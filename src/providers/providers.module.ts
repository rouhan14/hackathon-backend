import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { JiraAdapter } from './jira/jira.adapter';
import { JiraProviderModule } from './jira/jira-provider.module';
import { NotionAdapter } from './notion/notion.adapter';
import { NotionProviderModule } from './notion/notion-provider.module';
import { ProviderAdapter } from './provider-adapter';
import { ProviderConnectionsController } from './provider-connections.controller';
import { ProviderConnectionsService } from './provider-connections.service';
import {
  PROVIDER_ADAPTERS,
  ProviderRegistry,
} from './provider-registry.service';

@Module({
  imports: [ConnectionsModule, NotionProviderModule, JiraProviderModule],
  controllers: [ProviderConnectionsController],
  providers: [
    ProviderConnectionsService,
    ProviderRegistry,
    {
      provide: PROVIDER_ADAPTERS,
      inject: [NotionAdapter, JiraAdapter],
      useFactory: (
        notion: NotionAdapter,
        jira: JiraAdapter,
      ): ProviderAdapter[] => [notion, jira],
    },
  ],
  exports: [ProviderRegistry],
})
export class ProvidersModule {}
