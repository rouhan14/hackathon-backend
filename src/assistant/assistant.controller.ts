import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SafeUser } from '../auth/auth.service';
import { AssistantService } from './assistant.service';

@ApiTags('assistant')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('chat')
  @ApiOperation({
    summary: 'Send a message to the AI assistant.',
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
    return this.assistant.chat(user.id, body.message);
  }
}
