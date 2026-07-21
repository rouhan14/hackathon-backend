import { Injectable, NotFoundException } from '@nestjs/common';
import { ActionRisk, ConnectionStatus, ProviderName } from '@prisma/client';

export interface ToolExecutionContext {
  userId: string;
}

export interface AssistantTool {
  name: string;
  description: string;
  /** Workplace provider this tool talks to (for connection-based offering). */
  provider: ProviderName;
  risk: ActionRisk;
  /**
   * Scopes that must be present on the connection identified by `connectionId`
   * in tool arguments (when that field is used).
   */
  requiredScopes: string[];
  /** Executor metadata; never inferred from the model-facing JSON schema. */
  requiresConnectionId: boolean;
  /** JSON Schema object for the tool arguments (OpenAI tools format). */
  parameters: Record<string, unknown>;
  /**
   * Handler must throw on failure. The shared ToolExecutor maps failures to
   * `ok: false` tool outcomes (except policy denials, which abort the request).
   */
  execute: (
    ctx: ToolExecutionContext,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
}

export interface ConnectionForTools {
  provider: ProviderName;
  status: ConnectionStatus;
}

/** Pure: tools whose provider has at least one usable connection. */
export function filterToolsForConnections(
  tools: readonly AssistantTool[],
  connections: readonly ConnectionForTools[],
): AssistantTool[] {
  const usableProviders = new Set(
    connections
      .filter(
        (c) =>
          c.status === ConnectionStatus.ACTIVE ||
          c.status === ConnectionStatus.DEGRADED,
      )
      .map((c) => c.provider),
  );
  return tools.filter((tool) => usableProviders.has(tool.provider));
}

@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, AssistantTool>();

  register(tool: AssistantTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): AssistantTool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new NotFoundException(
        `Assistant tool "${name}" is not registered.`,
      );
    }
    return tool;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): AssistantTool[] {
    return [...this.tools.values()];
  }

  listForConnections(
    connections: readonly ConnectionForTools[],
  ): AssistantTool[] {
    return filterToolsForConnections(this.list(), connections);
  }
}
