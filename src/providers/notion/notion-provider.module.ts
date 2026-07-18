import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../../connections/connections.module';
import { NotionAdapter } from './notion.adapter';
import { NotionAuthController } from './notion-auth.controller';
import { NotionAuthService } from './notion-auth.service';

@Module({
  imports: [HttpModule, ConnectionsModule],
  controllers: [NotionAuthController],
  providers: [NotionAdapter, NotionAuthService],
  exports: [NotionAdapter],
})
export class NotionProviderModule {}
