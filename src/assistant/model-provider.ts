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

export interface ModelProvider {
  generateStructured<T>(request: ModelRequest): Promise<ModelResult<T>>;
  generateWithTools(request: ToolModelRequest): Promise<ToolModelResult>;
}

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

export const MODEL_PROVIDER = Symbol('MODEL_PROVIDER');
