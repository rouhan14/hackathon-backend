import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
  type ToolConfiguration,
  type ToolResultContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import type { BedrockIamConfig } from './bedrock.config';
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
import { buildDefaultToolCalls } from './default-tool-calls';
import {
  looksLikePseudoToolNarration,
  parsePseudoToolCalls,
} from './parse-pseudo-tool-calls';
import { boundSerializeForModel } from './tool-result';

const PROVIDER_NAME = 'bedrock';
const DEFAULT_TOOL_ROUNDS = 5;

/**
 * Bedrock Converse API via IAM SigV4 credentials (AWS_ACCESS_KEY_ID / SECRET).
 */
@Injectable()
export class BedrockConverseModelProvider implements ModelProvider {
  private readonly logger = new Logger(BedrockConverseModelProvider.name);
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;
  private readonly maxTokens: number;

  constructor(config: BedrockIamConfig, client?: BedrockRuntimeClient) {
    this.modelId = config.modelId;
    this.maxTokens = config.maxTokens;
    this.client =
      client ??
      new BedrockRuntimeClient({
        region: config.region,
        ...(config.accessKeyId && config.secretAccessKey
          ? {
              credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
                ...(config.sessionToken
                  ? { sessionToken: config.sessionToken }
                  : {}),
              },
            }
          : {}),
      });
  }

  async generateStructured<T>(request: ModelRequest): Promise<ModelResult<T>> {
    const system = [
      request.instructions,
      'Respond with a single JSON object only. Do not include markdown fences or commentary outside the JSON.',
      request.schemaName
        ? `The JSON object should match the schema named "${request.schemaName}".`
        : '',
      request.schema
        ? `JSON schema (follow this shape):\n${JSON.stringify(request.schema)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const userText =
      typeof request.input === 'string'
        ? request.input
        : JSON.stringify(request.input);

    try {
      const response = await this.client.send(
        new ConverseCommand({
          modelId: this.modelId,
          system: [{ text: system }],
          messages: [
            {
              role: 'user',
              content: [{ text: userText }],
            },
          ],
          inferenceConfig: { maxTokens: this.maxTokens },
        }),
      );

      const content = extractText(response.output?.message?.content);
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
        model: this.modelId,
        promptTokens: response.usage?.inputTokens,
        outputTokens: response.usage?.outputTokens,
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
    const supportsNativeTools = supportsNativeConverseTools(this.modelId);
    const toolConfig = supportsNativeTools
      ? this.toToolConfig(request.tools)
      : undefined;
    const messages: Message[] = [
      {
        role: 'user',
        content: [{ text: request.userMessage }],
      },
    ];

    const toolTraces: ToolLoopToolTrace[] = [];
    let promptTokens = 0;
    let outputTokens = 0;
    let rounds = 0;

    const systemText = [
      request.instructions,
      supportsNativeTools
        ? 'When you need live data, use the platform tools via the API tool-calling channel. Never write fake tool syntax in your answer.'
        : 'Native tool calling is unavailable for this model. When live data is needed, emit exactly one available tool call as tool_name({"argument":"value"}) and do not claim to have results before the server returns them.',
      'After tools return results, answer the user with concrete data only.',
    ].join('\n');

    const allowedToolNames = request.tools.map((t) => t.name);

    try {
      for (let round = 0; round < maxRounds; round += 1) {
        rounds = round + 1;
        const response = await this.client.send(
          new ConverseCommand({
            modelId: this.modelId,
            system: [{ text: systemText }],
            messages,
            inferenceConfig: { maxTokens: this.maxTokens },
            ...(toolConfig ? { toolConfig } : {}),
          }),
        );

        promptTokens += response.usage?.inputTokens ?? 0;
        outputTokens += response.usage?.outputTokens ?? 0;

        const assistantMessage = response.output?.message;
        if (!assistantMessage?.content?.length) {
          throw new ModelResponseParseException(
            'Model returned an empty chat message.',
          );
        }

        messages.push({
          role: 'assistant',
          content: assistantMessage.content,
        });

        const toolUses = assistantMessage.content.filter(
          (
            block,
          ): block is ContentBlock & {
            toolUse: NonNullable<ContentBlock['toolUse']>;
          } => Boolean(block.toolUse?.name && block.toolUse?.toolUseId),
        );

        // Native Converse toolUse blocks.
        if (toolUses.length) {
          const toolResultBlocks: ContentBlock[] = [];
          for (const block of toolUses) {
            const toolUse = block.toolUse;
            const name = toolUse.name!;
            const toolUseId = toolUse.toolUseId!;
            let args: Record<string, unknown> = {};
            if (toolUse.input && typeof toolUse.input === 'object') {
              args = toolUse.input as Record<string, unknown>;
            }

            const run = await request.executeTool(name, args);
            const payload = run.ok
              ? run.data
              : {
                  error: run.error,
                  ...(run.code ? { code: run.code } : {}),
                };

            toolTraces.push({ name, arguments: args, ok: run.ok });
            this.logger.log(
              `Executed tool ${name} ok=${run.ok} (native toolUse)`,
            );

            toolResultBlocks.push({
              toolResult: {
                toolUseId,
                content: buildToolResultContent(payload),
                status: run.ok ? 'success' : 'error',
              },
            });
          }

          messages.push({
            role: 'user',
            content: toolResultBlocks,
          });
          continue;
        }

        const answer = extractText(assistantMessage.content)?.trim() ?? '';
        if (!answer) {
          throw new ModelResponseParseException(
            'Model returned an empty answer.',
          );
        }

        // Fallback 1: model wrote jira_search(...) or ```tool_code``` as text.
        let pendingCalls = parsePseudoToolCalls(answer, allowedToolNames);

        // Fallback 2: model refused / narrated tools — force safe default tool runs.
        if (
          pendingCalls.length === 0 &&
          request.tools.length > 0 &&
          toolTraces.length === 0 &&
          (looksLikePseudoToolNarration(answer) ||
            /unable to call tools|cannot call tools|can't call tools/i.test(
              answer,
            ))
        ) {
          pendingCalls = buildDefaultToolCalls(
            request.tools,
            request.instructions,
          );
          if (pendingCalls.length) {
            this.logger.warn(
              `Forcing default tools server-side: ${pendingCalls.map((c) => c.name).join(', ')}`,
            );
          }
        }

        if (pendingCalls.length > 0 && request.tools.length > 0) {
          const resultLines: string[] = [];
          for (const call of pendingCalls) {
            const run = await request.executeTool(call.name, call.arguments);
            const payload = run.ok
              ? run.data
              : {
                  error: run.error,
                  ...(run.code ? { code: run.code } : {}),
                };
            toolTraces.push({
              name: call.name,
              arguments: call.arguments,
              ok: run.ok,
            });
            this.logger.log(
              `Executed tool ${call.name} ok=${run.ok} (server-side tool fallback)`,
            );
            resultLines.push(
              `Tool ${call.name}(${JSON.stringify(call.arguments)}) => ${boundSerializeForModel(payload)}`,
            );
          }

          messages.push({
            role: 'user',
            content: [
              {
                text: [
                  'Here are real tool results from the server (not invented).',
                  'Write a helpful answer for the user using only this data.',
                  'Do not say you are unable to call tools. Do not write tool_code blocks.',
                  ...resultLines,
                ].join('\n\n'),
              },
            ],
          });
          continue;
        }

        return {
          answer: stripPseudoToolNarration(answer),
          provider: PROVIDER_NAME,
          model: this.modelId,
          toolCalls: toolTraces,
          rounds,
          promptTokens,
          outputTokens,
        };
      }

      messages.push({
        role: 'user',
        content: [
          {
            text: 'Stop calling tools. Provide your best final answer using only the tool results already available.',
          },
        ],
      });
      const finalResponse = await this.client.send(
        new ConverseCommand({
          modelId: this.modelId,
          system: [{ text: request.instructions }],
          messages,
          inferenceConfig: { maxTokens: this.maxTokens },
        }),
      );
      rounds += 1;
      promptTokens += finalResponse.usage?.inputTokens ?? 0;
      outputTokens += finalResponse.usage?.outputTokens ?? 0;

      const answer =
        extractText(finalResponse.output?.message?.content)?.trim() ?? '';
      if (!answer) {
        throw new ModelResponseParseException(
          'Model returned an empty answer after the tool budget was exhausted.',
        );
      }

      return {
        answer,
        provider: PROVIDER_NAME,
        model: this.modelId,
        toolCalls: toolTraces,
        rounds,
        promptTokens,
        outputTokens,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private toToolConfig(
    tools: ModelToolDefinition[],
  ): ToolConfiguration | undefined {
    if (!tools.length) {
      return undefined;
    }
    return {
      tools: tools.map((tool) => ({
        toolSpec: {
          name: tool.name,
          description: tool.description,
          inputSchema: {
            // AWS Document type — JSON Schema object for the tool input.
            json: tool.parameters as never,
          },
        },
      })),
    };
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

    const name =
      error && typeof error === 'object' && 'name' in error
        ? String((error as { name: string }).name)
        : '';
    const message =
      error instanceof Error ? error.message : 'Model provider request failed.';

    this.logger.warn(
      `Bedrock Converse request failed (name=${name || 'unknown'}, model=${this.modelId}).`,
    );

    if (
      name === 'UnrecognizedClientException' ||
      name === 'InvalidSignatureException' ||
      name === 'AccessDeniedException' ||
      /security token|access denied|invalid.*key|not authorized/i.test(message)
    ) {
      return new ModelAuthException(
        'Bedrock IAM authentication failed. Check AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, region, and that the IAM user can invoke the model.',
      );
    }

    if (
      name === 'ResourceNotFoundException' ||
      (name === 'ValidationException' && /model/i.test(message))
    ) {
      return new ModelNotAvailableException(
        `Model "${this.modelId}" was not found or is not enabled in this region.`,
      );
    }

    if (name === 'ModelTimeoutException' || /timeout/i.test(message)) {
      return new ModelTimeoutException();
    }

    return new ModelUpstreamException(
      'Bedrock Converse request failed. See server logs for details.',
    );
  }
}

/** Gemma 3 advertises client-side tools on Mantle, not runtime Converse. */
export function supportsNativeConverseTools(modelId: string): boolean {
  return !/^google\.gemma-3-/i.test(modelId);
}

function extractText(content: ContentBlock[] | undefined): string | undefined {
  if (!content?.length) {
    return undefined;
  }
  return content
    .map((block) => block.text)
    .filter((text): text is string => Boolean(text))
    .join('\n');
}

/** Remove leftover pseudo tool markup from a final user-facing answer. */
function stripPseudoToolNarration(text: string): string {
  return text
    .replace(/```\s*tool_code[\s\S]*?```/gi, '')
    .replace(/```[\s\S]*?\bjira_search\s*\([\s\S]*?```/gi, '')
    .replace(/\bjira_search\s*\([^)]*\)\s*/gi, '')
    .trim();
}

function buildToolResultContent(payload: unknown): ToolResultContentBlock[] {
  try {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return [{ json: payload as never }];
    }
    if (typeof payload === 'string') {
      const parsed = JSON.parse(payload) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return [{ json: parsed as never }];
      }
    }
  } catch {
    // fall through to text
  }
  return [{ text: boundSerializeForModel(payload) }];
}
