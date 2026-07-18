import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderName } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { ProviderAdapter, ProviderCapabilities, ProviderCredential } from '../provider-adapter';
import { SLACK_REVOKE_URL } from './slack.constants';

@Injectable()
export class SlackAdapter implements ProviderAdapter {
  readonly provider = ProviderName.SLACK;
  constructor(private readonly http: HttpService, private readonly config: ConfigService) {}
  getCapabilities(): ProviderCapabilities { return { provider: this.provider, supportsLiveSearch: false, supportsIncrementalSync: false, supportsWebhooks: true, supportedActions: [] }; }
  async revoke(credential: ProviderCredential): Promise<boolean> {
    try {
      const result = await firstValueFrom(this.http.post<{ ok: boolean }>(SLACK_REVOKE_URL, null, { params: { token: credential.accessToken }, headers: { Authorization: `Bearer ${credential.accessToken}` } }));
      return result.data.ok;
    } catch { return false; }
  }
}
