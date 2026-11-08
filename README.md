# Apex Flows

Turn your API into plain-English automations.

Connect an OpenAPI spec or MCP server, describe the job in a sentence, watch the
plan compile, read the graph, then run it or put it on a schedule. Steps can wait
for a person to approve them, and every run keeps its inputs, outputs and failures.

Apex Flows is the product layer: accounts, workspaces, quotas and the UI. Planning
and durable execution are done by [apex-engine](https://github.com/satyanvm/apex-engine),
which it reaches server-side only.

## Stack

Next.js 15 (App Router), TypeScript, Tailwind 4, @xyflow/react, and Postgres through
`pg` with plain SQL migrations.

## Run it locally

You need Node 20+, pnpm, Postgres and a running apex-engine.

```bash
pnpm install
cp .env.example .env.local
```

Fill in `.env.local`, then export it for the migrate script and start the app:

```bash
set -a; source .env.local; set +a; pnpm migrate && pnpm dev
```

Open http://localhost:3100.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. Add `?sslmode=require` for managed providers. |
| `ENGINE_URL` | yes | Base URL of apex-engine. |
| `ENGINE_API_KEY` | yes | One key from the engine's `APEX_API_KEYS`. |
| `APP_URL` | yes in production | Public origin, no trailing slash. Mutating requests must come from it. An `https://` value turns on Secure cookies. |
| `MONTHLY_COMPILE_LIMIT` | no (100) | Compiles per workspace per calendar month (UTC). |
| `MONTHLY_RUN_LIMIT` | no (500) | Runs per workspace per calendar month (UTC). |
| `DATABASE_POOL_MAX` | no (5) | Connections per server instance. |

To give one workspace different limits, set `compile_limit` and `run_limit` on its
row in `workspaces`.

## Deploy

### Docker

Runs the app and Postgres on one host. Migrations apply when the container starts.

```bash
POSTGRES_PASSWORD=... ENGINE_URL=https://engine.example.com ENGINE_API_KEY=... APP_URL=https://flows.example.com docker compose up -d --build
```

Put HTTPS in front of port 3100.

### Vercel and managed Postgres

1. Create a Postgres database (Neon, Supabase, RDS) and copy its connection string.
2. Import this repo in Vercel and set the variables above. Use the pooled connection
   string, with `DATABASE_POOL_MAX=1`.
3. Set the Build Command to `pnpm vercel-build`, which applies migrations first.

Compiles stream for as long as the engine takes, so `/api/compile` asks for
`maxDuration = 300`. Check that your Vercel plan allows it.

## Tests

The suite needs a real, disposable Postgres database. It truncates every table.

```bash
docker run -d --name apex-test-pg -e POSTGRES_USER=apex -e POSTGRES_PASSWORD=apex -e POSTGRES_DB=apex_test -p 127.0.0.1:55433:5432 postgres:16-alpine
```

```bash
TEST_DATABASE_URL=postgres://apex:apex@localhost:55433/apex_test pnpm test
```

The engine is a local fake HTTP server in tests only.

## How tenancy works

One engine key serves every workspace, so the engine can't tell workspaces apart.
This app does that:

- `tools`, `runs` and `schedules` record which engine id belongs to which workspace.
  Every proxied call checks that first and answers 404 for anything else.
- A saved flow can only come from a compilation stored server-side for that workspace.
  The browser never submits a DAG.
- Only catalog ids owned by the workspace are ever sent to the engine.

Scheduled runs are started by the engine, so they're claimed afterwards: each schedule's
input carries a reserved `__apex` marker, and the app adds matching runs when a Runs or
Flow page loads.

## Known limits

- Scheduled runs count against the quota when they're claimed, not when they start. A
  workspace nobody opens can run past its cap until the next page load, at which point
  its schedules stop and show as paused.
- Claiming reads the engine's latest 200 runs, so a very busy engine could push older
  scheduled runs out of that window between page loads.
- There are no invitations yet. Each account has one workspace, although the schema
  supports members.
- There's no email verification or password reset yet.
