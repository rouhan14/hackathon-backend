import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { GroqModelProvider } from './groq-model-provider';

export class OpenAiModelProvider extends GroqModelProvider {
  constructor(http: HttpService, config: ConfigService) {
    super(http, config);
    this.providerConfig = 'openai';
  }
}
