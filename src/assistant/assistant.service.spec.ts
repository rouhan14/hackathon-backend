import { ActionRisk, ConnectionStatus, ProviderName } from '@prisma/client';
import {
  BrainAssistantService,
  buildAssistantInstructions,
} from './brain-assistant.service';
import type { ModelProvider } from './model-provider';
import type { AssistantTool } from './tool-registry.service';
import type { ToolExecutorService } from './tool-executor.service';
import type { ToolRegistryService } from './tool-registry.service';
import type { BrainRunService } from './brain-run.service';

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
  });

  it('mentions connected providers that have no tools', () => {
    const text = buildAssistantInstructions(
      { email: 'a@b.com', name: null },
      [
        {
          id: 's1',
          provider: ProviderName.SLACK,
          workspaceName: 'Acme',
          accountName: null,
          status: ConnectionStatus.ACTIVE,
        } as never,
      ],
      [],
    );
    expect(text).toMatch(/no assistant tools yet: SLACK/i);
  });
});

describe('BrainAssistantService.ask', () => {
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
          requiresConnectionId: true,
          parameters: { type: 'object', properties: {} },
          execute: jest.fn(),
        },
        {
          name: 'gmail_search',
          provider: ProviderName.GMAIL,
          description: 'Search Gmail',
          risk: ActionRisk.READ,
          requiredScopes: [],
          requiresConnectionId: false,
          parameters: { type: 'object', properties: {} },
          execute: jest.fn(),
        },
      ] as AssistantTool[]);

    const toolLoop: ToolLoopMock =
      deps.toolLoop ??
      (jest.fn().mockResolvedValue({
        answer: 'done',
        provider: 'groq',
        model: 'test-model',
        toolCalls: [],
        rounds: 1,
        promptTokens: 1,
        outputTokens: 1,
      }) as ToolLoopMock);

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
      jest
        .fn()
        .mockImplementation((_userId, _name, args: Record<string, unknown>) =>
          Promise.resolve({
            ok: true,
            data: { issues: [] },
            arguments: args,
          }),
        );

    const toolExecutor = {
      execute,
    } as unknown as ToolExecutorService;

    const connections = {
      findAll: jest.fn().mockResolvedValue(connectionsList),
    };

    const brainRunStart = jest.fn().mockResolvedValue('run-1');
    const brainRunComplete = jest.fn().mockResolvedValue(undefined);
    const brainRunFail = jest.fn().mockResolvedValue(undefined);
    const brainRuns = {
      start: brainRunStart,
      complete: brainRunComplete,
      fail: brainRunFail,
    } as unknown as BrainRunService;

    const service = new BrainAssistantService(
      model,
      tools,
      toolExecutor,
      connections as never,
      brainRuns,
    );

    return {
      service,
      toolLoop,
      execute,
      tools,
      brainRunStart,
      brainRunComplete,
      brainRunFail,
    };
  }

  it('offers jira tools when only Jira is connected', async () => {
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
  });

  it('short-circuits without a model call when nothing is connected', async () => {
    const { service, toolLoop, brainRunStart } = build({ connections: [] });
    const result = await service.ask(user as never, 'Hello');
    expect(toolLoop).not.toHaveBeenCalled();
    expect(brainRunStart).not.toHaveBeenCalled();
    expect(result.kind).toBe('no_connections');
    expect(result.provider).toBeUndefined();
    expect(result.answer).toMatch(/no connected workplace apps/i);
  });

  it('offers a non-Jira tool when only that provider is connected', async () => {
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

  it('hard-filters offered tools and instructions by requested sources', async () => {
    const { service, toolLoop } = build({
      connections: [
        {
          id: 'jira-1',
          provider: ProviderName.JIRA,
          status: ConnectionStatus.ACTIVE,
          workspaceName: 'Jira workspace',
          accountName: null,
        },
        {
          id: 'gmail-1',
          provider: ProviderName.GMAIL,
          status: ConnectionStatus.ACTIVE,
          workspaceName: null,
          accountName: 'me@example.com',
        },
      ],
    });

    await service.ask(user as never, 'Find Jira work', [ProviderName.JIRA]);

    const request = toolLoop.mock.calls[0]?.[0];
    expect(request?.tools).toEqual([
      expect.objectContaining({ name: 'jira_search' }),
    ]);
    expect(request?.instructions).toContain('jira-1');
    expect(request?.instructions).not.toContain('gmail-1');
  });

  it('records an empty model answer as one failed run', async () => {
    const toolLoop = jest.fn().mockResolvedValue({
      answer: '   ',
      provider: 'groq',
      model: 'test-model',
      toolCalls: [],
      rounds: 1,
    }) as ToolLoopMock;
    const { service, brainRunFail } = build({
      connections: [
        {
          id: 'conn-1',
          provider: ProviderName.JIRA,
          status: ConnectionStatus.ACTIVE,
          workspaceName: 'Acme',
          accountName: null,
        },
      ],
      toolLoop,
    });

    await expect(service.ask(user as never, 'search')).rejects.toMatchObject({
      status: 502,
    });
    expect(brainRunFail).toHaveBeenCalledTimes(1);
  });

  it('routes tool execution through ToolExecutorService and records a run', async () => {
    const execute = jest
      .fn()
      .mockImplementation((_userId, _name, args: Record<string, unknown>) =>
        Promise.resolve({
          ok: true,
          data: { ok: true },
          arguments: args,
        }),
      );
    const { service, toolLoop, brainRunComplete } = build({
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

    toolLoop.mockImplementation(async (req) => {
      await req.executeTool('jira_search', {
        connectionId: 'conn-1',
        jql: 'project = A',
      });
      return {
        answer: 'found',
        provider: 'groq',
        model: 'm',
        toolCalls: [],
        rounds: 1,
      };
    });

    const result = await service.ask(user as never, 'search');
    expect(execute).toHaveBeenCalledWith(
      'user-1',
      'jira_search',
      {
        connectionId: 'conn-1',
        jql: 'project = A',
      },
      expect.objectContaining({
        connections: [expect.objectContaining({ id: 'conn-1' })],
      }),
    );
    expect(result.kind).toBe('answer');
    expect(result.answer).toBe('found');
    expect(result.runId).toBe('run-1');
    expect(brainRunComplete).toHaveBeenCalled();
  });
});
