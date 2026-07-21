import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  ModelAuthException,
  ModelConfigurationException,
  ModelNotAvailableException,
  ModelResponseParseException,
  ModelTimeoutException,
  ModelUpstreamException,
} from './model-errors';
import {
  ModelProvider,
  ModelRequest,
  ModelResult,
  ToolLoopRequest,
  ToolLoopResult,
  ToolLoopToolTrace,
  ToolModelRequest,
  ToolModelResult,
} from './model-provider';
import { boundSerializeForModel } from './tool-result';

interface GroqResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

interface GroqToolResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

/** OpenAI-style chat message shape sent back to Groq across tool rounds. */
type GroqChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    }
  | { role: 'tool'; content: string; tool_call_id: string };

const DEFAULT_TOOL_ROUNDS = 5;

@Injectable()
export class GroqModelProvider implements ModelProvider {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async generateStructured<T>(request: ModelRequest): Promise<ModelResult<T>> {
    const apiKey = this.requiredConfig('GROQ_API_KEY');
    const model = this.requiredConfig('GROQ_MODEL_NAME');

    const data = await this.createCompletion<GroqResponse>(apiKey, {
      model,
      messages: [
        { role: 'system', content: request.instructions },
        { role: 'user', content: JSON.stringify(request.input) },
      ],
      response_format: { type: 'json_object' },
    });

    const content = data.choices[0]?.message.content;
    if (!content) {
      throw new ModelResponseParseException(
        'Groq returned an empty model response.',
      );
    }

    let output: T;
    try {
      output = JSON.parse(content) as T;
    } catch {
      throw new ModelResponseParseException();
    }

    return {
      output,
      provider: 'groq',
      model,
      promptTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  }

  /**
   * Native OpenAI-style tool loop for the unified brain.
   * Groq models (e.g. openai/gpt-oss-120b) support real function calling, so we
   * loop model→tool→model until the model returns a final text answer or the
   * round budget is exhausted.
   */
  async toolLoop(request: ToolLoopRequest): Promise<ToolLoopResult> {
    const apiKey = this.requiredConfig('GROQ_API_KEY');
    const model = this.requiredConfig('GROQ_MODEL_NAME');
    const maxRounds = Math.min(
      Math.max(request.maxRounds ?? DEFAULT_TOOL_ROUNDS, 1),
      10,
    );

    const messages: GroqChatMessage[] = [
      { role: 'system', content: request.instructions },
      { role: 'user', content: request.userMessage },
    ];
    const tools = request.tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    const toolTraces: ToolLoopToolTrace[] = [];
    let promptTokens = 0;
    let outputTokens = 0;
    let rounds = 0;

    for (let round = 0; round < maxRounds; round += 1) {
      rounds = round + 1;
      const data = await this.createCompletion<GroqToolResponse>(apiKey, {
        model,
        messages,
        ...(tools.length ? { tools, tool_choice: 'auto' as const } : {}),
      });

      promptTokens += data.usage?.prompt_tokens ?? 0;
      outputTokens += data.usage?.completion_tokens ?? 0;

      const message = data.choices[0]?.message;
      if (!message) {
        throw new ModelResponseParseException(
          'Groq returned an empty model response.',
        );
      }

      const toolCalls = message.tool_calls ?? [];
      if (!toolCalls.length) {
        const answer = message.content?.trim() ?? '';
        if (!answer) {
          throw new ModelResponseParseException(
            'Groq returned an empty answer.',
          );
        }
        return {
          answer,
          provider: 'groq',
          model,
          toolCalls: toolTraces,
          rounds,
          promptTokens,
          outputTokens,
        };
      }

      // Echo the assistant tool-call message back before appending results.
      messages.push({
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: call.function,
        })),
      });

      for (const call of toolCalls) {
        const name = call.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = call.function.arguments
            ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
            : {};
        } catch {
          toolTraces.push({ name, arguments: {}, ok: false });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({
              error: 'Tool arguments were not valid JSON.',
            }),
          });
          continue;
        }

        const run = await request.executeTool(name, args);
        const payload = run.ok
          ? run.data
          : { error: run.error, ...(run.code ? { code: run.code } : {}) };
        toolTraces.push({ name, arguments: run.arguments, ok: run.ok });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: boundSerializeForModel(payload),
        });
      }
    }

    // Round budget exhausted — ask for a final answer with no further tools.
    messages.push({
      role: 'user',
      content:
        'Stop calling tools. Provide your best final answer using only the tool results already available.',
    });
    const finalData = await this.createCompletion<GroqToolResponse>(apiKey, {
      model,
      messages,
    });
    rounds += 1;
    promptTokens += finalData.usage?.prompt_tokens ?? 0;
    outputTokens += finalData.usage?.completion_tokens ?? 0;

    const answer = finalData.choices[0]?.message?.content?.trim() ?? '';
    if (!answer) {
      throw new ModelResponseParseException(
        'Groq returned an empty answer after the tool budget was exhausted.',
      );
    }
    return {
      answer,
      provider: 'groq',
      model,
      toolCalls: toolTraces,
      rounds,
      promptTokens,
      outputTokens,
    };
  }

  async generateWithTools(request: ToolModelRequest): Promise<ToolModelResult> {
    const apiKey = this.requiredConfig('GROQ_API_KEY');
    const model = this.requiredConfig('GROQ_MODEL_NAME');
    const data = await this.createCompletion<GroqToolResponse>(apiKey, {
      model,
      messages: [
        { role: 'system', content: request.instructions },
        ...request.messages.map((message) => {
          if (message.role === 'assistant') {
            return {
              role: 'assistant',
              content: message.content,
              tool_calls: (message.toolCalls ?? []).map((call) => ({
                id: call.id,
                type: 'function',
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.arguments),
                },
              })),
            };
          }
          if (message.role === 'tool') {
            return {
              role: 'tool',
              content: message.content,
              tool_call_id: message.toolCallId,
            };
          }
          return { role: 'user', content: message.content };
        }),
      ],
      tools: request.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      })),
      tool_choice: 'auto',
    });

    const message = data.choices[0]?.message;
    if (!message) {
      throw new ModelResponseParseException(
        'Groq returned an empty model response.',
      );
    }
    return {
      content: message.content ?? '',
      toolCalls: (message.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: parseToolArguments(call.function.arguments),
      })),
    };
  }

  private requiredConfig(key: string): string {
    const value = String(this.config.get(key) ?? '').trim();
    if (!value) {
      throw new ModelConfigurationException(`${key} must be set.`);
    }
    return value;
  }

  private async createCompletion<T>(
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.http.post<T>(
          'https://api.groq.com/openai/v1/chat/completions',
          body,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return response.data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          throw new ModelAuthException('Groq authentication failed.');
        }
        if (status === 404) {
          throw new ModelNotAvailableException(
            'The configured Groq model is not available.',
          );
        }
        if (
          status === 408 ||
          status === 504 ||
          error.code === 'ECONNABORTED' ||
          error.code === 'ETIMEDOUT'
        ) {
          throw new ModelTimeoutException();
        }
      }
      throw new ModelUpstreamException('Groq request failed.');
    }
  }
}

function parseToolArguments(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ModelResponseParseException(
      'Groq returned tool arguments that were not valid JSON.',
    );
  }
}
