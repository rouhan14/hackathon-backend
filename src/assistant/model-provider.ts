import type { ToolRunResult } from './tool-executor.service';

export interface ModelRequest {
  instructions: string;
  input: unknown;
  schemaName?: string;
  schema?: Record<string, unknown>;
}

export interface ModelResult<T = unknown> {
  output: T;
  provider: string;
  model: string;
  promptTokens?: number;
  outputTokens?: number;
}

/** OpenAI-style function tool schema offered to the model. */
export interface ModelToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolLoopRequest {
  instructions: string;
  userMessage: string;
  tools: ModelToolDefinition[];
  /** Max model→tool→model rounds. Default 5. */
  maxRounds?: number;
  /**
   * Must return a ToolRunResult (never throw for tool/MCP failures).
   * Policy denials may still throw ForbiddenException to abort the request.
   */
  executeTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<ToolRunResult>;
}

export interface ToolLoopToolTrace {
  name: string;
  arguments: Record<string, unknown>;
  ok: boolean;
}

export interface ToolLoopResult {
  answer: string;
  provider: string;
  model: string;
  toolCalls: ToolLoopToolTrace[];
  rounds: number;
  promptTokens?: number;
  outputTokens?: number;
}

export interface ModelProvider {
  generateStructured<T>(request: ModelRequest): Promise<ModelResult<T>>;
  toolLoop(request: ToolLoopRequest): Promise<ToolLoopResult>;
}

export const MODEL_PROVIDER = Symbol('MODEL_PROVIDER');
