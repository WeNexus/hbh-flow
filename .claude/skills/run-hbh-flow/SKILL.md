---
name: run-hbh-flow
description: Build, run, and drive hbh-flow (the Honeybee Herb workflow-automation platform — NestJS API + BullMQ worker + React/Vite UI). Use when asked to start hbh-flow, run its API or UI, log in, take a screenshot of the dashboard, smoke-test the REST API, or interact with the running app.
---

hbh-flow is a NestJS monorepo: a REST/WebSocket **API** (`apps/api`), a BullMQ **worker** (`apps/worker`), and a React 19 + Vite + MUI **UI** (`apps/ui`). In dev the API proxies `/` to the Vite dev server, and the UI calls the API at `location.origin + '/api'` — so you drive everything through the API origin on **:3001**. The GUI is driven headlessly with `.claude/skills/run-hbh-flow/driver.mjs` (Chrome DevTools Protocol over Node's built-in WebSocket — no puppeteer/playwright needed); the REST API is smoke-tested with `.claude/skills/run-hbh-flow/api-smoke.sh`.

All paths below are relative to the repo root (`/home/ibrahim/Projects/hbh-flow`).

## Prerequisites

Runtimes (already present in this environment):

```bash
node -v            # v24.12.0 (package.json needs >=23.11.1)
pnpm -v            # 10.15.0
google-chrome --version   # for the UI driver (headless)
```

Dependent services run in Docker; the UI driver needs Chrome:

```bash
sudo apt-get update
sudo apt-get install -y google-chrome-stable   # or chromium; set CHROME_BIN if named differently
```

- **Postgres** and **Redis** run as Docker containers named `postgres` (postgres:16-alpine, :5432) and `redis` (redis:latest, :6379). They already exist here — just ensure they're started (below).
- **MongoDB** is a remote Atlas cluster (`MONGO_URL` in `.env`) — nothing to run locally.

## Setup

Dependencies are already installed in this environment. From a clean clone you'd run (root workspace, then the UI has its own `node_modules`):

```bash
pnpm install
cd apps/ui && pnpm install && cd ../..
```

`.env` already exists at the repo root with working credentials (local Postgres/Redis, remote Mongo, and all third-party API keys). Start the dependent services and apply DB migrations:

```bash
docker start postgres redis
node_modules/.bin/prisma migrate deploy   # → "No pending migrations to apply."
```

Verify connectivity:

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d flow -c '\dt' | head   # lists tables
docker exec redis redis-cli ping                                           # → PONG
```

## Run (agent path)

Do **not** use `pnpm start` for automated work — it spawns api+worker+UI *and* opens an ngrok tunnel to a fixed public domain (`NGROK_*` in `.env`). Launch the API and Vite directly instead.

**1. Start the API** (bypasses the ngrok orchestrator; `--env-file` loads `.env`):

```bash
node --env-file=.env --import @swc-node/register/esm-register apps/api/main.ts \
  --enable-source-maps --no-experimental-strip-types &> /tmp/hbh-api.log &
# wait for readiness (~12s: SWC compile + Nest boot + BullMQ queue setup)
for i in $(seq 1 40); do
  curl -sf http://localhost:3001/api/docs.json -o /dev/null && { echo "API UP"; break; }
  sleep 1
done
```

Ready marker in the log: `Nest application successfully started`. Swagger UI at `http://localhost:3001/api`.

**2. Start the Vite UI dev server** (the API dev-proxies `/` to it on UI_PORT=3003):

```bash
cd apps/ui && ./node_modules/.bin/vite --port 3003 --strictPort &> /tmp/hbh-ui.log & cd ../..
for i in $(seq 1 40); do curl -sf http://localhost:3003/ -o /dev/null && { echo "VITE UP"; break; }; sleep 1; done
```

**3. Smoke-test the REST API** (login → CSRF → authenticated calls):

```bash
./.claude/skills/run-hbh-flow/api-smoke.sh    # prints "SMOKE OK" on success
```

**4. Drive the UI** with the CDP driver (screenshots land where you tell it):

```bash
mkdir -p /tmp/shots
# screenshot any URL (via the API origin, which proxies to Vite):
node .claude/skills/run-hbh-flow/driver.mjs shot http://localhost:3001/ /tmp/shots/login.png
# log in with the seeded SYSTEM user and screenshot the authenticated dashboard:
node .claude/skills/run-hbh-flow/driver.mjs login http://localhost:3001 \
  flow@honeybeeherb.com hbh-admin-1234 /tmp/shots/dashboard.png
```

`login` prints `after login → path: /` and writes the dashboard screenshot (sidebar, Overview cards, execution charts). Seeded creds: **flow@honeybeeherb.com** / **hbh-admin-1234** (SYSTEM role).

| driver command | what it does |
|---|---|
| `shot <url> <out.png>` | Navigate, wait for content, screenshot. |
| `login <base> <email> <password> <out.png>` | Fill + submit login, wait for redirect off `/login`, screenshot. |
| `probe <base> <email> <password>` | Debug: run login+whoami via in-page `fetch`, print HTTP statuses. |

**Worker (optional)** — only needed to actually *execute* queued/scheduled jobs; the API+UI run fine without it:

```bash
node --env-file=.env --import @swc-node/register/esm-register apps/worker/main.ts \
  --enable-source-maps --no-experimental-strip-types &> /tmp/hbh-worker.log &
```

**Stop everything** — note the `[m]`/`[w]` regex trick so `pkill -f` doesn't match (and kill) its own shell:

```bash
pkill -f "apps/api/[m]ain.ts"; pkill -f "apps/worker/[m]ain.ts"; pkill -f "[v]ite --port 3003"
```

## Run (human path)

`pnpm start` runs api + worker + Vite together and (because `NGROK_AUTHTOKEN`/`NGROK_DOMAIN` are set in `.env`) opens a public ngrok tunnel. Useful for a human at a browser; avoid it for headless automation — it blocks the shell and the fixed ngrok domain conflicts if another instance holds it.

## Test

```bash
pnpm test        # Vitest (watch mode by default)
pnpm vitest run  # single non-watch pass
```

## Gotchas

- **The root `main.ts` (`pnpm start`) opens ngrok.** It reads `NGROK_AUTHTOKEN`/`NGROK_DOMAIN` from `.env` and tunnels to a fixed public domain. For automated runs launch `apps/api/main.ts` directly (see agent path) so nothing goes public.
- **No backend build step.** TypeScript runs directly via `@swc-node/register` with `--no-experimental-strip-types`. There is no `dist/` in dev; `pnpm build` only builds the UI (to `dist/` at repo root, served by the API in production mode).
- **Access the UI through :3001, not :3003 directly.** The UI's axios base URL is `location.origin + '/api'`. Loaded from the Vite origin (:3003) its API calls would hit :3003/api (404s). The API dev-proxies `/` to Vite, so :3001 gives the correct same-origin topology.
- **Auth = HttpOnly cookie + CSRF header.** `POST /api/auth/login` sets an HttpOnly `access_token` cookie and returns a `csrfToken`. Every protected request needs **both** the cookie and an `X-CSRF-Token: <token>` header. The cookie is `Secure` only in production, so it works over plain http://localhost in dev.
- **List endpoints paginate with `page`/`limit`, not `take`/`skip`.** `limit` max is 250. `?take=3` → HTTP 400 `property take should not exist` (global `ValidationPipe` has `forbidNonWhitelisted: true`).
- **Driving React controlled inputs (in `driver.mjs`):** you must (1) set the value via the *native* `HTMLInputElement.prototype.value` setter and dispatch a bubbling `input` event, (2) **fill and click in separate CDP evals with a delay between** — same-tick fill+submit reads state before React commits it and posts empty fields (server → `email must be an email`), and (3) select the login fields by `#email`/`#password`, not by input type — MUI's color-mode select renders its own hidden input that a type-based match grabs by mistake.

- **`pkill -f "apps/api/main.ts"` kills its own shell** (exit code 144). `pkill -f` matches full command lines, and the launch command / the pkill command itself contain that string. Use a bracket in the pattern — `pkill -f "apps/api/[m]ain.ts"` — so the pattern text no longer matches itself. Never chain the launch and a broad `pkill` in one shell invocation.

## Troubleshooting

- **`login` prints alert `"An error occurred"` / `"email must be an email"`**: the form submitted before React committed the typed values (or the wrong input was filled). Fixed in `driver.mjs` by splitting fill/click and selecting by id — re-pull the driver if you see this.
- **`shot` produces a tiny (~4KB) blank PNG**: the page was captured before React's first paint. The driver polls for `document.body.innerText` (and, for login, `input` count ≥ 2) before acting — make sure Vite (:3003) is actually up, or the proxied page is empty.
- **API exits immediately / Prisma or Redis connection errors**: `docker start postgres redis` and confirm the pings under Setup. Migrations must be applied (`prisma migrate deploy`).
- **`login` times out "waiting for redirect off /login"**: the API isn't reachable from the browser (start it first) or creds are wrong. Use `driver.mjs probe ...` to see the raw login/whoami HTTP statuses.
- **Chrome not found**: install `google-chrome-stable` (or `chromium`) and set `CHROME_BIN=/path/to/binary` for the driver.
