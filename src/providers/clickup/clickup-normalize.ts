import { CLICKUP_SEARCH_MAX_RESULTS } from './clickup.constants';

export interface NormalizedClickUpTask {
  id: string;
  name: string;
  status?: string;
  assignees: string[];
  priority?: string;
  dueDate?: string;
  updatedAt?: string;
  url?: string;
  listName?: string;
  workspaceName?: string;
}

export interface NormalizedClickUpSearchResult {
  connectionId: string;
  query: string;
  taskCount: number;
  tasks: NormalizedClickUpTask[];
  empty: boolean;
  note?: string;
}

export function normalizeClickUpSearchResult(input: {
  connectionId: string;
  query: string;
  result: unknown;
  limit?: number;
}): NormalizedClickUpSearchResult {
  const payload = unwrapMcpResult(input.result);
  const limit = Math.min(
    input.limit ?? CLICKUP_SEARCH_MAX_RESULTS,
    CLICKUP_SEARCH_MAX_RESULTS,
  );
  const tasks = collectTasks(payload)
    .map(normalizeClickUpTask)
    .filter((task): task is NormalizedClickUpTask => task !== null)
    .slice(0, limit);

  return {
    connectionId: input.connectionId,
    query: input.query,
    taskCount: tasks.length,
    tasks,
    empty: tasks.length === 0,
    note:
      tasks.length === 0
        ? 'No ClickUp tasks matched this search in the authorized workspaces.'
        : undefined,
  };
}

export function normalizeClickUpTaskResult(
  result: unknown,
): NormalizedClickUpTask | null {
  const payload = unwrapMcpResult(result);
  if (looksLikeTask(payload)) {
    return normalizeClickUpTask(payload);
  }
  const first = collectTasks(payload)[0];
  return first ? normalizeClickUpTask(first) : null;
}

function unwrapMcpResult(result: unknown): unknown {
  if (!isRecord(result)) return result;
  if (result.structuredContent !== undefined) return result.structuredContent;
  if (!Array.isArray(result.content)) return result;
  for (const block of result.content) {
    if (!isRecord(block)) continue;
    if (typeof block.text === 'string') {
      try {
        return JSON.parse(block.text) as unknown;
      } catch {
        continue;
      }
    }
    if (block.type === 'resource' && isRecord(block.resource)) {
      return block.resource;
    }
  }
  return result;
}

function collectTasks(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    const direct = payload.filter(looksLikeTask);
    return direct.length ? direct : payload.flatMap(collectTasks);
  }
  if (!isRecord(payload)) return [];
  if (looksLikeTask(payload)) return [payload];

  for (const key of ['tasks', 'results', 'items', 'data', 'task']) {
    if (payload[key] !== undefined) {
      const nested = collectTasks(payload[key]);
      if (nested.length) return nested;
    }
  }
  for (const value of Object.values(payload)) {
    if (isRecord(value) || Array.isArray(value)) {
      const nested = collectTasks(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

function looksLikeTask(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const id = pickString(value, ['id', 'task_id', 'taskId']);
  const name = pickString(value, ['name', 'title', 'task_name']);
  if (!id || !name) return false;
  const type = pickString(value, ['type', 'object_type', 'objectType']);
  return (
    !type ||
    type.toLowerCase().includes('task') ||
    value.status !== undefined ||
    value.list !== undefined ||
    value.assignees !== undefined
  );
}

function normalizeClickUpTask(raw: unknown): NormalizedClickUpTask | null {
  if (!isRecord(raw)) return null;
  const id = pickString(raw, ['id', 'task_id', 'taskId']);
  const name = pickString(raw, ['name', 'title', 'task_name']);
  if (!id || !name) return null;

  const status = nestedLabel(raw.status);
  const priority = nestedLabel(raw.priority);
  const listName = nestedLabel(raw.list);
  const workspaceName =
    nestedLabel(raw.workspace) ??
    nestedLabel(raw.team) ??
    nestedLabel(raw.space);
  const dueDate = normalizeDate(
    pickString(raw, ['due_date', 'dueDate', 'due_at']),
  );
  const updatedAt = normalizeDate(
    pickString(raw, ['date_updated', 'updated_at', 'updatedAt']),
  );
  const url = pickString(raw, ['url', 'web_url', 'webUrl']);

  return {
    id,
    name,
    ...(status ? { status } : {}),
    assignees: normalizeAssignees(raw.assignees),
    ...(priority ? { priority } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(url ? { url } : {}),
    ...(listName ? { listName } : {}),
    ...(workspaceName ? { workspaceName } : {}),
  };
}

function normalizeAssignees(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((assignee) => {
      if (typeof assignee === 'string') return assignee.trim();
      if (!isRecord(assignee)) return undefined;
      return pickString(assignee, ['username', 'displayName', 'name', 'email']);
    })
    .filter((value): value is string => Boolean(value));
}

function nestedLabel(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!isRecord(value)) return undefined;
  return pickString(value, ['status', 'priority', 'name', 'label', 'value']);
}

function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^\d{10,13}$/.test(value)) {
    const milliseconds =
      value.length === 10 ? Number(value) * 1000 : Number(value);
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  return value;
}

function pickString(
  value: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
