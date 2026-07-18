import { ActionRisk, ConnectionStatus, ProviderName } from '@prisma/client';
import {
  AssistantService,
  buildAssistantInstructions,
} from './assistant.service';
import type { ModelProvider } from './model-provider';
import type { AssistantTool } from './tool-registry.service';
import type { ToolExecutorService } from './tool-executor.service';
import type { ToolRegistryService } from './tool-registry.service';

describe('buildAssistantInstructions', () => {
  it('is provider-agnostic and lists connections and tools generically', () => {
    const text = buildAssistantInstructions(
      { email: 'a@b.com', name: 'A' },
      [
        {
          id: 'c1',
          provider: ProviderName.JIRA,
          workspaceName: 'Acme',
          accountName: null,
          status: ConnectionStatus.ACTIVE,
        } as never,
      ],
      [
        {
          name: 'jira_search',
          provider: ProviderName.JIRA,
          description: 'Search Jira',
        } as AssistantTool,
      ],
    );

    expect(text).toContain('provider=JIRA');
    expect(text).toContain('jira_search');
    expect(text).toContain('Available connections');
    expect(text).toContain('Available tools');
    expect(text).not.toMatch(/Available Jira connections/i);
    expect(text).not.toMatch(/call jira_search/i);
  });
});

describe('AssistantService.ask', () => {
  type ToolLoopMock = jest.MockedFunction<ModelProvider['toolLoop']>;

  const user = {
    id: 'user-1',
    email: 'dev@example.com',
    name: 'Dev',
  } as const;

  function build(deps: {
    connections?: Array<{
      id: string;
      provider: ProviderName;
      status: ConnectionStatus;
      workspaceName: string | null;
      accountName: string | null;
      grantedScopes?: string[];
    }>;
    registeredTools?: AssistantTool[];
    toolLoop?: ToolLoopMock;
    execute?: jest.Mock;
  }) {
    const connectionsList = deps.connections ?? [];
    const registered =
      deps.registeredTools ??
      ([
        {
          name: 'jira_search',
          provider: ProviderName.JIRA,
          description: 'Search Jira',
          risk: ActionRisk.READ,
          requiredScopes: ['search:jira-work'],
          parameters: { type: 'object', properties: {} },
          execute: jest.fn(),
        },
        {
          name: 'gmail_search',
          provider: ProviderName.GMAIL,
          description: 'Search Gmail',
          risk: ActionRisk.READ,
          requiredScopes: [],
          parameters: { type: 'object', properties: {} },
          execute: jest.fn(),
        },
      ] as AssistantTool[]);

    const toolLoop: ToolLoopMock =
      deps.toolLoop ??
      jest.fn<ModelProvider['toolLoop']>().mockResolvedValue({
        answer: 'done',
        provider: 'bedrock',
        model: 'google.gemma-3-4b-it',
        toolCalls: [],
        rounds: 1,
        promptTokens: 1,
        outputTokens: 1,
      });

    const model = {
      toolLoop,
      generateStructured: jest.fn(),
    } as unknown as ModelProvider;

    const tools = {
      listForConnections: jest
        .fn()
        .mockImplementation((conns: typeof connectionsList) => {
          const usable = new Set(
            conns
              .filter(
                (c) =>
                  c.status === ConnectionStatus.ACTIVE ||
                  c.status === ConnectionStatus.DEGRADED,
              )
              .map((c) => c.provider),
          );
          return registered.filter((t) => usable.has(t.provider));
        }),
    } as unknown as ToolRegistryService;

    const execute =
      deps.execute ??
      jest.fn().mockResolvedValue({ ok: true, data: { issues: [] } });

    const toolExecutor = {
      execute,
    } as unknown as ToolExecutorService;

    const connections = {
      findAll: jest.fn().mockResolvedValue(connectionsList),
    };

    const service = new AssistantService(
      model,
      tools,
      toolExecutor,
      connections as never,
    );

    return { service, toolLoop, execute, tools };
  }

  it('offers jira tools when only Jira is connected (via registry filter, not orchestrator name checks)', async () => {
    const { service, toolLoop } = build({
      connections: [
        {
          id: 'conn-1',
          provider: ProviderName.JIRA,
          status: ConnectionStatus.ACTIVE,
          workspaceName: 'Acme',
          accountName: 'Acme',
        },
      ],
    });

    await service.ask(user as never, 'What is assigned to me?');

    expect(toolLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [expect.objectContaining({ name: 'jira_search' })],
      }),
    );
    const request = toolLoop.mock.calls[0]?.[0];
    expect(request?.instructions).toContain('conn-1');
    expect(request?.instructions).not.toMatch(/ProviderName/);
  });

  it('offers no provider tools when nothing is connected', async () => {
    const { service, toolLoop } = build({ connections: [] });
    await service.ask(user as never, 'Hello');
    expect(toolLoop).toHaveBeenCalledWith(
      expect.objectContaining({ tools: [] }),
    );
  });

  it('offers a non-Jira tool when only that provider is connected without orchestrator naming it', async () => {
    const { service, toolLoop } = build({
      connections: [
        {
          id: 'g1',
          provider: ProviderName.GMAIL,
          status: ConnectionStatus.ACTIVE,
          workspaceName: null,
          accountName: 'me@x.com',
        },
      ],
    });

    await service.ask(user as never, 'Find emails');

    expect(toolLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [expect.objectContaining({ name: 'gmail_search' })],
      }),
    );
  });

  it('routes tool execution through ToolExecutorService', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue({ ok: true, data: { ok: true } });
    const { service, toolLoop } = build({
      connections: [
        {
          id: 'conn-1',
          provider: ProviderName.JIRA,
          status: ConnectionStatus.ACTIVE,
          workspaceName: 'Acme',
          accountName: null,
        },
      ],
      execute,
    });

    toolLoop.mockImplementation(
      async (req: {
        executeTool: (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<unknown>;
      }) => {
        await req.executeTool('jira_search', {
          connectionId: 'conn-1',
          jql: 'project = A',
        });
        return {
          answer: 'found',
          provider: 'bedrock',
          model: 'm',
          toolCalls: [],
          rounds: 1,
        };
      },
    );

    const result = await service.ask(user as never, 'search');
    expect(execute).toHaveBeenCalledWith('user-1', 'jira_search', {
      connectionId: 'conn-1',
      jql: 'project = A',
    });
    expect(result.answer).toBe('found');
  });
});
