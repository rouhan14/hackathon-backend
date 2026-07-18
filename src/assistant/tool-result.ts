/** Single size bound for any tool payload sent to the model. */
export const MAX_TOOL_RESULT_CHARS = 40_000;

/**
 * Serialize a tool outcome for the model. This is the only truncation path.
 */
export function boundSerializeForModel(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    text = JSON.stringify({ error: 'Tool result could not be serialized.' });
  }
  if (text.length <= MAX_TOOL_RESULT_CHARS) {
    return text;
  }
  return JSON.stringify({
    truncated: true,
    preview: text.slice(0, MAX_TOOL_RESULT_CHARS),
  });
}
