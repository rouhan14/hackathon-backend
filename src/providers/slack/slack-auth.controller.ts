import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
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
import { SlackAuthService } from './slack-auth.service';

export class SlackOAuthAuthorizationEntity {
  @ApiProperty({
    example:
      'https://slack.com/oauth/v2/authorize?client_id=example&state=example',
  })
  authorizationUrl: string;
}

@ApiTags('slack-auth')
@Controller('auth/slack')
export class SlackAuthController {
  constructor(private readonly auth: SlackAuthService, private readonly config: ConfigService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create an owned Slack OAuth authorization URL.',
  })
  @ApiOkResponse({ type: SlackOAuthAuthorizationEntity })
  async login(
    @CurrentUser() user: SafeUser,
  ): Promise<SlackOAuthAuthorizationEntity> {
    return { authorizationUrl: await this.auth.startAuthorization(user.id) };
  }

  @Get('callback')
  @ApiOperation({ summary: 'Complete the user-bound Slack OAuth flow.' })
  async callback(@Res() response: Response, @Query('code') code?: string, @Query('state') state?: string, @Query('error') error?: string): Promise<void> {
    try {
      if (error || !code || !state) throw new Error('Invalid Slack OAuth callback.');
      await this.auth.completeAuthorization(code, state);
      response.redirect(this.redirect('connected'));
    } catch {
      response.redirect(this.redirect('error'));
    }
  }

  private redirect(status: 'connected' | 'error'): string {
    const url = new URL(this.config.get<string>('SLACK_POST_AUTH_REDIRECT', 'http://localhost:3000/dashboard'));
    url.searchParams.set('slack', status);
    return url.toString();
  }
}
