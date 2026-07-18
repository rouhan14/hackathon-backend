import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  JIRA_NO_ACCESSIBLE_SITES_CODE,
  JIRA_REAUTH_REQUIRED_CODE,
  JIRA_SEARCH_PERMISSION_REQUIRED_CODE,
  JIRA_SEARCH_REQUIRED_SCOPE,
} from './jira.constants';

export class JiraNoAccessibleSitesException extends BadRequestException {
  constructor() {
    super({
      code: JIRA_NO_ACCESSIBLE_SITES_CODE,
      message:
        'No Jira Cloud site was authorized. Select a Jira site on the Atlassian consent screen. Existing Jira connections were not changed.',
    });
  }
}

export class JiraReauthRequiredException extends UnauthorizedException {
  constructor() {
    super({
      code: JIRA_REAUTH_REQUIRED_CODE,
      message: 'The Jira connection must be authorized again.',
    });
  }
}

export class JiraSearchPermissionRequiredException extends ForbiddenException {
  constructor() {
    super({
      code: JIRA_SEARCH_PERMISSION_REQUIRED_CODE,
      message:
        'Jira search is not enabled for this connection. Ask an Atlassian organization admin to allow Jira Search for Rovo MCP, then reconnect Jira.',
      requiredScope: JIRA_SEARCH_REQUIRED_SCOPE,
    });
  }
}
