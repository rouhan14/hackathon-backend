import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CLICKUP_AUTH_START_FAILED_CODE,
  CLICKUP_CAPABILITY_UNAVAILABLE_CODE,
  CLICKUP_CLIENT_NOT_APPROVED_CODE,
  CLICKUP_RATE_LIMITED_CODE,
  CLICKUP_REAUTH_REQUIRED_CODE,
} from './clickup.constants';

export class ClickUpReauthRequiredException extends UnauthorizedException {
  constructor() {
    super({
      code: CLICKUP_REAUTH_REQUIRED_CODE,
      message: 'The ClickUp connection must be authorized again.',
    });
  }
}

export class ClickUpCapabilityUnavailableException extends BadGatewayException {
  constructor() {
    super({
      code: CLICKUP_CAPABILITY_UNAVAILABLE_CODE,
      message:
        'ClickUp did not expose the required read-only search and task tools.',
    });
  }
}

export class ClickUpRateLimitedException extends HttpException {
  constructor() {
    super(
      {
        code: CLICKUP_RATE_LIMITED_CODE,
        message:
          'ClickUp MCP rate limit reached. Wait for the provider quota window to reset.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class ClickUpClientNotApprovedException extends BadGatewayException {
  constructor() {
    super({
      code: CLICKUP_CLIENT_NOT_APPROVED_CODE,
      message:
        'ClickUp has not approved this application callback URI for hosted MCP OAuth.',
    });
  }
}

export class ClickUpAuthStartFailedException extends BadGatewayException {
  constructor() {
    super({
      code: CLICKUP_AUTH_START_FAILED_CODE,
      message: 'ClickUp did not start the hosted MCP authorization flow.',
    });
  }
}
