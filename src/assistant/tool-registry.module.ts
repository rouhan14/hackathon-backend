import { Global, Module } from '@nestjs/common';
import { ToolRegistryService } from './tool-registry.service';

/**
 * Global so provider modules (Jira, future Gmail, etc.) can register tools
 * without the assistant module importing those providers for bootstrap.
 */
@Global()
@Module({
  providers: [ToolRegistryService],
  exports: [ToolRegistryService],
})
export class ToolRegistryModule {}
