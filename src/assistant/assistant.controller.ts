import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { SafeUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  BrainAssistantService,
  AssistantAskResult,
} from './brain-assistant.service';
import { NotionAssistantService } from './notion-assistant.service';
import { AskDto } from './dto/ask.dto';

@ApiTags('assistant')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('assistant')
export class AssistantController {
  constructor(
    private readonly brainAssistant: BrainAssistantService,
    private readonly notionAssistant: NotionAssistantService,
  ) {}

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Alias of POST /assistant/brain (multi-app tool loop). Prefer /assistant/brain for new clients.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        answer: 'You have 2 open bugs assigned to you: ...',
        kind: 'answer',
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        toolCalls: [
          {
            name: 'jira_search',
            arguments: {
              connectionId: 'conn_123',
              jql: 'assignee = currentUser() AND type = Bug AND statusCategory != Done',
            },
            ok: true,
          },
        ],
        rounds: 2,
        availableConnections: [
          {
            id: 'conn_123',
            provider: 'JIRA',
            workspaceName: 'Acme',
            accountName: 'Acme',
            status: 'ACTIVE',
          },
        ],
      },
    },
  })
  ask(
    @CurrentUser() user: SafeUser,
    @Body() dto: AskDto,
  ): Promise<AssistantAskResult> {
    return this.brainAssistant.ask(user, dto.message, dto.sources);
  }

  @Post('brain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Unified AI brain. One endpoint across connected apps (Jira, Notion, ClickUp). Prefers Groq tool calling when GROQ_API_KEY is set; falls back to Bedrock. Can chain tools in a single request (e.g. read a Notion page, then create Jira tickets).',
  })
  @ApiBody({
    type: AskDto,
    examples: {
      readJira: {
        summary: 'Read Jira',
        value: {
          message: 'What Jira tickets do I have in progress right now?',
        },
      },
      readNotion: {
        summary: 'Read Notion',
        value: {
          message: 'Read my "Q3 Roadmap" page in Notion and summarize it.',
        },
      },
      crossApp: {
        summary: 'Cross-app (Notion → Jira)',
        value: {
          message:
            'Read my "Q3 Roadmap" Notion page and create a Jira task in project ENG for each initiative listed.',
        },
      },
    },
  })
  @ApiOkResponse({
    schema: {
      example: {
        answer:
          'Your Notion page "Q3 Roadmap" lists 3 initiatives. You currently have 2 in-progress Jira tickets: ...',
        kind: 'answer',
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        toolCalls: [
          {
            name: 'notion_search',
            arguments: { query: 'Q3 Roadmap' },
            ok: true,
          },
          {
            name: 'jira_search',
            arguments: {
              connectionId: 'conn_123',
              jql: 'assignee = currentUser() AND statusCategory = "In Progress"',
            },
            ok: true,
          },
        ],
        rounds: 3,
        availableConnections: [],
      },
    },
  })
  brain(
    @CurrentUser() user: SafeUser,
    @Body() dto: AskDto,
  ): Promise<AssistantAskResult> {
    return this.brainAssistant.ask(user, dto.message, dto.sources);
  }

  @Post('chat')
  @ApiOperation({
    deprecated: true,
    summary: 'Send a message to the AI assistant (Notion).',
    description:
      'Deprecated compatibility endpoint with a legacy response shape. Use POST /assistant/brain.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['message'],
      properties: {
        message: {
          type: 'string',
          example: 'Find my project notes in Notion.',
        },
      },
    },
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'I found three project notes matching your request.',
        },
      },
    },
  })
  chat(
    @CurrentUser() user: SafeUser,
    @Body() body: { message: string },
  ): Promise<{ message: string }> {
    return this.notionAssistant.chat(user.id, body.message);
  }
}
