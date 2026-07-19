import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../../connections/connections.module';
import { ClickUpAdapter } from './clickup.adapter';
import { ClickUpAssistantToolsRegistrar } from './clickup-assistant-tools.registrar';
import { ClickUpAuthController } from './clickup-auth.controller';
import { ClickUpMcpService } from './clickup-mcp.service';
import { ClickUpController } from './clickup.controller';

@Module({
  imports: [ConnectionsModule],
  controllers: [ClickUpAuthController, ClickUpController],
  providers: [
    ClickUpAdapter,
    ClickUpMcpService,
    ClickUpAssistantToolsRegistrar,
  ],
  exports: [ClickUpAdapter, ClickUpMcpService],
})
export class ClickUpProviderModule {}
