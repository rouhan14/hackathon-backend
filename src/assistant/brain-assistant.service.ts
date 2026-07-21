import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
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
import { BrainRunService } from './brain-run.service';
import {
  ModelNotAvailableException,
  ModelResponseParseException,
  ModelUpstreamException,
} from './model-errors';

export interface AssistantAskResult {
  kind: 'answer' | 'no_connections' | 'no_tools';
  answer: string;
  provider?: string;
  model?: string;
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
  /** Present when an AgentRun was persisted for this brain call. */
  runId?: string;
}

@Injectable()
export class BrainAssistantService {
  private readonly logger = new Logger(BrainAssistantService.name);

  constructor(
    @Inject(MODEL_PROVIDER) private readonly model: ModelProvider,
    private readonly tools: ToolRegistryService,
    private readonly toolExecutor: ToolExecutorService,
    private readonly connections: ConnectionsService,
    private readonly brainRuns: BrainRunService,
  ) {}

  async ask(
    user: SafeUser,
    message: string,
    sources?: readonly ProviderName[],
  ): Promise<AssistantAskResult> {
    const allConnections = await this.connections.findAll(user.id);
    const usable = allConnections.filter(
      (c) =>
        c.status === ConnectionStatus.ACTIVE ||
        c.status === ConnectionStatus.DEGRADED,
    );

    const availableConnections = usable.map((c) => ({
      id: c.id,
      provider: c.provider,
      workspaceName: c.workspaceName,
      accountName: c.accountName,
      status: c.status,
    }));

    if (usable.length === 0) {
      return {
        kind: 'no_connections',
        answer:
          'You have no connected workplace apps yet. Connect Jira, Notion, or ClickUp under Integrations, then ask again.',
        toolCalls: [],
        rounds: 0,
        availableConnections,
      };
    }

    const requestedSources = sources?.length ? new Set(sources) : undefined;
    const scopedConnections = requestedSources
      ? usable.filter((connection) => requestedSources.has(connection.provider))
      : usable;
    const offeredTools = this.tools.listForConnections(scopedConnections);

    if (offeredTools.length === 0) {
      const providers = requestedSources
        ? [...requestedSources].join(', ')
        : [...new Set(usable.map((c) => c.provider))].join(', ');
      return {
        kind: 'no_tools',
        answer: `No assistant tools are available for the selected source(s): ${providers}. Connect or select Jira, Notion, or ClickUp for live search and actions.`,
        toolCalls: [],
        rounds: 0,
        availableConnections,
      };
    }

    const instructions = buildAssistantInstructions(
      user,
      scopedConnections,
      offeredTools,
    );

    this.logger.log(
      `Brain ask userId=${user.id} tools=${offeredTools.map((t) => t.name).join(',') || 'none'} connections=${scopedConnections.length}`,
    );

    if (!this.model.toolLoop) {
      throw new ModelNotAvailableException(
        'The assistant model provider does not support tool calling.',
      );
    }

    const runId = await this.brainRuns.start({
      userId: user.id,
      message,
      connectionIds: scopedConnections.map((c) => c.id),
      toolNames: offeredTools.map((t) => t.name),
    });

    try {
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
          this.toolExecutor.execute(user.id, name, args, {
            connections: scopedConnections,
          }),
      });

      const answer = loop.answer?.trim() ?? '';
      if (!answer) {
        throw new ModelResponseParseException(
          'The model returned an empty answer. Try rephrasing, or check model configuration (GROQ_API_KEY / Bedrock).',
        );
      }

      const result: AssistantAskResult = {
        kind: 'answer',
        answer,
        provider: loop.provider,
        model: loop.model,
        toolCalls: loop.toolCalls,
        rounds: loop.rounds,
        availableConnections,
        promptTokens: loop.promptTokens,
        outputTokens: loop.outputTokens,
        ...(runId ? { runId } : {}),
      };

      await this.brainRuns.complete(runId, {
        answer: result.answer,
        provider: loop.provider,
        model: loop.model,
        toolCalls: result.toolCalls,
        rounds: result.rounds,
        promptTokens: result.promptTokens,
        outputTokens: result.outputTokens,
      });

      return result;
    } catch (error) {
      await this.brainRuns.fail(runId, error);
      if (error instanceof HttpException) {
        throw error;
      }
      const messageText =
        error instanceof Error ? error.message : 'Assistant request failed.';
      this.logger.error(`Brain ask failed: ${messageText}`);
      throw new ModelUpstreamException();
    }
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

  const connectedProviders = new Set(connections.map((c) => c.provider));
  const toolProviders = new Set(offeredTools.map((t) => t.provider));
  const providersWithoutTools = [...connectedProviders].filter(
    (p) => !toolProviders.has(p),
  );
  const noToolsLine =
    providersWithoutTools.length > 0
      ? `Connected providers with no assistant tools yet: ${providersWithoutTools.join(', ')}. Do not claim you can read those products until tools appear in the list below.`
      : null;

  return [
    "You are the AI Work Operating System brain. You can work across the user's connected apps (Jira, Notion, ClickUp, and any other tools listed below) in a single conversation.",
    'You have real function-calling tools. Always use them for live workplace data. Never invent fake tool syntax, code fences, or tool_code blocks.',
    'Answer the user using tools when you need live workplace data. You may chain tools: e.g. read a Notion page, then use its contents to answer or to search Jira.',
    'Do not invent records, IDs, or statuses. If tools fail or return nothing, say so clearly.',
    'Never ask the user for OAuth tokens or secrets.',
    'Never say you are unable to call tools when tools and connections are listed below — use them or wait for tool results.',
    `Authenticated user email: ${user.email}.`,
    user.name ? `Authenticated user name: ${user.name}.` : null,
    'Available connections (use connectionId from this list when a tool requires it):',
    connectionLines,
    noToolsLine,
    'Available tools:',
    toolLines,
    'For jira_search, always pass a connectionId from the list and valid JQL (examples: order by updated DESC; assignee = currentUser() ORDER BY updated DESC). Never use jql=true.',
    'For clickup_search and clickup_get_task, always pass a CLICKUP connectionId from the list. Use clickup_search before clickup_get_task unless the user supplied a task ID.',
    "For notion_search, notion_read_page and notion_create_page, do NOT pass a connectionId — Notion uses the user's connected workspace automatically. Use notion_search to find a page_id, then notion_read_page to read its content.",
    'IMPORTANT: a connectionId from the connections list is NOT a Notion page_id. Never pass a connectionId as parent_page_id. For notion_create_page, parent_page_id must be a page_id returned by notion_search, or omit it to let the server pick a parent.',
    'When the user asks you to create something, actually call the create tool in the same turn once you have what you need. Do not stop after searching and merely say you will create it.',
    'To create Jira issues from other content (e.g. a Notion page): first read the source, then call jira_create_issue with a JIRA connectionId, projectKey, issueTypeName (e.g. "Task"), and summary. If you do not know a valid projectKey, call jira_list_projects first. Create one issue per distinct work item.',
    'Only perform writes (jira_create_issue, notion_create_page) the user actually asked for. Do not create records speculatively.',
    'After tools return, give a concise, useful answer. Prefer bullet lists for multiple items when appropriate. When you create records, report what was created (IDs/keys/URLs from the tool result).',
  ]
    .filter(Boolean)
    .join('\n');
}
