import { Injectable, OnModuleInit } from '@nestjs/common';
import { ActionRisk, ProviderName } from '@prisma/client';
import { ToolRegistryService } from '../../assistant/tool-registry.service';
import {
  CLICKUP_SEARCH_MAX_QUERY_LENGTH,
  CLICKUP_SEARCH_MAX_RESULTS,
} from './clickup.constants';
import { ClickUpMcpService } from './clickup-mcp.service';

export const CLICKUP_SEARCH_TOOL = 'clickup_search';
export const CLICKUP_GET_TASK_TOOL = 'clickup_get_task';

@Injectable()
export class ClickUpAssistantToolsRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly clickup: ClickUpMcpService,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      name: CLICKUP_SEARCH_TOOL,
      provider: ProviderName.CLICKUP,
      description:
        'Search tasks in the user-authorized ClickUp workspaces. Always use a ClickUp connectionId from the available connections list.',
      risk: ActionRisk.READ,
      requiredScopes: [],
      requiresConnectionId: true,
      parameters: {
        type: 'object',
        properties: {
          connectionId: {
            type: 'string',
            description: 'ID of the user-owned ClickUp connection.',
          },
          query: {
            type: 'string',
            maxLength: CLICKUP_SEARCH_MAX_QUERY_LENGTH,
            description:
              'Natural-language task search, such as "blocked tasks assigned to me".',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: CLICKUP_SEARCH_MAX_RESULTS,
            description: 'Maximum tasks to return. Default 10.',
          },
        },
        required: ['connectionId', 'query'],
        additionalProperties: false,
      },
      execute: (ctx, args) =>
        this.clickup.searchTasks(
          ctx.userId,
          requiredString(args.connectionId, 'connectionId'),
          {
            query: requiredString(args.query, 'query'),
            limit: optionalInteger(
              args.limit,
              1,
              CLICKUP_SEARCH_MAX_RESULTS,
              'limit',
            ),
          },
        ),
    });

    this.registry.register({
      name: CLICKUP_GET_TASK_TOOL,
      provider: ProviderName.CLICKUP,
      description:
        'Retrieve one ClickUp task by ID through a user-owned ClickUp connection.',
      risk: ActionRisk.READ,
      requiredScopes: [],
      requiresConnectionId: true,
      parameters: {
        type: 'object',
        properties: {
          connectionId: {
            type: 'string',
            description: 'ID of the user-owned ClickUp connection.',
          },
          taskId: {
            type: 'string',
            description: 'ClickUp task ID returned by a prior search.',
          },
        },
        required: ['connectionId', 'taskId'],
        additionalProperties: false,
      },
      execute: (ctx, args) =>
        this.clickup.getTask(
          ctx.userId,
          requiredString(args.connectionId, 'connectionId'),
          requiredString(args.taskId, 'taskId'),
        ),
    });
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalInteger(
  value: unknown,
  min: number,
  max: number,
  field: string,
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}
