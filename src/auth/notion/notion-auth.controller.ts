import { Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { NotionAuthService } from './notion-auth.service';

const DEFAULT_POST_AUTH_REDIRECT = 'http://localhost:3000/dashboard';

@ApiTags('notion-auth')
@Controller('auth/notion')
export class NotionAuthController {
  constructor(
    private readonly notionAuthService: NotionAuthService,
    private readonly config: ConfigService,
  ) {}

  /** Kick off the OAuth flow: redirect the user to Notion's consent screen. */
  @Get()
  @ApiOperation({
    summary: 'Redirect the user to the Notion OAuth consent screen.',
  })
  async login(@Res() res: Response): Promise<void> {
    const url = await this.notionAuthService.startAuthorization();
    res.redirect(url);
  }

  /**
   * Notion redirects back here with an authorization code. On success/failure
   * we bounce the browser back to the frontend with a `notion` status param.
   */
  @Get('callback')
  @ApiOperation({
    summary: 'OAuth callback: verify state, exchange code, store the token.',
  })
  async callback(
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ): Promise<void> {
    try {
      if (error) {
        throw new Error(`Notion returned error: ${error}`);
      }
      if (!code || !state) {
        throw new Error('Missing "code" or "state" query parameter.');
      }

      await this.notionAuthService.verifyState(state);
      const token = await this.notionAuthService.exchangeCodeForToken(code);
      await this.notionAuthService.persistConnection(token);

      res.redirect(this.frontendRedirect('connected'));
    } catch {
      res.redirect(this.frontendRedirect('error'));
    }
  }

  /** Build the frontend URL to return to, tagged with a `notion` status. */
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
