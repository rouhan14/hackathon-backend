/**
 * Turn raw Atlassian MCP searchJiraIssuesUsingJql payloads into a compact
 * shape the LLM can reason about (key, summary, status, …).
 */

export interface NormalizedJiraIssue {
  key: string;
  summary: string;
  status?: string;
  assignee?: string;
  priority?: string;
  updated?: string;
  issueType?: string;
  url?: string;
}

export interface NormalizedJiraSearchResult {
  connectionId: string;
  cloudId: string;
  jql: string;
  issueCount: number;
  total?: number;
  issues: NormalizedJiraIssue[];
  empty: boolean;
  note?: string;
}

export function normalizeJiraSearchResult(input: {
  connectionId: string;
  cloudId: string;
  jql: string;
  result: unknown;
}): NormalizedJiraSearchResult {
  const payload = unwrapMcpResult(input.result);
  const issues = collectIssues(payload)
    .map(normalizeIssue)
    .filter(Boolean) as NormalizedJiraIssue[];
  const total = extractTotal(payload, issues.length);

  return {
    connectionId: input.connectionId,
    cloudId: input.cloudId,
    jql: input.jql,
    issueCount: issues.length,
    total,
    issues,
    empty: issues.length === 0,
    note:
      issues.length === 0
        ? 'No issues matched this JQL for the connected site. The user may have no matching work, or the cloudId/scopes may not cover their projects.'
        : undefined,
  };
}

function unwrapMcpResult(result: unknown): unknown {
  if (!isRecord(result)) {
    return result;
  }
  // Our service wraps MCP CallToolResult as { content, structuredContent, isError }
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (!isRecord(block)) continue;
      if (typeof block.text === 'string') {
        try {
          return JSON.parse(block.text) as unknown;
        } catch {
          // keep scanning
        }
      }
      if (block.type === 'resource' && isRecord(block.resource)) {
        return block.resource;
      }
    }
  }
  return result;
}

function extractTotal(payload: unknown, fallback: number): number | undefined {
  if (!isRecord(payload)) {
    return fallback;
  }
  for (const key of ['total', 'totalCount', 'issueCount', 'count']) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return fallback;
}

function collectIssues(payload: unknown): unknown[] {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    // Array of issues or array of containers
    if (payload.some(looksLikeIssue)) {
      return payload.filter(looksLikeIssue);
    }
    return payload.flatMap((item) => collectIssues(item));
  }
  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ['issues', 'values', 'results', 'items', 'data', 'issue']) {
    if (payload[key] !== undefined) {
      const nested = collectIssues(payload[key]);
      if (nested.length) {
        return nested;
      }
    }
  }

  // Deep scan for first non-empty issue-looking array
  for (const value of Object.values(payload)) {
    if (Array.isArray(value) && value.some(looksLikeIssue)) {
      return value.filter(looksLikeIssue);
    }
    if (isRecord(value) || Array.isArray(value)) {
      const nested = collectIssues(value);
      if (nested.length) {
        return nested;
      }
    }
  }

  return [];
}

function looksLikeIssue(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.key === 'string' && value.key.includes('-')) {
    return true;
  }
  // Nested Jira REST shape { id, key, fields: { summary } }
  if (
    typeof value.key === 'string' &&
    isRecord(value.fields) &&
    (typeof value.fields.summary === 'string' || value.fields.summary != null)
  ) {
    return true;
  }
  return false;
}

function normalizeIssue(raw: unknown): NormalizedJiraIssue | null {
  if (!isRecord(raw)) {
    return null;
  }
  const key = typeof raw.key === 'string' ? raw.key : undefined;
  if (!key) {
    return null;
  }

  const fields = isRecord(raw.fields) ? raw.fields : raw;

  const summary =
    pickString(fields, ['summary', 'title', 'name']) ??
    pickString(raw, ['summary', 'title', 'name']) ??
    '(no summary)';

  const status =
    pickNestedName(fields, 'status') ??
    pickString(fields, ['status', 'statusName']);

  const assignee =
    pickNestedName(fields, 'assignee') ??
    pickString(fields, ['assignee', 'assigneeName']);

  const priority =
    pickNestedName(fields, 'priority') ??
    pickString(fields, ['priority', 'priorityName']);

  const issueType =
    pickNestedName(fields, 'issuetype') ??
    pickNestedName(fields, 'issueType') ??
    pickString(fields, ['issuetype', 'issueType', 'type']);

  const updated =
    pickString(fields, ['updated', 'updatedAt', 'lastUpdated']) ??
    pickString(raw, ['updated', 'updatedAt']);

  const url =
    pickString(raw, ['url', 'self', 'browseUrl', 'webUrl']) ??
    pickString(fields, ['url', 'self']);

  return {
    key,
    summary,
    ...(status ? { status } : {}),
    ...(assignee ? { assignee } : {}),
    ...(priority ? { priority } : {}),
    ...(issueType ? { issueType } : {}),
    ...(updated ? { updated } : {}),
    ...(url ? { url } : {}),
  };
}

function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function pickNestedName(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = obj[key];
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (isRecord(value)) {
    return (
      pickString(value, ['displayName', 'name', 'value', 'emailAddress']) ??
      undefined
    );
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
