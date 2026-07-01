# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`hbh-flow` is Honeybee Herb's in-house workflow automation platform — an in-house replacement for Pipedream (see `PLAN.md`). It runs and orchestrates business workflows that integrate a large set of third-party services (Zoho, Shopify, WooCommerce, Odoo, BigCommerce, Monday, Flodesk, Duoplane, LeafTrade, LeafLink, OrderDesk, Apex Trading, Fujimausa, and an LLM/OpenAI lib). Workflows are code, versioned in this repo, executed as durable multi-step jobs on BullMQ.

## Commands

- **Run everything (dev)**: `pnpm start` — from `main.ts`, spawns `apps/api` (port `API_PORT`, 3001), `apps/worker` (port `WORKER_PORT`, 3002), and the Vite UI dev server (port `UI_PORT`, 3002/3003) with `node --watch`. Optionally opens an ngrok tunnel if `NGROK_AUTHTOKEN`/`NGROK_DOMAIN` are set. `pnpm start` also runs `prisma migrate deploy` first.
- **Production**: `pnpm start --prod` — Node.js clustering; primary forks `apps/worker` per CPU and runs `apps/api` in the primary.
- **Lint**: `pnpm lint` (ESLint, `--fix`). **Format**: `pnpm format` (Prettier: single quotes, trailing commas).
- **Test**: `pnpm test` (Vitest). Run one file: `pnpm vitest run libs/core/env/env.service.spec.ts`. Watch a single test by name: `pnpm vitest -t "name"`. Specs live next to source as `*.spec.ts`.
- **Build UI**: `pnpm build` (Vite build of `apps/ui`).
- **DB**: `pnpm prisma migrate dev` (create/apply migration), `pnpm prisma generate`, `pnpm prisma studio`. Schema is `prisma/schema.prisma`.
- **API docs**: Swagger UI at `http://localhost:3001/api`; OpenAPI at `/api/docs.yaml` / `/api/docs.json`.
- **Node 23+ required.** No TS build step for the backend — it runs `.ts` directly via `@swc-node/register` (`--no-experimental-strip-types`). Do not expect a `dist/` in dev.

The default seeded login is `flow@honeybeeherb.com` / `hbh-admin-1234` (see README for Postman/CSRF flow).

## Monorepo layout

pnpm workspace + NestJS monorepo (`nest-cli.json` defines projects). TypeScript path aliases (`tsconfig.json`) are the canonical way to import across boundaries — **use `#lib/...` and `#app/...`, not relative paths across libs/apps**:

- `apps/api` — HTTP/REST + WebSocket gateway. `controllers/` (one per resource), `gateways/` (Socket.IO), `schema/` (request/response DTOs), `ui/` (middleware that serves the built React SPA for all non-`/api`, non-`/webhook`, non-`/socket.io` routes).
- `apps/worker` — headless process that runs workflow jobs. `apps/worker/workflows/` holds the **actual business workflows**, grouped by brand/customer subfolder (`hbh/`, `ryot/`, `day1-distro/`, `miami-distro/`, `fat-ass-glass/`).
- `apps/ui` — React 19 + Vite + MUI SPA. Has its **own `package.json` and `node_modules`** (`cd apps/ui && pnpm install` separately).
- `libs/core` — cross-cutting foundation: `bootstrap.ts`, `EnvService`, `PrismaService` (Redis-cached), `MongoService`, `PostgresService`, `ActivityService`, `GlobalEventService`, Redis module, `importDir` dynamic loader.
- `libs/workflow` — the workflow engine (see below).
- `libs/auth` — JWT auth, RBAC, CSRF.
- `libs/hub` — the integration/connection framework (OAuth2 + token clients, connection testing, token refresh).
- `libs/{zoho,shopify,woocommerce,odoo,bigcommerce,monday,flodesk,duoplane,leaftrade,leaflink,orderdesk,apex-trading,fujimausa,llm}` — one service lib per external provider, each built on `libs/hub`.

## Bootstrap & module wiring

Both `apps/api/main.ts` and `apps/worker/main.ts` call `bootstrap()` from `libs/core/bootstrap.ts` with an `appType` (`AppType.API` | `AppType.Worker`). `bootstrap` builds a single `@Global()` `WrapperModule` that imports every provider lib and core service, then wraps the app-specific `imports`/`controllers`/`providers` in a nested `CoreModule`. Consequences to know:

- **API-only behavior is branched inside `bootstrap` on `appType`** (Helmet, CORS, cookie-parser, global `ValidationPipe`, Swagger, Sentry HTTP filter). Adding global middleware/pipes happens here, not in the app entrypoints.
- Every request DTO is validated by a global `ValidationPipe` with `whitelist: true` + `forbidNonWhitelisted: true` — unknown body properties are rejected. Define DTOs in `apps/api/schema/**`.
- `PrismaService` is a `PrismaClient` extended with a Redis cache layer (`libs/core/misc/prisma-cache`). Queries can take `uncache: { uncacheKeys: [...] }` options and cache keys like `job:${id}` — when you mutate a record, invalidate its cache key (grep existing controllers for the pattern).
- Socket.IO uses a Redis adapter (`RedisIoAdapter`) so API and worker processes share rooms/events across the cluster.
- Redis is used for multiple concerns on **separate DB numbers** (see `.env`): app (`REDIS_DB`), Socket.IO (`SOCKET_IO_REDIS_DB`), BullMQ (`BULL_REDIS_DB`), Prisma cache (`PRISMA_REDIS_DB`).

## The workflow engine (`libs/workflow`) — most important concept

A **workflow** is a class extending `WorkflowBase` (`libs/workflow/misc/workflow-base.ts`), decorated with `@Workflow({...})`, whose methods are decorated with `@Step(n)`. Workflows live in `apps/worker/workflows/**` and are auto-discovered at boot via `importDir` (`apps/worker/workflows/index.ts` picks every class whose prototype is `WorkflowBase`). To add a workflow, just drop a file in a subfolder — no manual registration.

```ts
@Workflow({ name: 'RYOT - Push order from Woo to Odoo', webhook: true, concurrency: 1 })
export class PushOrderToOdooWorkflow extends WorkflowBase {
  constructor(private readonly woo: WoocommerceService, private readonly odoo: OdooService) { super(); }

  @Step(1) async validate() { /* ... */ if (dup) return this.exit('already exists'); }
  @Step(2) async fetchCustomer() { return customer; } // return value is persisted
  @Step(3) async ensureCustomer() { const c = await this.getResult('fetchCustomer'); /* ... */ }
}
```

Key mechanics (read `WorkflowBase` and `libs/workflow/workflow.service.ts` before touching engine internals):

- **Steps run in ascending `@Step(order)`.** Each step's return value is **persisted to the `JobStep` table** and retrieved in later steps with `this.getResult<T>('stepMethodName')` / `this.getResumeData(...)`. Steps are effectively checkpoints — a resumed/retried job replays from persisted step results, so **keep steps idempotent and pass data between steps via return values, not instance fields.**
- Control-flow helpers on `this`: `exit(result)` (finish successfully now), `cancel(result)` (stop, mark cancelled), `delay(ms)`, `rerun(delay)` (re-run current step after delay), `pause(block?)` (returns a resume JWT; implemented as a ~10-year BullMQ delay, resumed manually). These set flags checked *after* the current step finishes — the current step always runs to completion.
- `this.payload` = trigger data (typed `P`); `this.context` / `this.setContext()` = mutable state stored in Redis (keep it small).
- Workflows are `Scope.TRANSIENT` NestJS providers, so **inject provider services** (e.g. `ZohoService`, `ShopifyService`) via the constructor like any Nest service.
- `@Workflow` config (`libs/workflow/schema/workflow-config.schema.ts`): `key` (defaults to class name — this is the DB/queue identity, so **renaming a class without setting `key` orphans its history/schedules**), `name`, `concurrency`, `maxRetries` (default 3), `limit` (rate limiter), `internal`, `allowUserDefinedCron`, `webhook` + `webhookPayloadType`, and `triggers` (event/cron).
- **Triggers**: use helpers from `libs/workflow/misc/trigger.ts` — `event(name, provider?, connection?)` and `cron(pattern, { timezone, immediate })`. Cron triggers seed BullMQ repeatable jobs; event triggers subscribe to `GlobalEventService` events. `webhook: true` exposes the workflow at the `/webhook` endpoint (`WebhookController`).
- Jobs and steps are mirrored in Postgres (`Job`, `JobStep`, `JobResponseChunk` models) with a `JobStatus` state machine (`SCHEDULED`/`RUNNING`/`DELAYED`/`PAUSED`/`SUCCEEDED`/`FAILED`/`CANCELLED`/...). BullMQ is the executor; Postgres is the source of truth for history/replay. The API can replay/re-run jobs (`JobController`).

## Integrations (`libs/hub` + provider libs)

`libs/hub` is a generic connection framework. A provider lib registers itself with the `@Client('oauth2' | 'token', options)` decorator (`libs/hub/misc/client.decorator.ts`) carrying an `id`, `name`, `icon`, and OAuth2 `scopes`. `HubService` discovers these at boot. Tokens/connections are persisted (`OAuth2Token`, `OAuth2AuthState`, `ConnectionStatus` Prisma models); token refresh and connection testing are themselves internal workflows (`libs/hub/misc/token-refresh.workflow.ts`, `connection-test.workflow.ts`).

Provider services (e.g. `ZohoService.post(url, body, { connection })`, `WoocommerceService.getClient(name)`) take a **`connection` name** — the same external provider can have multiple named connections (e.g. different stores/tenants). Provider modules that need credentials are configured via `forRoot({ useFactory, inject: [EnvService] })` in `bootstrap.ts`. When adding a new integration, model it on an existing lib (e.g. `libs/zoho`) and register its module in `bootstrap.ts`'s `WrapperModule`.

## Conventions & gotchas

- **ESM + Node 23, no build for backend.** Imports of local `.ts` files sometimes carry `.js`/`.js` extensions in specifiers because of ESM resolution — match the surrounding file's style.
- `BigInt.prototype.toJSON` is monkey-patched in `bootstrap` (BigInt IDs serialize as strings). Prisma uses `Int`/`autoincrement` for most IDs but be aware IDs may arrive as strings over the wire.
- ESLint intentionally disables `no-explicit-any` and the `no-unsafe-*` family; `no-floating-promises` is a **warning** — but still `await` or `void` promises (the engine relies on it).
- `.env` is required (there's a real `.env`; `.env.example` lists keys). `EnvService.getString/getNumber(key, default)` is the accessor — don't read `process.env` directly in app code.
- The React UI is served by the Node API in production via `apps/api/ui/ui.middleware.ts` (SPA fallback for all non-API routes), and by Vite in dev.
- Shopify GraphQL codegen/validation is configured in `.graphqlrc` against the `2025-10` Admin API; `.graphql`/`.gql`/`.ts` documents under `apps/worker/**` are the sources.
- Errors report to Sentry (`initSentry(appType)` in bootstrap); source maps upload via `pnpm sentry:sourcemaps`.
