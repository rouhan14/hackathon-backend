import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderName } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderCredential,
} from '../provider-adapter';
import { NOTION_API_VERSION, NOTION_REVOKE_URL } from './notion.constants';

@Injectable()
export class NotionAdapter implements ProviderAdapter {
  readonly provider = ProviderName.NOTION;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  getCapabilities(): ProviderCapabilities {
    return {
      provider: this.provider,
      supportsLiveSearch: false,
      supportsIncrementalSync: false,
      supportsWebhooks: true,
      supportedActions: [],
    };
  }

  async revoke(credential: ProviderCredential): Promise<boolean> {
    const basicAuth = Buffer.from(
      `${this.config.getOrThrow<string>('NOTION_CLIENT_ID')}:${this.config.getOrThrow<string>('NOTION_CLIENT_SECRET')}`,
    ).toString('base64');
    try {
      await firstValueFrom(
        this.http.post(
          NOTION_REVOKE_URL,
          { token: credential.accessToken },
          {
            headers: {
              Authorization: `Basic ${basicAuth}`,
              'Content-Type': 'application/json',
              'Notion-Version': NOTION_API_VERSION,
            },
          },
        ),
      );
      return true;
    } catch {
      // Revocation is best-effort. The local encrypted credential is removed
      // even if Notion says it is already invalid.
      return false;
    }
  }
}
