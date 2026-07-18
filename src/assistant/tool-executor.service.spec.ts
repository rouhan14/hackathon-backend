import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActionRisk, ProviderName } from '@prisma/client';
import { ToolExecutorService } from './tool-executor.service';
import type { ToolRegistryService } from './tool-registry.service';
import type { PolicyEngineService } from '../policy/policy-engine.service';
import type { ConnectionsService } from '../connections/connections.service';

describe('ToolExecutorService', () => {
  function build(opts: {
    execute?: jest.Mock;
    policyAllowed?: boolean;
    connection?: {
      id: string;
      provider: ProviderName;
      grantedScopes: string[];
    } | null;
  }) {
    const execute =
      opts.execute ?? jest.fn().mockResolvedValue({ issues: [1] });
    const registry = {
      has: jest.fn().mockReturnValue(true),
      get: jest.fn().mockReturnValue({
        name: 'jira_search',
        provider: ProviderName.JIRA,
        risk: ActionRisk.READ,
        requiredScopes: ['search:jira-work'],
        execute,
      }),
    } as unknown as ToolRegistryService;

    const policy = {
      evaluateAction: jest.fn().mockReturnValue({
        allowed: opts.policyAllowed ?? true,
        requiresApproval: false,
        reason:
          opts.policyAllowed === false
            ? 'External writes require approval.'
            : 'ok',
      }),
    } as unknown as PolicyEngineService;

    const connections = {
      findOne:
        opts.connection === null
          ? jest.fn().mockRejectedValue(new NotFoundException('missing'))
          : jest.fn().mockResolvedValue(
              opts.connection ?? {
                id: 'c1',
                provider: ProviderName.JIRA,
                grantedScopes: ['search:jira-work'],
              },
            ),
    } as unknown as ConnectionsService;

    return {
      executor: new ToolExecutorService(registry, policy, connections),
      execute,
      policy,
      connections,
    };
  }

  it('returns ok true with data on success', async () => {
    const { executor } = build({});
    const result = await executor.execute('u1', 'jira_search', {
      connectionId: 'c1',
      jql: 'x',
    });
    expect(result).toEqual({ ok: true, data: { issues: [1] } });
  });

  it('returns ok false when handler throws', async () => {
    const { executor } = build({
      execute: jest.fn().mockRejectedValue(new Error('MCP down')),
    });
    const result = await executor.execute('u1', 'jira_search', {
      connectionId: 'c1',
      jql: 'x',
    });
    expect(result).toEqual({ ok: false, error: 'MCP down' });
  });

  it('returns ok false when required scopes are missing', async () => {
    const { executor, execute } = build({
      connection: {
        id: 'c1',
        provider: ProviderName.JIRA,
        grantedScopes: [],
      },
    });
    const result = await executor.execute('u1', 'jira_search', {
      connectionId: 'c1',
      jql: 'x',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/missing required scope/i);
      expect(result.code).toBe('MISSING_SCOPES');
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it('accepts classic read:jira-work as satisfying search:jira-work', async () => {
    const execute = jest.fn().mockResolvedValue({ issues: [] });
    const { executor } = build({
      execute,
      connection: {
        id: 'c1',
        provider: ProviderName.JIRA,
        grantedScopes: ['read:jira-work'],
      },
    });
    const result = await executor.execute('u1', 'jira_search', {
      connectionId: 'c1',
      jql: 'order by updated DESC',
    });
    expect(result).toEqual({ ok: true, data: { issues: [] } });
    expect(execute).toHaveBeenCalled();
  });

  it('aborts the request with ForbiddenException on policy denial', async () => {
    const { executor } = build({ policyAllowed: false });
    await expect(
      executor.execute('u1', 'jira_search', {
        connectionId: 'c1',
        jql: 'x',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('maps handler ForbiddenException (MCP/tool permission) to ok false, not HTTP abort', async () => {
    class ToolPermissionException extends ForbiddenException {
      constructor() {
        super({
          code: 'TOOL_PERMISSION_REQUIRED',
          message: 'Search is not enabled for this connection.',
        });
      }
    }

    const { executor } = build({
      execute: jest.fn().mockRejectedValue(new ToolPermissionException()),
    });

    const result = await executor.execute('u1', 'jira_search', {
      connectionId: 'c1',
      jql: 'x',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Search is not enabled/i);
      expect(result.code).toBe('TOOL_PERMISSION_REQUIRED');
    }
  });
});
