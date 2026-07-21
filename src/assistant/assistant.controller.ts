import { Body, Controller, Post, UseGuards } from '@nestjs/common';
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
import { JiraAssistantService, AssistantAskResult } from './jira-assistant.service';
import { NotionAssistantService } from './notion-assistant.service';
import { AskDto } from './dto/ask.dto';

@ApiTags('assistant')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('assistant')
export class AssistantController {
  constructor(
    private readonly jiraAssistant: JiraAssistantService,
    private readonly notionAssistant: NotionAssistantService,
  ) {}

  @Post('ask')
  @ApiOperation({
    summary:
      'Ask a work question (Jira). The model may call connected provider tools (e.g. Jira MCP search).',
  })
  @ApiOkResponse({
    schema: {
      example: {
        answer: 'You have 2 open bugs assigned to you: ...',
        provider: 'bedrock',
        model: 'google.gemma-3-4b-it',
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
            provider: 'jira',
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
    return this.jiraAssistant.ask(user, dto.message);
  }

  @Post('brain')
  @ApiOperation({
    summary:
      'Unified AI brain (Gemma). One endpoint that works across all connected apps — Jira, Notion, and ClickUp — and can chain tools in a single request (e.g. read a Notion page, then create Jira tickets from it).',
  })
  @ApiBody({
    type: AskDto,
    examples: {
      readJira: {
        summary: 'Read Jira',
        value: { message: 'What Jira tickets do I have in progress right now?' },
      },
      readNotion: {
        summary: 'Read Notion',
        value: { message: 'Read my "Q3 Roadmap" page in Notion and summarize it.' },
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
        provider: 'bedrock',
        model: 'google.gemma-3-4b-it',
        toolCalls: [
          { name: 'notion_search', arguments: { query: 'Q3 Roadmap' }, ok: true },
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
    return this.jiraAssistant.ask(user, dto.message);
  }

  @Post('chat')
  @ApiOperation({
    summary: 'Send a message to the AI assistant (Notion).',
    description:
      'The assistant may use available MCP tools before returning its response.',
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
