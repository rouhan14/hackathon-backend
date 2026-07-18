export const NOTION_AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize';
export const NOTION_TOKEN_URL = 'https://api.notion.com/v1/oauth/token';
export const NOTION_REVOKE_URL = 'https://api.notion.com/v1/oauth/revoke';

// Keep the REST version pinned until recorded read fixtures have been migrated
// through Notion's 2026-03-11 database/data-source breaking changes.
export const NOTION_API_VERSION = '2022-06-28';
