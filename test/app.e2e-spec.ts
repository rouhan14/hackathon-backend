import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

process.env.JWT_SECRET ??= 'e2e-only-jwt-secret';
process.env.DATABASE_URL ??=
  'postgresql://postgres:dev@localhost:5433/hackathon?schema=public';
process.env.BEDROCK_API_KEY ??= 'e2e-only-bedrock-api-key';
process.env.BEDROCK_BASE_URL ??= 'https://bedrock-mantle.us-east-1.api.aws/v1';
process.env.BEDROCK_MODEL_ID ??= 'google.gemma-3-4b-it';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    await app?.close();
  });
});
