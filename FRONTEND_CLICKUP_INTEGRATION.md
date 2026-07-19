# Frontend ClickUp integration guide

This backend connects to ClickUp through ClickUp's official hosted MCP server.
The frontend never receives ClickUp access tokens and must not connect directly
to the MCP endpoint.

## Prerequisite

Set a stable public HTTPS callback and have ClickUp vet the exact URI for the
AI Work OS custom MCP client:

```env
CLICKUP_MCP_URL=https://mcp.clickup.com/mcp
CLICKUP_REDIRECT_URI=https://api.example.com/auth/clickup/callback
CLICKUP_POST_AUTH_REDIRECT=https://app.example.com/settings/integrations
```

Localhost can be used for backend fixture tests, but live OAuth may remain
blocked until ClickUp approves the public redirect URI.

## Start authorization

```http
GET /auth/clickup
Authorization: Bearer <appJwt>
```

The response is:

```json
{ "authorizationUrl": "https://app.clickup.com/..." }
```

Navigate the browser to `authorizationUrl`. Do not send the application JWT to
ClickUp.

## Handle the callback result

The backend owns `/auth/clickup/callback` and redirects to
`CLICKUP_POST_AUTH_REDIRECT` with one of:

- `?clickup=connected`: credentials and safe read-tool bindings were stored.
- `?clickup=unsupported`: ClickUp did not expose both required read tools.
- `?clickup=error`: authorization failed or was cancelled.

Remove the query parameter after showing inline feedback, then refresh
`GET /integrations`. A single `CLICKUP` connection represents the user's hosted
MCP authorization grant, including the workspaces selected during consent.

## Search tasks

```http
POST /integrations/clickup/:connectionId/search
Authorization: Bearer <appJwt>
Content-Type: application/json

{ "query": "blocked tasks assigned to me", "limit": 10 }
```

The response contains normalized task fields and never exposes the raw MCP
payload. `limit` defaults to 10 and must be between 1 and 25.

## Retrieve one task

```http
GET /integrations/clickup/:connectionId/tasks/:taskId
Authorization: Bearer <appJwt>
```

Use the `taskId` returned by search. If the backend returns
`CLICKUP_REAUTH_REQUIRED`, show a reconnect action. For
`CLICKUP_RATE_LIMITED`, do not retry automatically; explain that the ClickUp
quota window must reset.

## Disconnect

```http
DELETE /integrations/:connectionId
Authorization: Bearer <appJwt>
```

This removes encrypted local credentials. The hosted MCP flow does not expose
a provider-neutral revocation operation, so users may also remove AI Work OS
from their ClickUp connected applications when they need provider-side
revocation.
