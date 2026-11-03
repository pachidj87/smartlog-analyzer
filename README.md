# SmartLog Analyzer

Herramienta interna de observabilidad: los microservicios envían logs estructurados, SmartLog los almacena en MongoDB y ejecuta análisis asíncronos con IA (resúmenes, categorización y sugerencias) mediante un proveedor configurable. El monorepo usa pnpm, una API NestJS y un panel Angular 19 detrás de un único proxy inverso Nginx.

La arquitectura, las decisiones y las alternativas descartadas están en [ARCHITECTURE.md](./ARCHITECTURE.md).

## Requisitos

- Node.js 22+ y pnpm 9.15.9 (`corepack enable`).
- Docker Engine y Docker Compose v2 para levantar el stack completo.
- Chrome o Chromium para las pruebas Angular/Karma.

## Inicio rápido (local)

```bash
corepack enable
pnpm install
cp .env.example .env
set -a && . ./.env && set +a

docker compose up -d mongodb redis   # solo la infraestructura
pnpm start:api                       # http://localhost:3000/api
pnpm start:web                       # http://localhost:4200
```

`src/web/proxy.conf.json` reenvía `/api` desde el servidor de desarrollo al puerto `API_PORT`; así, el panel funciona sin CORS. La API lee `MONGODB_URI` y `REDIS_URL`, configuradas para los puertos locales publicados por Compose.

- Swagger UI: `http://localhost:3000/api/docs` (JSON en `/api/docs-json`).
- Disponibilidad: `GET /api/health`; proceso activo: `GET /api/health/live`.

Con MongoDB disponible, se pueden ejecutar las migraciones y cargar datos de demostración:

```bash
pnpm --filter smartlog-api run db:migrate -- --dry-run  # mostrar migraciones
pnpm --filter smartlog-api run db:migrate               # aplicar pendientes
pnpm --filter smartlog-api run db:migrate -- --rollback 002-analysis-indexes
pnpm --filter smartlog-api run seed -- --dry-run        # vista previa
pnpm --filter smartlog-api run seed                     # insertar logs y análisis demo
pnpm --filter smartlog-api run seed -- --reset          # borrar logs/análisis antes de insertar
pnpm --filter smartlog-api run db:indexes               # crear índices sin versionarlos
```

Las migraciones se registran en `_smartlog_migrations` y se revierten de la más reciente a la más antigua. `--rollback` requiere el identificador de una migración aplicada. El seed es repetible con `--reset`; si no se usa esa opción, añade otro conjunto de datos.

## Docker Compose

```bash
cp .env.example .env
# Cambia HTTP_AUTH_PASSWORD y las claves de los proveedores de IA antes de iniciar.
docker compose up --build
```

Nginx sirve todo en `http://localhost:8080` (autenticación básica con `HTTP_AUTH_USERNAME` / `HTTP_AUTH_PASSWORD`):

- Panel: `/`
- API: `/api`
- Swagger: `/api/docs`

Solo el proxy publica un puerto en el host. MongoDB y Redis se enlazan a `127.0.0.1` para herramientas locales; API y panel permanecen en la red privada de Compose. MongoDB y Redis deben estar saludables antes de iniciar la API. La comprobación de salud del contenedor API usa `/api/health/live`, para que una caída del proveedor de IA no marque el contenedor como no saludable.

La autenticación básica no cifra las credenciales. Para despliegues no locales, termina TLS delante del proxy.

Detén el stack con `docker compose down`; los volúmenes `mongodb_data` y `redis_data` conservan los datos. `docker compose down -v` los elimina.

## Comandos Make

| Comando | Función |
|---|---|
| `make install` | `pnpm install` |
| `make dev` | Ejecutar API y panel en desarrollo |
| `make build` | Compilar API y panel |
| `make test` | Pruebas unitarias, integración y web |
| `make test-unit` | Pruebas unitarias de la API |
| `make test-integration` | Pruebas HTTP de integración |
| `make test-web` | Pruebas Angular/Karma |
| `make seed ARGS="--reset"` | Ejecutar el seed con opciones |
| `make indexes ARGS="--dry-run"` | Crear o previsualizar índices |
| `make migrate ARGS="--dry-run"` | Aplicar o previsualizar migraciones |
| `make up` / `make down` | Iniciar/detener Compose |
| `make logs` | Seguir los logs de Compose |

## Pruebas

```bash
pnpm test               # todas las suites
pnpm test:unit          # Jest: unitarias de API
pnpm test:integration   # Jest + Supertest sobre un módulo Nest de pruebas
pnpm test:web           # Angular/Karma (ChromeHeadless)
pnpm build              # compilación de producción de API y panel
```

Las pruebas de integración sustituyen MongoDB, Redis, BullMQ y las llamadas HTTP a IA; no requieren servicios externos. Cubren límites de paginación, filtros, agregación, cola de fallos, validación del contrato del proveedor, timeouts y formato uniforme de errores.

Karma ejecuta Chrome sin sandbox cuando el proceso es root (`src/web/karma.conf.cjs`). Si Chrome no está en `PATH`, configura `CHROME_BIN`.

## API

Todas las rutas usan el prefijo `/api`. Los errores comparten esta estructura:

```json
{ "statusCode": 400, "error": "Bad Request", "message": "...", "path": "/api/logs", "timestamp": "..." }
```

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/logs` | Ingerir un log (`service`, `timestamp`, `level`, `message`, `metadata` opcional) |
| `GET` | `/api/logs` | Listar logs con filtros y paginación |
| `GET` | `/api/logs/stats` | Agrupar por `groupBy=service\|level` y rango opcional |
| `POST` | `/api/logs/analyze` | Encolar `{ logIds, prompt? }`; el prompt es opcional en la API (hasta 4000 caracteres), pero la interfaz web lo exige; responde `202` |
| `GET` | `/api/analysis` | Listar análisis con paginación y filtro opcional por estado |
| `GET` | `/api/analysis/dead-letter` | Consultar trabajos fallidos, solo lectura |
| `GET` | `/api/analysis/{id}` | Consultar estado y resultado de un análisis |
| `GET` | `/api/health` | Disponibilidad de API, Mongo, Redis, IA y memoria |
| `GET` | `/api/health/live` | Comprobar que el proceso responde |

`limit` vale 20 por defecto y debe estar entre 1 y 100; `offset` vale 0 por defecto y no puede ser negativo. Los valores inválidos producen `400` en lugar de ajustarse silenciosamente. Las respuestas de listas usan `{ items, total, limit, offset }`.

### Agregación

`GET /api/logs/stats?groupBy=level&from=...&to=...` devuelve:

```json
{
  "groupBy": "level",
  "from": "2026-11-01T00:00:00.000Z",
  "to": null,
  "total": 12,
  "buckets": [{ "key": "error", "count": 7 }]
}
```

Los grupos se ordenan por cantidad descendente y luego por clave ascendente; se limita la respuesta a 100 grupos. El rango incluye el `timestamp` del log y se rechaza con `400` si `from` es posterior a `to`.

### Cola de fallos

Al agotarse `AI_RETRY_ATTEMPTS`, un trabajo pasa de `analysis-queue` a `analysis-dead-letter-queue` y su análisis se marca como `failed`. `GET /api/analysis/dead-letter` expone `analysisId`, `failedReason`, `attempts` y `createdAt`. La cola es de solo lectura; para reintentar, elimina el trabajo o vuelve a enviar `POST /api/logs/analyze`.

### Proveedores de IA

Hay adaptadores nativos para OpenAI (Chat Completions), Anthropic (Messages) y Gemini (`generateContent`). `AI_PROVIDER` selecciona el proveedor principal y `AI_FALLBACK_PROVIDER` el de respaldo. Cada proveedor tiene URL, endpoint de salud y clave propios. Sus nombres se comparan sin distinguir mayúsculas, pero se guardan con su forma canónica (`OpenAI`, `Anthropic`, `Gemini`).

La respuesta del modelo debe cumplir el contrato JSON documentado (`summary` e `insights[]`). Una respuesta no válida provoca un error `503` en el trabajo de análisis y se reintenta; el fallo final se envía a la cola de fallos. Las claves nunca se envían al navegador.

## Modelo de datos

| Colección | Propósito | Campos principales |
|---|---|---|
| `logs` | Logs ingeridos | `service` (slug en minúsculas), `timestamp`, `level`, `message`, `metadata` opcional, `ingestedAt` |
| `analyses` | Trabajos de análisis | `logIds`, `status`, `provider`, `prompt` opcional, `result`, `error`, `attempts`, fechas |

## Variables de entorno

| Variable | Propósito |
|---|---|
| `PROXY_PORT` | Puerto de Nginx publicado en el host (por defecto 8080) |
| `HTTP_AUTH_USERNAME`, `HTTP_AUTH_PASSWORD` | Credenciales de autenticación básica |
| `API_PORT` | Puerto interno de la API y destino de proxy |
| `NODE_ENV` | Entorno de ejecución |
| `MONGO_PORT`, `REDIS_PORT` | Puertos locales para herramientas de desarrollo |
| `MONGODB_IMAGE`, `REDIS_IMAGE` | Imágenes de infraestructura |
| `MONGODB_INITDB_ROOT_USERNAME`, `MONGODB_INITDB_ROOT_PASSWORD`, `MONGODB_DATABASE` | Inicialización de MongoDB |
| `MONGODB_URI`, `REDIS_URL`, `APP_BASE_URL` | Direcciones para procesos ejecutados en el host |
| `MONGODB_URI_DOCKER`, `REDIS_URL_DOCKER`, `APP_BASE_URL_DOCKER` | Direcciones dentro de la red Compose |
| `REDIS_PASSWORD` | Autenticación de Redis |
| `CACHE_TTL_SECONDS` | TTL de la caché de listados de logs |
| `AI_PROVIDER`, `AI_FALLBACK_PROVIDER` | Proveedores de IA principal y respaldo |
| `AI_PROVIDER_<NAME>_URL`, `AI_PROVIDER_<NAME>_HEALTH_URL`, `AI_PROVIDER_<NAME>_API_KEY` | Endpoint, salud y clave de cada proveedor |
| `AI_PROVIDER_OPENAI_MODEL`, `AI_PROVIDER_ANTHROPIC_MODEL` | Modelos de OpenAI y Anthropic |
| `AI_PROVIDER_GEMINI_MODEL` | Modelo de Gemini; `AI_PROVIDER_GEMINI_URL` lo interpola (por defecto `gemini-flash-lite-latest`) |
| `AI_REQUEST_TIMEOUT_MS`, `AI_HEALTH_TIMEOUT_MS` | Timeouts de las peticiones de IA |
| `AI_RETRY_ATTEMPTS`, `AI_RETRY_BACKOFF_MS` | Reintentos y espera exponencial de BullMQ |
| `HEALTH_CHECK_MEMORY_HEAP_LIMIT`, `HEALTH_CHECK_MEMORY_RSS_LIMIT` | Límites de memoria en MiB |

`.env.example` contiene solo valores de ejemplo. `/api/health` responderá `503` mientras las claves de IA sigan siendo marcadores; `/api/health/live` seguirá indicando que el proceso está activo.

## Solución de problemas

- **`/api/health` responde 503**: esperado con claves de IA de ejemplo. Revisa el indicador fallido del cuerpo; `/api/health/live` solo comprueba el proceso.
- **El panel responde 401/403**: Nginx tiene autenticación básica; usa las credenciales de `.env` o llama a la API directamente en desarrollo.
- **Karma no inicia Chrome**: configura `CHROME_BIN` con la ruta del navegador existente.
- **El seed o las migraciones no conectan**: MongoDB debe estar disponible y `MONGODB_URI` exportada en la shell.
- **Un análisis queda en `queued`**: comprueba Redis y el worker de la API; los reintentos terminan en la cola de fallos.
