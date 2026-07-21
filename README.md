# AI Work Operating System (Backend)

One AI brain that reads and acts across all your work apps. Ask it a question in plain English, and it figures out which of your connected tools to touch (Jira, Notion, ClickUp), chains them together, and answers, or actually does the thing.

Built for the hackathon. NestJS + PostgreSQL + a single Gemma-powered orchestrator sitting behind an OAuth/MCP layer.

## The one-line pitch

Everyone's work lives in five different tabs. Jira has your tickets, Notion has your specs, ClickUp has the sprint, your calendar has the meetings, your inbox has the "hey can you..." messages. Context is scattered, and no single tool sees the whole picture.

We wanted a work operating system: a persistent layer that connects to the tools you already use with *your* permissions, understands what's going on across all of them, and can answer questions or take approved actions from one place. That includes things that span two apps at once, like:

> "Read my Q3 Roadmap page in Notion and create a Jira ticket for each initiative on it."

That's a single request. The AI reads Notion, understands the roadmap, then creates the tickets in Jira. No copy-paste, no tab-switching.

## What we actually built

We were honest with ourselves about hackathon time, so we went deep on one loop instead of shallow on ten. Here's what works end to end.

### A unified AI "brain" (one endpoint, all apps)

`POST /assistant/brain` is the headline feature. A single model orchestrating everything, defaulting to Groq for its tool calling with Amazon Bedrock (Gemma) as the fallback:

- It sees only the tools for apps you've actually connected (connection-scoped tool offering).
- It can chain tools across providers in one turn, like reading a Notion page and then creating Jira issues from it.
- It never sees your OAuth tokens. The model asks for a typed tool; our handlers hold the credentials and enforce the boundary.
- It uses a shared tool registry. Providers register their own tools, and the orchestrator does not hard-code provider names, so adding a new app doesn't mean rewriting the brain.

### Real OAuth integrations (not mocks)

| Provider | How it connects | Tools live today |
|---|---|---|
| Jira | Atlassian Rovo hosted MCP (OAuth) | `jira_search`, `jira_list_projects`, `jira_create_issue` |
| Notion | Hosted MCP (`mcp.notion.com`) | `notion_search`, `notion_read_page`, `notion_create_page` |
| ClickUp | Official hosted MCP, OAuth 2.1 + PKCE | `clickup_search`, `clickup_get_task` |
| Slack | OAuth connection scaffolding | connect flow wired |

Reads *and* writes are working. You can search and read across apps, and create Jira issues and Notion pages straight from a chat message.

### Security that isn't an afterthought

- Per-user connections. Your tokens are yours, and two users can't see each other's data.
- AES-256-GCM encrypted credentials in a token vault. Tokens are never stored as raw OAuth JSON, never logged, and never handed to the model.
- User-bound, single-use, expiring OAuth state to prevent account mix-up and CSRF on the callback.
- A deterministic policy engine gates every action by risk class. Destructive operations (delete and the like) are hard-disabled regardless of what a provider's MCP server *claims* it can do. Writes are permitted in this build; sends and destructive stay gated.
- Multi-tenant data model. Every record carries an `organizationId` and `userId` owner.

### A proper work-graph data model

A Prisma schema modeling the *real* domain, not just a chat log: organizations, memberships, connections, `SourceObject` (task, document, message, meeting, decision, commitment, and so on), typed `WorkRelation` edges (`blocks`, `depends_on`, `mentions`), `Evidence`, agent definitions and runs, action proposals, approvals, executions, and an immutable audit trail. Even the parts we didn't get to wire up have their schema in place, so the next phase is plumbing, not redesign.

### Model provider abstraction

An internal `ModelProvider` contract with `generateStructured` and `toolLoop`, plus a routing layer that picks the stack per request. Groq is the preferred brain model (it does native function calling, which the tool loop leans on heavily), and Bedrock/Gemma is the fallback, selected with a single `BRAIN_MODEL_PROVIDER` env var (`auto`, `groq`, or `bedrock`). Any OpenAI-compatible endpoint drops in behind the same interface. Config is lazy-loaded on the first call, so the app boots without cloud credentials, and a bad model setting can't break unrelated startup paths.

## The part we designed but didn't finish: the cron / background-jobs system

This is the honest bit. Our architecture (see `ARCHITECTURE.md`) is built around two processes: the synchronous API you talk to, and a separate worker process driven by Redis + BullMQ that does all the time-based and long-running work. That second half is designed in detail but not implemented. We simply ran out of clock.

What the scheduled/background system is *meant* to do:

- Scheduled briefs. A nightly cron job assembles a source-linked "daily brief" (here's what's on fire, what's blocked, what's due) and a per-meeting prep brief, without you asking.
- Incremental sync jobs. Instead of hitting providers live on every question, background jobs pull bounded changes on a cursor and keep a normalized copy fresh. Live reads become the fallback, not the default.
- Webhook renewal crons. The providers all expire things on their own clocks. Jira OAuth webhooks die after 30 days, Gmail's mailbox `watch` needs re-arming roughly weekly, and Google Calendar notification channels expire and can't be renewed in place. Each needs a recurring job that re-registers before expiry.
- Retry, back-off, and dead-letter handling. `429`s and transient provider failures get retried with back-off, and exhausted jobs land in a dead-letter queue instead of silently vanishing.
- Delayed post-action verification. After an approved write, a job runs *later* to re-read the source and confirm the change actually stuck. We never trust the model's word that something worked.

In the code today, `SyncCoordinatorService` is deliberately a thin, queue-agnostic stub. It returns a well-formed sync request that BullMQ can consume the moment Redis is added. So the seam is there; the engine behind it is future work. If we had one more day, this is where it went.

## How Codex fits into this project (and where we used it)

Straight up: this backend does not exist in its current shape without Codex. We're a small team on a hackathon clock, and Codex was effectively a force-multiplier that let a few people ship something with the surface area of a much bigger effort.

Here's specifically how it helped, with examples.

**1. It turned a fuzzy idea into a real architecture.** We came in with the *vision*, "one AI that understands all your work apps." What we didn't have was the hard shape of it. Every architecture document in this repo (`ARCHITECTURE.md`, `PROJECT_DESCRIPTION.md`, the integration guides) was produced with Codex, not hand-written by us. We described what we were imagining; Codex pushed back, structured it, and gave us a real design: the propose, approve, execute, verify action loop, the split between the API process and the worker process, and the `SourceObject` work-graph model instead of forcing everything into a "task." It took ideas we already half-had and made them concrete and defensible.

**2. It found shortcomings we would have shipped straight past.** This was the genuinely valuable part. Codex flagged things like our Notion adapter being pinned to an old `Notion-Version` header that has since had breaking changes, OAuth callbacks needing state bound to the user to avoid account mix-up, and the fact that hosted MCP means a *third party* momentarily handles your credentials, which is a real trust boundary and not "the same as keeping tokens in our backend." It also caught that ClickUp's own docs contradict themselves on whether delete tools exist, which is exactly why our policy engine treats runtime tool discovery as *descriptive*, not authoritative, and keeps destructive tools off no matter what. We wouldn't have caught half of these under time pressure.

**3. It gave us options, then let us choose.** Rather than one prescriptive answer, it laid out several plans: different provider-ordering strategies, REST versus MCP trade-offs, and where to add embeddings (answer: not yet). We read the trade-offs and picked Bedrock/Gemma first behind a swappable model contract, Postgres full-text search before any vector DB, and one orchestrator instead of a hierarchy of agents. Good decisions we could actually explain.

**4. It let us design for scale from day one.** Because Codex helped us think in terms of tenancy boundaries, encrypted-token vaults, connection-scoped tooling, and a stateless API that offloads heavy work to a worker queue, the design isn't a demo that falls over at user number two. It's shaped to grow to many users and organizations. We didn't finish building all of it, but we're building toward the *right* thing.

**5. It knocked out the boring, trivial code so we could move.** A huge amount of the day is not the clever part. It's DTOs, validation, argument-alias normalization for a weak model that keeps mis-naming fields, error mapping, boilerplate registrars, and test scaffolding. Codex ate that work and freed us to spend our actual brains on the integration logic and the cross-app tool chaining. Our raw productivity was multiple times what it would have been otherwise.

One thing we'd flag, though: the credits burned fast, faster than we expected, and a couple of times we had to be stingy with iterations right when we wanted to explore. We'd have loved a bit more runway, or clearer signposting on cost, so we didn't have to ration the tool in the back half of the hack. Small gripe against a genuinely large amount of value.

## What we learned

- Depth beats breadth in a hackathon. One fully-working cross-app loop demos better and teaches you more than five half-connected integrations.
- MCP is not a magic uniform layer. Every provider expires credentials differently, signs webhooks differently, and disagrees with its own docs. The abstraction has to sit in *our* policy layer, not be inherited from the providers.
- Never trust the model with credentials, or with "it worked." Tokens stay in our handlers, and success needs a provider receipt. Designing for that from the start is much cheaper than retrofitting it.
- A good schema is leverage. Modeling the full work-graph up front meant the unfinished features are already shaped, and the remaining work is wiring, not rethinking.
- Weak models need defensive tooling. A surprising amount of our provider code is normalizing the slightly-wrong argument names Gemma emits. Robust tools make a small model usable.

## Running it locally

```bash
npm install
cp .env.example .env
docker compose up -d postgres
npm exec -- prisma migrate deploy
npm exec -- prisma generate
npm run start:dev
```

You'll need a `TOKEN_ENCRYPTION_KEY` (32 random bytes, base64 or 64 hex chars), since OAuth won't complete without it, plus Bedrock credentials for the Gemma model (see `.env.example` for the IAM-key versus Mantle-API-key options). Swagger docs come up with the app.

### Choosing the model (Groq or Bedrock)

Late in the hack we switched the brain's default model. Gemma on Bedrock was doing the job, but it kept mis-formatting tool calls (there's a commit whose message is just "GEMMA IS RETARDED", which tells the story), so we moved the default to Groq, which does native function calling and behaves far better in the tool loop. Both are wired behind the same routing layer, and you pick with one env var.

Preferred is Groq:

```bash
GROQ_API_KEY=gsk_...
GROQ_MODEL_NAME=openai/gpt-oss-120b
# Which stack powers the brain: auto | groq | bedrock
# BRAIN_MODEL_PROVIDER=auto
```

With `BRAIN_MODEL_PROVIDER=auto` (the default) the brain uses Groq whenever `GROQ_API_KEY` is set, and falls back to Bedrock otherwise. Set it to `groq` to require Groq, or `bedrock` to force the Gemma path. The choice is resolved per request, so a bad setting can't stop the app from booting.

Bedrock/Gemma is still fully supported as the fallback. Use either an IAM access key (Converse API) or a Bedrock console API key:

```bash
BEDROCK_API_KEY=...
BEDROCK_BASE_URL=https://bedrock-mantle.us-east-1.api.aws/v1
BEDROCK_MODEL_ID=google.gemma-3-4b-it
```

Bedrock config is loaded lazily on the first Bedrock call. See `.env.example` for the full IAM-key versus API-key options.

### Try the brain

1. Sign up or log in: `POST /auth/signup`, `POST /auth/login`, then grab the access token.
2. Connect an app: open `GET /auth/jira` (or `/auth/notion`, `/auth/clickup`) with your bearer token and follow the returned `authorizationUrl`.
3. Confirm it landed: `GET /integrations`.
4. Ask:

```http
POST /assistant/brain
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "message": "Read my \"Q3 Roadmap\" Notion page and create a Jira task in project ENG for each initiative." }
```

The response includes the answer, a `kind` (`answer`, `no_connections`, or `no_tools`), the exact tool calls the model made, how many rounds it took, and which connections were available, so you can see the brain reasoning across apps. You can also pass an optional `sources` array in the body (for example `["JIRA"]`) to hard-limit the brain to specific apps. Every brain call is recorded as a best-effort `AgentRun` (`kind=assistant.brain`) with the model, token counts, and tool trace, and the response carries that `runId`. It's the first thread of the audit trail the architecture calls for, and it never fails the answer if persistence is down.

One migration gotcha: the `architecture_foundation` migration refuses to run if legacy `IntegrationConnection` rows exist, because the old schema never recorded who owned them. Backfill or disconnect those rows first. Existing users are automatically given a private default organization and owner membership.

### Verify

```bash
npm exec -- prisma validate
npm run lint
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

## Key endpoints

```text
POST   /auth/signup | /auth/login        Sign up / log in (JWT)
GET    /auth/me                          Current user

GET    /integrations                     List your connected apps
DELETE /integrations/:id                 Disconnect (wipes encrypted creds)
GET    /auth/{jira,notion,clickup,slack} Begin OAuth for a provider

POST   /assistant/brain                  Unified cross-app AI (Jira + Notion + ClickUp)
POST   /assistant/ask                    Alias of /assistant/brain (kept for older clients)
POST   /assistant/chat                   Notion-focused chat (deprecated, legacy shape)

GET    /health                           Liveness
```

## Where it goes next

The immediate next step is the half we designed but didn't build: stand up Redis + BullMQ and the worker process, then light up scheduled daily briefs, cursor-based incremental sync, webhook-renewal crons, and delayed post-action verification. After that comes Google Calendar and Gmail (both already in the schema), and then exposing the whole thing back out as our *own* MCP server so ChatGPT and Claude can use it as a work context source.

The foundation is laid for all of it. We just needed more than one weekend.
