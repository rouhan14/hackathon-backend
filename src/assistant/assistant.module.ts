import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ContextModule } from '../context/context.module';
import { PolicyModule } from '../policy/policy.module';
import { ProvidersModule } from '../providers/providers.module';
import { ToolRegistryService } from './tool-registry.service';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';
import { McpModule } from '../mcp/mcp.module';
import { ConnectionsModule } from '../connections/connections.module';
import { GroqModelProvider } from './groq-model-provider';
import { MODEL_PROVIDER } from './model-provider';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    McpModule,
    ConnectionsModule,
    ContextModule,
    PolicyModule,
    ProvidersModule,
  ],
  controllers: [AssistantController],
  providers: [
    ToolRegistryService,
    GroqModelProvider,
    AssistantService,
    { provide: MODEL_PROVIDER, useExisting: GroqModelProvider },
  ],
  exports: [ToolRegistryService, MODEL_PROVIDER],
})
export class AssistantModule {}
