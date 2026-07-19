import { Injectable } from '@nestjs/common';
import { ProviderName } from '@prisma/client';
import { ProviderAdapter, ProviderCapabilities } from '../provider-adapter';

@Injectable()
export class ClickUpAdapter implements ProviderAdapter {
  readonly provider = ProviderName.CLICKUP;

  getCapabilities(): ProviderCapabilities {
    return {
      provider: this.provider,
      supportsLiveSearch: true,
      supportsIncrementalSync: false,
      supportsWebhooks: false,
      supportedActions: ['search_workspace', 'get_task'],
    };
  }

  revoke(): Promise<boolean> {
    // The hosted MCP flow does not currently expose a provider-neutral
    // revocation operation. Disconnect still deletes local encrypted tokens.
    return Promise.resolve(false);
  }
}
