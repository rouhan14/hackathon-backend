import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type OpenAI from 'openai';
import { loadBedrockResolvedConfig } from './bedrock.config';
import { BedrockConverseModelProvider } from './bedrock-converse.model-provider';
import { BedrockOpenAIModelProvider } from './bedrock-openai.model-provider';
import type {
  ModelProvider,
  ModelRequest,
  ModelResult,
  ToolLoopRequest,
  ToolLoopResult,
} from './model-provider';

/**
 * Defers Bedrock env validation and client creation until the first model call.
 * Picks Mantle (API key) or IAM Converse (AWS access key pair) automatically.
 */
@Injectable()
export class LazyBedrockModelProvider implements ModelProvider {
  private readonly logger = new Logger(LazyBedrockModelProvider.name);
  private delegate: ModelProvider | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly openAiClient?: OpenAI,
  ) {}

  async generateStructured<T>(request: ModelRequest): Promise<ModelResult<T>> {
    return this.getDelegate().generateStructured(request);
  }

  async toolLoop(request: ToolLoopRequest): Promise<ToolLoopResult> {
    return this.getDelegate().toolLoop(request);
  }

  private getDelegate(): ModelProvider {
    if (!this.delegate) {
      const resolved = loadBedrockResolvedConfig(this.config);
      if (resolved.mode === 'mantle') {
        this.logger.log(
          `Initializing Bedrock Mantle provider model=${resolved.modelId}`,
        );
        this.delegate = new BedrockOpenAIModelProvider(
          resolved,
          this.openAiClient,
        );
      } else {
        this.logger.log(
          `Initializing Bedrock IAM Converse provider model=${resolved.modelId} region=${resolved.region}`,
        );
        this.delegate = new BedrockConverseModelProvider(resolved);
      }
    }
    return this.delegate;
  }
}
