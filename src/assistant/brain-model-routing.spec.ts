import { resolveBrainToolLoopProvider } from './brain-model-routing';

function config(map: Record<string, string | undefined>) {
  return {
    get: (key: string) => map[key],
  };
}

describe('resolveBrainToolLoopProvider', () => {
  it('prefers groq in auto mode when GROQ_API_KEY is set', () => {
    expect(
      resolveBrainToolLoopProvider(
        config({ GROQ_API_KEY: 'gsk_test', BRAIN_MODEL_PROVIDER: 'auto' }),
      ),
    ).toBe('groq');
  });

  it('falls back to bedrock in auto mode without GROQ_API_KEY', () => {
    expect(
      resolveBrainToolLoopProvider(config({ BRAIN_MODEL_PROVIDER: 'auto' })),
    ).toBe('bedrock');
  });

  it('forces bedrock when BRAIN_MODEL_PROVIDER=bedrock', () => {
    expect(
      resolveBrainToolLoopProvider(
        config({
          GROQ_API_KEY: 'gsk_test',
          BRAIN_MODEL_PROVIDER: 'bedrock',
        }),
      ),
    ).toBe('bedrock');
  });

  it('requires GROQ_API_KEY when BRAIN_MODEL_PROVIDER=groq', () => {
    expect(() =>
      resolveBrainToolLoopProvider(config({ BRAIN_MODEL_PROVIDER: 'groq' })),
    ).toThrow(/GROQ_API_KEY/);
  });

  it('rejects unknown routing modes', () => {
    expect(() =>
      resolveBrainToolLoopProvider(
        config({ BRAIN_MODEL_PROVIDER: 'sometimes' }),
      ),
    ).toThrow(/auto, groq, bedrock/);
  });
});
