export const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
export const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';
export const SLACK_REVOKE_URL = 'https://slack.com/api/auth.revoke';
export const SLACK_BOT_SCOPES = [
  'channels:history',
  'channels:read',
  'chat:write',
  'team:read',
  'users:read',
].join(',');
