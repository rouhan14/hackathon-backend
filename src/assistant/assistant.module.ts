import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectionsModule } from '../connections/connections.module';
import { PolicyModule } from '../policy/policy.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { LazyBedrockModelProvider } from './lazy-bedrock.model-provider';
import { MODEL_PROVIDER } from './model-provider';
import { ToolExecutorService } from './tool-executor.service';
import { ToolRegistryModule } from './tool-registry.module';

@Module({
  imports: [PolicyModule, ConnectionsModule, ToolRegistryModule],
  controllers: [AssistantController],
  providers: [
    ToolExecutorService,
    AssistantService,
    {
      provide: MODEL_PROVIDER,
      useFactory: (config: ConfigService) =>
        new LazyBedrockModelProvider(config),
      inject: [ConfigService],
    },
  ],
  exports: [MODEL_PROVIDER, AssistantService],
})
export class AssistantModule {}
