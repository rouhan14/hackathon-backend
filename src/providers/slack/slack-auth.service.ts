import { HttpService } from '@nestjs/axios';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderName } from '@prisma/client';
import { randomUUID } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { ConnectionsService } from '../../connections/connections.service';
import { TokenVaultService } from '../../connections/token-vault.service';
import {
  SLACK_AUTHORIZE_URL,
  SLACK_BOT_SCOPES,
  SLACK_TOKEN_URL,
} from './slack.constants';
import { SlackTokenResponse } from './slack.types';

const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class SlackAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly connections: ConnectionsService,
    private readonly tokenVault: TokenVaultService,
  ) {}

  async startAuthorization(userId: string): Promise<string> {
    const state = randomUUID();
    await this.connections.issueOAuthState({
      state, provider: ProviderName.SLACK, userId,
      redirectUri: this.redirectUri,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: SLACK_BOT_SCOPES,
    });
    return `${SLACK_AUTHORIZE_URL}?${params.toString()}`;
  }

  async completeAuthorization(code: string, state: string): Promise<void> {
    const context = await this.connections.consumeOAuthState(state, ProviderName.SLACK);
    const response = await firstValueFrom(this.http.post<SlackTokenResponse>(
      SLACK_TOKEN_URL,
      new URLSearchParams({ code, redirect_uri: this.redirectUri, client_id: this.clientId, client_secret: this.clientSecret }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    ));
    const token = response.data;
    if (!token.ok || !token.access_token || !token.team?.id) {
      throw new InternalServerErrorException(`Slack OAuth failed: ${token.error ?? 'invalid response'}`);
    }
    await this.connections.save({
      organizationId: context.organizationId,
      userId: context.userId,
      provider: ProviderName.SLACK,
      accountId: token.team.id,
      accountName: token.team.name,
      workspaceId: token.team.id,
      workspaceName: token.team.name,
      botId: token.bot_user_id,
      accessTokenEncrypted: this.tokenVault.encrypt(token.access_token),
      grantedScopes: token.scope?.split(',').map((scope) => scope.trim()).filter(Boolean) ?? [],
      metadata: { botUserId: token.bot_user_id, authedUserId: token.authed_user?.id },
    });
  }

  private get clientId(): string { return this.config.getOrThrow<string>('SLACK_CLIENT_ID'); }
  private get clientSecret(): string { return this.config.getOrThrow<string>('SLACK_CLIENT_SECRET'); }
  private get redirectUri(): string { return this.config.getOrThrow<string>('SLACK_OAUTH_REDIRECT'); }
}
