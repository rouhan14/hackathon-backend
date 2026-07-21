import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import {
  BedrockConverseModelProvider,
  supportsNativeConverseTools,
} from './bedrock-converse.model-provider';

describe('BedrockConverseModelProvider', () => {
  const config = {
    mode: 'iam' as const,
    accessKeyId: 'AKIAQ4NXQAJJIVNZJI6D',
    secretAccessKey: 'secret',
    region: 'us-east-1',
    modelId: 'google.gemma-3-4b-it',
    maxTokens: 512,
  };

  it('toolLoop runs a tool then returns the final answer via Converse', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({
        output: {
          message: {
            role: 'assistant',
            content: [
              {
                toolUse: {
                  toolUseId: 'tu-1',
                  name: 'jira_search',
                  input: {
                    connectionId: 'c1',
                    jql: 'assignee = currentUser()',
                  },
                },
              },
            ],
          },
        },
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        output: {
          message: {
            role: 'assistant',
            content: [{ text: 'You have 1 open issue.' }],
          },
        },
        usage: { inputTokens: 20, outputTokens: 8 },
      });

    const client = { send } as never;
    const executeTool = jest
      .fn()
      .mockImplementation((_name, args: Record<string, unknown>) =>
        Promise.resolve({
          ok: true,
          data: { issues: [{ key: 'A-1' }] },
          arguments: args,
        }),
      );

    const provider = new BedrockConverseModelProvider(
      { ...config, modelId: 'anthropic.claude-3-haiku-20240307-v1:0' },
      client,
    );
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
    expect(result.toolCalls[0]?.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(expect.any(ConverseCommand));
  });

  it('does not read Jira when the model answers without requesting a tool', async () => {
    const send = jest.fn().mockResolvedValue({
      output: {
        message: {
          role: 'assistant',
          content: [{ text: 'Hello! How can I help?' }],
        },
      },
    });
    const executeTool = jest.fn();
    const provider = new BedrockConverseModelProvider(config, {
      send,
    } as never);

    const result = await provider.toolLoop({
      instructions:
        'Available connections:\n- id=ae8aac0e-068e-4e65-8859-555e998cb25c; provider=JIRA',
      userMessage: 'hello',
      tools: [
        {
          name: 'jira_search',
          description: 'Search Jira',
          parameters: { type: 'object', properties: {} },
        },
      ],
      executeTool,
    });

    expect(result.answer).toBe('Hello! How can I help?');
    expect(executeTool).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('omits native toolConfig for runtime Gemma models', async () => {
    const commands: ConverseCommand[] = [];
    const send = jest.fn((command: ConverseCommand) => {
      commands.push(command);
      return Promise.resolve({
        output: {
          message: {
            role: 'assistant',
            content: [{ text: 'No live lookup needed.' }],
          },
        },
      });
    });
    const provider = new BedrockConverseModelProvider(config, {
      send,
    } as never);

    await provider.toolLoop({
      instructions: 'Help the user.',
      userMessage: 'hello',
      tools: [
        {
          name: 'jira_search',
          description: 'Search Jira',
          parameters: { type: 'object', properties: {} },
        },
      ],
      executeTool: jest.fn(),
    });

    expect(commands[0]?.input.toolConfig).toBeUndefined();
  });

  it('forces default jira_search when the model says it cannot call tools', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({
        output: {
          message: {
            role: 'assistant',
            content: [{ text: "I'm unable to call tools at the moment." }],
          },
        },
        usage: { inputTokens: 5, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        output: {
          message: {
            role: 'assistant',
            content: [{ text: 'You should pick up WORK-9 next.' }],
          },
        },
        usage: { inputTokens: 20, outputTokens: 8 },
      });

    const executeTool = jest
      .fn()
      .mockImplementation((_name, args: Record<string, unknown>) =>
        Promise.resolve({
          ok: true,
          data: { issues: [{ key: 'WORK-9' }] },
          arguments: args,
        }),
      );

    const provider = new BedrockConverseModelProvider(config, {
      send,
    } as never);

    const result = await provider.toolLoop({
      instructions:
        'Available connections:\n- id=ae8aac0e-068e-4e65-8859-555e998cb25c; provider=JIRA; workspace=Acme',
      userMessage: 'What should I work on today?',
      tools: [
        {
          name: 'jira_search',
          description: 'Search Jira',
          parameters: { type: 'object', properties: {} },
        },
      ],
      executeTool,
    });

    expect(executeTool).toHaveBeenCalledWith('jira_search', {
      connectionId: 'ae8aac0e-068e-4e65-8859-555e998cb25c',
      jql: 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC',
      maxResults: 15,
    });
    expect(result.toolCalls[0]?.ok).toBe(true);
    expect(result.answer).toBe('You should pick up WORK-9 next.');
  });

  it('executes pseudo tool_code text when the model does not emit native toolUse', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({
        output: {
          message: {
            role: 'assistant',
            content: [
              {
                text: "I'll use the tool.\n```tool_code\njira_search(connectionId='c1', jql='order by updated DESC')\n```",
              },
            ],
          },
        },
        usage: { inputTokens: 5, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        output: {
          message: {
            role: 'assistant',
            content: [{ text: 'Found issue WORK-1.' }],
          },
        },
        usage: { inputTokens: 10, outputTokens: 4 },
      });

    const executeTool = jest
      .fn()
      .mockImplementation((_name, args: Record<string, unknown>) =>
        Promise.resolve({
          ok: true,
          data: { issues: [{ key: 'WORK-1' }] },
          arguments: args,
        }),
      );

    const provider = new BedrockConverseModelProvider(config, {
      send,
    } as never);

    const result = await provider.toolLoop({
      instructions: 'Help the user.',
      userMessage: 'What is on my plate?',
      tools: [
        {
          name: 'jira_search',
          description: 'Search Jira',
          parameters: { type: 'object', properties: {} },
        },
      ],
      executeTool,
    });

    expect(executeTool).toHaveBeenCalledWith('jira_search', {
      connectionId: 'c1',
      jql: 'order by updated DESC',
    });
    expect(result.toolCalls[0]?.ok).toBe(true);
    expect(result.answer).toBe('Found issue WORK-1.');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('generateStructured parses JSON from Converse text', async () => {
    const send = jest.fn().mockResolvedValue({
      output: {
        message: {
          role: 'assistant',
          content: [{ text: JSON.stringify({ answer: 'hi' }) }],
        },
      },
      usage: { inputTokens: 3, outputTokens: 2 },
    });
    const provider = new BedrockConverseModelProvider(config, {
      send,
    } as never);

    const result = await provider.generateStructured<{ answer: string }>({
      instructions: 'Return JSON.',
      input: 'hello',
    });

    expect(result.output).toEqual({ answer: 'hi' });
    expect(result.provider).toBe('bedrock');
  });
});

describe('supportsNativeConverseTools', () => {
  it('disables native tools for Gemma 3 runtime models', () => {
    expect(supportsNativeConverseTools('google.gemma-3-4b-it')).toBe(false);
  });

  it('leaves native tools enabled for supported model families', () => {
    expect(
      supportsNativeConverseTools('anthropic.claude-3-haiku-20240307-v1:0'),
    ).toBe(true);
  });
});
