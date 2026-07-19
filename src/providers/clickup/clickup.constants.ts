export const CLICKUP_MCP_URL = 'https://mcp.clickup.com/mcp';
export const CLICKUP_MCP_ACCOUNT_ID = 'hosted-mcp';
export const CLICKUP_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export const CLICKUP_SEARCH_TOOL_CANDIDATES = [
  'search_workspace',
  'searchWorkspace',
] as const;
export const CLICKUP_GET_TASK_TOOL_CANDIDATES = [
  'get_task',
  'getTask',
] as const;

export const CLICKUP_SEARCH_QUERY_ARGUMENTS = [
  'query',
  'search_query',
  'search',
  'text',
] as const;
export const CLICKUP_SEARCH_LIMIT_ARGUMENTS = [
  'limit',
  'max_results',
  'maxResults',
] as const;
export const CLICKUP_TASK_ID_ARGUMENTS = ['task_id', 'taskId', 'id'] as const;

export const CLICKUP_REAUTH_REQUIRED_CODE = 'CLICKUP_REAUTH_REQUIRED';
export const CLICKUP_CAPABILITY_UNAVAILABLE_CODE =
  'CLICKUP_CAPABILITY_UNAVAILABLE';
export const CLICKUP_RATE_LIMITED_CODE = 'CLICKUP_RATE_LIMITED';
export const CLICKUP_CLIENT_NOT_APPROVED_CODE = 'CLICKUP_CLIENT_NOT_APPROVED';
export const CLICKUP_AUTH_START_FAILED_CODE = 'CLICKUP_AUTH_START_FAILED';

export const CLICKUP_SEARCH_MAX_RESULTS = 25;
export const CLICKUP_SEARCH_MAX_QUERY_LENGTH = 500;
