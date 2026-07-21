import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveBrainToolLoopProvider } from './brain-model-routing';
import { GroqModelProvider } from './groq-model-provider';
import { LazyBedrockModelProvider } from './lazy-bedrock.model-provider';
import { ModelConfigurationException } from './model-errors';
import type {
  ModelProvider,
  ModelRequest,
  ModelResult,
  ToolLoopRequest,
  ToolLoopResult,
  ToolModelRequest,
  ToolModelResult,
} from './model-provider';

/**
 * Explicitly routes the three legacy model capabilities while the application
 * converges on one tool-loop API. Brain routing is resolved at call time so a
 * bad brain setting cannot break unrelated application bootstrap paths.
 */
@Injectable()
export class RoutingModelProvider implements ModelProvider {
  constructor(
    private readonly config: ConfigService,
    private readonly groq: GroqModelProvider,
    private readonly bedrock: LazyBedrockModelProvider,
  ) {}

  generateStructured<T>(request: ModelRequest): Promise<ModelResult<T>> {
    return this.bedrock.generateStructured<T>(request);
  }

  toolLoop(request: ToolLoopRequest): Promise<ToolLoopResult> {
    let choice: ReturnType<typeof resolveBrainToolLoopProvider>;
    try {
      choice = resolveBrainToolLoopProvider(this.config);
    } catch (error) {
      throw new ModelConfigurationException(
        error instanceof Error
          ? error.message
          : 'Brain model routing is invalid.',
      );
    }
    return choice === 'groq'
      ? this.groq.toolLoop(request)
      : this.bedrock.toolLoop(request);
  }

  generateWithTools(request: ToolModelRequest): Promise<ToolModelResult> {
    return this.groq.generateWithTools(request);
  }
}
