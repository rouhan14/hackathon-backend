import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { NotionAuthController } from './notion-auth.controller';
import { NotionAuthService } from './notion-auth.service';

@Module({
  imports: [HttpModule],
  controllers: [NotionAuthController],
  providers: [NotionAuthService],
  exports: [NotionAuthService],
})
export class NotionAuthModule {}
