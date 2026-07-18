import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { SafeUser } from '../../auth/auth.service';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { JiraSearchDto } from './dto/jira-search.dto';
import { JiraMcpService } from './jira-mcp.service';

@ApiTags('jira')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('integrations/jira')
export class JiraController {
  constructor(private readonly jira: JiraMcpService) {}

  @Post(':connectionId/search')
  @ApiOperation({
    summary: 'Search Jira issues through Atlassian Rovo MCP using JQL.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        connectionId: 'connection-id',
        cloudId: 'atlassian-cloud-id',
        result: { content: [] },
      },
    },
  })
  search(
    @CurrentUser() user: SafeUser,
    @Param('connectionId') connectionId: string,
    @Body() input: JiraSearchDto,
  ): Promise<unknown> {
    return this.jira.searchIssues(user.id, connectionId, input);
  }
}
