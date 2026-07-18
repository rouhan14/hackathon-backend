import { Controller, Get, Logger, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { SafeUser } from '../../auth/auth.service';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { JiraNoAccessibleSitesException } from './jira.errors';
import { JiraMcpService } from './jira-mcp.service';

const DEFAULT_POST_AUTH_REDIRECT = 'http://localhost:3000/dashboard';

export class JiraOAuthAuthorizationEntity {
  @ApiProperty({
    example: 'https://auth.atlassian.com/authorize?...',
  })
  authorizationUrl: string;
}

@ApiTags('jira-auth')
@Controller('auth/jira')
export class JiraAuthController {
  private readonly logger = new Logger(JiraAuthController.name);

  constructor(
    private readonly jira: JiraMcpService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create a user-bound Atlassian Rovo MCP authorization URL.',
  })
  @ApiOkResponse({ type: JiraOAuthAuthorizationEntity })
  async login(
    @CurrentUser() user: SafeUser,
  ): Promise<JiraOAuthAuthorizationEntity> {
    return {
      authorizationUrl: await this.jira.startAuthorization(user.id),
    };
  }

  @Get('callback')
  @ApiOperation({ summary: 'Complete the Atlassian Rovo MCP OAuth flow.' })
  async callback(
    @Res() response: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ): Promise<void> {
    const correlationId = oauthCorrelationId(state);
    this.logger.log(
      `Jira OAuth callback received correlationId=${correlationId} hasCode=${Boolean(code)} hasState=${Boolean(state)} providerError=${error ?? 'none'}`,
    );

    try {
      if (error || !code || !state) {
        throw new Error('Invalid Jira OAuth callback.');
      }
      const result = await this.jira.completeAuthorization(code, state);
      this.logger.log(
        `Jira OAuth callback completed correlationId=${correlationId} connectedSites=${result.connectedSites}`,
      );
      response.redirect(
        this.frontendRedirect('connected', result.connectedSites),
      );
    } catch (callbackError) {
      if (callbackError instanceof JiraNoAccessibleSitesException) {
        this.logger.warn(
          `Jira OAuth callback completed without an authorized site correlationId=${correlationId}`,
        );
      } else {
        this.logger.error(
          `Jira OAuth callback failed correlationId=${correlationId}: ${errorChain(callbackError)}`,
          callbackError instanceof Error ? callbackError.stack : undefined,
        );
      }
      response.redirect(
        this.frontendRedirect(
          callbackError instanceof JiraNoAccessibleSitesException
            ? 'no-sites'
            : 'error',
        ),
      );
    }
  }

  private frontendRedirect(
    status: 'connected' | 'error' | 'no-sites',
    connectedSites?: number,
  ): string {
    const base = this.config.get<string>(
      'JIRA_POST_AUTH_REDIRECT',
      DEFAULT_POST_AUTH_REDIRECT,
    );
    const url = new URL(base);
    url.searchParams.set('jira', status);
    if (connectedSites !== undefined) {
      url.searchParams.set('jiraSites', String(connectedSites));
    }
    return url.toString();
  }
}

function oauthCorrelationId(state?: string): string {
  return state ? state.slice(0, 8) : 'missing';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorChain(error: unknown): string {
  const messages: string[] = [];
  const visited = new Set<unknown>();
  let current: unknown = error;

  while (current !== undefined && current !== null && !visited.has(current)) {
    visited.add(current);
    messages.push(errorMessage(current));
    current = current instanceof Error ? current.cause : undefined;
  }

  return messages.join(' caused by: ');
}
