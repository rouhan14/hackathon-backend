import { Injectable, OnModuleInit } from '@nestjs/common';
import { ActionRisk, ProviderName } from '@prisma/client';
import { ToolRegistryService } from '../../assistant/tool-registry.service';
import { JIRA_SEARCH_REQUIRED_SCOPE } from './jira.constants';
import { JiraMcpService } from './jira-mcp.service';

export const JIRA_SEARCH_TOOL = 'jira_search';

/**
 * Owns Jira assistant tool registration. Assistant module never imports this
 * for bootstrap — JiraProviderModule registers tools via the global registry.
 */
@Injectable()
export class JiraAssistantToolsRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly jira: JiraMcpService,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      name: JIRA_SEARCH_TOOL,
      provider: ProviderName.JIRA,
      description:
        'Search Jira issues via an already-connected Jira workspace using JQL. Always pass connectionId from available connections. Use real JQL such as "order by updated DESC" or "assignee = currentUser() ORDER BY updated DESC" — never jql=true.',
      risk: ActionRisk.READ,
      requiredScopes: [JIRA_SEARCH_REQUIRED_SCOPE],
      parameters: {
        type: 'object',
        properties: {
          connectionId: {
            type: 'string',
            description:
              'ID of the user Jira connection to use (from the available connections list).',
          },
          jql: {
            type: 'string',
            description:
              'Valid Jira Query Language. Examples: order by updated DESC; project = ABC ORDER BY updated DESC; assignee = currentUser() AND statusCategory != Done. Do not use the literal true.',
          },
          maxResults: {
            type: 'integer',
            description: 'Maximum issues to return (1-50). Default 25.',
            minimum: 1,
            maximum: 50,
          },
        },
        required: ['connectionId', 'jql'],
        additionalProperties: false,
      },
      execute: async (ctx, args) => {
        const connectionId = asNonEmptyString(
          args.connectionId,
          'connectionId',
        );
        const jql = asNonEmptyString(args.jql, 'jql');
        const maxResults = asOptionalInt(args.maxResults, 1, 50);
        // Throw on failure — ToolExecutor maps to ok: false.
        return this.jira.searchIssues(ctx.userId, connectionId, {
          jql,
          maxResults: maxResults ?? 25,
        });
      },
    });
  }
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function asOptionalInt(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`maxResults must be an integer between ${min} and ${max}.`);
  }
  return n;
}
