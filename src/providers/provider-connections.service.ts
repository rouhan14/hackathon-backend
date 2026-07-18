import { Injectable } from '@nestjs/common';
import { ConnectionsService } from '../connections/connections.service';
import { TokenVaultService } from '../connections/token-vault.service';
import { ProviderRegistry } from './provider-registry.service';

export interface DisconnectResult {
  disconnected: true;
  revokedAtProvider: boolean;
}

@Injectable()
export class ProviderConnectionsService {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly tokenVault: TokenVaultService,
    private readonly providers: ProviderRegistry,
  ) {}

  async disconnect(userId: string, id: string): Promise<DisconnectResult> {
    const connection = await this.connections.findOwnedCredential(userId, id);
    const adapter = this.providers.get(connection.provider);
    const revokedAtProvider = await adapter.revoke({
      connectionId: connection.id,
      accessToken: this.tokenVault.decrypt(connection.accessTokenEncrypted),
      refreshToken: connection.refreshTokenEncrypted
        ? this.tokenVault.decrypt(connection.refreshTokenEncrypted)
        : undefined,
    });

    await this.connections.removeOwned(userId, id);
    return { disconnected: true, revokedAtProvider };
  }
}
