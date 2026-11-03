# SmartLog Analyzer — Completion Design

Date: 2026-11-03
Status: draft (pending human approval)

## Intent and why

The prototype covers ingestion, AI analysis, persistence and health, but three defects block any honest demo: the AI provider registry never matches configured names, analysis routes are mounted where no client or test looks, and the Jest/Web test targets do not run. On top of that, several challenge deliverables are missing: pagination in the UI, dead-letter visibility, aggregation, seed/index tooling, a decision log, and structured logging.

This change closes that gap with the existing Angular app and the existing API, without introducing a new stack.

## Goals

- Every documented endpoint answers with the documented shape and status code.
- Angular dashboard: paginated log table with filters and ingestion, analyses list with polling, clean visual design, working route shell.
- Dead-letter queue is provably used on terminal failure and is observable through the API.
- Mongo aggregation endpoint grouped by service or level over a date range.
- Seed and index-creation scripts plus a Makefile.
- `pnpm test:unit`, `pnpm test:integration` and `pnpm test:web` run and pass.
- Tests cover the mocked LLM contract: valid response, unexpected format, timeout.
- README documents requirements, startup and test commands.
- ARCHITECTURE.md records each technical decision with the discarded alternative and the reason.

## Non-goals

- No authentication or authorization changes.
- No CI pipeline, no deployment automation beyond the existing Compose stack.
- No new frontend framework or component library; no Tailwind, no Angular Material.
- No real provider calls in tests; no new provider SDKs.
- No DLQ requeue action in this pass (read-only listing only).
- No multi-tenant, tracing, metrics backend or alerting.

## Anti-goals

- Turning tests green by deleting or skipping specs.
- A UI that hides API errors behind empty states.
- A "DLQ feature" that is only a log line.
- Rewriting working modules for style while the contract is still broken.

## Constraints

- Node 22, pnpm 9.15.9, pnpm workspaces (`src/api`, `src/web`).
- MongoDB 8 through the TypeORM Mongo driver; `synchronize: false`; no SQL migrations are possible.
- Angular 19 standalone components, plain SCSS, styles budget 12 kB per component.
- Test sources live under `tests/` at the repo root.
- The dev container cannot reach the Docker daemon. Container-level verification is deferred to the host; local verification relies on builds and test suites.
- No MongoDB or Redis instance is reachable from the dev container, so integration tests must not require live infrastructure.

## Approaches considered

**A. Contract first, then UI, then extras, then docs (chosen).** Fix provider matching, route mounting and the Jest/Web harness; then build the UI on a stable API; then add aggregation, seeds, logging; docs last.

**B. Vertical slices.** Ship logs list end-to-end first, then analyses, then DLQ. Visible progress earlier, but the UI would be built twice for the routes that move, and the test harness would stay red through most of the work.

**C. Backend complete, minimal UI last.** Fastest path to backend checklist items, but the frontend is an explicit deliverable and would end up thin.

A wins because all three backend defects block any UI verification. Building the UI first means debugging 404s and empty tables instead of layout.

## Decisions

| # | Decision | Alternative discarded | Why |
|---|---|---|---|
| 1 | Analyses are served at `GET /api/analysis`, `GET /api/analysis/:id`, and `GET /api/analysis/dead-letter`. Enqueue stays at `POST /api/logs/analyze`. | Keep `GET /api/logs/analysis` and change the frontend, tests and docs instead. | Docs, the current Angular service and the integration specs already assume `/api/analysis`. Nesting a top-level collection under `/logs` is the wrong hierarchy. |
| 2 | Split the analyses module into `AnalysesController` (`@Controller('analysis')`) and `LogAnalysisController` (`@Controller('logs')`, enqueue only). | One controller with `@Controller()` and absolute paths. | Keeps the enqueue route in the module that owns the queue while avoiding a circular import between `LogsModule` and `AnalysesModule`. `dead-letter` is declared before `:id` so it is not captured as an id. |
| 3 | Normalize provider names with `trim().toLowerCase()` on both sides of the registry comparison; keep enum values as persisted display names. | Lowercase the enum values. | The registry value is persisted in `analyses.provider`; keeping `OpenAI` stable preserves existing records while `.env` stays lowercase. |
| 4 | Dead letters are exposed read-only through `GET /api/analysis/dead-letter?limit&offset`, returning job id, analysis id, failed reason, attempts and timestamp. | A worker that consumes the DLQ and persists rows to Mongo. | The queue already holds the truth; duplicating it adds a schema and a second source of divergence. A read endpoint proves the queue is used and is enough for the demo. |
| 5 | Aggregation at `GET /api/logs/stats?groupBy=service\|level&from&to` using a Mongo `$match`/`$group`/`$sort` pipeline. | Fetch logs and aggregate in Node. | The checklist asks for an aggregation query; DB-side avoids loading the collection and returns in one round trip. |
| 6 | "Migration" is an index-creation script (`pnpm db:indexes`) for logs and analyses. | TypeORM migrations. | TypeORM's Mongo driver does not provide SQL-style migrations. Indexes are the schema concern that actually matters for Mongo read paths. Documented as an explicit decision. |
| 7 | `pnpm seed` inserts a demo dataset (~40 logs across 4 services, 4 levels, 7 days, plus 2 analyses) and supports `--reset`. | JSON fixtures consumed only by tests. | A runnable dataset is required to exercise pagination, filters and aggregation manually. |
| 8 | Jest configs set `rootDir` to `src/api`, `roots` to the repo `tests/` subfolders, and map `^src/(.*)$` to `<rootDir>/src/$1`. | Install `ts-jest` at the repo root. | Follows the app's own `node_modules`, no lockfile churn, and mirrors the TypeScript path mapping the code already uses. |
| 9 | LLM tests mock the injected HTTP client and cover: valid payload, malformed/unexpected payload, and timeout. | Network-level interception (`nock`) or a fake provider server. | Providers already receive `HttpService` through DI; a mock needs no new dependency and can simulate a timeout deterministically. |
| 10 | Structured logging is a dependency-free JSON logger plus a request middleware (`x-request-id`, method, path, status, duration). | `nestjs-pino` or `pino`. | One small class covers the requirement; a logging framework adds transports and configuration that the prototype does not need. |
| 11 | Web shell has two routes, `/logs` and `/analyses`, with a redirect to `/logs`, and a reusable pagination component (page size 10/20/50, previous/next, range and total). | Single `AppComponent` doing everything. | The current component is at the 12 kB style budget and mixes ingestion, listing and polling. Splitting keeps each unit testable and the styles small. |
| 12 | Web tests are enabled by adding `include: ['../../tests/web/**/*.spec.ts']` to the Karma target. | Move specs under `src/web`. | The repo convention keeps tests at the root; the build target should follow the convention, not the other way around. |
| 13 | A `Makefile` exposes install, dev, build, test targets, seed, indexes, and Compose up/down/logs. | npm scripts only. | The checklist asks for a Makefile or automation scripts; a Makefile is discoverable and composes the pnpm workspace commands. |
| 14 | Swagger schemas come from the `@nestjs/swagger` CLI plugin in `nest-cli.json`. | Hand-written `@ApiProperty` on every DTO field. | The plugin derives schemas from TypeScript types and DTO decorators, keeping DTOs focused on validation. |
| 15 | The API listens on `PORT`, falling back to `API_PORT`, then 3000. | Keep `PORT` only and document it. | Local `.env` defines `API_PORT`; today local `pnpm start:api` silently ignores it. |
| 16 | Frontend styling is rewritten around CSS custom-property tokens in a light theme, split across shell and feature components. | Keep the existing 12 kB dark stylesheet. | The current sheet is at the budget limit and cannot absorb pagination and filter UI. |

## Builder-check resolutions (architect's calls)

The builder review surfaced five gaps. Each is settled here; none changes the shape of the work.

1. **Provider factory and shared extraction.** `AnalysesModule` switches on `name.toLowerCase()` but compares against `ProviderName` values (`'OpenAI'`, `'Anthropic'`, `'Gemini'`), so every configured name falls through to the OpenAI default. Separately, `BaseAnalysisProvider.getTextContent` rejects arrays, yet all three adapters pass numeric indices (`choices.0.message.content`, `candidates.0.content.parts.0.text`, `completion.content.0.text`), so every real provider response throws "invalid analysis response". Both are fixed in phase 1: the switch normalizes both sides, `getTextContent` indexes arrays with numeric path segments, and the Anthropic path becomes `content.0.text` (Messages API). An unknown configured provider name registers nothing and logs a warning instead of silently instantiating OpenAI.
2. **`GET /api/logs/stats` contract.** `groupBy` is optional and defaults to `service` (`service | level`). `from` and `to` are optional ISO 8601 timestamps, inclusive, applied to the log event `timestamp` (not `ingestedAt`). Response is `200 { groupBy, from: string | null, to: string | null, total, buckets: [{ key, count }] }`, sorted by `count` descending then `key` ascending, capped at 100 buckets. Invalid `groupBy`, unparsable dates, or `from > to` return `400` through the DTO.
3. **Phase 2 exits when specs pass, not merely execute.** The Anthropic spec is authoritative: the adapter is fixed rather than the spec. The valid / malformed-payload / timeout matrix is applied to all three adapters, since each one mocks the HTTP client and the extra cases are cheap.
4. **Persisted provider value.** `AnalysisProviderRegistry.analyze` returns the matched adapter's canonical `provider.name`, so `analyses.provider` stores `OpenAI | Anthropic | Gemini`. Configured aliases are not supported: matching is exact after normalization, and an unmatched name is reported as a failure rather than mapped.
5. **Pagination contract stays strict.** Out-of-range `limit` (above 100) or negative `offset` returns `400`; values are not silently capped. The existing integration assertion and the documented maximum stay as-is, and phase 1 only verifies the behavior.

## Phases (each phase is one reviewable work unit)

1. **Contract.** Split controllers, normalize provider names in the registry and factory, fix `getTextContent` array traversal plus the Anthropic response path, fix the port fallback, verify pagination rejection. Done when `GET /api/analysis` and `/api/analysis/:id` answer, all three adapters parse a canonical mocked response, and the provider health signal stops reporting a false down.
2. **Test harness.** Fix the three Jest/Karma configurations and the stale spec imports. Done when `pnpm test:unit`, `pnpm test:integration` and `pnpm test:web` discover and pass their specs, including the valid / malformed / timeout matrix for the three adapters.
3. **Failure visibility and aggregation.** DLQ listing endpoint, dead-letter tests (terminal vs retry), `GET /api/logs/stats`, provider signal test.
4. **Data tooling.** Seed script, index script, Makefile. Done when `pnpm seed --dry-run` and `pnpm db:indexes --dry-run` print the intended operations.
5. **Structured logging.** JSON logger and request middleware with tests for the emitted shape.
6. **Frontend.** Route shell, API service aligned to the final contract, pagination component, logs page (filters, ingest, table), analyses page (list, status, polling), rewritten styles. Done when `pnpm build:web` passes and web tests cover pagination and the API service.
7. **Docs.** README sections and endpoint table; ARCHITECTURE decision table, updated diagram and code references. Done when every documented path exists in the code.

## Verification per phase

- API: `pnpm build:api`, `pnpm test:unit`, `pnpm test:integration`.
- Web: `pnpm build:web`, `pnpm test:web`.
- Container: deferred; the host runs `docker compose build --no-cache api web proxy` and `docker compose up -d --force-recreate`.
- No test may require a live Mongo, Redis or provider.

## Risks

- **Docker unavailable locally.** Container behavior is verified by build and unit/integration tests only; the final smoke test is on the host.
- **No live Mongo/Redis.** Seeds and index scripts are verified by dry-run and type check; real execution is part of the host checklist.
- **Route move breaks clients.** Frontend service, integration specs and docs change in the same phase; no compatibility alias is kept.
- **Style budget.** Splitting the stylesheet is required, not cosmetic.
- **Provider tests are mocked.** They prove contract handling, not real provider behavior; that stays documented.

## Definition of done (challenge mapping)

- Frontend with pagination: phase 6.
- Working endpoints: phases 1 and 3.
- DLQ on failure: phase 3.
- Functional tests: phases 2, 3, 5, 6.
- README requirements/startup/tests: phase 7.
- Reverse proxy, Makefile/scripts, OpenAPI, pagination, structured logging: phases 2, 4, 5, 6, 7.
- LLM summary/categorization/suggestions: already implemented; covered by phase 2/3 tests.
- Persisted analyses: already implemented; covered by phase 3 tests.
- LLM mocked tests (valid, unexpected format, timeout): phase 2.
- Input validation, HTTP errors: already implemented; covered by phase 2 integration tests.
- Unit and integration tests with edge cases: phases 2 and 3.
- Data model: already implemented; documented in phase 7.
- Migration and seed scripts: phase 4.
- Aggregation query: phase 3.
- Architecture diagram: exists; updated in phase 7.
- ARCHITECTURE.md decisions with discarded alternative: phase 7.

## Left to the builder

- Exact visual composition beyond the token palette and the two-route shell.
- Whether the page size is persisted in `localStorage`.
- Whether a DLQ requeue action is added later.
- Whether coverage thresholds are enforced in CI (no CI in scope).
