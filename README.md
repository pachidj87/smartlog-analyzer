# SmartLog Analyzer

Prototipo monorepo para analizar logs de varios microservicios. El repositorio contiene una API NestJS (`src/api`) y una aplicación Angular (`src/web`). MongoDB está disponible en el entorno Docker; la integración de persistencia y el proveedor externo de IA todavía están pendientes.

## Requisitos

- Node.js 22 o superior con Corepack habilitado (pnpm 9.15.9).
- Docker y Docker Compose para el despliegue integrado.

## Estructura

```text
smartlog-analyzer/
├── src/
│   ├── api/             # API NestJS
│   └── web/             # Frontend Angular
├── tests/               # Casos de prueba compartidos o de integración futura
├── db/                  # Migraciones y seeds futuros
├── Dockerfile           # Targets api y web
├── docker-compose.yml   # API, frontend y MongoDB
├── ARCHITECTURE.md      # Decisiones y arquitectura objetivo
└── .env.example         # Variables de entorno de ejemplo
```

## Instalación y desarrollo

Desde la raíz, pnpm instala los dos workspaces:

```bash
corepack enable
pnpm install
pnpm start:api
pnpm start:web
```

La API escucha en `http://localhost:3000` y Angular en `http://localhost:4200`.
Los procesos de desarrollo se ejecutan por separado; usa terminales distintas para mantener ambos activos.

## Build y pruebas

```bash
pnpm build
pnpm test:api
pnpm test:api:e2e
pnpm test:web
```

Los tests de API usan Jest. Los de Angular usan Karma y requieren un navegador disponible en el entorno de ejecución.

## Ejecutar con Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Abre `http://localhost:4200` para Angular y `http://localhost:3000` para la API. Compose también inicia MongoDB en `localhost:27017`, conserva sus datos en el volumen `mongodb_data` y espera a que pase el healthcheck antes de arrancar la API.

Para detener los servicios: `docker compose down`. Los datos sobreviven a ese comando; `docker compose down -v` elimina también el volumen persistente.

## Puertos, red y configuración

| Servicio | Puerto del contenedor | Puerto local predeterminado | Uso |
|---|---:|---:|---|
| Angular / Nginx | 80 | 4200 | Interfaz web |
| NestJS | 3000 | 3000 | API |
| MongoDB | 27017 | 27017 | Base de datos |

Compose crea una red privada por defecto. Dentro de ella, la API se conecta al host `mongodb:27017`; no debe usar `localhost` para alcanzar la base. Los puertos locales se pueden modificar en `.env` con `WEB_PORT`, `API_PORT` y `MONGO_PORT`.

Variables disponibles:

| Variable | Descripción |
|---|---|
| `API_PORT` | Puerto de la API publicado en el host. |
| `WEB_PORT` | Puerto publicado para la aplicación web. |
| `MONGO_PORT` | Puerto de MongoDB publicado en el host. |
| `MONGO_INITDB_ROOT_USERNAME` | Usuario administrativo inicial de MongoDB. |
| `MONGO_INITDB_ROOT_PASSWORD` | Contraseña administrativa local de MongoDB. |
| `MONGO_DATABASE` | Nombre de base de datos configurado para la instancia. |
| `MONGODB_URI` | URI disponible para la futura integración de la API. |

`.env.example` contiene valores de ejemplo únicamente: cambia las credenciales para cualquier entorno compartido y no subas `.env` al repositorio.

## Uso de IA y pendientes

Este scaffold aún no recibe ni persiste logs, ni solicita análisis a un proveedor de IA. La integración prevista, el contrato de datos de logs e insights y los riesgos asociados se documentan en [ARCHITECTURE.md](./ARCHITECTURE.md). Como siguiente paso se deben implementar la persistencia, la API de ingesta/consulta y un adaptador configurable para el proveedor externo.
