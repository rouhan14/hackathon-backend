import { ConfigService } from '@nestjs/config';
import { loadBedrockConfig, loadBedrockResolvedConfig } from './bedrock.config';

function configFrom(map: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => map[key],
  } as ConfigService;
}

describe('loadBedrockResolvedConfig', () => {
  it('loads IAM credentials for Converse', () => {
    const result = loadBedrockResolvedConfig(
      configFrom({
        AWS_ACCESS_KEY_ID: 'AKIAQ4NXQAJJIVNZJI6D',
        AWS_SECRET_ACCESS_KEY: 'secret-value',
        AWS_REGION: 'us-east-1',
        BEDROCK_MODEL_ID: 'google.gemma-3-4b-it',
      }),
    );
    expect(result).toEqual({
      mode: 'iam',
      accessKeyId: 'AKIAQ4NXQAJJIVNZJI6D',
      secretAccessKey: 'secret-value',
      region: 'us-east-1',
      modelId: 'google.gemma-3-4b-it',
      maxTokens: 2048,
    });
  });

  it('preserves the session token for temporary AWS credentials', () => {
    const result = loadBedrockResolvedConfig(
      configFrom({
        AWS_ACCESS_KEY_ID: 'ASIAQ4NXQAJJIVNZJI6D',
        AWS_SECRET_ACCESS_KEY: 'temporary-secret',
        AWS_SESSION_TOKEN: 'temporary-session-token',
      }),
    );
    expect(result).toMatchObject({
      mode: 'iam',
      accessKeyId: 'ASIAQ4NXQAJJIVNZJI6D',
      secretAccessKey: 'temporary-secret',
      sessionToken: 'temporary-session-token',
    });
  });

  it('supports the standard AWS SDK credential chain', () => {
    expect(
      loadBedrockResolvedConfig(
        configFrom({
          BEDROCK_USE_AWS_CREDENTIAL_CHAIN: 'true',
          AWS_REGION: 'us-west-2',
        }),
      ),
    ).toEqual({
      mode: 'iam',
      region: 'us-west-2',
      modelId: 'google.gemma-3-4b-it',
      maxTokens: 2048,
    });
  });

  it('rejects a partial explicit AWS key pair', () => {
    expect(() =>
      loadBedrockResolvedConfig(
        configFrom({ AWS_ACCESS_KEY_ID: 'AKIAQ4NXQAJJIVNZJI6D' }),
      ),
    ).toThrow(/configured together/i);
  });

  it('loads Mantle API key path', () => {
    const result = loadBedrockResolvedConfig(
      configFrom({
        BEDROCK_API_KEY: 'bedrock-long-term-api-key',
        BEDROCK_BASE_URL: 'https://bedrock-mantle.us-east-1.api.aws/v1',
        BEDROCK_MODEL_ID: 'google.gemma-3-4b-it',
      }),
    );
    expect(result.mode).toBe('mantle');
    if (result.mode === 'mantle') {
      expect(result.apiKey).toBe('bedrock-long-term-api-key');
    }
  });

  it('rejects IAM access key stuffed into BEDROCK_API_KEY', () => {
    expect(() =>
      loadBedrockResolvedConfig(
        configFrom({
          BEDROCK_API_KEY: 'AKIAQ4NXQAJJIVNZJI6DsomeSecret',
        }),
      ),
    ).toThrow(/IAM access key/i);
  });

  it('throws when nothing is configured', () => {
    expect(() => loadBedrockResolvedConfig(configFrom({}))).toThrow(
      /Configure either BEDROCK_API_KEY|AWS_ACCESS_KEY_ID/,
    );
  });
});

describe('loadBedrockConfig (mantle-only)', () => {
  it('returns mantle config when API key is set', () => {
    const result = loadBedrockConfig(
      configFrom({
        BEDROCK_API_KEY: 'mantle-key',
        BEDROCK_BASE_URL: 'https://bedrock-mantle.us-east-1.api.aws/v1',
        BEDROCK_MODEL_ID: 'google.gemma-3-4b-it',
      }),
    );
    expect(result.mode).toBe('mantle');
    expect(result.apiKey).toBe('mantle-key');
  });

  it('throws when only IAM is configured', () => {
    expect(() =>
      loadBedrockConfig(
        configFrom({
          AWS_ACCESS_KEY_ID: 'AKIAQ4NXQAJJIVNZJI6D',
          AWS_SECRET_ACCESS_KEY: 'secret',
        }),
      ),
    ).toThrow(/only IAM/);
  });
});
