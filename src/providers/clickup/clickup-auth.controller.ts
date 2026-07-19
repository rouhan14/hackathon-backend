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
import { ClickUpCapabilityUnavailableException } from './clickup.errors';
import { ClickUpMcpService } from './clickup-mcp.service';

const DEFAULT_POST_AUTH_REDIRECT = 'http://localhost:3000/dashboard';

export class ClickUpOAuthAuthorizationEntity {
  @ApiProperty({ example: 'https://app.clickup.com/api?...' })
  authorizationUrl: string;
}

@ApiTags('clickup-auth')
@Controller('auth/clickup')
export class ClickUpAuthController {
  private readonly logger = new Logger(ClickUpAuthController.name);

  constructor(
    private readonly clickup: ClickUpMcpService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create a user-bound ClickUp hosted MCP authorization URL.',
  })
  @ApiOkResponse({ type: ClickUpOAuthAuthorizationEntity })
  async login(
    @CurrentUser() user: SafeUser,
  ): Promise<ClickUpOAuthAuthorizationEntity> {
    return {
      authorizationUrl: await this.clickup.startAuthorization(user.id),
    };
  }

  @Get('callback')
  @ApiOperation({ summary: 'Complete the ClickUp hosted MCP OAuth flow.' })
  async callback(
    @Res() response: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ): Promise<void> {
    try {
      if (error || !code || !state) {
        throw new Error('Invalid ClickUp OAuth callback.');
      }
      await this.clickup.completeAuthorization(code, state);
      response.redirect(this.frontendRedirect('connected'));
    } catch (callbackError) {
      const status =
        callbackError instanceof ClickUpCapabilityUnavailableException
          ? 'unsupported'
          : 'error';
      this.logger.error(
        `ClickUp OAuth callback failed status=${status} errorType=${errorType(callbackError)}`,
      );
      response.redirect(this.frontendRedirect(status));
    }
  }

  private frontendRedirect(
    status: 'connected' | 'error' | 'unsupported',
  ): string {
    const url = new URL(
      this.config.get<string>(
        'CLICKUP_POST_AUTH_REDIRECT',
        DEFAULT_POST_AUTH_REDIRECT,
      ),
    );
    url.searchParams.set('clickup', status);
    return url.toString();
  }
}

function errorType(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
