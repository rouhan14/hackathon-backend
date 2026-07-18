# AI Work Operating System Backend

NestJS modular-monolith backend for connecting workplace providers, building an evidence-backed work graph, running policy-controlled agents, and executing explicitly approved actions.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the product and implementation design.

## Module boundaries

```text
identity        application users, authentication, organizations, memberships
connections     provider-neutral OAuth state and encrypted credentials
providers       Jira/Notion/Google/etc. adapters and provider lifecycle
sync            cursor and webhook-driven synchronization coordination
context         normalized source objects, evidence, relationships, retrieval
assistant       model-provider contract and bounded tool registry
agents          saved agent definitions, triggers, and autonomy policy
actions         proposal, approval, execution, and verification boundary
policy          deterministic read/write/destructive action decisions
audit           immutable security and product events
notifications   policy-controlled report delivery
infrastructure  database and future queue/cache implementations
health          operational health endpoints
```

The application is intentionally one deployable codebase. Provider, policy, context, and agent boundaries are NestJS modules, not microservices.

## Local setup

```bash
npm install
cp .env.example .env
docker compose up -d postgres
npm exec -- prisma migrate deploy
npm exec -- prisma generate
npm run start:dev
```

Generate `TOKEN_ENCRYPTION_KEY` as 32 random bytes encoded as base64 or 64 hexadecimal characters. Provider OAuth cannot complete without it.

### Model provider (Amazon Bedrock / Gemma)

The assistant uses Bedrock with **either**:

**A) IAM access keys (Converse API)** — use this if you have an `AKIA…` access key:

```bash
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
# AWS_SESSION_TOKEN=... # required for temporary ASIA credentials
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=google.gemma-3-4b-it
```

For IAM roles, container/instance credentials, shared profiles, or web
identity, omit the explicit keys and set
`BEDROCK_USE_AWS_CREDENTIAL_CHAIN=true` with `AWS_REGION`.

**B) Mantle API key** — Bedrock console long-term API key only (never paste `AKIA…` here):

```bash
BEDROCK_API_KEY=...
BEDROCK_BASE_URL=https://bedrock-mantle.us-east-1.api.aws/v1
BEDROCK_MODEL_ID=google.gemma-3-4b-it
```

Enable the Gemma model in the Bedrock console for that region. Config is loaded lazily on the first model call.

The `architecture_foundation` migration refuses to continue if legacy `IntegrationConnection` rows exist because the old schema did not record their user owner. Backfill or disconnect those rows before applying the migration. Existing users are automatically assigned a private default organization and owner membership.

## Verification

```bash
npm exec -- prisma validate
npm run lint
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

The basic e2e test replaces the Prisma provider so application composition can be checked without a running database. Database integration and tenant-isolation tests should run separately against a disposable PostgreSQL database once the first connection workflow is implemented.

## Current implementation status

- User signup/login with JWT
- Default organization and owner membership at signup
- User-owned provider connections
- User-bound, expiring, single-use OAuth state
- AES-256-GCM provider credential encryption
- Provider registry with Notion as the first adapter
- Approval policy baseline that blocks destructive actions
- Initial work graph, evidence, agent, report, action, and audit schema
- Capability module boilerplate for the remaining product architecture
- Bedrock Mantle model provider (`generateStructured` + `toolLoop`) for Gemma via env-configured OpenAI-compatible client
- Authenticated assistant ask endpoint with Jira MCP tool calling (`POST /assistant/ask`)

### Assistant ask (Jira tool loop)

1. Connect Jira: `GET /auth/jira` with a bearer token, complete OAuth.
2. Confirm the connection: `GET /integrations`.
3. Ask:

```http
POST /assistant/ask
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "message": "What open Jira issues am I assigned to?" }
```

The model may call registered tools for the user's connected providers (e.g. `jira_search` when Jira is connected). Provider modules register tools on the shared registry; the assistant orchestrator does not hard-code provider names. Tokens never go to the model.

Next implementation work is completing Notion reads and recorded fixtures, then adding one task provider behind the common provider contract.

To begin Notion OAuth, call `GET /auth/notion` with the access-token bearer header, then navigate the browser to the returned `authorizationUrl`. The OAuth callback continues to redirect back to the configured frontend URL.

## Jira via Atlassian Rovo MCP

Jira uses Atlassian's hosted Rovo MCP server rather than a locally maintained
Jira REST wrapper. Call `GET /auth/jira` with the application bearer token and
navigate to the returned `authorizationUrl`. After Atlassian redirects through
the backend callback, list the user's connections with `GET /integrations` and
use `POST /integrations/jira/:connectionId/search` for the initial read-only JQL
slice.
