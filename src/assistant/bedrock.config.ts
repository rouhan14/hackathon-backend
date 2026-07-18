import { ConfigService } from '@nestjs/config';

const DEFAULT_MAX_TOKENS = 2048;

export type BedrockAuthMode = 'mantle' | 'iam';

export interface BedrockMantleConfig {
  mode: 'mantle';
  apiKey: string;
  baseURL: string;
  modelId: string;
  maxTokens: number;
}

export interface BedrockIamConfig {
  mode: 'iam';
  /** Omitted when the AWS SDK should use its normal credential provider chain. */
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  region: string;
  modelId: string;
  maxTokens: number;
}

/** @deprecated Use BedrockResolvedConfig; kept for Mantle OpenAI provider. */
export type BedrockConfig = BedrockMantleConfig;

export type BedrockResolvedConfig = BedrockMantleConfig | BedrockIamConfig;

function optionalTrimmed(
  config: ConfigService,
  key: string,
): string | undefined {
  const value = config.get<string>(key)?.trim();
  return value || undefined;
}

function parseMaxTokens(config: ConfigService): number {
  const maxTokensRaw = config.get<string>('BEDROCK_MAX_TOKENS')?.trim();
  if (!maxTokensRaw) {
    return DEFAULT_MAX_TOKENS;
  }
  const parsed = Number(maxTokensRaw);
  if (!Number.isFinite(parsed) || parsed < 1 || !Number.isInteger(parsed)) {
    throw new Error('BEDROCK_MAX_TOKENS must be a positive integer when set.');
  }
  return parsed;
}

function isLikelyIamAccessKey(value: string): boolean {
  return /^AKIA[0-9A-Z]{16}$/i.test(value) || value.startsWith('AKIA');
}

/**
 * Resolve Bedrock auth from env.
 * Prefer Mantle when a non-IAM BEDROCK_API_KEY is set; otherwise use IAM keys
 * with the Converse API (correct for AKIA… access keys).
 */
export function loadBedrockResolvedConfig(
  config: ConfigService,
): BedrockResolvedConfig {
  const modelId =
    optionalTrimmed(config, 'BEDROCK_MODEL_ID') ?? 'google.gemma-3-4b-it';
  const maxTokens = parseMaxTokens(config);

  const apiKey = optionalTrimmed(config, 'BEDROCK_API_KEY');
  const baseURL = optionalTrimmed(config, 'BEDROCK_BASE_URL');
  const accessKeyId = optionalTrimmed(config, 'AWS_ACCESS_KEY_ID');
  const secretAccessKey = optionalTrimmed(config, 'AWS_SECRET_ACCESS_KEY');
  const sessionToken = optionalTrimmed(config, 'AWS_SESSION_TOKEN');
  const region =
    optionalTrimmed(config, 'AWS_REGION') ??
    optionalTrimmed(config, 'BEDROCK_REGION') ??
    'us-east-1';

  // Misconfiguration: IAM access key stuffed into BEDROCK_API_KEY (old mistake).
  if (apiKey && isLikelyIamAccessKey(apiKey)) {
    throw new Error(
      'BEDROCK_API_KEY looks like an IAM access key (AKIA…). Use AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY for IAM, or a Bedrock console API key for Mantle. Do not concatenate access key and secret into BEDROCK_API_KEY.',
    );
  }

  // Mantle path: OpenAI-compatible Bedrock API key (not AKIA).
  if (apiKey) {
    const url = baseURL ?? 'https://bedrock-mantle.us-east-1.api.aws/v1';
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(
        'BEDROCK_BASE_URL must be a valid absolute URL (e.g. https://bedrock-mantle.us-east-1.api.aws/v1).',
      );
    }
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('BEDROCK_BASE_URL must use https.');
    }
    return {
      mode: 'mantle',
      apiKey,
      baseURL: url,
      modelId,
      maxTokens,
    };
  }

  // IAM path: SigV4 Converse API.
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error(
      'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be configured together.',
    );
  }

  if (accessKeyId && secretAccessKey) {
    if (!isLikelyIamAccessKey(accessKeyId) && !accessKeyId.startsWith('ASIA')) {
      // Allow non-AKIA for temporary/session-style keys; still require both.
    }
    return {
      mode: 'iam',
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
      region,
      modelId,
      maxTokens,
    };
  }

  // Explicitly opt into the standard AWS SDK credential chain. This supports
  // IAM roles, ECS/EKS/EC2 metadata, shared profiles, and web identity.
  if (optionalTrimmed(config, 'BEDROCK_USE_AWS_CREDENTIAL_CHAIN') === 'true') {
    return {
      mode: 'iam',
      region,
      modelId,
      maxTokens,
    };
  }

  throw new Error(
    'Configure either BEDROCK_API_KEY (+ optional BEDROCK_BASE_URL) for Mantle, AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY for IAM Converse, or BEDROCK_USE_AWS_CREDENTIAL_CHAIN=true for the standard AWS credential chain.',
  );
}

/**
 * Mantle-only loader (used by OpenAI-compatible provider / legacy tests).
 */
export function loadBedrockConfig(config: ConfigService): BedrockMantleConfig {
  const resolved = loadBedrockResolvedConfig(config);
  if (resolved.mode !== 'mantle') {
    throw new Error(
      'Mantle Bedrock config requested but only IAM credentials are configured.',
    );
  }
  return resolved;
}
