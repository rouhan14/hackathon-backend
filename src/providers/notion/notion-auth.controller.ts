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
import { NotionAuthService } from './notion-auth.service';

const DEFAULT_POST_AUTH_REDIRECT = 'http://localhost:3000/dashboard';

export class OAuthAuthorizationEntity {
  @ApiProperty({
    example:
      'https://api.notion.com/v1/oauth/authorize?client_id=example&state=example',
  })
  authorizationUrl: string;
}

@ApiTags('notion-auth')
@Controller('auth/notion')
export class NotionAuthController {
  constructor(
    private readonly notionAuth: NotionAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create an owned Notion OAuth authorization URL.',
  })
  @ApiOkResponse({ type: OAuthAuthorizationEntity })
  async login(
    @CurrentUser() user: SafeUser,
  ): Promise<OAuthAuthorizationEntity> {
    return {
      authorizationUrl: await this.notionAuth.startAuthorization(user.id),
    };
  }

  @Get('callback')
  @ApiOperation({ summary: 'Complete the user-bound Notion OAuth flow.' })
  async callback(
    @Res() response: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ): Promise<void> {
    try {
      if (error || !code || !state) {
        throw new BadOAuthCallbackError();
      }
      await this.notionAuth.completeAuthorization(code, state);
      response.redirect(this.frontendRedirect('connected'));
    } catch {
      response.redirect(this.frontendRedirect('error'));
    }
  }

  private frontendRedirect(status: 'connected' | 'error'): string {
    const base = this.config.get<string>(
      'NOTION_POST_AUTH_REDIRECT',
      DEFAULT_POST_AUTH_REDIRECT,
    );
    const url = new URL(base);
    url.searchParams.set('notion', status);
    return url.toString();
  }
}

class BadOAuthCallbackError extends Error {}
