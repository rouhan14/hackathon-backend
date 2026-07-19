import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

export interface RemoteMcpOAuthClientProviderOptions {
  redirectUrl: string;
  state: string;
  providerLabel?: string;
  clientName?: string;
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  onClientInformation?: (
    value: OAuthClientInformationMixed,
  ) => void | Promise<void>;
  onTokens?: (value: OAuthTokens) => void | Promise<void>;
  onCodeVerifier?: (value: string) => void | Promise<void>;
  onRedirect?: (value: URL) => void | Promise<void>;
}

/**
 * Reusable OAuth 2.1/PKCE state holder for hosted Streamable HTTP MCP servers.
 * Persistence remains provider-owned through the callbacks supplied here.
 */
export class RemoteMcpOAuthClientProvider implements OAuthClientProvider {
  private clientInfo?: OAuthClientInformationMixed;
  private oauthTokens?: OAuthTokens;
  private verifier?: string;
  private redirect?: URL;

  constructor(private readonly options: RemoteMcpOAuthClientProviderOptions) {
    this.clientInfo = options.clientInformation;
    this.oauthTokens = options.tokens;
    this.verifier = options.codeVerifier;
  }

  get redirectUrl(): string {
    return this.options.redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: this.options.clientName ?? 'AI Work OS',
      client_uri: new URL(this.options.redirectUrl).origin,
      redirect_uris: [this.options.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
    };
  }

  state(): string {
    return this.options.state;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.clientInfo;
  }

  async saveClientInformation(
    clientInformation: OAuthClientInformationMixed,
  ): Promise<void> {
    this.clientInfo = clientInformation;
    await this.options.onClientInformation?.(clientInformation);
  }

  tokens(): OAuthTokens | undefined {
    return this.oauthTokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.oauthTokens = {
      ...tokens,
      refresh_token: tokens.refresh_token ?? this.oauthTokens?.refresh_token,
      scope: tokens.scope ?? this.oauthTokens?.scope,
    };
    await this.options.onTokens?.(this.oauthTokens);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this.redirect = authorizationUrl;
    await this.options.onRedirect?.(authorizationUrl);
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this.verifier = codeVerifier;
    await this.options.onCodeVerifier?.(codeVerifier);
  }

  codeVerifier(): string {
    if (!this.verifier) {
      throw new Error(
        `No PKCE code verifier is available for this ${this.options.providerLabel ?? 'MCP'} flow.`,
      );
    }
    return this.verifier;
  }

  get authorizationUrl(): URL | undefined {
    return this.redirect;
  }

  get currentClientInformation(): OAuthClientInformationMixed | undefined {
    return this.clientInfo;
  }

  get currentTokens(): OAuthTokens | undefined {
    return this.oauthTokens;
  }
}
