# SmartLog Analyzer

Internal observability tool: microservices push structured logs, SmartLog stores them in MongoDB and runs asynchronous AI analyses (summary, categorization and suggestions) through a configurable provider. The repository is a pnpm workspace with a NestJS API and an Angular 19 dashboard behind a single Nginx reverse proxy.

Architecture, decisions and discarded alternatives live in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Requirements

- Node.js 22+ and pnpm 9.15.9 (`corepack enable`).
- Docker Engine with Docker Compose v2 (for the full stack).
- Chrome or Chromium for the Angular/Karma suite.

## Quick start (local)

```bash
corepack enable
pnpm install
cp .env.example .env
set -a && . ./.env && set +a

docker compose up -d mongodb redis   # only the infrastructure
pnpm start:api                       # http://localhost:3000/api
pnpm start:web                       # http://localhost:4200
```

`src/web/proxy.conf.json` forwards `/api` from the dev server to `API_PORT`, so the dashboard works without CORS. The API reads `MONGODB_URI` and `REDIS_URL` from the environment, which already point at the loopback ports published by Compose.

- Swagger UI: `http://localhost:3000/api/docs` (JSON at `/api/docs-json`).
- Readiness: `GET /api/health`; liveness: `GET /api/health/live`.

Seed demo data and create the MongoDB indexes once MongoDB is reachable:

```bash
pnpm --filter smartlog-api run seed -- --dry-run   # preview only
pnpm --filter smartlog-api run seed                # insert demo logs + analyses
pnpm --filter smartlog-api run seed -- --reset     # clear logs/analyses first
pnpm --filter smartlog-api run db:indexes          # create indexes idempotently
pnpm --filter smartlog-api run db:indexes -- --dry-run
```

## Docker Compose

```bash
cp .env.example .env
# Replace HTTP_AUTH_PASSWORD and the AI provider keys before starting.
docker compose up --build
```

Everything is served through Nginx on `http://localhost:8080` (Basic Auth using `HTTP_AUTH_USERNAME` / `HTTP_AUTH_PASSWORD`):

- Dashboard: `/`
- API: `/api`
- Swagger: `/api/docs`

Only the proxy publishes a port on the host. MongoDB and Redis bind to `127.0.0.1` for local tooling; the API and dashboard stay on the private Compose network. MongoDB and Redis must be healthy before the API starts, and the API container healthcheck uses `/api/health/live` so an AI provider outage does not mark the container unhealthy.

Basic Auth does not encrypt credentials. Terminate TLS in front of the proxy for any non-local deployment.

Stop with `docker compose down`; data stays in the `mongodb_data` and `redis_data` volumes. `docker compose down -v` removes them.

## Make targets

| Target | What it does |
|---|---|
| `make install` | `pnpm install` |
| `make dev` | Run the API and the dev server together |
| `make build` | Build the API and the dashboard |
| `make test` | Unit + integration + web suites |
| `make test-unit` | API unit tests |
| `make test-integration` | API HTTP integration tests |
| `make test-web` | Angular/Karma tests |
| `make seed ARGS="--reset"` | Run the seed script with optional flags |
| `make indexes ARGS="--dry-run"` | Create MongoDB indexes (or preview) |
| `make up` / `make down` | Start/stop the Compose stack |
| `make logs` | Follow Compose logs |

## Tests

```bash
pnpm test               # everything
pnpm test:unit          # Jest, API units (48 specs)
pnpm test:integration   # Jest + Supertest against a Nest testing module
pnpm test:web           # Angular/Karma (ChromeHeadless)
pnpm build              # API + dashboard production build
```

Integration tests stub MongoDB, Redis, BullMQ and the AI HTTP layer, so no external service is required. They cover pagination bounds, filters, the aggregation endpoint, dead-letter listing, provider contract validation, timeouts and the consistent error payload.

Karma runs headless Chrome with `--no-sandbox` when the process is root (`src/web/karma.conf.cjs`). If Chrome is not on `PATH`, set `CHROME_BIN` to the binary.

## API

All routes are mounted under `/api`. Errors always return the same envelope:

```json
{ "statusCode": 400, "error": "Bad Request", "message": "...", "path": "/api/logs", "timestamp": "..." }
```

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/logs` | Ingest one log (`service`, `timestamp`, `level`, `message`, optional `metadata`) |
| `GET` | `/api/logs` | List logs with `limit`, `offset`, `service`, `level`, `from`, `to` |
| `GET` | `/api/logs/stats` | Aggregate by `groupBy=service\|level` with optional `from`/`to` |
| `POST` | `/api/logs/analyze` | Enqueue an analysis for `logIds`; responds `202` |
| `GET` | `/api/analysis` | List analyses with `limit`, `offset`, optional `status` |
| `GET` | `/api/analysis/dead-letter` | Read-only dead-letter jobs with `limit`, `offset` |
| `GET` | `/api/analysis/{id}` | Analysis status and result |
| `GET` | `/api/health` | Readiness: API, Mongo, Redis cache, AI provider, memory |
| `GET` | `/api/health/live` | Liveness: the process answers |

`limit` defaults to 20 and must be between 1 and 100; `offset` defaults to 0 and must be non-negative. Invalid values return `400` instead of being silently clamped. List responses are `{ items, total, limit, offset }`.

### Aggregation

`GET /api/logs/stats?groupBy=level&from=...&to=...` returns:

```json
{
  "groupBy": "level",
  "from": "2026-11-01T00:00:00.000Z",
  "to": null,
  "total": 12,
  "buckets": [{ "key": "error", "count": 7 }]
}
```

Buckets are sorted by count descending, then key ascending, and capped at 100 entries. The range is inclusive on the log `timestamp`; a reversed range is rejected with `400`.

### Dead-letter queue

After `AI_RETRY_ATTEMPTS` failures a job is moved from `analysis-queue` to `analysis-dead-letter-queue` and its analysis is marked `failed`. Dead letters are read-only: `GET /api/analysis/dead-letter` exposes `analysisId`, `failedReason`, `attempts` and `createdAt` for triage. Requeueing is intentionally manual (delete the job or re-post `/api/logs/analyze`).

### AI providers

OpenAI (Chat Completions), Anthropic (Messages) and Gemini (`generateContent`) have native adapters. `AI_PROVIDER` selects the primary and `AI_FALLBACK_PROVIDER` the fallback; each provider is configured with `AI_PROVIDER_<NAME>_URL`, `AI_PROVIDER_<NAME>_HEALTH_URL` and `AI_PROVIDER_<NAME>_API_KEY`. Provider names are matched case-insensitively but persisted with their canonical spelling (`OpenAI`, `Anthropic`, `Gemini`). Invalid names are ignored with a warning instead of registering a broken adapter.

The model must answer with the documented JSON contract (`summary` plus `insights[]`). Non-JSON or off-contract responses become a `503` on the analysis task and are retried; the final failure lands in the dead-letter queue. Provider keys never reach the browser.

## Data model

| Collection | Purpose | Notes |
|---|---|---|
| `logs` | Ingested log entries | `service` (lowercase slug), `timestamp`, `level`, `message`, optional `metadata`, `ingestedAt` |
| `analyses` | Analysis jobs | `logIds`, `status` (`queued`/`processing`/`completed`/`failed`), `provider`, `result`, `error`, `attempts`, timestamps |

Indexes (`pnpm ... db:indexes`): `logs.timestamp_-1`, `logs.service_1_timestamp_-1`, `logs.level_1_timestamp_-1`, `analyses.status_1_createdAt_-1`, `analyses.createdAt_-1`.

## Environment variables

| Variable | Purpose |
|---|---|
| `PROXY_PORT` | Host port published by Nginx (default 8080) |
| `HTTP_AUTH_USERNAME`, `HTTP_AUTH_PASSWORD` | Basic Auth credentials for the proxy |
| `API_PORT` | Internal API port (also used by the dev proxy and Nginx upstream) |
| `NODE_ENV` | Runtime environment |
| `MONGO_PORT`, `REDIS_PORT` | Loopback ports for local tooling |
| `MONGODB_IMAGE`, `REDIS_IMAGE` | Pinned infrastructure images |
| `MONGODB_INITDB_ROOT_USERNAME`, `MONGODB_INITDB_ROOT_PASSWORD`, `MONGODB_DATABASE` | MongoDB bootstrap |
| `MONGODB_URI`, `REDIS_URL`, `APP_BASE_URL` | Host-side connection strings |
| `MONGODB_URI_DOCKER`, `REDIS_URL_DOCKER`, `APP_BASE_URL_DOCKER` | In-network connection strings |
| `REDIS_PASSWORD` | Redis password |
| `CACHE_TTL_SECONDS` | TTL of the log list cache |
| `AI_PROVIDER`, `AI_FALLBACK_PROVIDER` | Primary and fallback adapters |
| `AI_PROVIDER_<NAME>_URL`, `AI_PROVIDER_<NAME>_HEALTH_URL`, `AI_PROVIDER_<NAME>_API_KEY` | Per-provider endpoint, health endpoint and secret |
| `AI_PROVIDER_OPENAI_MODEL`, `AI_PROVIDER_ANTHROPIC_MODEL` | Model names |
| `AI_REQUEST_TIMEOUT_MS`, `AI_HEALTH_TIMEOUT_MS` | HTTP timeouts |
| `AI_RETRY_ATTEMPTS`, `AI_RETRY_BACKOFF_MS` | BullMQ attempts and initial exponential backoff |
| `HEALTH_CHECK_MEMORY_HEAP_LIMIT`, `HEALTH_CHECK_MEMORY_RSS_LIMIT` | Memory limits in MiB |

`.env.example` ships placeholder keys. `/api/health` returns `503` while they remain placeholders; `/api/health/live` keeps containers healthy.

## Troubleshooting

- **`/api/health` returns 503** — expected with placeholder AI keys. Check the failing indicator in the response body; `/api/health/live` only proves the process is up.
- **Dashboard gets 401/403** — Nginx Basic Auth is enabled; use the credentials from `.env` (or call the API directly on `API_PORT` during local development).
- **Karma cannot start Chrome** — install Chrome/Chromium or export `CHROME_BIN`. Running as root requires the `ChromeHeadlessNoSandbox` launcher already configured in `src/web/karma.conf.cjs`.
- **Seed or index script cannot connect** — MongoDB must be reachable and `MONGODB_URI` must be exported in the current shell.
- **Analysis stuck in `queued`** — check that Redis is up and the API worker is running; retries follow `AI_RETRY_ATTEMPTS` with exponential backoff and end in the dead-letter queue.
