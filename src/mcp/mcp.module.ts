import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { McpService } from './mcp.service';

@Module({
  imports: [ConfigModule],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule {}
