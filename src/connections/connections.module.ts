import { Module } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { TokenVaultService } from './token-vault.service';

@Module({
  providers: [ConnectionsService, TokenVaultService],
  exports: [ConnectionsService, TokenVaultService],
})
export class ConnectionsModule {}
