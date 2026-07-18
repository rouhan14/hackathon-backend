import { ForbiddenException } from '@nestjs/common';
import OpenAI from 'openai';
import { BedrockOpenAIModelProvider } from './bedrock-openai.model-provider';
import {
  ModelAuthException,
  ModelNotAvailableException,
  ModelResponseParseException,
  ModelUpstreamException,
} from './model-errors';

describe('BedrockOpenAIModelProvider', () => {
  const config = {
    mode: 'mantle' as const,
    apiKey: 'test-key',
    baseURL: 'https://bedrock-mantle.us-east-1.api.aws/v1',
    modelId: 'google.gemma-3-4b-it',
    maxTokens: 512,
  };

  function mockClient(create: jest.Mock): OpenAI {
    return {
      chat: {
        completions: {
          create,
        },
      },
    } as unknown as OpenAI;
  }

  it('returns parsed structured JSON and usage metadata', async () => {
    const create = jest.fn().mockResolvedValue({
      model: 'google.gemma-3-4b-it',
      choices: [
        {
          message: {
            content: JSON.stringify({ answer: 'hello', confidence: 0.9 }),
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const provider = new BedrockOpenAIModelProvider(config, mockClient(create));
    const result = await provider.generateStructured<{
      answer: string;
      confidence: number;
    }>({
      instructions: 'Return a short greeting payload.',
      input: { question: 'hi' },
      schemaName: 'Greeting',
      schema: {
        type: 'object',
        properties: {
          answer: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    });

    expect(result).toEqual({
      output: { answer: 'hello', confidence: 0.9 },
      provider: 'bedrock',
      model: 'google.gemma-3-4b-it',
      promptTokens: 10,
      outputTokens: 5,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'google.gemma-3-4b-it',
        max_tokens: 512,
        response_format: { type: 'json_object' },
        messages: [
          expect.objectContaining({
            role: 'system',
          }),
          {
            role: 'user',
            content: JSON.stringify({ question: 'hi' }),
          },
        ],
      }),
    );
  });

  it('throws when model content is not JSON', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'not-json' } }],
    });
    const provider = new BedrockOpenAIModelProvider(config, mockClient(create));

    await expect(
      provider.generateStructured({
        instructions: 'Return JSON.',
        input: 'x',
      }),
    ).rejects.toBeInstanceOf(ModelResponseParseException);
  });

  it('throws when model content is empty', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [{ message: { content: '   ' } }],
    });
    const provider = new BedrockOpenAIModelProvider(config, mockClient(create));

    await expect(
      provider.generateStructured({
        instructions: 'Return JSON.',
        input: 'x',
      }),
    ).rejects.toBeInstanceOf(ModelResponseParseException);
  });

  it('maps 401 to ModelAuthException', async () => {
    const apiError = new OpenAI.APIError(
      401,
      { error: { message: 'unauthorized' } },
      'unauthorized',
      new Headers(),
    );
    const create = jest.fn().mockRejectedValue(apiError);
    const provider = new BedrockOpenAIModelProvider(config, mockClient(create));

    await expect(
      provider.generateStructured({
        instructions: 'Return JSON.',
        input: 'x',
      }),
    ).rejects.toBeInstanceOf(ModelAuthException);
  });

  it('maps 404 to ModelNotAvailableException', async () => {
    const apiError = new OpenAI.APIError(
      404,
      { error: { message: 'not found' } },
      'not found',
      new Headers(),
    );
    const create = jest.fn().mockRejectedValue(apiError);
    const provider = new BedrockOpenAIModelProvider(config, mockClient(create));

    await expect(
      provider.generateStructured({
        instructions: 'Return JSON.',
        input: 'x',
      }),
    ).rejects.toBeInstanceOf(ModelNotAvailableException);
  });

  it('maps other API errors to ModelUpstreamException', async () => {
    const apiError = new OpenAI.APIError(
      500,
      { error: { message: 'boom' } },
      'boom',
      new Headers(),
    );
    const create = jest.fn().mockRejectedValue(apiError);
    const provider = new BedrockOpenAIModelProvider(config, mockClient(create));

    await expect(
      provider.generateStructured({
        instructions: 'Return JSON.',
        input: 'x',
      }),
    ).rejects.toBeInstanceOf(ModelUpstreamException);
  });

  it('toolLoop runs a tool then returns the final answer', async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce({
        model: 'google.gemma-3-4b-it',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'jira_search',
                    arguments: JSON.stringify({
                      connectionId: 'c1',
                      jql: 'assignee = currentUser()',
                    }),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      })
      .mockResolvedValueOnce({
        model: 'google.gemma-3-4b-it',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'You have 1 open issue.',
            },
          },
        ],
        usage: { prompt_tokens: 40, completion_tokens: 12 },
      });

    const executeTool = jest.fn().mockResolvedValue({
      ok: true,
      data: { issues: [{ key: 'A-1' }] },
    });
    const provider = new BedrockOpenAIModelProvider(config, mockClient(create));

    const result = await provider.toolLoop({
      instructions: 'Use tools when needed.',
      userMessage: 'What is assigned to me?',
      tools: [
        {
          name: 'jira_search',
          description: 'Search Jira',
          parameters: {
            type: 'object',
            properties: {
              connectionId: { type: 'string' },
              jql: { type: 'string' },
            },
            required: ['connectionId', 'jql'],
          },
        },
      ],
      executeTool,
    });

    expect(executeTool).toHaveBeenCalledWith('jira_search', {
      connectionId: 'c1',
      jql: 'assignee = currentUser()',
    });
    expect(result.answer).toBe('You have 1 open issue.');
    expect(result.toolCalls).toEqual([
      {
        name: 'jira_search',
        arguments: {
          connectionId: 'c1',
          jql: 'assignee = currentUser()',
        },
        ok: true,
      },
    ]);
    expect(result.rounds).toBe(2);
    expect(result.promptTokens).toBe(60);
    expect(result.outputTokens).toBe(20);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('toolLoop records ok false when executeTool returns a failed result', async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'jira_search',
                    arguments: '{"connectionId":"c1","jql":"x"}',
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Jira search failed.',
            },
          },
        ],
      });

    const provider = new BedrockOpenAIModelProvider(config, mockClient(create));
    const result = await provider.toolLoop({
      instructions: 'Use tools.',
      userMessage: 'search',
      tools: [
        {
          name: 'jira_search',
          description: 'Search',
          parameters: { type: 'object', properties: {} },
        },
      ],
      executeTool: () => Promise.resolve({ ok: false, error: 'boom' }),
    });

    expect(result.toolCalls[0]?.ok).toBe(false);
    expect(result.answer).toBe('Jira search failed.');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('toolLoop rethrows ForbiddenException from executeTool (policy abort)', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            role: 'assistant',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'dangerous',
                  arguments: '{}',
                },
              },
            ],
          },
        },
      ],
    });
    const provider = new BedrockOpenAIModelProvider(config, mockClient(create));

    await expect(
      provider.toolLoop({
        instructions: 'Use tools.',
        userMessage: 'do it',
        tools: [
          {
            name: 'dangerous',
            description: 'x',
            parameters: { type: 'object', properties: {} },
          },
        ],
        executeTool: () =>
          Promise.reject(
            new ForbiddenException('External writes require approval.'),
          ),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
