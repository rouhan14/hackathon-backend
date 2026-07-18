import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProviderName } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ConnectionsService } from '../../connections/connections.service';
import { TokenVaultService } from '../../connections/token-vault.service';
import {
  ATLASSIAN_ACCESSIBLE_RESOURCES_URL,
  ATLASSIAN_ACCESSIBLE_RESOURCES_TOOL,
  ATLASSIAN_JIRA_SEARCH_TOOL,
  ATLASSIAN_ROVO_MCP_URL,
  JIRA_OAUTH_STATE_TTL_MS,
  JIRA_REAUTH_REQUIRED_CODE,
  connectionHasJiraSearchAccess,
  JIRA_SEARCH_REQUIRED_SCOPE,
} from './jira.constants';
import { JiraSearchDto } from './dto/jira-search.dto';
import {
  JiraNoAccessibleSitesException,
  JiraReauthRequiredException,
  JiraSearchPermissionRequiredException,
} from './jira.errors';
import { JiraOAuthClientProvider } from './jira-oauth-client.provider';
import { normalizeJiraSearchResult } from './jira-search-normalize';
import type {
  AtlassianResource,
  JiraAuthorizationResult,
  JiraConnectionMetadata,
  JiraOAuthStateMetadata,
} from './jira.types';

@Injectable()
export class JiraMcpService {
  private readonly logger = new Logger(JiraMcpService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly connections: ConnectionsService,
    private readonly tokenVault: TokenVaultService,
  ) {}

  async startAuthorization(userId: string): Promise<string> {
    const state = randomUUID();
    const correlationId = oauthCorrelationId(state);
    this.logger.log(
      `Starting Jira OAuth authorization correlationId=${correlationId} userId=${userId} redirectUri=${this.redirectUri}`,
    );
    await this.connections.issueOAuthState({
      state,
      provider: ProviderName.JIRA,
      userId,
      redirectUri: this.redirectUri,
      expiresAt: new Date(Date.now() + JIRA_OAUTH_STATE_TTL_MS),
    });

    const provider = new JiraOAuthClientProvider({
      redirectUrl: this.redirectUri,
      state,
      onClientInformation: async (clientInformation) => {
        await this.connections.updateOAuthState(state, {
          metadata: toJson({
            clientInformationEncrypted: this.tokenVault.encrypt(
              JSON.stringify(clientInformation),
            ),
          }),
        });
        this.logger.log(
          `Stored Jira MCP client registration correlationId=${correlationId}`,
        );
      },
      onCodeVerifier: async (codeVerifier) => {
        await this.connections.updateOAuthState(state, { codeVerifier });
        this.logger.log(
          `Stored Jira PKCE verifier correlationId=${correlationId}`,
        );
      },
    });
    const client = this.createClient();
    const transport = this.createTransport(provider);

    try {
      await client.connect(transport);
    } catch (error) {
      if (error instanceof UnauthorizedError && provider.authorizationUrl) {
        this.logger.log(
          `Jira authorization URL created correlationId=${correlationId} authorizationOrigin=${provider.authorizationUrl.origin}`,
        );
        return provider.authorizationUrl.toString();
      }
      this.logger.error(
        `Jira OAuth authorization start failed correlationId=${correlationId}: ${errorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadGatewayException(
        'Atlassian did not start the Jira authorization flow.',
      );
    } finally {
      await client.close().catch(() => undefined);
    }

    throw new BadRequestException('The Jira connection is already authorized.');
  }

  async completeAuthorization(
    code: string,
    state: string,
  ): Promise<JiraAuthorizationResult> {
    const correlationId = oauthCorrelationId(state);
    let stage = 'consume-oauth-state';

    this.logger.log(
      `Completing Jira OAuth authorization correlationId=${correlationId}`,
    );

    let context: Awaited<ReturnType<ConnectionsService['consumeOAuthState']>>;
    try {
      context = await this.connections.consumeOAuthState(
        state,
        ProviderName.JIRA,
      );
    } catch (error) {
      this.logAuthorizationFailure(correlationId, stage, error);
      throw error;
    }

    this.logger.log(
      `Consumed Jira OAuth state correlationId=${correlationId} hasRedirectUri=${Boolean(context.redirectUri)} hasCodeVerifier=${Boolean(context.codeVerifier)} hasClientMetadata=${Boolean(context.metadata)}`,
    );
    stage = 'validate-oauth-session';
    if (!context.redirectUri || !context.codeVerifier) {
      const error = new BadRequestException(
        'The Jira OAuth session is incomplete.',
      );
      this.logAuthorizationFailure(correlationId, stage, error);
      throw error;
    }

    stage = 'load-mcp-client-registration';
    const stateMetadata = readStateMetadata(context.metadata);
    if (!stateMetadata.clientInformationEncrypted) {
      const error = new BadRequestException(
        'The Jira OAuth client registration is missing.',
      );
      this.logAuthorizationFailure(correlationId, stage, error);
      throw error;
    }
    let clientInformation: OAuthClientInformationMixed;
    try {
      clientInformation = this.decryptClientInformation(
        stateMetadata.clientInformationEncrypted,
      );
    } catch (error) {
      this.logAuthorizationFailure(correlationId, stage, error);
      throw error;
    }

    const provider = new JiraOAuthClientProvider({
      redirectUrl: context.redirectUri,
      state,
      codeVerifier: context.codeVerifier,
      clientInformation,
    });

    try {
      stage = 'exchange-authorization-code';
      const authTransport = this.createTransport(provider);
      await authTransport.finishAuth(code);
      this.logger.log(
        `Jira OAuth token exchange completed correlationId=${correlationId} hasAccessToken=${Boolean(provider.currentTokens?.access_token)} hasRefreshToken=${Boolean(provider.currentTokens?.refresh_token)}`,
      );

      stage = 'connect-authenticated-mcp-client';
      const client = this.createClient();
      const transport = this.createTransport(provider);
      try {
        await client.connect(transport);
        this.logger.log(
          `Connected authenticated Jira MCP client correlationId=${correlationId}`,
        );
        const tokens = provider.currentTokens;
        const currentClientInformation = provider.currentClientInformation;
        if (!tokens?.access_token || !currentClientInformation) {
          throw new Error(
            'Atlassian did not return reusable OAuth credentials.',
          );
        }

        stage = 'discover-accessible-jira-sites';
        const result = await client.callTool({
          name: ATLASSIAN_ACCESSIBLE_RESOURCES_TOOL,
          arguments: {},
        });
        let resources = result.isError
          ? []
          : extractAccessibleResources(result);
        this.logger.log(
          `Discovered Jira resources correlationId=${correlationId} resourceCount=${resources.length} toolReturnedError=${Boolean(result.isError)}`,
        );
        if (result.isError || resources.length === 0) {
          this.logger.warn(
            `Jira MCP resource discovery returned no usable sites correlationId=${correlationId}; trying Atlassian OAuth accessible-resources fallback`,
          );
          resources = await this.fetchAccessibleResources(
            tokens.access_token,
            correlationId,
          );
        }
        if (resources.length === 0) {
          throw new JiraNoAccessibleSitesException();
        }

        const credentialGroupId = randomUUID();

        stage = 'persist-jira-connections';
        await Promise.all(
          resources.map((resource) =>
            this.saveConnection(
              context.organizationId,
              context.userId,
              resource,
              tokens,
              currentClientInformation,
              credentialGroupId,
            ),
          ),
        );
        this.logger.log(
          `Persisted Jira connections correlationId=${correlationId} connectionCount=${resources.length}`,
        );
        return { connectedSites: resources.length };
      } finally {
        await client.close().catch(() => undefined);
      }
    } catch (error) {
      if (error instanceof JiraNoAccessibleSitesException) {
        this.logger.warn(
          `Jira OAuth authorization completed without an authorized site correlationId=${correlationId} stage=${stage}`,
        );
        throw error;
      }
      this.logAuthorizationFailure(correlationId, stage, error);
      throw new BadGatewayException(
        `Atlassian could not complete the Jira connection at stage "${stage}".`,
        { cause: error },
      );
    }
  }

  async searchIssues(
    userId: string,
    connectionId: string,
    input: JiraSearchDto,
  ): Promise<unknown> {
    const connection = await this.connections.findOwnedCredential(
      userId,
      connectionId,
    );
    if (connection.provider !== ProviderName.JIRA) {
      throw new BadRequestException('The selected connection is not Jira.');
    }
    if (!connection.workspaceId) {
      throw new BadRequestException('The Jira connection has no cloudId.');
    }
    if (!connectionHasJiraSearchAccess(connection.grantedScopes)) {
      this.logger.warn(
        `Jira search blocked before MCP call userId=${userId} connectionId=${connectionId} grantedScopes=${connection.grantedScopes.join(',') || 'none'} need=${JIRA_SEARCH_REQUIRED_SCOPE}|read:jira-work`,
      );
      throw new JiraSearchPermissionRequiredException();
    }

    const metadata = readConnectionMetadata(connection.metadata);
    const clientInformation = this.decryptClientInformation(
      metadata.mcpClientInformationEncrypted,
    );
    const provider = new JiraOAuthClientProvider({
      redirectUrl: this.redirectUri,
      state: randomUUID(),
      clientInformation,
      tokens: this.tokensFromConnection(connection, metadata),
      onTokens: async (tokens) => {
        await this.connections.updateOwnedCredentialTokens(
          userId,
          connectionId,
          this.tokenUpdate(tokens),
        );
      },
      onRedirect: async () => {
        await this.markReauthRequired(userId, connectionId);
        throw new JiraReauthRequiredException();
      },
    });
    const client = this.createClient();
    const transport = this.createTransport(provider);

    const jql = normalizeJiraJql(input.jql);
    const maxResults = input.maxResults ?? 25;

    try {
      await client.connect(transport);
      this.logger.log(
        `Jira MCP search cloudId=${connection.workspaceId} jql=${JSON.stringify(jql)} maxResults=${maxResults}`,
      );
      const result = await client.callTool({
        name: ATLASSIAN_JIRA_SEARCH_TOOL,
        arguments: {
          cloudId: connection.workspaceId,
          jql,
          maxResults,
        },
      });
      if (result.isError) {
        const detail = extractMcpErrorText(result);
        this.logger.warn(
          `Jira MCP search rejected cloudId=${connection.workspaceId} detail=${detail}`,
        );
        throw new BadGatewayException(
          detail
            ? `Jira rejected the search request: ${detail}`
            : 'Jira rejected the search request.',
        );
      }
      const normalized = normalizeJiraSearchResult({
        connectionId,
        cloudId: connection.workspaceId,
        jql,
        result,
      });
      this.logger.log(
        `Jira MCP search ok cloudId=${connection.workspaceId} issueCount=${normalized.issueCount} total=${normalized.total ?? 'n/a'}`,
      );
      return normalized;
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof JiraReauthRequiredException
      ) {
        throw error;
      }
      if (error instanceof UnauthorizedError) {
        await this.markReauthRequired(userId, connectionId);
        throw new JiraReauthRequiredException();
      }
      this.logger.error(
        `Jira MCP search failed connectionId=${connectionId}: ${errorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadGatewayException(
        `The Jira search request failed: ${errorMessage(error)}`,
      );
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private createClient(): Client {
    return new Client(
      { name: 'ai-work-os-backend', version: '0.1.0' },
      { capabilities: {} },
    );
  }

  private createTransport(
    provider: JiraOAuthClientProvider,
  ): StreamableHTTPClientTransport {
    return new StreamableHTTPClientTransport(new URL(this.mcpUrl), {
      authProvider: provider,
    });
  }

  private async saveConnection(
    organizationId: string,
    userId: string,
    resource: AtlassianResource,
    tokens: OAuthTokens,
    clientInformation: OAuthClientInformationMixed,
    credentialGroupId: string,
  ): Promise<void> {
    const metadata: JiraConnectionMetadata = {
      mcpClientInformationEncrypted: this.tokenVault.encrypt(
        JSON.stringify(clientInformation),
      ),
      siteUrl: resource.url,
      avatarUrl: resource.avatarUrl,
      tokenType: tokens.token_type,
    };
    await this.connections.save({
      organizationId,
      userId,
      provider: ProviderName.JIRA,
      accountId: resource.id,
      accountName: resource.name,
      workspaceId: resource.id,
      workspaceName: resource.name,
      accessTokenEncrypted: this.tokenVault.encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token
        ? this.tokenVault.encrypt(tokens.refresh_token)
        : null,
      tokenExpiresAt: expiresAt(tokens),
      grantedScopes: tokenScopes(tokens, resource.scopes),
      credentialGroupId,
      metadata: toJson(metadata),
    });
  }

  private async fetchAccessibleResources(
    accessToken: string,
    correlationId: string,
  ): Promise<AtlassianResource[]> {
    const response = await fetch(ATLASSIAN_ACCESSIBLE_RESOURCES_URL, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(
        `Atlassian accessible-resources fallback returned HTTP ${response.status}.`,
      );
    }

    const resources = extractAccessibleResourcesPayload(
      (await response.json()) as unknown,
    );
    this.logger.log(
      `Atlassian accessible-resources fallback completed correlationId=${correlationId} resourceCount=${resources.length}`,
    );
    return resources;
  }

  private tokensFromConnection(
    connection: Awaited<ReturnType<ConnectionsService['findOwnedCredential']>>,
    metadata: JiraConnectionMetadata,
  ): OAuthTokens {
    const remainingSeconds = connection.tokenExpiresAt
      ? Math.max(
          0,
          Math.floor((connection.tokenExpiresAt.getTime() - Date.now()) / 1000),
        )
      : undefined;
    return {
      access_token: this.tokenVault.decrypt(connection.accessTokenEncrypted),
      token_type: metadata.tokenType ?? 'Bearer',
      refresh_token: connection.refreshTokenEncrypted
        ? this.tokenVault.decrypt(connection.refreshTokenEncrypted)
        : undefined,
      expires_in: remainingSeconds,
      scope: connection.grantedScopes.join(' '),
    };
  }

  private tokenUpdate(
    tokens: OAuthTokens,
  ): Parameters<ConnectionsService['updateOwnedCredentialTokens']>[2] {
    return {
      accessTokenEncrypted: this.tokenVault.encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token
        ? this.tokenVault.encrypt(tokens.refresh_token)
        : null,
      tokenExpiresAt: expiresAt(tokens),
      grantedScopes: tokenScopes(tokens),
    };
  }

  private decryptClientInformation(
    encryptedValue: string,
  ): OAuthClientInformationMixed {
    try {
      const value = JSON.parse(
        this.tokenVault.decrypt(encryptedValue),
      ) as unknown;
      if (!isRecord(value) || typeof value.client_id !== 'string') {
        throw new Error('Invalid MCP client registration.');
      }
      return value as OAuthClientInformationMixed;
    } catch {
      throw new BadRequestException(
        'The Jira MCP client registration could not be loaded.',
      );
    }
  }

  private async markReauthRequired(
    userId: string,
    connectionId: string,
  ): Promise<void> {
    await this.connections.markOwnedCredentialReauthRequired(
      userId,
      connectionId,
      JIRA_REAUTH_REQUIRED_CODE,
      'The Jira connection must be authorized again.',
    );
  }

  private logAuthorizationFailure(
    correlationId: string,
    stage: string,
    error: unknown,
  ): void {
    this.logger.error(
      `Jira OAuth authorization failed correlationId=${correlationId} stage=${stage}: ${errorMessage(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
  }

  private get redirectUri(): string {
    return this.config.getOrThrow<string>('JIRA_REDIRECT_URI');
  }

  private get mcpUrl(): string {
    return this.config.get<string>('ATLASSIAN_MCP_URL', ATLASSIAN_ROVO_MCP_URL);
  }
}

function oauthCorrelationId(state: string): string {
  return state.slice(0, 8);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function expiresAt(tokens: OAuthTokens): Date | null {
  return typeof tokens.expires_in === 'number'
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;
}

function tokenScopes(tokens: OAuthTokens, fallback: string[] = []): string[] {
  return tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : fallback;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readStateMetadata(
  value: Prisma.JsonValue | null,
): JiraOAuthStateMetadata {
  if (!isRecord(value)) {
    return {};
  }
  return {
    clientInformationEncrypted:
      typeof value.clientInformationEncrypted === 'string'
        ? value.clientInformationEncrypted
        : undefined,
  };
}

function readConnectionMetadata(
  value: Prisma.JsonValue | null,
): JiraConnectionMetadata {
  if (
    !isRecord(value) ||
    typeof value.mcpClientInformationEncrypted !== 'string'
  ) {
    throw new BadRequestException(
      'The Jira connection is missing its MCP client registration.',
    );
  }
  return {
    mcpClientInformationEncrypted: value.mcpClientInformationEncrypted,
    siteUrl: typeof value.siteUrl === 'string' ? value.siteUrl : undefined,
    avatarUrl:
      typeof value.avatarUrl === 'string' ? value.avatarUrl : undefined,
    tokenType:
      typeof value.tokenType === 'string' ? value.tokenType : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractAccessibleResources(
  result: unknown,
): AtlassianResource[] {
  return extractAccessibleResourcesPayload(extractToolPayload(result));
}

export function extractAccessibleResourcesPayload(
  payload: unknown,
): AtlassianResource[] {
  const candidates = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.resources)
      ? payload.resources
      : [];

  return candidates.flatMap((candidate) => {
    if (!isRecord(candidate)) {
      return [];
    }
    const id =
      typeof candidate.id === 'string'
        ? candidate.id
        : typeof candidate.cloudId === 'string'
          ? candidate.cloudId
          : undefined;
    if (!id) {
      return [];
    }
    const scopes = Array.isArray(candidate.scopes)
      ? candidate.scopes.filter(
          (scope): scope is string => typeof scope === 'string',
        )
      : [];
    if (!scopes.some(isJiraScope)) {
      return [];
    }
    return [
      {
        id,
        name:
          typeof candidate.name === 'string'
            ? candidate.name
            : 'Atlassian Jira',
        url: typeof candidate.url === 'string' ? candidate.url : undefined,
        avatarUrl:
          typeof candidate.avatarUrl === 'string'
            ? candidate.avatarUrl
            : undefined,
        scopes,
      },
    ];
  });
}

function isJiraScope(scope: string): boolean {
  return scope.toLowerCase().includes('jira');
}

function extractToolPayload(result: unknown): unknown {
  if (!isRecord(result)) {
    return undefined;
  }
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  if (!Array.isArray(result.content)) {
    return undefined;
  }
  for (const block of result.content) {
    if (
      isRecord(block) &&
      block.type === 'text' &&
      typeof block.text === 'string'
    ) {
      try {
        return JSON.parse(block.text) as unknown;
      } catch {
        continue;
      }
    }
  }
  return undefined;
}

/**
 * Bare "ORDER BY …" is rejected by many Jira/MCP setups. Prefer a bounded query.
 */
export function normalizeJiraJql(jql: string): string {
  const trimmed = jql?.trim() ?? '';
  if (!trimmed || /^true$/i.test(trimmed)) {
    return 'updated >= -90d ORDER BY updated DESC';
  }
  if (/^order\s+by\b/i.test(trimmed)) {
    return `updated >= -90d ${trimmed}`;
  }
  return trimmed;
}

export function extractMcpErrorText(result: unknown): string {
  if (!isRecord(result)) {
    return '';
  }
  const chunks: string[] = [];
  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (
        isRecord(block) &&
        typeof block.text === 'string' &&
        block.text.trim()
      ) {
        chunks.push(block.text.trim());
      }
    }
  }
  if (typeof result.message === 'string' && result.message.trim()) {
    chunks.push(result.message.trim());
  }
  if (result.structuredContent !== undefined) {
    try {
      chunks.push(JSON.stringify(result.structuredContent));
    } catch {
      // ignore
    }
  }
  return chunks.join(' | ').slice(0, 800);
}
