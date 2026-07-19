import { ConnectionStatus, ProviderName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectionsService } from './connections.service';

describe('ConnectionsService credential groups', () => {
  it('updates every connection that shares a provider credential grant', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      provider: ProviderName.JIRA,
      credentialGroupId: 'grant-1',
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      integrationConnection: { findFirst, updateMany },
    } as unknown as PrismaService;
    const service = new ConnectionsService(prisma);
    const update = {
      accessTokenEncrypted: 'new-access',
      refreshTokenEncrypted: 'new-refresh',
    };

    await service.updateOwnedCredentialTokens('user-1', 'connection-1', update);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        provider: ProviderName.JIRA,
        credentialGroupId: 'grant-1',
        deletedAt: null,
      },
      data: {
        ...update,
        status: ConnectionStatus.ACTIVE,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  });

  it('updates only the selected legacy connection when it has no group', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      integrationConnection: {
        findFirst: jest.fn().mockResolvedValue({
          provider: ProviderName.JIRA,
          credentialGroupId: null,
        }),
        updateMany,
      },
    } as unknown as PrismaService;
    const service = new ConnectionsService(prisma);

    await service.updateOwnedCredentialTokens('user-1', 'connection-1', {
      accessTokenEncrypted: 'new-access',
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'connection-1', userId: 'user-1', deletedAt: null },
      }),
    );
  });

  it('updates discovered provider metadata without changing credentials', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      integrationConnection: {
        findFirst: jest.fn().mockResolvedValue({
          provider: ProviderName.CLICKUP,
          credentialGroupId: null,
        }),
        updateMany,
      },
    } as unknown as PrismaService;
    const service = new ConnectionsService(prisma);
    const metadata = {
      mcpClientInformationEncrypted: 'encrypted-client',
      toolBindings: { search: { name: 'search_workspace' } },
    };

    await service.updateOwnedCredentialMetadata(
      'user-1',
      'connection-1',
      metadata,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'connection-1', userId: 'user-1', deletedAt: null },
      data: { metadata },
    });
  });

  it('marks the entire credential group as requiring reauthorization', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      integrationConnection: {
        findFirst: jest.fn().mockResolvedValue({
          provider: ProviderName.JIRA,
          credentialGroupId: 'grant-1',
        }),
        updateMany,
      },
    } as unknown as PrismaService;
    const service = new ConnectionsService(prisma);

    await service.markOwnedCredentialReauthRequired(
      'user-1',
      'connection-1',
      'JIRA_REAUTH_REQUIRED',
      'Reconnect Jira.',
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        provider: ProviderName.JIRA,
        credentialGroupId: 'grant-1',
        deletedAt: null,
      },
      data: {
        status: ConnectionStatus.REAUTH_REQUIRED,
        lastErrorCode: 'JIRA_REAUTH_REQUIRED',
        lastErrorMessage: 'Reconnect Jira.',
      },
    });
  });
});
