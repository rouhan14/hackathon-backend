import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ConnectionsModule } from '../connections/connections.module';
import { ContextModule } from '../context/context.module';
import { PolicyModule } from '../policy/policy.module';
import { ProvidersModule } from '../providers/providers.module';
import { McpModule } from '../mcp/mcp.module';
import { AssistantController } from './assistant.controller';
import { JiraAssistantService } from './jira-assistant.service';
import { NotionAssistantService } from './notion-assistant.service';
import { LazyBedrockModelProvider } from './lazy-bedrock.model-provider';
import { GroqModelProvider } from './groq-model-provider';
import { MODEL_PROVIDER, type ModelProvider } from './model-provider';
import { ToolExecutorService } from './tool-executor.service';
import { ToolRegistryModule } from './tool-registry.module';

@Module({
  imports: [
    HttpModule,
    PolicyModule,
    ConnectionsModule,
    ToolRegistryModule,
    McpModule,
    ContextModule,
    ProvidersModule,
  ],
  controllers: [AssistantController],
  providers: [
    // ToolRegistryService is intentionally NOT declared here. It comes from the
    // @Global() ToolRegistryModule so provider modules (Jira, ClickUp, ...)
    // register tools into the SAME singleton this module consumes. Declaring it
    // locally creates a second, empty instance and the assistant sees no tools.
    ToolExecutorService,
    JiraAssistantService,
    NotionAssistantService,
    GroqModelProvider,
    {
      provide: MODEL_PROVIDER,
      useFactory: (config: ConfigService, groq: GroqModelProvider) => {
        // Create a combined provider that routes to the right implementation.
        const bedrock = new LazyBedrockModelProvider(config);
        return {
          generateStructured: <T>(request: any) => bedrock.generateStructured<T>(request),
          // /assistant/ask (Jira) runs on Bedrock/Gemma via its pseudo-tool loop.
          toolLoop: (request: any) => {
            if (!bedrock.toolLoop) {
              throw new Error('toolLoop not supported by Bedrock provider');
            }
            return bedrock.toolLoop(request);
          },
          // /assistant/chat (Notion) uses Groq's native function calling.
          generateWithTools: (request: any) => groq.generateWithTools(request),
        } as ModelProvider;
      },
      inject: [ConfigService, GroqModelProvider],
    },
  ],
  exports: [MODEL_PROVIDER, JiraAssistantService, NotionAssistantService],
})
export class AssistantModule {}
