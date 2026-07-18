import { ConfigService } from '@nestjs/config';
import { ProviderName } from '@prisma/client';
import { ConnectionsService } from '../../connections/connections.service';
import { TokenVaultService } from '../../connections/token-vault.service';
import { JIRA_SEARCH_PERMISSION_REQUIRED_CODE } from './jira.constants';
import {
  extractAccessibleResources,
  extractAccessibleResourcesPayload,
  extractMcpErrorText,
  JiraMcpService,
  normalizeJiraJql,
} from './jira-mcp.service';

describe('extractAccessibleResources', () => {
  it('extracts Atlassian sites from MCP text content', () => {
    const result = {
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              id: 'cloud-1',
              name: 'Example Jira',
              url: 'https://example.atlassian.net',
              scopes: ['read:jira-work'],
            },
          ]),
        },
      ],
    };

    expect(extractAccessibleResources(result)).toEqual([
      {
        id: 'cloud-1',
        name: 'Example Jira',
        url: 'https://example.atlassian.net',
        avatarUrl: undefined,
        scopes: ['read:jira-work'],
      },
    ]);
  });

  it('extracts resources from structured MCP content', () => {
    const result = {
      structuredContent: {
        resources: [
          {
            cloudId: 'cloud-2',
            name: 'Second Jira',
            scopes: ['read:issue:jira'],
          },
        ],
      },
    };

    expect(extractAccessibleResources(result)[0]).toMatchObject({
      id: 'cloud-2',
      name: 'Second Jira',
    });
  });

  it('does not create Jira resources for non-Jira Atlassian products', () => {
    const result = {
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              id: 'jira-cloud',
              name: 'Jira site',
              scopes: ['search:jira-work'],
            },
            {
              id: 'confluence-cloud',
              name: 'Confluence site',
              scopes: ['read:page:confluence'],
            },
          ]),
        },
      ],
    };

    expect(extractAccessibleResources(result)).toEqual([
      expect.objectContaining({ id: 'jira-cloud' }),
    ]);
  });

  it('extracts Jira sites from the OAuth accessible-resources response', () => {
    expect(
      extractAccessibleResourcesPayload([
        {
          id: 'cloud-3',
          name: 'OAuth Jira site',
          url: 'https://oauth-jira.atlassian.net',
          scopes: ['read:jira-work'],
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        id: 'cloud-3',
        name: 'OAuth Jira site',
      }),
    ]);
  });
});

describe('JiraMcpService.searchIssues', () => {
  it('rejects connections with no Jira read/search scopes', async () => {
    const connections = {
      findOwnedCredential: jest.fn().mockResolvedValue({
        id: 'connection-1',
        provider: ProviderName.JIRA,
        workspaceId: 'cloud-1',
        grantedScopes: ['write:jira-work'],
      }),
    } as unknown as ConnectionsService;
    const service = new JiraMcpService(
      new ConfigService(),
      connections,
      {} as TokenVaultService,
    );

    await expect(
      service.searchIssues('user-1', 'connection-1', {
        jql: 'ORDER BY updated DESC',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: JIRA_SEARCH_PERMISSION_REQUIRED_CODE,
      }) as unknown,
      status: 403,
    });
  });

  it('does not reject connections that only have classic read:jira-work', async () => {
    const connections = {
      findOwnedCredential: jest.fn().mockResolvedValue({
        id: 'connection-1',
        provider: ProviderName.JIRA,
        workspaceId: 'cloud-1',
        grantedScopes: ['read:jira-work', 'write:jira-work'],
        metadata: {
          mcpClientInformationEncrypted: 'enc',
        },
        accessTokenEncrypted: 'tok',
      }),
    } as unknown as ConnectionsService;
    const tokenVault = {
      decrypt: jest.fn().mockImplementation(() => {
        throw new Error('stop-before-mcp');
      }),
    } as unknown as TokenVaultService;
    const service = new JiraMcpService(
      new ConfigService(),
      connections,
      tokenVault,
    );

    // Scope gate should pass; failure happens later when decrypting MCP client info.
    await expect(
      service.searchIssues('user-1', 'connection-1', {
        jql: 'ORDER BY updated DESC',
      }),
    ).rejects.not.toMatchObject({
      response: expect.objectContaining({
        code: JIRA_SEARCH_PERMISSION_REQUIRED_CODE,
      }) as unknown,
    });
  });
});

describe('normalizeJiraJql', () => {
  it('prefixes bare ORDER BY with a time window', () => {
    expect(normalizeJiraJql('ORDER BY updated DESC')).toBe(
      'updated >= -90d ORDER BY updated DESC',
    );
  });

  it('replaces literal true with a safe default', () => {
    expect(normalizeJiraJql('true')).toBe(
      'updated >= -90d ORDER BY updated DESC',
    );
  });

  it('leaves valid JQL unchanged', () => {
    expect(
      normalizeJiraJql('assignee = currentUser() ORDER BY updated DESC'),
    ).toBe('assignee = currentUser() ORDER BY updated DESC');
  });
});

describe('extractMcpErrorText', () => {
  it('joins text content blocks', () => {
    expect(
      extractMcpErrorText({
        isError: true,
        content: [{ type: 'text', text: 'Invalid JQL' }],
      }),
    ).toBe('Invalid JQL');
  });
});
