import { randomUUID } from 'crypto';
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationConnection } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

const NOTION_AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize';
const NOTION_TOKEN_URL = 'https://api.notion.com/v1/oauth/token';
const NOTION_REVOKE_URL = 'https://api.notion.com/v1/oauth/revoke';
const PROVIDER = 'notion';
/** How long an issued OAuth state stays valid before the callback must consume it. */
const STATE_TTL_MS = 10 * 60 * 1000;

export interface NotionTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_id: string;
  workspace_name: string | null;
  workspace_icon: string | null;
  owner: unknown;
  duplicated_template_id: string | null;
}

@Injectable()
export class NotionAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  private get clientId(): string {
    return this.config.getOrThrow<string>('NOTION_CLIENT_ID');
  }

  private get clientSecret(): string {
    return this.config.getOrThrow<string>('NOTION_CLIENT_SECRET');
  }

  private get redirectUri(): string {
    return this.config.getOrThrow<string>('NOTION_REDIRECT_URI');
  }

  /**
   * Start the OAuth flow: mint a single-use CSRF state, persist it, and return
   * the Notion consent URL to redirect the user to.
   */
  async startAuthorization(): Promise<string> {
    const state = randomUUID();
    await this.prisma.oAuthState.create({
      data: {
        state,
        provider: PROVIDER,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });
    return this.buildAuthorizationUrl(state);
  }

  /**
   * Verify the state returned on the callback: it must exist and not be expired.
   * The state is consumed (deleted) so it can never be replayed.
   */
  async verifyState(state: string): Promise<void> {
    const record = await this.prisma.oAuthState.findUnique({
      where: { state },
    });
    if (!record) {
      throw new BadRequestException('Invalid or unknown OAuth state.');
    }

    // Single-use: delete it regardless of whether it turns out to be expired.
    await this.prisma.oAuthState.delete({ where: { state } });

    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('OAuth state has expired.');
    }
  }

  /** Exchange the authorization code from the callback for an access token. */
  async exchangeCodeForToken(code: string): Promise<NotionTokenResponse> {
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
              'Notion-Version': '2022-06-28',
            },
          },
        ),
      );
      return response.data;
    } catch {
      throw new InternalServerErrorException(
        'Failed to exchange Notion authorization code for an access token.',
      );
    }
  }

  /**
   * Revoke an access token at Notion. Best-effort: returns true on success,
   * false if Notion rejects it (e.g. already invalid) — the caller still
   * removes our stored copy either way.
   */
  async revokeToken(accessToken: string): Promise<boolean> {
    const basicAuth = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString('base64');

    try {
      await firstValueFrom(
        this.http.post(
          NOTION_REVOKE_URL,
          { token: accessToken },
          {
            headers: {
              Authorization: `Basic ${basicAuth}`,
              'Content-Type': 'application/json',
              'Notion-Version': '2022-06-28',
            },
          },
        ),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Store the token, keyed by workspace. Re-authing the same workspace updates
   * the existing row (thanks to the provider+workspaceId unique constraint)
   * instead of creating duplicates.
   */
  async persistConnection(
    token: NotionTokenResponse,
  ): Promise<IntegrationConnection> {
    const data = {
      provider: PROVIDER,
      workspaceId: token.workspace_id,
      workspaceName: token.workspace_name,
      botId: token.bot_id,
      accessToken: token.access_token,
      raw: token as unknown as object,
    };

    return this.prisma.integrationConnection.upsert({
      where: {
        provider_workspaceId: {
          provider: PROVIDER,
          workspaceId: token.workspace_id,
        },
      },
      create: data,
      update: data,
    });
  }

  private buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      owner: 'user',
      state,
    });
    return `${NOTION_AUTHORIZE_URL}?${params.toString()}`;
  }
}
