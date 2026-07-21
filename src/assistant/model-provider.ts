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
   * Must return a ToolRunResult with the arguments actually executed (never
   * throw for tool/MCP failures). Providers record those resolved arguments in
   * traces so server-side defaults remain observable.
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

// Notion MCP-specific interfaces
export interface ToolModelRequest {
  instructions: string;
  messages: ToolModelMessage[];
  tools: ToolModelDefinition[];
}

export interface ToolModelMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: ToolCall[];
}

export interface ToolModelDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolModelResult {
  content: string;
  toolCalls: ToolCall[];
}

export interface ModelProvider {
  generateStructured<T>(request: ModelRequest): Promise<ModelResult<T>>;
  toolLoop?(request: ToolLoopRequest): Promise<ToolLoopResult>;
  generateWithTools?(request: ToolModelRequest): Promise<ToolModelResult>;
}

export const MODEL_PROVIDER = Symbol('MODEL_PROVIDER');
