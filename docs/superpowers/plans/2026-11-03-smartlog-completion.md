# SmartLog Analyzer Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SmartLog Analyzer demo honest: correct API contract, working AI adapters, observable dead-letter queue, aggregation, seeds/indexes, structured logging, a paginated Angular dashboard, and a green test suite.

**Architecture:** NestJS API (Mongo + TypeORM, Redis cache, BullMQ) behind an authenticated Nginx proxy, with an Angular 19 standalone dashboard. Work proceeds contract-first, then tests, failure visibility, tooling, logging, UI, docs.

**Tech Stack:** Node 22, pnpm 9.15.9, NestJS 11, TypeORM Mongo driver, BullMQ, Angular 19, Jest, Karma/ChromeHeadless.

**Spec:** `docs/superpowers/specs/2026-11-03-smartlog-completion-design.md`

## Global Constraints

- Node 22, pnpm 9.15.9; workspaces `src/api` and `src/web`.
- No test may require live MongoDB, Redis, or an AI provider.
- Test sources stay under `tests/` at the repo root.
- Routes after this plan: `POST /api/logs`, `GET /api/logs`, `GET /api/logs/stats`, `POST /api/logs/analyze`, `GET /api/analysis`, `GET /api/analysis/dead-letter`, `GET /api/analysis/:id`, `GET /api/health`, `GET /api/health/live`, `GET /api/docs`.
- `limit` above 100 or `offset` below 0 returns 400; values are never silently capped.
- Persisted provider names are exactly `OpenAI`, `Anthropic`, `Gemini`.
- Technical artifacts, code, comments and docs are in English.
- Conventional commits only; no AI attribution.
- Docker daemon is unreachable from the dev container; container verification happens on the host.
- `limit` default 20, max 100, `offset` default 0.

## Review Focus

- **Empty dataset:** `GET /api/logs/stats` returns `{ total: 0, buckets: [] }` and the UI shows an empty state, never an error banner.
- **Offset beyond the last page:** the UI resets to the last valid page instead of showing a permanently blank table.
- **Provider returns non-JSON text:** the adapter throws `ServiceUnavailableException`, the analysis is marked failed, and a dead letter is written only after attempts are exhausted.
- **Mongo or Redis down:** `/api/health` returns 503 with per-check detail; the dashboard surfaces the error instead of an empty table.
- **Invalid query params** (`limit=101`, `limit=0`, bad date, `from > to`): 400 with the shared `{ statusCode, message, error }` envelope.

---

## Task 1: Repair the Jest harness

**Files:**
- Modify: `tests/jest.unit.config.cjs`, `tests/jest.integration.config.cjs`
- Modify: the seven stale spec imports listed below
- Test: existing specs

**Interfaces:**
- Produces: `pnpm test:unit` and `pnpm test:integration` execute specs from the repo root.

- [ ] **Step 1: Rewrite `tests/jest.unit.config.cjs`**

```js
const path = require('node:path');

module.exports = {
  rootDir: path.join(__dirname, '..', 'src', 'api'),
  roots: [path.join(__dirname, 'unit')],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/../../tests/unit/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '../../tests/tsconfig.json' }],
  },
  moduleNameMapper: { '^src/(.*)$': '<rootDir>/src/$1' },
  moduleFileExtensions: ['js', 'json', 'ts'],
  clearMocks: true,
};
```

- [ ] **Step 2: Apply the same shape to `tests/jest.integration.config.cjs`** with `roots` and `testMatch` pointing at `tests/integration/**/*.spec.ts`.

- [ ] **Step 3: Fix stale imports**

`tests/unit/analysis-provider-registry.spec.ts:9`, `anthropic-analysis.provider.spec.ts:4`, `gemini-analysis.provider.spec.ts:5-6`, `openai-analysis.provider.spec.ts:4`, `health.controller.spec.ts:12` must import from `src/api/src/modules/analyses/providers/...`, `src/api/src/common/filters/...`, and the correct entity paths, matching the current tree.

While in `health.controller.spec.ts`, add the degraded case: with a failing dependency check the controller returns HTTP 503 and `{ status: 'error', checks: { <name>: 'error' } }`; with all checks healthy it returns 200 and `{ status: 'ok' }`. This pins the Review Focus item "Mongo or Redis down".

- [ ] **Step 4: Run and record the baseline**

Run: `pnpm test:unit`
Expected: specs execute; failures are real assertions, not `MODULE_NOT_FOUND` or `ts-jest not found`.
Run: `pnpm test:integration`
Expected: same, with route failures limited to the `/api/analysis` mount.

- [ ] **Step 5: Commit**

```bash
git add tests/jest.unit.config.cjs tests/jest.integration.config.cjs tests/unit
git commit -m "test: fix jest rootDir and stale spec imports"
```

## Task 2: Enable the Angular test target

**Files:**
- Modify: `src/web/angular.json` (test target options)
- Modify: `tests/web/app.component.spec.ts`
- Delete: `src/web/tsconfig.spec.json` (unused)
- Test: `pnpm test:web`

**Interfaces:**
- Produces: Karma discovers `tests/web/**/*.spec.ts`.

- [ ] **Step 1: Add the include glob** to the test target options: `"include": ["../../tests/web/**/*.spec.ts"]`.

- [ ] **Step 2: Provide test doubles in the existing spec** so the shell compiles without a live backend: `provideHttpClient()`, `provideHttpClientTesting()`, `provideRouter([])`.

- [ ] **Step 3: Run**

Run: `pnpm test:web -- --browsers=ChromeHeadless`
Expected: at least two specs execute. If Chrome is missing, record `CHROME_BIN` in the README and skip only the browser run.

- [ ] **Step 4: Commit**

```bash
git add src/web/angular.json tests/web
git commit -m "test(web): discover specs from the root tests directory"
```

## Task 3: Normalize provider selection

**Files:**
- Modify: `src/api/src/modules/analyses/providers/analysis-provider.registry.ts`
- Modify: `src/api/src/modules/analyses/analyses.module.ts:76-92`
- Test: `tests/unit/analysis-provider-registry.spec.ts`

**Interfaces:**
- Produces: `AnalysisProviderRegistry.analyze(logs: LogEntryInterface[]): Promise<{ result: AnalysisResultInterface; provider: ProviderName }>` returning the matched adapter's canonical name.
- Produces: factory mapping `openai|anthropic|gemini` (any case) to the matching adapter; unknown names log a warning and register nothing.

- [ ] **Step 1: Write the failing test**

```ts
it('matches configured provider names case-insensitively', async () => {
  config.get.mockImplementation((key: string) =>
    key === 'AI_PROVIDER' ? 'anthropic' : undefined,
  );
  const result = await registry.analyze([]);
  expect(result.provider).toBe('Anthropic');
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm test:unit -- analysis-provider-registry`
Expected: FAIL, provider resolves to OpenAI or no provider is found.

- [ ] **Step 3: Implement normalization**

Compare with `candidate.name.toLowerCase() === name.trim().toLowerCase()`; return `provider.name`. In the factory switch, compare `case ProviderName.ANTHROPIC.toLowerCase():` etc., and use `default:` only to log `Unknown AI provider "<name>"`.

- [ ] **Step 4: Run and confirm GREEN**, then commit:

```bash
git add src/api/src/modules/analyses tests/unit/analysis-provider-registry.spec.ts
git commit -m "fix(analyses): match provider names case-insensitively"
```

## Task 4: Fix provider response extraction

**Files:**
- Modify: `src/api/src/modules/analyses/providers/base-analysis.provider.ts:61-80`
- Modify: `src/api/src/modules/analyses/providers/anthropic-analysis.provider.ts:37-42`
- Test: `tests/unit/anthropic-analysis.provider.spec.ts`, `gemini-analysis.provider.spec.ts`, `openai-analysis.provider.spec.ts`

**Interfaces:**
- Produces: `protected getTextContent(value: unknown, providerName: string, path: Array<string | number>): string` traverses objects and arrays; a numeric segment indexes an array; any type mismatch throws `ServiceUnavailableException`.
- Anthropic path becomes `['content', 0, 'text']`.

- [ ] **Step 1: Write the failing test**

```ts
it('parses the Messages API content array', async () => {
  post.mockResolvedValue({
    data: { content: [{ type: 'text', text: JSON.stringify(result) }] },
  });
  await expect(provider.analyze([])).resolves.toEqual(result);
});
```

- [ ] **Step 2: Run and confirm RED** (`pnpm test:unit -- anthropic`)
Expected: FAIL with "Anthropic returned an invalid analysis response".

- [ ] **Step 3: Implement array traversal**

In the loop: if `typeof key === 'number'` require `Array.isArray(current)` and index it; otherwise require a non-array object and read the property. Keep the existing error message. Update Anthropic's path to `['content', 0, 'text']`.

- [ ] **Step 4: Confirm GREEN for all three adapters**, then commit:

```bash
git add src/api/src/modules/analyses/providers tests/unit
git commit -m "fix(analyses): traverse provider response arrays and fix anthropic path"
```

## Task 5: Cover malformed payloads and timeouts

**Files:**
- Modify: `tests/unit/openai-analysis.provider.spec.ts`, `anthropic-analysis.provider.spec.ts`, `gemini-analysis.provider.spec.ts`

**Interfaces:**
- Consumes: adapters from Task 4.

- [ ] **Step 1: Add three cases per adapter**

```ts
it('rejects a non-JSON completion with 503', async () => {
  post.mockResolvedValue({ data: { choices: [{ message: { content: 'not json' } }] } });
  await expect(provider.analyze([])).rejects.toMatchObject({ status: 503 });
});

it('rejects a JSON payload that misses the contract', async () => {
  post.mockResolvedValue({ data: { choices: [{ message: { content: '{"summary":"x"}' } }] } });
  await expect(provider.analyze([])).rejects.toMatchObject({ status: 503 });
});

it('propagates a timeout as a failed call', async () => {
  post.mockRejectedValue(Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' }));
  await expect(provider.analyze([])).rejects.toThrow(/timeout/i);
});
```

- [ ] **Step 2: Run**

Run: `pnpm test:unit`
Expected: PASS for all nine cases. If a case fails, fix the adapter, not the assertion.

- [ ] **Step 3: Commit**

```bash
git add tests/unit
git commit -m "test(analyses): cover malformed provider payloads and timeouts"
```

## Task 6: Move analyses to /api/analysis

**Files:**
- Modify: `src/api/src/modules/analyses/analyses.controller.ts`
- Create: `src/api/src/modules/analyses/log-analysis.controller.ts`
- Modify: `src/api/src/modules/analyses/analyses.module.ts` (controllers array)
- Test: `tests/integration/analyses.integration.spec.ts`

**Interfaces:**
- Produces: `AnalysesController` at `@Controller('analysis')` with `findAll`, `findOne`.
- Produces: `LogAnalysisController` at `@Controller('logs')` with `@Post('analyze') enqueue(dto: AnalyzeLogsDto)`.

- [ ] **Step 1: Update the integration test** to register both controllers and assert `GET /api/analysis` → 200 and `POST /api/logs/analyze` → 202. In `tests/integration/logs.integration.spec.ts`, add the strict-pagination assertions: `GET /api/logs?limit=101` → 400, `GET /api/logs?limit=0` → 400, `GET /api/logs?offset=-1` → 400, each with the shared `{ statusCode, message, error }` body.

- [ ] **Step 2: Run and confirm RED** (`pnpm test:integration -- analyses`)
Expected: 404 on `/api/analysis`.

- [ ] **Step 3: Split the controllers** as described; keep Swagger tags and `@HttpCode(HttpStatus.ACCEPTED)` on enqueue.

- [ ] **Step 4: Confirm GREEN**, then commit:

```bash
git add src/api/src/modules/analyses tests/integration/analyses.integration.spec.ts
git commit -m "fix(analyses): serve analyses under /api/analysis"
```

## Task 7: Honor API_PORT locally

**Files:**
- Create: `src/api/src/config/resolve-port.ts`
- Modify: `src/api/src/main.ts` (listen call)
- Test: `tests/unit/resolve-port.spec.ts`

**Interfaces:**
- Produces: `export function resolvePort(env: NodeJS.ProcessEnv): number` → `PORT`, then `API_PORT`, then `3000`; non-numeric values fall through.

- [ ] **Step 1: Write the failing test** with cases `{PORT:'4000'} → 4000`, `{API_PORT:'3001'} → 3001`, `{} → 3000`, `{PORT:'abc',API_PORT:'3002'} → 3002`.

- [ ] **Step 2: RED**, implement, **GREEN**, then commit:

```bash
git add src/api/src/config tests/unit/resolve-port.spec.ts src/api/src/main.ts
git commit -m "fix(api): fall back to API_PORT when PORT is unset"
```

## Task 8: Expose the dead-letter queue

**Files:**
- Create: `src/api/src/modules/analyses/dto/list-dead-letters-query.dto.ts`
- Modify: `src/api/src/modules/analyses/analyses.service.ts`
- Modify: `src/api/src/modules/analyses/analyses.controller.ts`
- Test: `tests/unit/analyses.service.spec.ts` (new), `tests/integration/analyses.integration.spec.ts`

**Interfaces:**
- Produces: `AnalysesService.findDeadLetters(query): Promise<{ items: DeadLetterJob[]; total: number; limit: number; offset: number }>`
- Produces: `export interface DeadLetterJob { id: string; analysisId: string; failedReason: string; attempts: number; createdAt: string }`
- Produces: route `GET /api/analysis/dead-letter` declared **before** `@Get(':id')`.

- [ ] **Step 1: Write the failing unit test** with a fake queue `{ getWaitingCount: () => 1, getJobs: jest.fn().mockResolvedValue([{ id: 'j1', data: { analysisId: 'a1', attempts: 3, failedReason: 'boom' }, timestamp: 1 }]) }`; expect the mapped `DeadLetterJob`.

- [ ] **Step 2: RED**, implement with `getWaitingCount()` and `getJobs(['waiting'], offset, offset + limit - 1)`, **GREEN**.

- [ ] **Step 3: Integration test** asserts `GET /api/analysis/dead-letter?limit=10` → 200 with `{ items, total, limit, offset }` and that `GET /api/analysis/dead-letter` is not captured by `:id`.

- [ ] **Step 4: Commit**

```bash
git add src/api/src/modules/analyses tests
git commit -m "feat(analyses): expose dead-letter jobs"
```

## Task 9: Prove terminal failures reach the DLQ

**Files:**
- Test: `tests/unit/analysis.processor.spec.ts` (new)

**Interfaces:**
- Consumes: `AnalysisProcessor.handleFailed(job, error)` from `analysis.processor.ts:70-109`.

- [ ] **Step 1: Write two cases**

```ts
it('does not dead-letter a job that still has attempts left', async () => {
  await processor.handleFailed(job({ attemptsMade: 1, attempts: 3 }), new Error('x'));
  expect(deadLetterQueue.add).not.toHaveBeenCalled();
});

it('dead-letters a job after its last attempt', async () => {
  await processor.handleFailed(job({ attemptsMade: 3, attempts: 3 }), new Error('boom'));
  expect(deadLetterQueue.add).toHaveBeenCalledWith(
    'analysis-failed',
    expect.objectContaining({ analysisId: expect.any(String), attempts: 3 }),
    expect.any(Object),
  );
});
```

- [ ] **Step 2: Run** `pnpm test:unit -- analysis.processor`. Expected: PASS. If the guard `attemptsMade < attempts` is off by one, fix the processor and keep the test.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/analysis.processor.spec.ts
git commit -m "test(analyses): cover dead-letter terminal failure"
```

## Task 10: Add the aggregation endpoint

**Files:**
- Create: `src/api/src/modules/logs/dto/log-stats-query.dto.ts`
- Modify: `src/api/src/modules/logs/logs.service.ts`
- Modify: `src/api/src/modules/logs/logs.controller.ts`
- Test: `tests/unit/logs.service.spec.ts` (new), `tests/integration/logs.integration.spec.ts`

**Interfaces:**
- Produces: `LogStatsQueryDto { groupBy: 'service' | 'level' = 'service'; from?: string; to?: string }`.
- Produces: `LogsService.getStats(query): Promise<{ groupBy: 'service' | 'level'; from: string | null; to: string | null; total: number; buckets: Array<{ key: string; count: number }> }>`.
- Produces: `GET /api/logs/stats`.
- Produces: pipeline `$match` (timestamp `$gte`/`$lte`, inclusive) → `$group` by `$${groupBy}` → `$sort { count: -1, _id: 1 }` → `$limit 100`; `total` from `countDocuments(match)`.

- [ ] **Step 1: Failing unit test** with a fake repository returning `[{ _id: 'payment-api', count: 3 }]` and `countDocuments: 3`; expect `buckets: [{ key: 'payment-api', count: 3 }]` and `total: 3`. Add an empty case: `[]` and `0` → `{ total: 0, buckets: [] }`.

- [ ] **Step 2: RED**, implement, **GREEN**.

- [ ] **Step 3: Integration test** for 400 cases: `groupBy=invalid`, `from=not-a-date`, `from > to`; and 200 shape.

- [ ] **Step 4: Commit**

```bash
git add src/api/src/modules/logs tests
git commit -m "feat(logs): add aggregation by service or level"
```

## Task 11: Add index tooling

**Files:**
- Create: `src/api/src/db/indexes.ts`
- Create: `src/api/src/db/scripts/create-indexes.ts`
- Modify: `src/api/package.json` (`db:indexes`)
- Test: `tests/unit/indexes.spec.ts`

**Interfaces:**
- Produces: `export const INDEX_DEFINITIONS: Array<{ collection: 'logs' | 'analyses'; keys: Record<string, 1 | -1>; name: string }>` with logs: `timestamp:-1`, `service:1,timestamp:-1`, `level:1,timestamp:-1`; analyses: `status:1,createdAt:-1`.
- Produces: `formatIndexCommands(defs): string[]` for dry-run output.

- [ ] **Step 1: Failing test** asserts five definitions and that `formatIndexCommands(INDEX_DEFINITIONS)` contains `logs.timestamp_-1`.
- [ ] **Step 2: RED**, implement, **GREEN**.
- [ ] **Step 3: Script** connects with `AppDataSource` unless `--dry-run`, then creates indexes per definition.
- [ ] **Step 4: Commit**

```bash
git add src/api/src/db src/api/package.json tests/unit/indexes.spec.ts
git commit -m "feat(db): add mongodb index script"
```

## Task 12: Add demo seed data

**Files:**
- Create: `src/api/src/db/seeds/demo-data.ts`
- Create: `src/api/src/db/scripts/seed.ts`
- Modify: `src/api/package.json` (`seed`)
- Test: `tests/unit/demo-data.spec.ts`

**Interfaces:**
- Produces: `buildDemoLogs(now: Date): CreateLogDto[]` → 40 entries across `payment-api`, `auth-service`, `catalog-api`, `notifications-worker`, levels `debug|log|warn|error|fatal`, spread over 7 days.
- Produces: `buildDemoAnalyses(logIds: string[], now: Date)` → 2 analyses (`completed` with a result, `failed` with an error).
- Script supports `--dry-run` and `--reset`.

- [ ] **Step 1: Failing test** asserts length 40, four distinct services, at least three levels, timestamps within the last 7 days, and `buildDemoAnalyses` statuses.
- [ ] **Step 2: RED**, implement, **GREEN**.
- [ ] **Step 3: Commit**

```bash
git add src/api/src/db tests/unit/demo-data.spec.ts src/api/package.json
git commit -m "feat(db): add demo seed dataset and script"
```

## Task 13: Add the Makefile

**Files:**
- Create: `Makefile`

**Interfaces:**
- Produces targets: `install`, `dev`, `build`, `test`, `test-unit`, `test-integration`, `test-web`, `seed`, `indexes`, `up`, `down`, `logs`, `help`.

- [ ] **Step 1: Write the Makefile** with `.PHONY` for every target; `help` prints target descriptions.
- [ ] **Step 2: Verify** `make help` and `make -n build` print the expected commands.
- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "chore: add makefile for install, build, test and stack commands"
```

## Task 14: Structured logging

**Files:**
- Create: `src/api/src/common/logging/json-logger.service.ts`
- Create: `src/api/src/common/logging/request-logging.middleware.ts`
- Modify: `src/api/src/main.ts`
- Test: `tests/unit/json-logger.spec.ts`, `tests/unit/request-logging.middleware.spec.ts`

**Interfaces:**
- Produces: `JsonLoggerService implements LoggerService` writing one JSON line to stdout: `{ timestamp, level, context?, message, ...meta }`.
- Produces: `RequestLoggingMiddleware` assigning `req.id` (from `x-request-id` or `randomUUID()`), setting the response header, and logging `{ requestId, method, path, status, durationMs }` on `finish`.

- [ ] **Step 1: Failing tests** — logger emits parseable JSON with the `level` field; middleware reuses an inbound `x-request-id`, generates one when absent, and logs once on finish (fake `EventEmitter` response).
- [ ] **Step 2: RED**, implement, **GREEN**.
- [ ] **Step 3: Wire in `main.ts`** with `app.useLogger(new JsonLoggerService())` and `app.use(new RequestLoggingMiddleware())`.
- [ ] **Step 4: Commit**

```bash
git add src/api/src/common/logging src/api/src/main.ts tests/unit
git commit -m "feat(api): add structured json logging and request correlation"
```

## Task 15: Align the web API client

**Files:**
- Modify: `src/web/src/app/logs-api.service.ts`
- Test: `tests/web/logs-api.service.spec.ts` (new)

**Interfaces:**
- Produces: `listLogs(params: { limit: number; offset: number; service?: string; level?: string; from?: string; to?: string }): Observable<Page<LogEntry>>`
- Produces: `listLogsStats(params: { groupBy: 'service' | 'level'; from?: string; to?: string }): Observable<LogStats>`
- Produces: `listDeadLetters(limit: number, offset: number): Observable<Page<DeadLetterJob>>`
- Produces: `listAnalyses(limit, offset, status?)` calling `/analysis`.

- [ ] **Step 1: Failing test** with `provideHttpClientTesting()`: each method hits the documented URL, and filters become query params (empty filters omitted).
- [ ] **Step 2: RED**, implement, **GREEN**.
- [ ] **Step 3: Commit**

```bash
git add src/web/src/app/logs-api.service.ts tests/web/logs-api.service.spec.ts
git commit -m "feat(web): align api client with the final contract"
```

## Task 16: Pagination component

**Files:**
- Create: `src/web/src/app/shared/pagination/pagination.component.ts`, `.html`, `.scss`
- Test: `tests/web/pagination.component.spec.ts`

**Interfaces:**
- Produces: inputs `total: number`, `limit: number`, `offset: number`; output `pageChange: { limit: number; offset: number }`.
- Produces: shown text `Showing 1–20 of 84`; page sizes `[10, 20, 50]`; previous disabled at offset 0; next disabled when `offset + limit >= total`.

- [ ] **Step 1: Failing tests** for range text, disabled boundaries, size change resetting offset to 0, and next emitting `offset + limit`.
- [ ] **Step 2: RED**, implement, **GREEN**.
- [ ] **Step 3: Commit**

```bash
git add src/web/src/app/shared/pagination tests/web/pagination.component.spec.ts
git commit -m "feat(web): add pagination component"
```

## Task 17: Logs page

**Files:**
- Create: `src/web/src/app/pages/logs/logs-page.component.ts`, `.html`, `.scss`
- Test: `tests/web/logs-page.component.spec.ts`

**Interfaces:**
- Consumes: `LogsApiService.listLogs` and `createLog`.
- Produces: filter form (`service`, `level`, `from`, `to`), ingest form (`service`, `level`, `message`), table with row selection, analyze-selected action, pagination wiring, error banner and empty state.
- Produces: when a page returns `items: []` and `offset > 0`, reset to the last valid offset.

- [ ] **Step 1: Failing tests** — renders rows; empty dataset shows "No logs yet"; a 400 shows the API message; a page change calls `listLogs` with the new offset.
- [ ] **Step 2: RED**, implement, **GREEN**.
- [ ] **Step 3: Commit**

```bash
git add src/web/src/app/pages/logs tests/web/logs-page.component.spec.ts
git commit -m "feat(web): add paginated logs page with filters and ingestion"
```

## Task 18: Analyses page

**Files:**
- Create: `src/web/src/app/pages/analyses/analyses-page.component.ts`, `.html`, `.scss`
- Test: `tests/web/analyses-page.component.spec.ts`

**Interfaces:**
- Consumes: `listAnalyses`, `getAnalysis`, `listDeadLetters`.
- Produces: status filter, paginated list, badges per status, result summary/insights, polling every 2.5 s while a job is `queued|processing`, dead-letter section with failed reason and attempts.

- [ ] **Step 1: Failing tests** with `fakeAsync`/`tick`: polling stops on `completed`; failed job shows the error; dead-letter list renders reason and attempts.
- [ ] **Step 2: RED**, implement, **GREEN**.
- [ ] **Step 3: Commit**

```bash
git add src/web/src/app/pages/analyses tests/web/analyses-page.component.spec.ts
git commit -m "feat(web): add analyses page with polling and dead-letter view"
```

## Task 19: Shell, routes and styles

**Files:**
- Modify: `src/web/src/app/app.component.ts`, `.html`, `.scss`
- Modify: `src/web/src/app/app.routes.ts`
- Modify: `src/web/src/styles.scss`
- Test: `tests/web/app.component.spec.ts`

**Interfaces:**
- Produces: routes `''` → redirect `logs`, `logs` → `LogsPageComponent`, `analyses` → `AnalysesPageComponent`, `**` → redirect `logs`.
- Produces: shell with nav links and `router-outlet`; a light theme expressed through CSS custom properties (`--surface`, `--text`, `--accent`, `--danger`, `--radius`, `--space-*`) in `styles.scss`.
- Constraint: each component stylesheet stays under 11 kB.

- [ ] **Step 1: Failing test** for the route table and the rendered nav.
- [ ] **Step 2: RED**, implement, **GREEN**; run `pnpm build:web` and confirm no budget error.
- [ ] **Step 3: Commit**

```bash
git add src/web/src/app src/web/src/styles.scss tests/web/app.component.spec.ts
git commit -m "feat(web): add routed shell and design tokens"
```

## Task 20: Swagger schemas from types

**Files:**
- Modify: `src/api/nest-cli.json`
- Modify: `src/api/src/main.ts` (Swagger document setup, only if the plugin output needs a schema path)
- Test: manual — `GET /api/docs-json`

**Interfaces:**
- Produces: `@nestjs/swagger` CLI plugin configuration that emits `@ApiProperty` metadata from DTO TypeScript types, so no DTO hand-writes schema decorators.
- Produces: `GET /api/docs-json` listing every route in the Global Constraints list with request and response schemas.

- [ ] **Step 1: Enable the plugin**

```json
{
  "compilerOptions": {
    "plugins": ["@nestjs/swagger"]
  }
}
```

- [ ] **Step 2: Rebuild and inspect the generated document**

Run: `pnpm build:api && node dist/api/main.js` (or `pnpm start:api`), then `curl -u "$HTTP_AUTH_USERNAME:$HTTP_AUTH_PASSWORD" http://localhost:8080/api/docs-json`.
Expected: each DTO in `logs/dto` and `analyses/dto` appears under `components.schemas` with its properties and required list.

- [ ] **Step 3: Commit**

```bash
git add src/api/nest-cli.json
git commit -m "feat(api): derive swagger schemas from dto types"
```

## Task 21: README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces sections: Requisitos, Levantar (local, Docker, Makefile), Tests (unit, integration, web, ChromeHeadless note), API, Scripts, Variables, DLQ, Troubleshooting.

- [ ] **Step 1: Rewrite the required sections** with exact commands from the repo (`pnpm`, `make`, `docker compose`).
- [ ] **Step 2: Verify every documented command exists** in `package.json` or the `Makefile`, and every route exists in the controllers.
- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document setup, tests, scripts and endpoints"
```

## Task 22: Architecture decision log

**Files:**
- Modify: `ARCHITECTURE.md`

**Interfaces:**
- Produces: a decisions table with columns `Decision | Alternative discarded | Why` covering the 16 decisions in the spec, an updated Mermaid diagram including the DLQ, stats endpoint and polling, and corrected route/queue names.

- [ ] **Step 1: Add the decision table and update the diagram.**
- [ ] **Step 2: Cross-check** every path, queue name, script name and command against the code.
- [ ] **Step 3: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs: record architecture decisions and discarded alternatives"
```

## Final verification (host)

```bash
make test
docker compose build --no-cache api web proxy
docker compose up -d --force-recreate
curl -u "$HTTP_AUTH_USERNAME:$HTTP_AUTH_PASSWORD" http://localhost:8080/api/health/live
curl -u "$HTTP_AUTH_USERNAME:$HTTP_AUTH_PASSWORD" http://localhost:8080/api/logs?limit=5
curl -u "$HTTP_AUTH_USERNAME:$HTTP_AUTH_PASSWORD" "http://localhost:8080/api/logs/stats?groupBy=level"
curl -u "$HTTP_AUTH_USERNAME:$HTTP_AUTH_PASSWORD" http://localhost:8080/api/docs-json | head -c 200
```
