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
        expiresAt: input.expiresAt,
      },
    });
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
      };
    });
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
