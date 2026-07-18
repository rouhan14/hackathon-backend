export interface SlackTokenResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id: string; name: string };
  bot_user_id?: string;
  scope?: string;
  authed_user?: { id: string; scope?: string; access_token?: string };
}
