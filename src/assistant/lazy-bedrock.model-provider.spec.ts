import { ConfigService } from '@nestjs/config';
import { LazyBedrockModelProvider } from './lazy-bedrock.model-provider';

describe('LazyBedrockModelProvider', () => {
  it('does not require Bedrock env until the first model call', () => {
    const config = {
      get: () => undefined,
    } as unknown as ConfigService;

    expect(() => new LazyBedrockModelProvider(config)).not.toThrow();
  });

  it('fails clearly on first call when env is missing', async () => {
    const config = {
      get: () => undefined,
    } as unknown as ConfigService;
    const provider = new LazyBedrockModelProvider(config);

    await expect(
      provider.generateStructured({
        instructions: 'x',
        input: 'y',
      }),
    ).rejects.toThrow(/BEDROCK_API_KEY|AWS_ACCESS_KEY_ID/);
  });

  it('selects IAM Converse when AWS keys are present', async () => {
    const config = {
      get: (key: string) =>
        ({
          AWS_ACCESS_KEY_ID: 'AKIAQ4NXQAJJIVNZJI6D',
          AWS_SECRET_ACCESS_KEY: 'secret',
          AWS_REGION: 'us-east-1',
          BEDROCK_MODEL_ID: 'google.gemma-3-4b-it',
        })[key],
    } as unknown as ConfigService;

    const provider = new LazyBedrockModelProvider(config);
    try {
      await provider.generateStructured({ instructions: 'x', input: 'y' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toMatch(/BEDROCK_API_KEY must be set/);
      expect(message).not.toMatch(/IAM access key \(AKIA/);
    }
  });
});
