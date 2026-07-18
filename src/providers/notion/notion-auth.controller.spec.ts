import { ConfigService } from '@nestjs/config';
import type { SafeUser } from '../../auth/auth.service';
import { NotionAuthController } from './notion-auth.controller';
import { NotionAuthService } from './notion-auth.service';

describe('NotionAuthController', () => {
  it('returns an authorization URL for client-side navigation', async () => {
    const authorizationUrl =
      'https://api.notion.com/v1/oauth/authorize?state=test-state';
    const startAuthorization = jest.fn().mockResolvedValue(authorizationUrl);
    const notionAuth = {
      startAuthorization,
    } as unknown as NotionAuthService;
    const controller = new NotionAuthController(
      notionAuth,
      new ConfigService(),
    );
    const user = { id: 'user-1' } as SafeUser;

    await expect(controller.login(user)).resolves.toEqual({
      authorizationUrl,
    });
    expect(startAuthorization).toHaveBeenCalledWith(user.id);
  });
});
