import {
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConnectionsService } from '../connections/connections.service';
import { connectionHasJiraSearchAccess } from '../providers/jira/jira.constants';
import { PolicyEngineService } from '../policy/policy-engine.service';
import { ToolRegistryService } from './tool-registry.service';

export type ToolRunResult =
  { ok: true; data: unknown } | { ok: false; error: string; code?: string };

/**
 * Canonical place for policy, scope checks, and mapping handler failures to
 * tool outcomes. Handlers throw; this layer maps all handler errors to
 * `{ ok: false }` (including ForbiddenException subclasses from MCP/tools,
 * e.g. Jira search permission). Policy denials throw ForbiddenException
 * *before* the handler runs so `/assistant/ask` aborts with HTTP 403.
 */
@Injectable()
export class ToolExecutorService {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly policy: PolicyEngineService,
    private readonly connections: ConnectionsService,
  ) {}

  async execute(
    userId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolRunResult> {
    if (!this.registry.has(name)) {
      return { ok: false, error: `Unknown tool "${name}".` };
    }

    const tool = this.registry.get(name);
    const decision = this.policy.evaluateAction({
      risk: tool.risk,
      hasExactApproval: false,
    });
    if (!decision.allowed) {
      throw new ForbiddenException(decision.reason);
    }

    if (tool.requiredScopes.length > 0) {
      const scopeCheck = await this.checkScopes(
        userId,
        tool.provider,
        tool.requiredScopes,
        args,
      );
      if (!scopeCheck.ok) {
        return scopeCheck;
      }
    }

    try {
      const data = await tool.execute({ userId }, args);
      return { ok: true, data };
    } catch (error) {
      // Handler/MCP Forbidden (e.g. JiraSearchPermissionRequiredException) is a
      // tool failure for the model — not an ask-level policy abort.
      return toFailedResult(error);
    }
  }

  private async checkScopes(
    userId: string,
    toolProvider: import('@prisma/client').ProviderName,
    requiredScopes: string[],
    args: Record<string, unknown>,
  ): Promise<ToolRunResult | { ok: true }> {
    const connectionId = args.connectionId;
    if (typeof connectionId !== 'string' || !connectionId.trim()) {
      return {
        ok: false,
        error:
          'connectionId is required for this tool so scopes can be verified.',
      };
    }

    try {
      const connection = await this.connections.findOne(
        userId,
        connectionId.trim(),
      );
      if (connection.provider !== toolProvider) {
        return {
          ok: false,
          error: `Connection "${connectionId}" is not a ${toolProvider} connection.`,
        };
      }
      const missing = requiredScopes.filter(
        (scope) => !scopeIsSatisfied(scope, connection.grantedScopes),
      );
      if (missing.length > 0) {
        return {
          ok: false,
          error: `Connection is missing required scope(s): ${missing.join(', ')}.`,
          code: 'MISSING_SCOPES',
        };
      }
      return { ok: true };
    } catch (error) {
      if (error instanceof NotFoundException) {
        return { ok: false, error: error.message };
      }
      return toFailedResult(error);
    }
  }
}

function toFailedResult(error: unknown): ToolRunResult {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string') {
      return { ok: false, error: response };
    }
    if (response && typeof response === 'object') {
      const body = response as { message?: string | string[]; code?: string };
      const message = Array.isArray(body.message)
        ? body.message.join(' ')
        : body.message;
      return {
        ok: false,
        error: message ?? error.message,
        ...(body.code ? { code: body.code } : {}),
      };
    }
    return { ok: false, error: error.message };
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: 'Tool execution failed.' };
}

/** Match exact scopes, plus Jira search equivalents (read:jira-work, etc.). */
function scopeIsSatisfied(
  required: string,
  grantedScopes: readonly string[],
): boolean {
  if (grantedScopes.includes(required)) {
    return true;
  }
  if (required === 'search:jira-work') {
    return connectionHasJiraSearchAccess(grantedScopes);
  }
  return false;
}
