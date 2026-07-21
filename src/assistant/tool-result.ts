/** Single size bound for any tool payload sent to the model. */
export const MAX_TOOL_RESULT_CHARS = 40_000;

/**
 * Serialize a tool outcome for the model. This is the only truncation path.
 */
export function boundSerializeForModel(
  value: unknown,
  maxChars = MAX_TOOL_RESULT_CHARS,
): string {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    text = JSON.stringify({ error: 'Tool result could not be serialized.' });
  }
  if (text.length <= maxChars) {
    return text;
  }
  return JSON.stringify({
    truncated: true,
    preview: text.slice(0, maxChars),
  });
}

/** Reuse the same serialization and truncation policy for Prisma JSON fields. */
export function boundJsonForStorage(
  value: unknown,
  maxChars = MAX_TOOL_RESULT_CHARS,
): object {
  const parsed = JSON.parse(boundSerializeForModel(value, maxChars)) as unknown;
  return parsed && typeof parsed === 'object' ? parsed : { value: parsed };
}
