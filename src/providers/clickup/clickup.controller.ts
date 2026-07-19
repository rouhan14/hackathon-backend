import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { SafeUser } from '../../auth/auth.service';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ClickUpMcpService } from './clickup-mcp.service';
import { ClickUpSearchDto } from './dto/clickup-search.dto';

@ApiTags('clickup')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('integrations/clickup')
export class ClickUpController {
  constructor(private readonly clickup: ClickUpMcpService) {}

  @Post(':connectionId/search')
  @ApiOperation({ summary: 'Search tasks through ClickUp hosted MCP.' })
  @ApiOkResponse({
    schema: {
      example: {
        connectionId: 'connection-id',
        query: 'blocked tasks assigned to me',
        taskCount: 1,
        tasks: [{ id: 'task-id', name: 'Fix OAuth', status: 'blocked' }],
        empty: false,
      },
    },
  })
  search(
    @CurrentUser() user: SafeUser,
    @Param('connectionId') connectionId: string,
    @Body() input: ClickUpSearchDto,
  ) {
    return this.clickup.searchTasks(user.id, connectionId, input);
  }

  @Get(':connectionId/tasks/:taskId')
  @ApiOperation({ summary: 'Get one task through ClickUp hosted MCP.' })
  getTask(
    @CurrentUser() user: SafeUser,
    @Param('connectionId') connectionId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.clickup.getTask(user.id, connectionId, taskId);
  }
}
