export interface JiraOAuthStateMetadata {
  clientInformationEncrypted?: string;
}

export interface JiraConnectionMetadata {
  mcpClientInformationEncrypted: string;
  siteUrl?: string;
  avatarUrl?: string;
  tokenType?: string;
}

export interface AtlassianResource {
  id: string;
  name: string;
  url?: string;
  avatarUrl?: string;
  scopes: string[];
}

export interface JiraAuthorizationResult {
  connectedSites: number;
}
