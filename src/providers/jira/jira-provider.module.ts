import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../../connections/connections.module';
import { JiraAdapter } from './jira.adapter';
import { JiraAssistantToolsRegistrar } from './jira-assistant-tools.registrar';
import { JiraAuthController } from './jira-auth.controller';
import { JiraController } from './jira.controller';
import { JiraMcpService } from './jira-mcp.service';

@Module({
  imports: [ConnectionsModule],
  controllers: [JiraAuthController, JiraController],
  providers: [JiraAdapter, JiraMcpService, JiraAssistantToolsRegistrar],
  exports: [JiraAdapter, JiraMcpService],
})
export class JiraProviderModule {}
