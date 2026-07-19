import { Injectable, NotFoundException } from '@nestjs/common';
import { ConnectionStatus, Prisma, ProviderName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const safeSelect = {
  id: true,
  provider: true,
  accountId: true,
  accountName: true,
  workspaceId: true,
  workspaceName: true,
  status: true,
  grantedScopes: true,
  lastSuccessfulSyncAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.IntegrationConnectionSelect;

export type SafeConnection = Prisma.IntegrationConnectionGetPayload<{
  select: typeof safeSelect;
}>;

export interface OAuthStateContext {
  userId: string;
  organizationId: string;
  redirectUri: string | null;
  codeVerifier: string | null;
  metadata: Prisma.JsonValue | null;
}

export interface SaveConnectionInput {
  organizationId: string;
  userId: string;
  provider: ProviderName;
  accountId: string;
  accountName?: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
  botId?: string | null;
  accessTokenEncrypted: string;
  refreshTokenEncrypted?: string | null;
  tokenExpiresAt?: Date | null;
  grantedScopes?: string[];
  credentialGroupId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class ConnectionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string): Promise<SafeConnection[]> {
    return this.prisma.integrationConnection.findMany({
      where: { userId, deletedAt: null },
      select: safeSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string): Promise<SafeConnection> {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id, userId, deletedAt: null },
      select: safeSelect,
    });
    if (!connection) {
      throw new NotFoundException(`Integration connection "${id}" not found.`);
    }
    return connection;
  }

  async findOwnedCredential(userId: string, id: string) {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!connection) {
      throw new NotFoundException(`Integration connection "${id}" not found.`);
    }
    return connection;
  }

  async findActiveProviderCredential(userId: string, provider: ProviderName) {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        userId,
        provider,
        status: ConnectionStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!connection) {
      throw new NotFoundException(`No active ${provider} connection found.`);
    }
    return connection;
  }

  async save(input: SaveConnectionInput): Promise<SafeConnection> {
    return this.prisma.integrationConnection.upsert({
      where: {
        userId_provider_accountId: {
          userId: input.userId,
          provider: input.provider,
          accountId: input.accountId,
        },
      },
      create: {
        ...input,
        grantedScopes: input.grantedScopes ?? [],
      },
      update: {
        accountName: input.accountName,
        workspaceId: input.workspaceId,
        workspaceName: input.workspaceName,
        botId: input.botId,
        accessTokenEncrypted: input.accessTokenEncrypted,
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        tokenExpiresAt: input.tokenExpiresAt,
        grantedScopes: input.grantedScopes ?? [],
        credentialGroupId: input.credentialGroupId,
        metadata: input.metadata,
        status: ConnectionStatus.ACTIVE,
        deletedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
      select: safeSelect,
    });
  }

  async removeOwned(userId: string, id: string): Promise<void> {
    const connection = await this.findOwnedCredential(userId, id);
    await this.prisma.integrationConnection.delete({
      where: { id: connection.id },
    });
  }

  async issueOAuthState(input: {
    state: string;
    provider: ProviderName;
    userId: string;
    expiresAt: Date;
    redirectUri?: string;
    codeVerifier?: string;
    organizationId?: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    const organizationId =
      input.organizationId ??
      (await this.defaultOrganizationIdForUser(input.userId));

    await this.prisma.oAuthState.create({
      data: {
        state: input.state,
        provider: input.provider,
        userId: input.userId,
        organizationId,
        redirectUri: input.redirectUri,
        codeVerifier: input.codeVerifier,
        metadata: input.metadata,
        expiresAt: input.expiresAt,
      },
    });
  }

  async updateOAuthState(
    state: string,
    input: {
      codeVerifier?: string;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    const updated = await this.prisma.oAuthState.updateMany({
      where: {
        state,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: input,
    });
    if (updated.count !== 1) {
      throw new NotFoundException('OAuth state is invalid or expired.');
    }
  }

  async consumeOAuthState(
    state: string,
    provider: ProviderName,
  ): Promise<OAuthStateContext> {
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.oAuthState.findUnique({ where: { state } });
      if (
        !record ||
        record.provider !== provider ||
        record.consumedAt ||
        record.expiresAt.getTime() < Date.now()
      ) {
        throw new NotFoundException('OAuth state is invalid or expired.');
      }

      const consumed = await tx.oAuthState.updateMany({
        where: { id: record.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new NotFoundException('OAuth state has already been consumed.');
      }

      return {
        userId: record.userId,
        organizationId: record.organizationId,
        redirectUri: record.redirectUri,
        codeVerifier: record.codeVerifier,
        metadata: record.metadata,
      };
    });
  }

  async updateOwnedCredentialTokens(
    userId: string,
    id: string,
    input: {
      accessTokenEncrypted: string;
      refreshTokenEncrypted?: string | null;
      tokenExpiresAt?: Date | null;
      grantedScopes?: string[];
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    const where = await this.ownedCredentialGroupWhere(userId, id);
    await this.prisma.integrationConnection.updateMany({
      where,
      data: {
        ...input,
        status: ConnectionStatus.ACTIVE,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  }

  async markOwnedCredentialReauthRequired(
    userId: string,
    id: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    const where = await this.ownedCredentialGroupWhere(userId, id);
    await this.prisma.integrationConnection.updateMany({
      where,
      data: {
        status: ConnectionStatus.REAUTH_REQUIRED,
        lastErrorCode: errorCode,
        lastErrorMessage: errorMessage,
      },
    });
  }

  private async ownedCredentialGroupWhere(
    userId: string,
    id: string,
  ): Promise<Prisma.IntegrationConnectionWhereInput> {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id, userId, deletedAt: null },
      select: { provider: true, credentialGroupId: true },
    });
    if (!connection) {
      throw new NotFoundException(`Integration connection "${id}" not found.`);
    }
    return connection.credentialGroupId
      ? {
          userId,
          provider: connection.provider,
          credentialGroupId: connection.credentialGroupId,
          deletedAt: null,
        }
      : { id, userId, deletedAt: null };
  }

  private async defaultOrganizationIdForUser(userId: string): Promise<string> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      select: { organizationId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) {
      throw new NotFoundException('User does not belong to an organization.');
    }
    return membership.organizationId;
  }
}
