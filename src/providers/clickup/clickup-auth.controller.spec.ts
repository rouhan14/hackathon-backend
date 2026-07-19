import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { SafeUser } from '../../auth/auth.service';
import { ClickUpAuthController } from './clickup-auth.controller';
import { ClickUpCapabilityUnavailableException } from './clickup.errors';
import { ClickUpMcpService } from './clickup-mcp.service';

describe('ClickUpAuthController', () => {
  it('returns the hosted MCP authorization URL', async () => {
    const startAuthorization = jest
      .fn()
      .mockResolvedValue('https://app.clickup.com/oauth?state=one');
    const controller = new ClickUpAuthController(
      { startAuthorization } as unknown as ClickUpMcpService,
      new ConfigService(),
    );

    await expect(
      controller.login({ id: 'user-1' } as SafeUser),
    ).resolves.toEqual({
      authorizationUrl: 'https://app.clickup.com/oauth?state=one',
    });
    expect(startAuthorization).toHaveBeenCalledWith('user-1');
  });

  it('redirects a successful callback to the frontend', async () => {
    const completeAuthorization = jest
      .fn()
      .mockResolvedValue({ connected: true });
    const controller = new ClickUpAuthController(
      { completeAuthorization } as unknown as ClickUpMcpService,
      new ConfigService({
        CLICKUP_POST_AUTH_REDIRECT:
          'http://localhost:3000/settings/integrations',
      }),
    );
    const redirect = jest.fn();

    await controller.callback(
      { redirect } as unknown as Response,
      'code',
      'state',
    );

    expect(redirect).toHaveBeenCalledWith(
      'http://localhost:3000/settings/integrations?clickup=connected',
    );
  });

  it('uses a distinct callback status when read tools are unavailable', async () => {
    const completeAuthorization = jest
      .fn()
      .mockRejectedValue(new ClickUpCapabilityUnavailableException());
    const controller = new ClickUpAuthController(
      { completeAuthorization } as unknown as ClickUpMcpService,
      new ConfigService(),
    );
    const redirect = jest.fn();

    await controller.callback(
      { redirect } as unknown as Response,
      'code',
      'state',
    );

    expect(redirect).toHaveBeenCalledWith(
      'http://localhost:3000/dashboard?clickup=unsupported',
    );
  });
});
