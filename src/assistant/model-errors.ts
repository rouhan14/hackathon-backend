import {
  BadGatewayException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * Upstream model endpoint rejected our provider credentials (e.g. Bedrock API key).
 * Must NOT be HTTP 401 — that status is reserved for the user's app JWT so the
 * frontend does not clear the session when Gemma/Bedrock is misconfigured.
 */
export class ModelAuthException extends BadGatewayException {
  constructor(message = 'Model provider authentication failed.') {
    super({
      code: 'MODEL_AUTH_FAILED',
      message,
    });
  }
}

/** Model id missing, not enabled, or endpoint not found. */
export class ModelNotAvailableException extends ServiceUnavailableException {
  constructor(message = 'Configured model is not available.') {
    super({
      code: 'MODEL_NOT_AVAILABLE',
      message,
    });
  }
}

/** Upstream model API returned an unexpected or unusable response. */
export class ModelUpstreamException extends BadGatewayException {
  constructor(message = 'Model provider request failed.') {
    super({
      code: 'MODEL_UPSTREAM_ERROR',
      message,
    });
  }
}

/** Model reply could not be parsed as the expected structured JSON. */
export class ModelResponseParseException extends BadGatewayException {
  constructor(message = 'Model returned content that is not valid JSON.') {
    super({
      code: 'MODEL_RESPONSE_PARSE_ERROR',
      message,
    });
  }
}

export class ModelTimeoutException extends GatewayTimeoutException {
  constructor(message = 'Model provider request timed out.') {
    super({
      code: 'MODEL_TIMEOUT',
      message,
    });
  }
}
