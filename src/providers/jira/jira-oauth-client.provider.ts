import {
  RemoteMcpOAuthClientProvider,
  RemoteMcpOAuthClientProviderOptions,
} from '../mcp/remote-mcp-oauth-client.provider';

export type JiraOAuthClientProviderOptions =
  RemoteMcpOAuthClientProviderOptions;

/** Backward-compatible Jira name around the shared hosted-MCP OAuth client. */
export class JiraOAuthClientProvider extends RemoteMcpOAuthClientProvider {
  constructor(options: JiraOAuthClientProviderOptions) {
    super({ ...options, providerLabel: 'Jira' });
  }
}
