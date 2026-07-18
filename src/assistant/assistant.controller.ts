import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { SafeUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AssistantAskResult, AssistantService } from './assistant.service';
import { AskDto } from './dto/ask.dto';

@ApiTags('assistant')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('ask')
  @ApiOperation({
    summary:
      'Ask a work question. The model may call connected provider tools (e.g. Jira MCP search).',
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
    return this.assistant.ask(user, dto.message);
  }
}
