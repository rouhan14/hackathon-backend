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
}

export const MODEL_PROVIDER = Symbol('MODEL_PROVIDER');
