import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConnectionStatus, ProviderName } from '@prisma/client';
import type { SafeUser } from '../auth/auth.service';
import {
  ConnectionsService,
  SafeConnection,
} from '../connections/connections.service';
import {
  MODEL_PROVIDER,
  type ModelProvider,
  type ToolLoopToolTrace,
} from './model-provider';
import type { AssistantTool } from './tool-registry.service';
import { ToolRegistryService } from './tool-registry.service';
import { ToolExecutorService } from './tool-executor.service';

export interface AssistantAskResult {
  answer: string;
  provider: string;
  model: string;
  toolCalls: ToolLoopToolTrace[];
  rounds: number;
  availableConnections: Array<{
    id: string;
    provider: ProviderName;
    workspaceName: string | null;
    accountName: string | null;
    status: ConnectionStatus;
  }>;
  promptTokens?: number;
  outputTokens?: number;
}

@Injectable()
export class JiraAssistantService {
  private readonly logger = new Logger(JiraAssistantService.name);

  constructor(
    @Inject(MODEL_PROVIDER) private readonly model: ModelProvider,
    private readonly tools: ToolRegistryService,
    private readonly toolExecutor: ToolExecutorService,
    private readonly connections: ConnectionsService,
  ) {}

  async ask(user: SafeUser, message: string): Promise<AssistantAskResult> {
    const allConnections = await this.connections.findAll(user.id);
    const usable = allConnections.filter(
      (c) =>
        c.status === ConnectionStatus.ACTIVE ||
        c.status === ConnectionStatus.DEGRADED,
    );

    const offeredTools = this.tools.listForConnections(usable);
    const instructions = buildAssistantInstructions(user, usable, offeredTools);

    this.logger.log(
      `Assistant ask userId=${user.id} tools=${offeredTools.map((t) => t.name).join(',') || 'none'} connections=${usable.length}`,
    );

    if (!this.model.toolLoop) {
      throw new Error('Jira assistant requires a model provider with toolLoop support');
    }

    const loop = await this.model.toolLoop({
      instructions,
      userMessage: message,
      tools: offeredTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
      maxRounds: 5,
      executeTool: (name, args) =>
        this.toolExecutor.execute(user.id, name, args),
    });

    return {
      answer: loop.answer,
      provider: loop.provider,
      model: loop.model,
      toolCalls: loop.toolCalls,
      rounds: loop.rounds,
      availableConnections: usable.map((c) => ({
        id: c.id,
        provider: c.provider,
        workspaceName: c.workspaceName,
        accountName: c.accountName,
        status: c.status,
      })),
      promptTokens: loop.promptTokens,
      outputTokens: loop.outputTokens,
    };
  }
}

/** Exported for unit tests — provider-agnostic instruction builder. */
export function buildAssistantInstructions(
  user: Pick<SafeUser, 'email' | 'name'>,
  connections: readonly SafeConnection[],
  offeredTools: readonly AssistantTool[],
): string {
  const connectionLines =
    connections.length === 0
      ? 'No active workplace connections. If the user needs live data from a product, tell them to connect that integration first.'
      : connections
          .map(
            (c) =>
              `- id=${c.id}; provider=${c.provider}; workspace=${c.workspaceName ?? c.accountName ?? 'unknown'}; status=${c.status}`,
          )
          .join('\n');

  const toolLines =
    offeredTools.length === 0
      ? 'No tools are available for the current connections.'
      : offeredTools
          .map((t) => `- ${t.name} (provider=${t.provider}): ${t.description}`)
          .join('\n');

  return [
    'You are the AI Work Operating System assistant.',
    'Answer the user using tools when you need live workplace data.',
    'Do not invent records, IDs, or statuses. If tools fail or return nothing, say so clearly.',
    'Never ask the user for OAuth tokens or secrets.',
    'Prefer platform tools for live workplace questions. Never write fake tool syntax (no tool_code fences).',
    'Never say you are unable to call tools when tools and connections are listed below — use them or wait for tool results.',
    `Authenticated user email: ${user.email}.`,
    user.name ? `Authenticated user name: ${user.name}.` : null,
    'Available connections (use connectionId from this list when a tool requires it):',
    connectionLines,
    'Available tools:',
    toolLines,
    'For jira_search, always pass a connectionId from the list and valid JQL (examples: order by updated DESC; assignee = currentUser() ORDER BY updated DESC). Never use jql=true.',
    'After tools return, give a concise, useful answer. Prefer bullet lists for multiple items when appropriate.',
  ]
    .filter(Boolean)
    .join('\n');
}
