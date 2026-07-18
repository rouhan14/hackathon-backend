import type { ModelToolDefinition } from './model-provider';
import type { PseudoToolCall } from './parse-pseudo-tool-calls';

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

/**
 * When the model fails to call tools, invent safe default tool invocations
 * from the assistant system context (connection ids listed in instructions).
 */
export function buildDefaultToolCalls(
  tools: readonly ModelToolDefinition[],
  instructions: string,
): PseudoToolCall[] {
  if (!tools.length) {
    return [];
  }

  const names = new Set(tools.map((t) => t.name));
  const forced: PseudoToolCall[] = [];

  if (names.has('jira_search')) {
    const jiraConnectionId = extractJiraConnectionId(instructions);
    if (jiraConnectionId) {
      forced.push({
        name: 'jira_search',
        arguments: {
          connectionId: jiraConnectionId,
          // Prefer the current user's open work for "what should I work on".
          jql: 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC',
          maxResults: 15,
        },
      });
    }
  }

  return forced;
}

/**
 * Prefer an id on a JIRA connection line; fall back to the first UUID in context.
 */
export function extractJiraConnectionId(
  instructions: string,
): string | undefined {
  const lines = instructions.split(/\r?\n/);
  for (const line of lines) {
    if (
      !/provider\s*=\s*JIRA/i.test(line) &&
      !/provider\s*=\s*jira/i.test(line)
    ) {
      continue;
    }
    const match = line.match(UUID_RE);
    if (match?.[0]) {
      return match[0];
    }
  }

  // Pattern: id=<uuid>
  const idMatch = instructions.match(
    /id\s*=\s*([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i,
  );
  if (idMatch?.[1]) {
    return idMatch[1];
  }

  const any = instructions.match(UUID_RE);
  return any?.[0];
}
