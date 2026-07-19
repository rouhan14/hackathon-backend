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
import { RemoteMcpOAuthClientProvider } from '../mcp/remote-mcp-oauth-client.provider';
import {
  CLICKUP_GET_TASK_TOOL_CANDIDATES,
  CLICKUP_MCP_ACCOUNT_ID,
  CLICKUP_MCP_URL,
  CLICKUP_OAUTH_STATE_TTL_MS,
  CLICKUP_REAUTH_REQUIRED_CODE,
  CLICKUP_SEARCH_MAX_QUERY_LENGTH,
  CLICKUP_SEARCH_MAX_RESULTS,
  CLICKUP_SEARCH_LIMIT_ARGUMENTS,
  CLICKUP_SEARCH_QUERY_ARGUMENTS,
  CLICKUP_SEARCH_TOOL_CANDIDATES,
  CLICKUP_TASK_ID_ARGUMENTS,
} from './clickup.constants';
import {
  ClickUpAuthStartFailedException,
  ClickUpCapabilityUnavailableException,
  ClickUpClientNotApprovedException,
  ClickUpRateLimitedException,
  ClickUpReauthRequiredException,
} from './clickup.errors';
import {
  normalizeClickUpSearchResult,
  normalizeClickUpTaskResult,
} from './clickup-normalize';
import type {
  ClickUpAuthorizationResult,
  ClickUpConnectionMetadata,
  ClickUpOAuthStateMetadata,
  ClickUpToolBindings,
  McpToolDescriptor,
} from './clickup.types';
import type { ClickUpSearchDto } from './dto/clickup-search.dto';

type ClickUpReadOperation =
  | { kind: 'search'; query: string; limit: number }
  | { kind: 'getTask'; taskId: string };

@Injectable()
export class ClickUpMcpService {
  private readonly logger = new Logger(ClickUpMcpService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly connections: ConnectionsService,
    private readonly tokenVault: TokenVaultService,
  ) {}

  async startAuthorization(userId: string): Promise<string> {
    const state = randomUUID();
    const correlationId = oauthCorrelationId(state);
    await this.connections.issueOAuthState({
      state,
      provider: ProviderName.CLICKUP,
      userId,
      redirectUri: this.redirectUri,
      expiresAt: new Date(Date.now() + CLICKUP_OAUTH_STATE_TTL_MS),
    });

    const provider = new RemoteMcpOAuthClientProvider({
      redirectUrl: this.redirectUri,
      state,
      providerLabel: 'ClickUp',
      onClientInformation: async (clientInformation) => {
        await this.connections.updateOAuthState(state, {
          metadata: toJson({
            clientInformationEncrypted: this.tokenVault.encrypt(
              JSON.stringify(clientInformation),
            ),
          }),
        });
      },
      onCodeVerifier: async (codeVerifier) => {
        await this.connections.updateOAuthState(state, { codeVerifier });
      },
    });
    const client = this.createClient();

    try {
      await client.connect(this.createTransport(provider));
    } catch (error) {
      if (error instanceof UnauthorizedError && provider.authorizationUrl) {
        this.logger.log(
          `ClickUp authorization URL created correlationId=${correlationId} authorizationOrigin=${provider.authorizationUrl.origin}`,
        );
        return provider.authorizationUrl.toString();
      }
      this.logger.error(
        `ClickUp OAuth start failed correlationId=${correlationId} errorType=${errorType(error)}`,
      );
      if (looksLikeClientApprovalFailure(error)) {
        throw new ClickUpClientNotApprovedException();
      }
      throw new ClickUpAuthStartFailedException();
    } finally {
      await client.close().catch(() => undefined);
    }

    throw new BadRequestException(
      'The ClickUp MCP connection is already authorized.',
    );
  }

  async completeAuthorization(
    code: string,
    state: string,
  ): Promise<ClickUpAuthorizationResult> {
    const correlationId = oauthCorrelationId(state);
    let stage = 'consume-oauth-state';
    const context = await this.connections.consumeOAuthState(
      state,
      ProviderName.CLICKUP,
    );

    if (!context.redirectUri || !context.codeVerifier) {
      throw new BadRequestException('The ClickUp OAuth session is incomplete.');
    }
    const stateMetadata = readOAuthStateMetadata(context.metadata);
    if (!stateMetadata.clientInformationEncrypted) {
      throw new BadRequestException(
        'The ClickUp MCP client registration is missing.',
      );
    }

    const clientInformation = this.decryptClientInformation(
      stateMetadata.clientInformationEncrypted,
    );
    const provider = new RemoteMcpOAuthClientProvider({
      redirectUrl: context.redirectUri,
      state,
      providerLabel: 'ClickUp',
      codeVerifier: context.codeVerifier,
      clientInformation,
    });

    try {
      stage = 'exchange-authorization-code';
      await this.createTransport(provider).finishAuth(code);

      stage = 'connect-authenticated-mcp-client';
      const client = this.createClient();
      try {
        await client.connect(this.createTransport(provider));
        const tokens = provider.currentTokens;
        const currentClientInformation = provider.currentClientInformation;
        if (!tokens?.access_token || !currentClientInformation) {
          throw new Error('ClickUp did not return reusable OAuth credentials.');
        }

        stage = 'discover-read-capabilities';
        const toolList = await client.listTools();
        const toolBindings = discoverClickUpToolBindings(toolList.tools);

        stage = 'persist-clickup-connection';
        await this.saveConnection(
          context.organizationId,
          context.userId,
          tokens,
          currentClientInformation,
          toolBindings,
        );
        this.logger.log(
          `ClickUp connection persisted correlationId=${correlationId} searchTool=${toolBindings.search.name} getTaskTool=${toolBindings.getTask.name}`,
        );
        return { connected: true };
      } finally {
        await client.close().catch(() => undefined);
      }
    } catch (error) {
      this.logger.error(
        `ClickUp OAuth completion failed correlationId=${correlationId} stage=${stage} errorType=${errorType(error)}`,
      );
      if (error instanceof ClickUpCapabilityUnavailableException) throw error;
      throw new BadGatewayException(
        `ClickUp could not complete the connection at stage "${stage}".`,
        { cause: error },
      );
    }
  }

  async searchTasks(
    userId: string,
    connectionId: string,
    input: ClickUpSearchDto,
  ) {
    const query = input.query.trim();
    const limit = input.limit ?? 10;
    if (!query || query.length > CLICKUP_SEARCH_MAX_QUERY_LENGTH) {
      throw new BadRequestException(
        `query must contain between 1 and ${CLICKUP_SEARCH_MAX_QUERY_LENGTH} characters.`,
      );
    }
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > CLICKUP_SEARCH_MAX_RESULTS
    ) {
      throw new BadRequestException(
        `limit must be an integer between 1 and ${CLICKUP_SEARCH_MAX_RESULTS}.`,
      );
    }
    const result = await this.executeReadOperation(userId, connectionId, {
      kind: 'search',
      query,
      limit,
    });
    return normalizeClickUpSearchResult({
      connectionId,
      query,
      limit,
      result,
    });
  }

  async getTask(userId: string, connectionId: string, taskId: string) {
    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) {
      throw new BadRequestException('taskId must be a non-empty string.');
    }
    const result = await this.executeReadOperation(userId, connectionId, {
      kind: 'getTask',
      taskId: normalizedTaskId,
    });
    const task = normalizeClickUpTaskResult(result);
    if (!task) {
      throw new BadGatewayException(
        'ClickUp returned a task response that could not be normalized.',
      );
    }
    return { connectionId, task };
  }

  private async executeReadOperation(
    userId: string,
    connectionId: string,
    operation: ClickUpReadOperation,
  ): Promise<unknown> {
    const connection = await this.connections.findOwnedCredential(
      userId,
      connectionId,
    );
    if (connection.provider !== ProviderName.CLICKUP) {
      throw new BadRequestException('The selected connection is not ClickUp.');
    }

    let metadata = readConnectionMetadata(connection.metadata);
    const provider = new RemoteMcpOAuthClientProvider({
      redirectUrl: this.redirectUri,
      state: randomUUID(),
      providerLabel: 'ClickUp',
      clientInformation: this.decryptClientInformation(
        metadata.mcpClientInformationEncrypted,
      ),
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
        throw new ClickUpReauthRequiredException();
      },
    });
    const client = this.createClient();

    try {
      await client.connect(this.createTransport(provider));
      let result: Awaited<ReturnType<Client['callTool']>>;
      try {
        result = await this.callBoundTool(
          client,
          metadata.toolBindings,
          operation,
        );
      } catch (error) {
        if (!looksLikeMissingTool(error)) throw error;
        metadata = await this.rediscoverBindings(
          client,
          userId,
          connectionId,
          metadata,
        );
        result = await this.callBoundTool(
          client,
          metadata.toolBindings,
          operation,
        );
      }

      if (isMissingToolResult(result)) {
        metadata = await this.rediscoverBindings(
          client,
          userId,
          connectionId,
          metadata,
        );
        result = await this.callBoundTool(
          client,
          metadata.toolBindings,
          operation,
        );
      }

      if (isMcpErrorResult(result)) {
        const detail = extractMcpErrorText(result);
        if (looksRateLimited(result) || looksRateLimited(detail)) {
          throw new ClickUpRateLimitedException();
        }
        throw new BadGatewayException('ClickUp rejected the read request.');
      }
      return result;
    } catch (error) {
      if (
        error instanceof ClickUpReauthRequiredException ||
        error instanceof ClickUpRateLimitedException ||
        error instanceof ClickUpCapabilityUnavailableException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }
      if (error instanceof UnauthorizedError) {
        await this.markReauthRequired(userId, connectionId);
        throw new ClickUpReauthRequiredException();
      }
      if (looksRateLimited(error)) {
        throw new ClickUpRateLimitedException();
      }
      this.logger.error(
        `ClickUp MCP read failed connectionId=${connectionId} operation=${operation.kind} errorType=${errorType(error)}`,
      );
      throw new BadGatewayException('The ClickUp read request failed.');
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private callBoundTool(
    client: Client,
    bindings: ClickUpToolBindings,
    operation: ClickUpReadOperation,
  ) {
    if (operation.kind === 'search') {
      const binding = bindings.search;
      const args: Record<string, unknown> = {
        [binding.queryArgument]: operation.query,
      };
      if (binding.limitArgument) {
        args[binding.limitArgument] = operation.limit;
      }
      return client.callTool({ name: binding.name, arguments: args });
    }
    const binding = bindings.getTask;
    return client.callTool({
      name: binding.name,
      arguments: { [binding.taskIdArgument]: operation.taskId },
    });
  }

  private async rediscoverBindings(
    client: Client,
    userId: string,
    connectionId: string,
    metadata: ClickUpConnectionMetadata,
  ): Promise<ClickUpConnectionMetadata> {
    const toolList = await client.listTools();
    const refreshed = {
      ...metadata,
      toolBindings: discoverClickUpToolBindings(toolList.tools),
    };
    await this.connections.updateOwnedCredentialMetadata(
      userId,
      connectionId,
      toJson(refreshed),
    );
    return refreshed;
  }

  private createClient(): Client {
    return new Client(
      { name: 'ai-work-os-backend', version: '0.1.0' },
      { capabilities: {} },
    );
  }

  private createTransport(
    provider: RemoteMcpOAuthClientProvider,
  ): StreamableHTTPClientTransport {
    return new StreamableHTTPClientTransport(new URL(this.mcpUrl), {
      authProvider: provider,
    });
  }

  private async saveConnection(
    organizationId: string,
    userId: string,
    tokens: OAuthTokens,
    clientInformation: OAuthClientInformationMixed,
    toolBindings: ClickUpToolBindings,
  ): Promise<void> {
    const metadata: ClickUpConnectionMetadata = {
      mcpClientInformationEncrypted: this.tokenVault.encrypt(
        JSON.stringify(clientInformation),
      ),
      tokenType: tokens.token_type,
      toolBindings,
    };
    await this.connections.save({
      organizationId,
      userId,
      provider: ProviderName.CLICKUP,
      accountId: CLICKUP_MCP_ACCOUNT_ID,
      accountName: 'ClickUp',
      workspaceName: 'Authorized ClickUp workspaces',
      accessTokenEncrypted: this.tokenVault.encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token
        ? this.tokenVault.encrypt(tokens.refresh_token)
        : null,
      tokenExpiresAt: expiresAt(tokens),
      grantedScopes: tokenScopes(tokens),
      metadata: toJson(metadata),
    });
  }

  private tokensFromConnection(
    connection: Awaited<ReturnType<ConnectionsService['findOwnedCredential']>>,
    metadata: ClickUpConnectionMetadata,
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
        'The ClickUp MCP client registration could not be loaded.',
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
      CLICKUP_REAUTH_REQUIRED_CODE,
      'The ClickUp connection must be authorized again.',
    );
  }

  private get redirectUri(): string {
    return this.config.getOrThrow<string>('CLICKUP_REDIRECT_URI');
  }

  private get mcpUrl(): string {
    return this.config.get<string>('CLICKUP_MCP_URL', CLICKUP_MCP_URL);
  }
}

export function discoverClickUpToolBindings(
  tools: readonly McpToolDescriptor[],
): ClickUpToolBindings {
  const search = findSafeTool(tools, CLICKUP_SEARCH_TOOL_CANDIDATES);
  const getTask = findSafeTool(tools, CLICKUP_GET_TASK_TOOL_CANDIDATES);
  if (!search || !getTask) throw new ClickUpCapabilityUnavailableException();

  const queryArgument = findSchemaProperty(
    search,
    CLICKUP_SEARCH_QUERY_ARGUMENTS,
  );
  const taskIdArgument = findSchemaProperty(getTask, CLICKUP_TASK_ID_ARGUMENTS);
  if (!queryArgument || !taskIdArgument) {
    throw new ClickUpCapabilityUnavailableException();
  }
  const limitArgument = findSchemaProperty(
    search,
    CLICKUP_SEARCH_LIMIT_ARGUMENTS,
  );

  return {
    search: {
      name: search.name,
      queryArgument,
      ...(limitArgument ? { limitArgument } : {}),
    },
    getTask: { name: getTask.name, taskIdArgument },
  };
}

function findSafeTool(
  tools: readonly McpToolDescriptor[],
  candidates: readonly string[],
): McpToolDescriptor | undefined {
  return tools.find(
    (tool) =>
      candidates.includes(tool.name) &&
      tool.annotations?.destructiveHint !== true &&
      tool.annotations?.readOnlyHint !== false,
  );
}

function findSchemaProperty(
  tool: McpToolDescriptor,
  candidates: readonly string[],
): string | undefined {
  const properties = tool.inputSchema.properties ?? {};
  return candidates.find((candidate) => candidate in properties);
}

function readOAuthStateMetadata(
  value: Prisma.JsonValue | null,
): ClickUpOAuthStateMetadata {
  if (!isRecord(value)) return {};
  return {
    clientInformationEncrypted:
      typeof value.clientInformationEncrypted === 'string'
        ? value.clientInformationEncrypted
        : undefined,
  };
}

function readConnectionMetadata(
  value: Prisma.JsonValue | null,
): ClickUpConnectionMetadata {
  if (!isRecord(value)) {
    throw new BadRequestException('ClickUp connection metadata is missing.');
  }
  const encrypted = value.mcpClientInformationEncrypted;
  const bindings = value.toolBindings;
  if (typeof encrypted !== 'string' || !isRecord(bindings)) {
    throw new BadRequestException('ClickUp connection metadata is invalid.');
  }
  const search = bindings.search;
  const getTask = bindings.getTask;
  if (!isRecord(search) || !isRecord(getTask)) {
    throw new BadRequestException('ClickUp tool bindings are invalid.');
  }
  if (
    typeof search.name !== 'string' ||
    typeof search.queryArgument !== 'string' ||
    typeof getTask.name !== 'string' ||
    typeof getTask.taskIdArgument !== 'string'
  ) {
    throw new BadRequestException('ClickUp tool bindings are invalid.');
  }
  return {
    mcpClientInformationEncrypted: encrypted,
    tokenType:
      typeof value.tokenType === 'string' ? value.tokenType : undefined,
    toolBindings: {
      search: {
        name: search.name,
        queryArgument: search.queryArgument,
        limitArgument:
          typeof search.limitArgument === 'string'
            ? search.limitArgument
            : undefined,
      },
      getTask: {
        name: getTask.name,
        taskIdArgument: getTask.taskIdArgument,
      },
    },
  };
}

function expiresAt(tokens: OAuthTokens): Date | null {
  return typeof tokens.expires_in === 'number'
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;
}

function tokenScopes(tokens: OAuthTokens): string[] {
  return tokens.scope?.split(/\s+/).filter(Boolean) ?? [];
}

function isMcpErrorResult(value: unknown): value is { isError: true } {
  return isRecord(value) && value.isError === true;
}

function isMissingToolResult(value: unknown): boolean {
  return (
    isMcpErrorResult(value) && looksLikeMissingTool(extractMcpErrorText(value))
  );
}

function looksLikeMissingTool(value: unknown): boolean {
  const text = errorMessage(value).toLowerCase();
  return (
    text.includes('tool') &&
    (text.includes('not found') ||
      text.includes('unknown') ||
      text.includes('missing'))
  );
}

function looksRateLimited(value: unknown): boolean {
  if (isRecord(value)) {
    if (
      value.status === 429 ||
      value.statusCode === 429 ||
      value.code === 429
    ) {
      return true;
    }
  }
  const text = errorMessage(value).toLowerCase();
  return text.includes('429') || text.includes('rate limit');
}

function extractMcpErrorText(value: unknown): string {
  if (!isRecord(value)) return '';
  const chunks: string[] = [];
  if (Array.isArray(value.content)) {
    for (const block of value.content) {
      if (
        isRecord(block) &&
        typeof block.text === 'string' &&
        block.text.trim()
      ) {
        chunks.push(block.text.trim());
      }
    }
  }
  if (typeof value.message === 'string') chunks.push(value.message);
  return chunks.join(' | ').slice(0, 800);
}

function looksLikeClientApprovalFailure(error: unknown): boolean {
  const text = errorMessage(error).toLowerCase();
  return [
    'redirect uri',
    'redirect_uri',
    'allowlist',
    'not approved',
    'unauthorized_client',
    'client registration',
  ].some((needle) => text.includes(needle));
}

function oauthCorrelationId(state: string): string {
  return state.slice(0, 8);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function errorType(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
