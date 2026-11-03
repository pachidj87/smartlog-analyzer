# SmartLog Analyzer

Monorepo de una herramienta interna para recibir logs de microservicios, persistirlos en MongoDB y generar análisis asíncronos mediante proveedores de IA configurables. La API NestJS y el dashboard Angular comparten pnpm workspaces; los servicios externos locales son MongoDB y Redis.

La arquitectura y las decisiones técnicas vigentes están en [ARCHITECTURE.md](./ARCHITECTURE.md).

## Requisitos

- Node.js 22+ con Corepack y pnpm 9.15.9.
- Docker Engine y Docker Compose v2.
- Chrome/Chromium para ejecutar tests Angular con Karma.

## Estructura

```text
smartlog-analyzer/
├── src/
│   ├── api/           # API NestJS
│   │   └── src/db/    # DataSource, migraciones y seeds
│   └── web/           # Dashboard Angular 19
├── tests/             # Unitarios, integración HTTP y Angular/Karma
├── Dockerfile
├── nginx-proxy.conf.template
├── nginx-proxy-entrypoint.sh
├── docker-compose.yml
├── ARCHITECTURE.md
└── .env.example
```

## Desarrollo local

```bash
corepack enable
pnpm install
cp .env.example .env
set -a
. ./.env
set +a
docker compose up -d mongodb redis
NODE_ENV=development pnpm start:api
NODE_ENV=development pnpm start:web
```

La API local usa `MONGODB_URI` y `REDIS_URL` del `.env`, que apuntan a los puertos de loopback publicados por MongoDB y Redis. `src/web/proxy.conf.json` reenvía `/api` desde `http://localhost:4200` a la API local en el puerto definido por `API_PORT`. El stack Compose utiliza las variantes `*_DOCKER` para resolver los servicios por DNS privado.

Swagger: `http://localhost:3000/api/docs`.

## Tests y build

Todos los tests se gestionan desde `tests/` raíz:

```bash
pnpm test                 # Unit + integración HTTP + Angular/Karma
pnpm test:unit
pnpm test:integration
pnpm test:web
pnpm build                # API y Angular
```

Los tests HTTP usan Nest TestingModule y Supertest con collaborators aislados para probar rutas, DTOs, códigos HTTP y respuestas. Angular/Karma requiere Chrome o Chromium instalado.

Limitación conocida: `pnpm test:unit` falla antes de ejecutar specs porque `tests/jest.unit.config.cjs` fija `rootDir` en la raíz del repo y `ts-jest` solo está instalado en `src/api` (`Module ts-jest in the transform option was not found`). Además, algunos specs importan rutas previas al refactor. El build y la ejecución de la API no se ven afectados.

## API mínima

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/logs` | Ingestar log |
| `GET` | `/api/logs` | Listar logs, filtros y paginado |
| `POST` | `/api/logs/analyze` | Encolar análisis; responde `202` |
| `GET` | `/api/analysis` | Listar análisis, filtro de estado y paginado |
| `GET` | `/api/analysis/{id}` | Consultar estado/resultado |
| `GET` | `/api/health` | Readiness: API, Mongo, cache Redis, IA y memoria |
| `GET` | `/api/health/live` | Liveness: proceso activo, sin dependencias |

Ambos listados aceptan `limit` (20 por defecto, máximo 100) y `offset` (0 por defecto). El dashboard sondea las tareas activas cada 2,5 segundos y muestra queued/running, resultados completed y fallos terminales.

## Ejecutar stack completo con Docker

```bash
cp .env.example .env
# Cambia HTTP_AUTH_PASSWORD y configura las credenciales de los proveedores.
docker compose up --build
```

El único punto HTTP publicado es Nginx:

- Dashboard: `http://localhost:8080`
- API: `http://localhost:8080/api`
- Swagger: `http://localhost:8080/api/docs`
- Nginx solicita autenticación HTTP Basic con `HTTP_AUTH_USERNAME` y `HTTP_AUTH_PASSWORD`.
- MongoDB: `127.0.0.1:27017` (`MONGO_PORT`, solo para herramientas locales).
- Redis: `127.0.0.1:6379` (`REDIS_PORT`, solo loopback; también privado para los demás hosts).

API y dashboard no publican puertos al host; el proxy enruta `/api` a NestJS y el resto de rutas a Angular. MongoDB y Redis solo se enlazan a loopback para desarrollo local. Compose espera a que MongoDB y Redis estén healthy para iniciar la API. El healthcheck del contenedor API consulta `/api/health/live`, que solo verifica que el proceso responda, para que una caída de un proveedor de IA no marque el contenedor como unhealthy. La readiness real queda en `/api/health` (Mongo, cache, provider AI activo y memoria) y devuelve `503` mientras las claves de IA sean placeholders. Cuando ambos proveedores fallan, la tarea se reintenta con backoff exponencial y termina en la dead-letter queue.

La autenticación Basic no cifra las credenciales por sí sola. Úsala detrás de TLS en cualquier despliegue no local; no publiques este proxy directamente por HTTP en redes no confiables.

Para detener: `docker compose down`. Los datos permanecen en `mongodb_data` y `redis_data`. `docker compose down -v` elimina ambos volúmenes.

## Puertos, red y variables

Compose crea una red privada y los servicios se alcanzan por sus nombres `proxy`, `api`, `web`, `mongodb` y `redis`. Nginx es el único servicio HTTP accesible en la interfaz de red del host; MongoDB y Redis solo se enlazan a loopback para desarrollo local. API y web permanecen internos.

| Variable | Uso |
|---|---|
| `PROXY_PORT` | Puerto HTTP publicado por Nginx (8080 por defecto). |
| `HTTP_AUTH_USERNAME`, `HTTP_AUTH_PASSWORD` | Credenciales Basic Auth exigidas para dashboard y API. |
| `NODE_ENV`, `API_PORT` | Entorno y puerto interno de API; Nginx utiliza el mismo puerto del upstream. |
| `MONGO_PORT`, `REDIS_PORT` | Puertos de loopback de MongoDB/Redis para desarrollo local. |
| `MONGODB_IMAGE`, `REDIS_IMAGE` | Versiones de las imágenes de infraestructura. |
| `MONGODB_INITDB_ROOT_USERNAME`, `MONGODB_INITDB_ROOT_PASSWORD`, `MONGODB_DATABASE` | Inicialización de MongoDB. |
| `MONGODB_URI`, `REDIS_URL`, `APP_BASE_URL` | URLs para ejecutar la API directamente en el host. |
| `MONGODB_URI_DOCKER`, `REDIS_URL_DOCKER`, `APP_BASE_URL_DOCKER` | URLs de API dentro de la red de Compose. |
| `REDIS_PASSWORD` | Contraseña del servidor Redis. |
| `CACHE_TTL_SECONDS` | TTL de la cache de listado de logs. |
| `AI_PROVIDER`, `AI_FALLBACK_PROVIDER` | Selección de adaptadores IA activo/fallback. |
| `AI_PROVIDER_<NAME>_URL` | Endpoint de análisis para un provider. |
| `AI_PROVIDER_<NAME>_HEALTH_URL` | Endpoint de health del provider. |
| `AI_PROVIDER_<NAME>_API_KEY` | Credencial del provider; nunca se envía al navegador. |
| `AI_PROVIDER_OPENAI_MODEL`, `AI_PROVIDER_ANTHROPIC_MODEL` | Modelos usados por los adaptadores OpenAI y Anthropic. |
| `AI_REQUEST_TIMEOUT_MS`, `AI_HEALTH_TIMEOUT_MS` | Timeouts HTTP del adaptador. |
| `AI_RETRY_ATTEMPTS`, `AI_RETRY_BACKOFF_MS` | Intentos BullMQ y demora exponencial inicial. |
| `HEALTH_CHECK_MEMORY_HEAP_LIMIT`, `HEALTH_CHECK_MEMORY_RSS_LIMIT` | Límites de memoria del healthcheck, en MiB. |

OpenAI (Chat Completions), Anthropic (Messages) y Gemini (`generateContent`) tienen adaptadores nativos. Se pueden seleccionar con `AI_PROVIDER` y `AI_FALLBACK_PROVIDER`; cada proveedor tiene URL, endpoint de health y API key configurables mediante `AI_PROVIDER_<NAME>_*`; OpenAI y Anthropic también aceptan configuración del modelo. Los ejemplos usan endpoints oficiales y modelos de ejemplo; sustituye las claves por credenciales válidas y no guardes secretos en Git. Más detalles de contrato, retry/DLQ y health en [ARCHITECTURE.md](./ARCHITECTURE.md).
