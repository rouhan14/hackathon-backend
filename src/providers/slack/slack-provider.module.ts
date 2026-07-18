import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../../connections/connections.module';
import { SlackAdapter } from './slack.adapter';
import { SlackAuthController } from './slack-auth.controller';
import { SlackAuthService } from './slack-auth.service';

@Module({ imports: [HttpModule, ConnectionsModule], controllers: [SlackAuthController], providers: [SlackAdapter, SlackAuthService], exports: [SlackAdapter] })
export class SlackProviderModule {}
