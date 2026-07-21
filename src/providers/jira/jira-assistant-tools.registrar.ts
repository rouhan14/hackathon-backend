import { Injectable, OnModuleInit } from '@nestjs/common';
import { ActionRisk, ProviderName } from '@prisma/client';
import { ToolRegistryService } from '../../assistant/tool-registry.service';
import { JIRA_SEARCH_REQUIRED_SCOPE } from './jira.constants';
import { JiraMcpService } from './jira-mcp.service';

export const JIRA_SEARCH_TOOL = 'jira_search';
export const JIRA_LIST_PROJECTS_TOOL = 'jira_list_projects';
export const JIRA_CREATE_ISSUE_TOOL = 'jira_create_issue';

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

    this.registry.register({
      name: JIRA_LIST_PROJECTS_TOOL,
      provider: ProviderName.JIRA,
      description:
        'List the Jira projects the user can see for a connected Jira workspace. Use this to find a valid projectKey before creating an issue. Always pass a JIRA connectionId.',
      risk: ActionRisk.READ,
      requiredScopes: [],
      parameters: {
        type: 'object',
        properties: {
          connectionId: {
            type: 'string',
            description:
              'ID of the user Jira connection (from the available connections list).',
          },
        },
        required: ['connectionId'],
        additionalProperties: false,
      },
      execute: async (ctx, args) => {
        const connectionId = asNonEmptyString(args.connectionId, 'connectionId');
        return this.jira.listProjects(ctx.userId, connectionId);
      },
    });

    this.registry.register({
      name: JIRA_CREATE_ISSUE_TOOL,
      provider: ProviderName.JIRA,
      description:
        'Create a new Jira issue (ticket) in a connected Jira workspace. Requires a projectKey (use jira_list_projects if unknown), an issueTypeName such as "Task", "Bug", or "Story", and a summary. Always pass a JIRA connectionId.',
      risk: ActionRisk.WRITE,
      requiredScopes: [],
      parameters: {
        type: 'object',
        properties: {
          connectionId: {
            type: 'string',
            description:
              'ID of the user Jira connection (from the available connections list).',
          },
          projectKey: {
            type: 'string',
            description:
              'Key of the target Jira project, e.g. "ENG". Get it from jira_list_projects if unknown.',
          },
          issueTypeName: {
            type: 'string',
            description: 'Issue type name, e.g. "Task", "Bug", or "Story".',
          },
          summary: {
            type: 'string',
            description: 'Short one-line title for the issue.',
          },
          description: {
            type: 'string',
            description: 'Optional longer description / body for the issue.',
          },
        },
        required: ['connectionId', 'projectKey', 'issueTypeName', 'summary'],
        additionalProperties: false,
      },
      execute: async (ctx, args) => {
        const connectionId = asNonEmptyString(args.connectionId, 'connectionId');
        return this.jira.createIssue(ctx.userId, connectionId, {
          projectKey: asNonEmptyString(args.projectKey, 'projectKey'),
          issueTypeName: asNonEmptyString(args.issueTypeName, 'issueTypeName'),
          summary: asNonEmptyString(args.summary, 'summary'),
          description:
            typeof args.description === 'string' && args.description.trim()
              ? args.description.trim()
              : undefined,
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
