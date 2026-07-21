/**
 * Chooses which model stack powers /assistant/brain and /assistant/ask toolLoop.
 *
 * BRAIN_MODEL_PROVIDER:
 *   - auto (default): Groq when GROQ_API_KEY is set, otherwise Bedrock
 *   - groq: require Groq
 *   - bedrock: force Bedrock/Gemma path
 */
export type BrainModelProviderChoice = 'groq' | 'bedrock';

export function resolveBrainToolLoopProvider(config: {
  get: (key: string) => unknown;
}): BrainModelProviderChoice {
  const configuredProvider = config.get('BRAIN_MODEL_PROVIDER');
  const raw = (
    typeof configuredProvider === 'string' ? configuredProvider : 'auto'
  )
    .trim()
    .toLowerCase();
  const groqApiKey = config.get('GROQ_API_KEY');
  const hasGroq =
    typeof groqApiKey === 'string' && groqApiKey.trim().length > 0;

  if (raw === 'bedrock') {
    return 'bedrock';
  }
  if (raw === 'groq') {
    if (!hasGroq) {
      throw new Error(
        'BRAIN_MODEL_PROVIDER=groq requires GROQ_API_KEY to be set.',
      );
    }
    return 'groq';
  }
  if (raw === 'auto') {
    return hasGroq ? 'groq' : 'bedrock';
  }
  throw new Error('BRAIN_MODEL_PROVIDER must be one of: auto, groq, bedrock.');
}
