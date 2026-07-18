import { HttpException, Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import type { BedrockMantleConfig } from './bedrock.config';
import {
  ModelAuthException,
  ModelNotAvailableException,
  ModelResponseParseException,
  ModelTimeoutException,
  ModelUpstreamException,
} from './model-errors';
import type {
  ModelProvider,
  ModelRequest,
  ModelResult,
  ModelToolDefinition,
  ToolLoopRequest,
  ToolLoopResult,
  ToolLoopToolTrace,
} from './model-provider';
import { boundSerializeForModel } from './tool-result';

const PROVIDER_NAME = 'bedrock';
const DEFAULT_TOOL_ROUNDS = 5;

@Injectable()
export class BedrockOpenAIModelProvider implements ModelProvider {
  private readonly logger = new Logger(BedrockOpenAIModelProvider.name);
  private readonly client: OpenAI;
  private readonly modelId: string;
  private readonly maxTokens: number;

  constructor(config: BedrockMantleConfig, client?: OpenAI) {
    this.modelId = config.modelId;
    this.maxTokens = config.maxTokens;
    this.client =
      client ??
      new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      });
  }

  async generateStructured<T>(request: ModelRequest): Promise<ModelResult<T>> {
    const systemContent = this.buildSystemPrompt(request);
    const userContent = this.formatUserInput(request.input);

    try {
      const completion = await this.client.chat.completions.create({
        model: this.modelId,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent },
        ],
        max_tokens: this.maxTokens,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content?.trim()) {
        throw new ModelResponseParseException(
          'Model returned an empty response.',
        );
      }

      let output: T;
      try {
        output = JSON.parse(content) as T;
      } catch {
        throw new ModelResponseParseException(
          'Model returned content that is not valid JSON.',
        );
      }

      return {
        output,
        provider: PROVIDER_NAME,
        model: completion.model ?? this.modelId,
        promptTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async toolLoop(request: ToolLoopRequest): Promise<ToolLoopResult> {
    const maxRounds = Math.min(
      Math.max(request.maxRounds ?? DEFAULT_TOOL_ROUNDS, 1),
      10,
    );
    const tools = this.toChatTools(request.tools);
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: request.instructions },
      { role: 'user', content: request.userMessage },
    ];

    const toolTraces: ToolLoopToolTrace[] = [];
    let promptTokens = 0;
    let outputTokens = 0;
    let modelName = this.modelId;
    let rounds = 0;

    try {
      for (let round = 0; round < maxRounds; round += 1) {
        rounds = round + 1;
        const completion = await this.client.chat.completions.create({
          model: this.modelId,
          messages,
          max_tokens: this.maxTokens,
          ...(tools.length ? { tools, tool_choice: 'auto' as const } : {}),
        });

        modelName = completion.model ?? this.modelId;
        promptTokens += completion.usage?.prompt_tokens ?? 0;
        outputTokens += completion.usage?.completion_tokens ?? 0;

        const message = completion.choices[0]?.message;
        if (!message) {
          throw new ModelResponseParseException(
            'Model returned an empty chat message.',
          );
        }

        messages.push(message);

        const toolCalls = message.tool_calls ?? [];
        if (!toolCalls.length) {
          const answer = message.content?.trim() ?? '';
          if (!answer) {
            throw new ModelResponseParseException(
              'Model returned an empty answer.',
            );
          }
          return {
            answer,
            provider: PROVIDER_NAME,
            model: modelName,
            toolCalls: toolTraces,
            rounds,
            promptTokens,
            outputTokens,
          };
        }

        for (const call of toolCalls) {
          if (call.type !== 'function') {
            continue;
          }

          const name = call.function.name;
          let args: Record<string, unknown> = {};
          try {
            args = call.function.arguments
              ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
              : {};
          } catch {
            args = {};
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
            : {
                error: run.error,
                ...(run.code ? { code: run.code } : {}),
              };

          toolTraces.push({ name, arguments: args, ok: run.ok });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: boundSerializeForModel(payload),
          });
        }
      }

      messages.push({
        role: 'user',
        content:
          'Stop calling tools. Provide your best final answer using only the tool results already available.',
      });
      const finalCompletion = await this.client.chat.completions.create({
        model: this.modelId,
        messages,
        max_tokens: this.maxTokens,
      });
      rounds += 1;
      modelName = finalCompletion.model ?? this.modelId;
      promptTokens += finalCompletion.usage?.prompt_tokens ?? 0;
      outputTokens += finalCompletion.usage?.completion_tokens ?? 0;

      const answer = finalCompletion.choices[0]?.message?.content?.trim() ?? '';
      if (!answer) {
        throw new ModelResponseParseException(
          'Model returned an empty answer after the tool budget was exhausted.',
        );
      }

      return {
        answer,
        provider: PROVIDER_NAME,
        model: modelName,
        toolCalls: toolTraces,
        rounds,
        promptTokens,
        outputTokens,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private toChatTools(tools: ModelToolDefinition[]): ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  private buildSystemPrompt(request: ModelRequest): string {
    const parts = [
      request.instructions,
      'Respond with a single JSON object only. Do not include markdown fences or commentary outside the JSON.',
    ];

    if (request.schemaName) {
      parts.push(
        `The JSON object should match the schema named "${request.schemaName}".`,
      );
    }

    if (request.schema) {
      parts.push(
        `JSON schema (follow this shape):\n${JSON.stringify(request.schema)}`,
      );
    }

    return parts.join('\n\n');
  }

  private formatUserInput(input: unknown): string {
    if (typeof input === 'string') {
      return input;
    }
    return JSON.stringify(input);
  }

  private mapError(error: unknown): Error {
    if (error instanceof HttpException) {
      return error;
    }

    if (
      error instanceof ModelAuthException ||
      error instanceof ModelNotAvailableException ||
      error instanceof ModelResponseParseException ||
      error instanceof ModelTimeoutException ||
      error instanceof ModelUpstreamException
    ) {
      return error;
    }

    if (error instanceof OpenAI.APIError) {
      const rawStatus: unknown = error.status;
      const status = typeof rawStatus === 'number' ? rawStatus : undefined;
      this.logger.warn(
        `Bedrock Mantle request failed (status=${status ?? 'unknown'}, model=${this.modelId}).`,
      );

      if (status === 401 || status === 403) {
        return new ModelAuthException(
          'Model provider authentication failed. Check BEDROCK_API_KEY is a Bedrock API key (not an IAM access key).',
        );
      }

      if (status === 404) {
        return new ModelNotAvailableException(
          `Model "${this.modelId}" was not found. Enable it in the Bedrock console for this region and verify BEDROCK_MODEL_ID / BEDROCK_BASE_URL.`,
        );
      }

      if (status === 408 || status === 504) {
        return new ModelTimeoutException();
      }

      return new ModelUpstreamException(
        'Model provider request failed. See server logs for status code.',
      );
    }

    if (error instanceof Error) {
      const errName = error.name.toLowerCase();
      const message = error.message.toLowerCase();
      if (
        errName.includes('timeout') ||
        message.includes('timeout') ||
        message.includes('etimedout') ||
        message.includes('aborted')
      ) {
        return new ModelTimeoutException();
      }
    }

    this.logger.warn(
      `Unexpected model provider error for model=${this.modelId}.`,
    );
    return new ModelUpstreamException();
  }
}
