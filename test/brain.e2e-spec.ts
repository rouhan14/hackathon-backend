import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { ActionRisk, ConnectionStatus, ProviderName } from '@prisma/client';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { ConnectionsService } from './../src/connections/connections.service';
import { MODEL_PROVIDER } from './../src/assistant/model-provider';
import { ToolRegistryService } from './../src/assistant/tool-registry.service';
import { BrainRunService } from './../src/assistant/brain-run.service';
import type { AssistantAskResult } from './../src/assistant/brain-assistant.service';

process.env.JWT_SECRET ??= 'e2e-only-jwt-secret';
process.env.DATABASE_URL ??=
  'postgresql://postgres:dev@localhost:5433/hackathon?schema=public';
process.env.BEDROCK_API_KEY ??= 'e2e-only-bedrock-api-key';
process.env.BEDROCK_BASE_URL ??= 'https://bedrock-mantle.us-east-1.api.aws/v1';
process.env.BEDROCK_MODEL_ID ??= 'google.gemma-3-4b-it';

/**
 * In-process API tests for /assistant/brain with Prisma/model mocked.
 * Does not require Docker or live provider credentials.
 */
describe('Assistant brain API (e2e, mocked deps)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;

  const user = {
    id: 'user-e2e-1',
    email: 'e2e@example.com',
    name: 'E2E User',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const toolLoop = jest.fn();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        user: {
          findUnique: jest.fn().mockResolvedValue(user),
        },
        agentRun: {
          create: jest.fn().mockResolvedValue({ id: 'run-e2e' }),
          update: jest.fn().mockResolvedValue({}),
        },
        membership: {
          findFirst: jest.fn().mockResolvedValue({
            organizationId: 'org-e2e',
          }),
        },
      })
      .overrideProvider(ConnectionsService)
      .useValue({
        findAll: jest.fn().mockResolvedValue([
          {
            id: 'conn-jira-1',
            provider: ProviderName.JIRA,
            status: ConnectionStatus.ACTIVE,
            workspaceName: 'Acme',
            accountName: 'Acme',
            grantedScopes: ['search:jira-work'],
          },
        ]),
        findOne: jest.fn(),
      })
      .overrideProvider(MODEL_PROVIDER)
      .useValue({
        generateStructured: jest.fn(),
        toolLoop,
        generateWithTools: jest.fn(),
      })
      .overrideProvider(BrainRunService)
      .useValue({
        start: jest.fn().mockResolvedValue('run-e2e'),
        complete: jest.fn().mockResolvedValue(undefined),
        fail: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    jwt = app.get(JwtService);

    // Ensure at least one tool is registered for Jira in this process.
    const registry = app.get(ToolRegistryService);
    if (!registry.has('jira_search')) {
      registry.register({
        name: 'jira_search',
        provider: ProviderName.JIRA,
        description: 'Search Jira',
        risk: ActionRisk.READ,
        requiredScopes: [],
        requiresConnectionId: true,
        parameters: {
          type: 'object',
          properties: {
            connectionId: { type: 'string' },
            jql: { type: 'string' },
          },
          required: ['connectionId', 'jql'],
        },
        execute: () => Promise.resolve({ issues: [] }),
      });
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    toolLoop.mockReset();
    toolLoop.mockResolvedValue({
      answer: 'You have 2 open issues.',
      provider: 'groq',
      model: 'test-model',
      toolCalls: [
        {
          name: 'jira_search',
          arguments: {
            connectionId: 'conn-jira-1',
            jql: 'assignee = currentUser()',
          },
          ok: true,
        },
      ],
      rounds: 2,
      promptTokens: 10,
      outputTokens: 20,
    });
  });

  function authHeader() {
    const token = jwt.sign({ sub: user.id, email: user.email });
    return { Authorization: `Bearer ${token}` };
  }

  it('GET /health', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toBeDefined();
  });

  it('POST /assistant/brain rejects unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .post('/assistant/brain')
      .send({ message: 'What is blocked?' })
      .expect(401);
  });

  it('POST /assistant/brain rejects empty message', async () => {
    await request(app.getHttpServer())
      .post('/assistant/brain')
      .set(authHeader())
      .send({ message: '' })
      .expect(400);
  });

  it('POST /assistant/brain returns answer + toolCalls', async () => {
    const res = await request(app.getHttpServer())
      .post('/assistant/brain')
      .set(authHeader())
      .send({ message: 'What Jira issues are assigned to me?' })
      .expect(200);

    const body = res.body as AssistantAskResult;
    expect(body.kind).toBe('answer');
    expect(body.answer).toBe('You have 2 open issues.');
    expect(body.provider).toBe('groq');
    expect(body.model).toBe('test-model');
    expect(body.toolCalls).toEqual([
      expect.objectContaining({ name: 'jira_search', ok: true }),
    ]);
    expect(body.rounds).toBe(2);
    expect(body.availableConnections).toEqual([
      expect.objectContaining({
        id: 'conn-jira-1',
        provider: ProviderName.JIRA,
      }),
    ]);
    expect(toolLoop).toHaveBeenCalledTimes(1);
  });

  it('POST /assistant/ask is an alias of brain', async () => {
    const res = await request(app.getHttpServer())
      .post('/assistant/ask')
      .set(authHeader())
      .send({ message: 'Hello brain alias' })
      .expect(200);

    const body = res.body as AssistantAskResult;
    expect(body.answer).toBe('You have 2 open issues.');
    expect(toolLoop).toHaveBeenCalledTimes(1);
  });

  it('POST /assistant/brain rejects an unknown source filter', async () => {
    await request(app.getHttpServer())
      .post('/assistant/brain')
      .set(authHeader())
      .send({ message: 'Search work', sources: ['DROPBOX'] })
      .expect(400);
  });
});
