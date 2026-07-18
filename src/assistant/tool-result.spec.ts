import { boundSerializeForModel, MAX_TOOL_RESULT_CHARS } from './tool-result';

describe('boundSerializeForModel', () => {
  it('serializes small payloads fully', () => {
    expect(boundSerializeForModel({ a: 1 })).toBe(JSON.stringify({ a: 1 }));
  });

  it('truncates oversized payloads once', () => {
    const big = 'x'.repeat(MAX_TOOL_RESULT_CHARS + 100);
    const out = boundSerializeForModel({ body: big });
    const parsed = JSON.parse(out) as { truncated: boolean; preview: string };
    expect(parsed.truncated).toBe(true);
    expect(parsed.preview.length).toBe(MAX_TOOL_RESULT_CHARS);
  });
});
