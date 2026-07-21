/**
 * Some models (especially smaller ones) write tool calls as plain text
 * instead of using the provider's native toolUse / function-calling channel.
 * Detect those so the orchestrator can still execute real tools.
 */

export interface PseudoToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** Placeholder/wrapper words small models emit around the real tool name. */
const WRAPPER_KEYWORDS = [
  'tool_name',
  'tool_call',
  'toolcall',
  'use_tool',
  'run_tool',
  'call_tool',
  'execute_tool',
  'invoke',
] as const;

/**
 * Parse text for calls like:
 *   jira_search(connectionId='…', jql='…')
 *   ```tool_code
 *   jira_search(...)
 *   ```
 */
export function parsePseudoToolCalls(
  text: string,
  allowedToolNames: readonly string[],
): PseudoToolCall[] {
  if (!text?.trim() || allowedToolNames.length === 0) {
    return [];
  }

  const allowed = new Map(
    allowedToolNames.map((n) => [n.toLowerCase(), n] as const),
  );
  const found: PseudoToolCall[] = [];
  const seen = new Set<string>();

  for (const [lower, canonical] of allowed) {
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const idx = text.toLowerCase().indexOf(lower, searchFrom);
      if (idx < 0) {
        break;
      }
      // Word boundary check
      const before = idx === 0 ? ' ' : text[idx - 1];
      if (/[a-zA-Z0-9_]/.test(before)) {
        searchFrom = idx + lower.length;
        continue;
      }
      let j = idx + lower.length;
      while (j < text.length && /\s/.test(text[j])) {
        j += 1;
      }
      if (text[j] !== '(') {
        searchFrom = idx + lower.length;
        continue;
      }
      const close = findMatchingParen(text, j);
      if (close < 0) {
        searchFrom = idx + lower.length;
        continue;
      }
      const inside = text.slice(j + 1, close);
      const args = parseCallArguments(inside);
      const key = `${canonical}:${JSON.stringify(args)}`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ name: canonical, arguments: args });
      }
      searchFrom = close + 1;
    }
  }

  // Wrapper form: small models often literally emit the placeholder word, e.g.
  //   tool_name(jira_search, {"jql":"..."})
  //   tool_call(name="jira_search", arguments={...})
  //   invoke(jira_search, {...})
  for (const keyword of WRAPPER_KEYWORDS) {
    const lowerText = text.toLowerCase();
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const idx = lowerText.indexOf(keyword, searchFrom);
      if (idx < 0) {
        break;
      }
      const before = idx === 0 ? ' ' : text[idx - 1];
      if (/[a-zA-Z0-9_]/.test(before)) {
        searchFrom = idx + keyword.length;
        continue;
      }
      let j = idx + keyword.length;
      while (j < text.length && /\s/.test(text[j])) {
        j += 1;
      }
      if (text[j] !== '(') {
        searchFrom = idx + keyword.length;
        continue;
      }
      const close = findMatchingParen(text, j);
      if (close < 0) {
        searchFrom = idx + keyword.length;
        continue;
      }
      const call = parseWrappedCall(text.slice(j + 1, close), allowed);
      if (call) {
        const key = `${call.name}:${JSON.stringify(call.arguments)}`;
        if (!seen.has(key)) {
          seen.add(key);
          found.push(call);
        }
      }
      searchFrom = close + 1;
    }
  }

  // JSON-ish: {"name":"jira_search","arguments":{...}}
  const jsonRe =
    /\{\s*"(?:name|tool)"\s*:\s*"([^"]+)"\s*,\s*"(?:arguments|parameters|input)"\s*:\s*(\{[\s\S]*?\})\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = jsonRe.exec(text)) !== null) {
    const rawName = match[1];
    const canonical = allowed.get(rawName.toLowerCase());
    if (!canonical) {
      continue;
    }
    try {
      const args = JSON.parse(match[2]) as Record<string, unknown>;
      const key = `${canonical}:${JSON.stringify(args)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      found.push({ name: canonical, arguments: args });
    } catch {
      // ignore malformed JSON
    }
  }

  return found;
}

/**
 * Parse the inside of a wrapper call like `jira_search, {json}` or
 * `name="jira_search", arguments={json}` into a real tool call, if the resolved
 * name is allowed.
 */
function parseWrappedCall(
  inside: string,
  allowed: Map<string, string>,
): PseudoToolCall | null {
  const parts = splitTopLevelCommas(inside);
  if (parts.length === 0) {
    return null;
  }

  let rawName: string | undefined;
  let argsPart: string | undefined;

  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    const colon = trimmed.indexOf(':');
    const sep = eq >= 0 && (colon < 0 || eq < colon) ? eq : colon;
    if (sep > 0 && !trimmed.startsWith('{')) {
      const key = trimmed.slice(0, sep).trim().replace(/^["']|["']$/g, '').toLowerCase();
      const value = trimmed.slice(sep + 1).trim();
      if (['name', 'tool', 'tool_name', 'function'].includes(key)) {
        rawName = unquote(value);
        continue;
      }
      if (
        ['arguments', 'args', 'parameters', 'params', 'input'].includes(key)
      ) {
        argsPart = value;
        continue;
      }
      // Some other kwarg — treat the whole wrapper as positional args below.
    }
    if (rawName === undefined) {
      rawName = unquote(trimmed);
    } else if (argsPart === undefined) {
      argsPart = trimmed;
    }
  }

  if (!rawName) {
    return null;
  }
  const canonical = allowed.get(rawName.toLowerCase());
  if (!canonical) {
    return null;
  }
  const args = argsPart ? parseCallArguments(argsPart) : {};
  return { name: canonical, arguments: args };
}

function unquote(value: string): string {
  return value.trim().replace(/^["'`]|["'`]$/g, '');
}

function parseCallArguments(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      // Fall back to key=value parsing below.
    }
  }
  return parseKwargs(raw);
}

/** True when the model is simulating tools instead of answering with data. */
export function looksLikePseudoToolNarration(text: string): boolean {
  return (
    /```\s*tool_code/i.test(text) ||
    /\btool_code\b/i.test(text) ||
    /\bjira_search\s*\(/i.test(text) ||
    /\b(?:tool_name|tool_call|toolcall|use_tool|run_tool|call_tool|execute_tool)\s*\(/i.test(
      text,
    ) ||
    /I'll use the .+ tool/i.test(text)
  );
}

/** Find the index of the ')' matching the '(' at openIdx, respecting quotes. */
function findMatchingParen(text: string, openIdx: number): number {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  for (let i = openIdx; i < text.length; i += 1) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    if (quote) {
      if (ch === quote && prev !== '\\') {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function parseKwargs(raw: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if (!raw.trim()) {
    return args;
  }

  // Split on commas that are outside quotes.
  const parts = splitTopLevelCommas(raw);
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) {
      continue;
    }
    const key = part.slice(0, eq).trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      continue;
    }
    const valueRaw = part.slice(eq + 1).trim();
    args[key] = parseScalar(valueRaw);
  }
  return args;
}

function splitTopLevelCommas(raw: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let quote: '"' | "'" | null = null;
  let depth = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    const prev = i > 0 ? raw[i - 1] : '';
    if (quote) {
      buf += ch;
      if (ch === quote && prev !== '\\') {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1;
      buf += ch;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      buf += ch;
      continue;
    }
    if (ch === ',' && depth === 0) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) {
    parts.push(buf);
  }
  return parts;
}

function parseScalar(valueRaw: string): unknown {
  if (
    (valueRaw.startsWith("'") && valueRaw.endsWith("'")) ||
    (valueRaw.startsWith('"') && valueRaw.endsWith('"'))
  ) {
    return valueRaw.slice(1, -1);
  }
  if (/^(true|false)$/i.test(valueRaw)) {
    return valueRaw.toLowerCase() === 'true';
  }
  if (/^-?\d+(\.\d+)?$/.test(valueRaw)) {
    return Number(valueRaw);
  }
  try {
    return JSON.parse(valueRaw) as unknown;
  } catch {
    return valueRaw;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
