import { ModelConfigurationException } from './model-errors';
import { RoutingModelProvider } from './routing-model.provider';

describe('RoutingModelProvider', () => {
  const request = {
    instructions: 'test',
    userMessage: 'hello',
    tools: [],
    executeTool: jest.fn(),
  };

  function build(values: Record<string, string | undefined>) {
    const config = { get: (key: string) => values[key] };
    const groq = {
      toolLoop: jest.fn().mockResolvedValue({ provider: 'groq' }),
    };
    const bedrock = {
      toolLoop: jest.fn().mockResolvedValue({ provider: 'bedrock' }),
    };
    return {
      provider: new RoutingModelProvider(
        config as never,
        groq as never,
        bedrock as never,
      ),
      groq,
      bedrock,
    };
  }

  it('routes each brain call without storing an Error union', async () => {
    const { provider, groq, bedrock } = build({
      BRAIN_MODEL_PROVIDER: 'auto',
      GROQ_API_KEY: 'gsk_test',
    });

    await provider.toolLoop(request);

    expect(groq.toolLoop).toHaveBeenCalledWith(request);
    expect(bedrock.toolLoop).not.toHaveBeenCalled();
  });

  it('maps invalid routing config to a typed model exception', () => {
    const { provider } = build({ BRAIN_MODEL_PROVIDER: 'groq' });

    expect(() => provider.toolLoop(request)).toThrow(
      ModelConfigurationException,
    );
  });
});
