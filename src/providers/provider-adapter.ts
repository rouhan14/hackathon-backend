import { ProviderName } from '@prisma/client';

export interface ProviderCapabilities {
  provider: ProviderName;
  supportsLiveSearch: boolean;
  supportsIncrementalSync: boolean;
  supportsWebhooks: boolean;
  supportedActions: string[];
}

export interface ProviderCredential {
  connectionId: string;
  accessToken: string;
  refreshToken?: string;
}

export interface ProviderAdapter {
  readonly provider: ProviderName;
  getCapabilities(): ProviderCapabilities;
  revoke(credential: ProviderCredential): Promise<boolean>;
}
