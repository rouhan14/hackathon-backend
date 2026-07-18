export const ATLASSIAN_ROVO_MCP_URL = 'https://mcp.atlassian.com/v1/mcp/authv2';

export const ATLASSIAN_ACCESSIBLE_RESOURCES_URL =
  'https://api.atlassian.com/oauth/token/accessible-resources';

export const ATLASSIAN_ACCESSIBLE_RESOURCES_TOOL =
  'getAccessibleAtlassianResources';

export const ATLASSIAN_JIRA_SEARCH_TOOL = 'searchJiraIssuesUsingJql';

export const JIRA_REAUTH_REQUIRED_CODE = 'JIRA_REAUTH_REQUIRED';

export const JIRA_NO_ACCESSIBLE_SITES_CODE = 'JIRA_NO_ACCESSIBLE_SITES';

export const JIRA_SEARCH_PERMISSION_REQUIRED_CODE =
  'JIRA_SEARCH_PERMISSION_REQUIRED';

/** Preferred granular Rovo/MCP search scope. */
export const JIRA_SEARCH_REQUIRED_SCOPE = 'search:jira-work';

/**
 * Scopes that are enough to attempt Jira issue search.
 * Classic OAuth often grants `read:jira-work` (includes search) without
 * the newer granular `search:jira-work` string.
 */
export const JIRA_SEARCH_ACCEPTABLE_SCOPES = [
  'search:jira-work',
  'read:jira-work',
  'read:jql:jira',
] as const;

export function connectionHasJiraSearchAccess(
  grantedScopes: readonly string[],
): boolean {
  const normalized = grantedScopes.map((s) => s.toLowerCase());
  if (
    JIRA_SEARCH_ACCEPTABLE_SCOPES.some((scope) =>
      normalized.includes(scope.toLowerCase()),
    )
  ) {
    return true;
  }
  // Other granular read/search scopes that mention jira.
  return normalized.some(
    (scope) =>
      scope.includes('jira') &&
      (scope.includes('search') ||
        scope.startsWith('read:') ||
        scope.includes('read:issue')),
  );
}

export const JIRA_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
