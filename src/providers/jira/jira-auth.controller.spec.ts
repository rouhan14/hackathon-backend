import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { SafeUser } from '../../auth/auth.service';
import { JiraNoAccessibleSitesException } from './jira.errors';
import { JiraAuthController } from './jira-auth.controller';
import { JiraMcpService } from './jira-mcp.service';

describe('JiraAuthController', () => {
  it('returns the provider authorization URL for frontend navigation', async () => {
    const startAuthorization = jest
      .fn()
      .mockResolvedValue('https://auth.atlassian.com/authorize?state=one');
    const controller = new JiraAuthController(
      { startAuthorization } as unknown as JiraMcpService,
      new ConfigService(),
    );

    await expect(
      controller.login({ id: 'user-1' } as SafeUser),
    ).resolves.toEqual({
      authorizationUrl: 'https://auth.atlassian.com/authorize?state=one',
    });
    expect(startAuthorization).toHaveBeenCalledWith('user-1');
  });

  it('redirects a successful callback to the frontend', async () => {
    const completeAuthorization = jest
      .fn()
      .mockResolvedValue({ connectedSites: 1 });
    const controller = new JiraAuthController(
      { completeAuthorization } as unknown as JiraMcpService,
      new ConfigService({
        JIRA_POST_AUTH_REDIRECT: 'http://localhost:3000/settings/integrations',
      }),
    );
    const redirect = jest.fn();
    const response = { redirect } as unknown as Response;

    await controller.callback(response, 'code', 'state');

    expect(redirect).toHaveBeenCalledWith(
      'http://localhost:3000/settings/integrations?jira=connected&jiraSites=1',
    );
  });

  it('redirects an authorization with no selected sites to a distinct status', async () => {
    const completeAuthorization = jest
      .fn()
      .mockRejectedValue(new JiraNoAccessibleSitesException());
    const controller = new JiraAuthController(
      { completeAuthorization } as unknown as JiraMcpService,
      new ConfigService({
        JIRA_POST_AUTH_REDIRECT: 'http://localhost:3000/dashboard',
      }),
    );
    const redirect = jest.fn();
    const response = { redirect } as unknown as Response;

    await controller.callback(response, 'code', 'state');

    expect(redirect).toHaveBeenCalledWith(
      'http://localhost:3000/dashboard?jira=no-sites',
    );
  });
});
