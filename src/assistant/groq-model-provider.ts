import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  ModelProvider,
  ModelRequest,
  ModelResult,
  ToolModelRequest,
  ToolModelResult,
} from './model-provider';

interface GroqResponse<T> {
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
}

@Injectable()
export class GroqModelProvider implements ModelProvider {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async generateStructured<T>(
    request: ModelRequest,
  ): Promise<ModelResult<T>> {
    const apiKey = this.config.getOrThrow<string>('GROQ_API_KEY');
    const model = this.config.getOrThrow<string>('GROQ_MODEL_NAME');

    const response = await firstValueFrom(
      this.http.post<GroqResponse<T>>(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model,
          messages: [
            { role: 'system', content: request.instructions },
            { role: 'user', content: JSON.stringify(request.input) },
          ],
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const content = response.data.choices[0]?.message.content;
    if (!content) {
      throw new Error('Groq returned an empty model response');
    }

    return {
      output: JSON.parse(content) as T,
      provider: 'groq',
      model,
      promptTokens: response.data.usage?.prompt_tokens,
      outputTokens: response.data.usage?.completion_tokens,
    };
  }

  async generateWithTools(
    request: ToolModelRequest,
  ): Promise<ToolModelResult> {
    const apiKey = this.config.getOrThrow<string>('GROQ_API_KEY');
    const model = this.config.getOrThrow<string>('GROQ_MODEL_NAME');
    const response = await firstValueFrom(
      this.http.post<GroqToolResponse>(
        'https://api.groq.com/openai/v1/chat/completions',
        {
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
        },
        { headers: { Authorization: `Bearer ${apiKey}` } },
      ),
    );

    const message = response.data.choices[0]?.message;
    if (!message) throw new Error('Groq returned an empty model response');
    return {
      content: message.content ?? '',
      toolCalls: (message.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: JSON.parse(call.function.arguments) as Record<string, unknown>,
      })),
    };
  }
}
