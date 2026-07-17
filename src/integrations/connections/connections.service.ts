import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotionAuthService } from '../../auth/notion/notion-auth.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Columns safe to expose — deliberately excludes accessToken and raw. */
const safeSelect = {
  id: true,
  provider: true,
  workspaceId: true,
  workspaceName: true,
  botId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.IntegrationConnectionSelect;

export type SafeConnection = Prisma.IntegrationConnectionGetPayload<{
  select: typeof safeSelect;
}>;

export interface DisconnectResult {
  disconnected: true;
  revokedAtProvider: boolean;
}

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notionAuth: NotionAuthService,
  ) {}

  findAll(): Promise<SafeConnection[]> {
    return this.prisma.integrationConnection.findMany({
      select: safeSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<SafeConnection> {
    const connection = await this.prisma.integrationConnection.findUnique({
      where: { id },
      select: safeSelect,
    });
    if (!connection) {
      throw new NotFoundException(`Integration connection "${id}" not found.`);
    }
    return connection;
  }

  /**
   * Disconnect an integration: revoke the token at the provider (best-effort),
   * then delete our stored connection.
   */
  async disconnect(id: string): Promise<DisconnectResult> {
    const connection = await this.prisma.integrationConnection.findUnique({
      where: { id },
    });
    if (!connection) {
      throw new NotFoundException(`Integration connection "${id}" not found.`);
    }

    let revokedAtProvider = false;
    if (connection.provider === 'notion') {
      revokedAtProvider = await this.notionAuth.revokeToken(
        connection.accessToken,
      );
    }

    await this.prisma.integrationConnection.delete({ where: { id } });
    return { disconnected: true, revokedAtProvider };
  }
}
