import {
  JIRA_NO_ACCESSIBLE_SITES_CODE,
  JIRA_REAUTH_REQUIRED_CODE,
  JIRA_SEARCH_PERMISSION_REQUIRED_CODE,
  JIRA_SEARCH_REQUIRED_SCOPE,
} from './jira.constants';
import {
  JiraNoAccessibleSitesException,
  JiraReauthRequiredException,
  JiraSearchPermissionRequiredException,
} from './jira.errors';

describe('JiraNoAccessibleSitesException', () => {
  it('returns an actionable stable API error', () => {
    const error = new JiraNoAccessibleSitesException();

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toEqual({
      code: JIRA_NO_ACCESSIBLE_SITES_CODE,
      message:
        'No Jira Cloud site was authorized. Select a Jira site on the Atlassian consent screen. Existing Jira connections were not changed.',
    });
  });
});

describe('JiraReauthRequiredException', () => {
  it('exposes a stable provider-specific error code', () => {
    const error = new JiraReauthRequiredException();

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toEqual({
      code: JIRA_REAUTH_REQUIRED_CODE,
      message: 'The Jira connection must be authorized again.',
    });
  });
});

describe('JiraSearchPermissionRequiredException', () => {
  it('returns an actionable stable API error', () => {
    const error = new JiraSearchPermissionRequiredException();

    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toEqual({
      code: JIRA_SEARCH_PERMISSION_REQUIRED_CODE,
      message:
        'Jira search is not enabled for this connection. Ask an Atlassian organization admin to allow Jira Search for Rovo MCP, then reconnect Jira.',
      requiredScope: JIRA_SEARCH_REQUIRED_SCOPE,
    });
  });
});
