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

Next implementation work is completing Notion reads and recorded fixtures, then adding one task provider behind the common provider contract.

To begin Notion OAuth, call `GET /auth/notion` with the access-token bearer header, then navigate the browser to the returned `authorizationUrl`. The OAuth callback continues to redirect back to the configured frontend URL.
