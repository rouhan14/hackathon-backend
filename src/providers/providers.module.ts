import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { NotionAdapter } from './notion/notion.adapter';
import { NotionProviderModule } from './notion/notion-provider.module';
import { SlackAdapter } from './slack/slack.adapter';
import { SlackProviderModule } from './slack/slack-provider.module';
import { ProviderAdapter } from './provider-adapter';
import { ProviderConnectionsController } from './provider-connections.controller';
import { ProviderConnectionsService } from './provider-connections.service';
import {
  PROVIDER_ADAPTERS,
  ProviderRegistry,
} from './provider-registry.service';

@Module({
  imports: [ConnectionsModule, NotionProviderModule, SlackProviderModule],
  controllers: [ProviderConnectionsController],
  providers: [
    ProviderConnectionsService,
    ProviderRegistry,
    {
      provide: PROVIDER_ADAPTERS,
      inject: [NotionAdapter, SlackAdapter],
      useFactory: (
        notion: NotionAdapter,
        slack: SlackAdapter,
      ): ProviderAdapter[] => [notion, slack],
    },
  ],
  exports: [ProviderRegistry],
})
export class ProvidersModule {}
