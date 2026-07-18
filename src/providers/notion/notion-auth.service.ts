import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderName } from '@prisma/client';
import { randomUUID } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { ConnectionsService } from '../../connections/connections.service';
import { TokenVaultService } from '../../connections/token-vault.service';
import {
  NOTION_API_VERSION,
  NOTION_AUTHORIZE_URL,
  NOTION_TOKEN_URL,
} from './notion.constants';
import { NotionTokenResponse } from './notion.types';

const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class NotionAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly connections: ConnectionsService,
    private readonly tokenVault: TokenVaultService,
  ) {}

  async startAuthorization(userId: string): Promise<string> {
    const state = randomUUID();
    await this.connections.issueOAuthState({
      state,
      provider: ProviderName.NOTION,
      userId,
      redirectUri: this.redirectUri,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });
    return this.buildAuthorizationUrl(state);
  }

  async completeAuthorization(code: string, state: string): Promise<void> {
    const context = await this.connections.consumeOAuthState(
      state,
      ProviderName.NOTION,
    );
    const token = await this.exchangeCodeForToken(code);

    await this.connections.save({
      organizationId: context.organizationId,
      userId: context.userId,
      provider: ProviderName.NOTION,
      accountId: token.workspace_id,
      accountName: token.workspace_name,
      workspaceId: token.workspace_id,
      workspaceName: token.workspace_name,
      botId: token.bot_id,
      accessTokenEncrypted: this.tokenVault.encrypt(token.access_token),
      refreshTokenEncrypted: token.refresh_token
        ? this.tokenVault.encrypt(token.refresh_token)
        : null,
      tokenExpiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      // Do not persist the raw token response. It contains credentials.
      metadata: {
        tokenType: token.token_type,
        workspaceIcon: token.workspace_icon,
        duplicatedTemplateId: token.duplicated_template_id,
      },
    });
  }

  private async exchangeCodeForToken(
    code: string,
  ): Promise<NotionTokenResponse> {
    const basicAuth = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString('base64');

    try {
      const response = await firstValueFrom(
        this.http.post<NotionTokenResponse>(
          NOTION_TOKEN_URL,
          {
            grant_type: 'authorization_code',
            code,
            redirect_uri: this.redirectUri,
          },
          {
            headers: {
              Authorization: `Basic ${basicAuth}`,
              'Content-Type': 'application/json',
              'Notion-Version': NOTION_API_VERSION,
            },
          },
        ),
      );
      return response.data;
    } catch {
      throw new InternalServerErrorException(
        'Failed to exchange the Notion authorization code.',
      );
    }
  }

  private buildAuthorizationUrl(state: string): string {
    if (!state) {
      throw new BadRequestException('OAuth state is required.');
    }
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      owner: 'user',
      state,
    });
    return `${NOTION_AUTHORIZE_URL}?${params.toString()}`;
  }

  private get clientId(): string {
    return this.config.getOrThrow<string>('NOTION_CLIENT_ID');
  }

  private get clientSecret(): string {
    return this.config.getOrThrow<string>('NOTION_CLIENT_SECRET');
  }

  private get redirectUri(): string {
    return this.config.getOrThrow<string>('NOTION_REDIRECT_URI');
  }
}
