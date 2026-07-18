import { Module } from '@nestjs/common';
import { ContextModule } from '../context/context.module';
import { PolicyModule } from '../policy/policy.module';
import { ProvidersModule } from '../providers/providers.module';
import { ToolRegistryService } from './tool-registry.service';

@Module({
  imports: [ContextModule, PolicyModule, ProvidersModule],
  providers: [ToolRegistryService],
  exports: [ToolRegistryService],
})
export class AssistantModule {}
