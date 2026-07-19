import { ConfigService } from '@nestjs/config';
import { ProviderName } from '@prisma/client';
import { ConnectionsService } from '../../connections/connections.service';
import { TokenVaultService } from '../../connections/token-vault.service';
import { CLICKUP_CAPABILITY_UNAVAILABLE_CODE } from './clickup.constants';
import { ClickUpCapabilityUnavailableException } from './clickup.errors';
import {
  ClickUpMcpService,
  discoverClickUpToolBindings,
} from './clickup-mcp.service';
import type { McpToolDescriptor } from './clickup.types';

function tool(
  name: string,
  properties: Record<string, object>,
  annotations?: McpToolDescriptor['annotations'],
): McpToolDescriptor {
  return {
    name,
    inputSchema: { type: 'object', properties },
    annotations,
  };
}

describe('discoverClickUpToolBindings', () => {
  it('binds safe snake-case read tools and their argument schemas', () => {
    expect(
      discoverClickUpToolBindings([
        tool('search_workspace', {
          query: { type: 'string' },
          limit: { type: 'integer' },
        }),
        tool('get_task', { task_id: { type: 'string' } }),
      ]),
    ).toEqual({
      search: {
        name: 'search_workspace',
        queryArgument: 'query',
        limitArgument: 'limit',
      },
      getTask: { name: 'get_task', taskIdArgument: 'task_id' },
    });
  });

  it('accepts documented naming and schema variants', () => {
    expect(
      discoverClickUpToolBindings([
        tool('searchWorkspace', {
          search_query: { type: 'string' },
          maxResults: { type: 'integer' },
        }),
        tool('getTask', { taskId: { type: 'string' } }),
      ]),
    ).toMatchObject({
      search: {
        name: 'searchWorkspace',
        queryArgument: 'search_query',
        limitArgument: 'maxResults',
      },
      getTask: { name: 'getTask', taskIdArgument: 'taskId' },
    });
  });

  it('fails closed when a candidate is marked destructive', () => {
    expect(() =>
      discoverClickUpToolBindings([
        tool(
          'search_workspace',
          { query: { type: 'string' } },
          { destructiveHint: true },
        ),
        tool('get_task', { task_id: { type: 'string' } }),
        tool('delete_task', { task_id: { type: 'string' } }),
      ]),
    ).toThrow(ClickUpCapabilityUnavailableException);

    const error = new ClickUpCapabilityUnavailableException();
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ code: CLICKUP_CAPABILITY_UNAVAILABLE_CODE }),
    );
  });

  it('does not bind arbitrary write tools', () => {
    expect(() =>
      discoverClickUpToolBindings([
        tool('create_task', { name: { type: 'string' } }),
        tool('delete_task', { task_id: { type: 'string' } }),
      ]),
    ).toThrow();
  });
});

describe('ClickUpMcpService ownership gate', () => {
  it('rejects unbounded search input before loading a connection', async () => {
    const findOwnedCredential = jest.fn();
    const service = new ClickUpMcpService(
      new ConfigService(),
      { findOwnedCredential } as unknown as ConnectionsService,
      {} as TokenVaultService,
    );

    await expect(
      service.searchTasks('user-1', 'connection-1', {
        query: 'x'.repeat(501),
      }),
    ).rejects.toThrow('query must contain between 1 and 500 characters.');
    await expect(
      service.searchTasks('user-1', 'connection-1', {
        query: 'blocked',
        limit: 26,
      }),
    ).rejects.toThrow('limit must be an integer between 1 and 25.');
    expect(findOwnedCredential).not.toHaveBeenCalled();
  });

  it('rejects a non-ClickUp connection before decrypting credentials', async () => {
    const connections = {
      findOwnedCredential: jest.fn().mockResolvedValue({
        id: 'connection-1',
        provider: ProviderName.JIRA,
      }),
    } as unknown as ConnectionsService;
    const decrypt = jest.fn();
    const tokenVault = { decrypt } as unknown as TokenVaultService;
    const service = new ClickUpMcpService(
      new ConfigService({
        CLICKUP_REDIRECT_URI: 'https://api.example.com/auth/clickup/callback',
      }),
      connections,
      tokenVault,
    );

    await expect(
      service.searchTasks('user-1', 'connection-1', { query: 'blocked' }),
    ).rejects.toThrow('The selected connection is not ClickUp.');
    expect(decrypt).not.toHaveBeenCalled();
  });
});
