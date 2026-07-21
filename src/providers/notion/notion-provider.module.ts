import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { McpModule } from '../../mcp/mcp.module';
import { ConnectionsModule } from '../../connections/connections.module';
import { NotionAdapter } from './notion.adapter';
import { NotionAssistantToolsRegistrar } from './notion-assistant-tools.registrar';
import { NotionAuthController } from './notion-auth.controller';
import { NotionAuthService } from './notion-auth.service';
import { NotionMcpService } from './notion-mcp.service';

@Module({
  imports: [HttpModule, ConnectionsModule, McpModule],
  controllers: [NotionAuthController],
  providers: [
    NotionAdapter,
    NotionAuthService,
    NotionMcpService,
    NotionAssistantToolsRegistrar,
  ],
  exports: [NotionAdapter, NotionMcpService],
})
export class NotionProviderModule {}
