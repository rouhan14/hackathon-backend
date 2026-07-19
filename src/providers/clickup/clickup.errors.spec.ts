import {
  CLICKUP_CAPABILITY_UNAVAILABLE_CODE,
  CLICKUP_CLIENT_NOT_APPROVED_CODE,
  CLICKUP_RATE_LIMITED_CODE,
  CLICKUP_REAUTH_REQUIRED_CODE,
} from './clickup.constants';
import {
  ClickUpCapabilityUnavailableException,
  ClickUpClientNotApprovedException,
  ClickUpRateLimitedException,
  ClickUpReauthRequiredException,
} from './clickup.errors';

describe('ClickUp stable API errors', () => {
  it.each([
    [new ClickUpReauthRequiredException(), 401, CLICKUP_REAUTH_REQUIRED_CODE],
    [new ClickUpRateLimitedException(), 429, CLICKUP_RATE_LIMITED_CODE],
    [
      new ClickUpCapabilityUnavailableException(),
      502,
      CLICKUP_CAPABILITY_UNAVAILABLE_CODE,
    ],
    [
      new ClickUpClientNotApprovedException(),
      502,
      CLICKUP_CLIENT_NOT_APPROVED_CODE,
    ],
  ])('returns %s with status %s and code %s', (error, status, code) => {
    expect(error.getStatus()).toBe(status);
    expect(error.getResponse()).toEqual(expect.objectContaining({ code }));
  });
});
