export interface NotionTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  bot_id: string;
  workspace_id: string;
  workspace_name: string | null;
  workspace_icon: string | null;
  owner: unknown;
  duplicated_template_id: string | null;
}
