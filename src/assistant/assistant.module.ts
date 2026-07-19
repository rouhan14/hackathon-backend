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
import { MODEL_PROVIDER } from './model-provider';
import { ToolExecutorService } from './tool-executor.service';
import { ToolRegistryService } from './tool-registry.service';
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
    ToolRegistryService,
    ToolExecutorService,
    JiraAssistantService,
    NotionAssistantService,
    GroqModelProvider,
    {
      provide: MODEL_PROVIDER,
      useFactory: (config: ConfigService, groq: GroqModelProvider) => {
        // Use LazyBedrock for Jira (toolLoop), Groq for Notion (generateWithTools)
        const bedrock = new LazyBedrockModelProvider(config);
        return {
          generateStructured: bedrock.generateStructured.bind(bedrock),
          toolLoop: bedrock.toolLoop.bind(bedrock),
          generateWithTools: groq.generateWithTools.bind(groq),
        };
      },
      inject: [ConfigService, GroqModelProvider],
    },
  ],
  exports: [MODEL_PROVIDER, JiraAssistantService, NotionAssistantService, ToolRegistryService],
})
export class AssistantModule {}
