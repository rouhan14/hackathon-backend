import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ConnectionsModule } from '../connections/connections.module';
import { ContextModule } from '../context/context.module';
import { PolicyModule } from '../policy/policy.module';
import { ProvidersModule } from '../providers/providers.module';
import { McpModule } from '../mcp/mcp.module';
import { AssistantController } from './assistant.controller';
import { BrainAssistantService } from './brain-assistant.service';
import { NotionAssistantService } from './notion-assistant.service';
import { LazyBedrockModelProvider } from './lazy-bedrock.model-provider';
import { GroqModelProvider } from './groq-model-provider';
import { OpenAiModelProvider } from './openai-model-provider';
import { MODEL_PROVIDER } from './model-provider';
import { ToolExecutorService } from './tool-executor.service';
import { ToolRegistryModule } from './tool-registry.module';
import { BrainRunService } from './brain-run.service';
import { RoutingModelProvider } from './routing-model.provider';

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
    BrainRunService,
    BrainAssistantService,
    NotionAssistantService,
    GroqModelProvider,
    OpenAiModelProvider,
    {
      provide: LazyBedrockModelProvider,
      useFactory: (config: ConfigService) =>
        new LazyBedrockModelProvider(config),
      inject: [ConfigService],
    },
    RoutingModelProvider,
    {
      provide: MODEL_PROVIDER,
      useExisting: RoutingModelProvider,
    },
  ],
  exports: [MODEL_PROVIDER, BrainAssistantService, NotionAssistantService],
})
export class AssistantModule {}
