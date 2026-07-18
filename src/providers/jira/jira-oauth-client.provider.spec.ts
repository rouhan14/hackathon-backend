import type { OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { JiraOAuthClientProvider } from './jira-oauth-client.provider';

describe('JiraOAuthClientProvider', () => {
  it('persists authorization artifacts through callbacks', async () => {
    const onCodeVerifier = jest.fn();
    const onClientInformation = jest.fn();
    const onTokens = jest.fn();
    const provider = new JiraOAuthClientProvider({
      redirectUrl: 'http://localhost:5000/auth/jira/callback',
      state: 'state-1',
      onCodeVerifier,
      onClientInformation,
      onTokens,
    });

    await provider.saveCodeVerifier('verifier');
    await provider.saveClientInformation({ client_id: 'client-1' });
    await provider.saveTokens({
      access_token: 'access',
      token_type: 'Bearer',
      refresh_token: 'refresh',
    });

    expect(provider.state()).toBe('state-1');
    expect(provider.codeVerifier()).toBe('verifier');
    expect(provider.clientInformation()).toEqual({ client_id: 'client-1' });
    expect(provider.tokens()).toMatchObject({ access_token: 'access' });
    expect(onCodeVerifier).toHaveBeenCalledWith('verifier');
    expect(onClientInformation).toHaveBeenCalledWith({
      client_id: 'client-1',
    });
    expect(onTokens).toHaveBeenCalled();
  });

  it('keeps a rotating refresh token when a refresh response omits it', async () => {
    const initial: OAuthTokens = {
      access_token: 'old-access',
      token_type: 'Bearer',
      refresh_token: 'existing-refresh',
      scope: 'read:jira-work',
    };
    const provider = new JiraOAuthClientProvider({
      redirectUrl: 'http://localhost:5000/auth/jira/callback',
      state: 'state-1',
      tokens: initial,
    });

    await provider.saveTokens({
      access_token: 'new-access',
      token_type: 'Bearer',
    });

    expect(provider.tokens()).toMatchObject({
      access_token: 'new-access',
      refresh_token: 'existing-refresh',
      scope: 'read:jira-work',
    });
  });
});
