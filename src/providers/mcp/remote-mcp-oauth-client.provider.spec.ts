import type { OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { RemoteMcpOAuthClientProvider } from './remote-mcp-oauth-client.provider';

describe('RemoteMcpOAuthClientProvider', () => {
  it('persists OAuth artifacts through provider callbacks', async () => {
    const onClientInformation = jest.fn();
    const onCodeVerifier = jest.fn();
    const onTokens = jest.fn();
    const provider = new RemoteMcpOAuthClientProvider({
      redirectUrl: 'https://api.example.com/auth/clickup/callback',
      state: 'state-1',
      providerLabel: 'ClickUp',
      onClientInformation,
      onCodeVerifier,
      onTokens,
    });

    await provider.saveClientInformation({ client_id: 'client-1' });
    await provider.saveCodeVerifier('verifier');
    await provider.saveTokens({
      access_token: 'access',
      token_type: 'Bearer',
      refresh_token: 'refresh',
    });

    expect(provider.state()).toBe('state-1');
    expect(provider.currentClientInformation).toEqual({
      client_id: 'client-1',
    });
    expect(provider.codeVerifier()).toBe('verifier');
    expect(provider.currentTokens).toMatchObject({ access_token: 'access' });
    expect(onClientInformation).toHaveBeenCalled();
    expect(onCodeVerifier).toHaveBeenCalled();
    expect(onTokens).toHaveBeenCalled();
  });

  it('keeps refresh token and scope when a refresh response omits them', async () => {
    const tokens: OAuthTokens = {
      access_token: 'old-access',
      token_type: 'Bearer',
      refresh_token: 'refresh',
      scope: 'mcp:read',
    };
    const provider = new RemoteMcpOAuthClientProvider({
      redirectUrl: 'https://api.example.com/auth/clickup/callback',
      state: 'state-1',
      tokens,
    });

    await provider.saveTokens({
      access_token: 'new-access',
      token_type: 'Bearer',
    });

    expect(provider.currentTokens).toMatchObject({
      access_token: 'new-access',
      refresh_token: 'refresh',
      scope: 'mcp:read',
    });
  });
});
