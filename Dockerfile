FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY src/api/package.json ./src/api/package.json
COPY src/web/package.json ./src/web/package.json
RUN pnpm install --frozen-lockfile

COPY src/api ./src/api
COPY src/web ./src/web
RUN pnpm build

FROM node:22-alpine AS api-dependencies

ENV NODE_ENV=production
WORKDIR /app

RUN corepack enable
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/.npmrc /app/pnpm-lock.yaml ./
COPY src/api/package.json ./src/api/package.json
COPY src/web/package.json ./src/web/package.json
RUN pnpm install --prod --filter smartlog-api --frozen-lockfile

FROM node:22-alpine AS api

ENV NODE_ENV=production
WORKDIR /app

COPY --from=api-dependencies /app/node_modules ./node_modules
COPY --from=api-dependencies /app/src/api/node_modules ./src/api/node_modules
COPY --from=api-dependencies /app/src/api/package.json ./src/api/package.json
COPY --from=build /app/src/api/dist ./src/api/dist

EXPOSE 3000
CMD ["node", "src/api/dist/main.js"]

FROM nginx:1.27-alpine AS web

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/src/web/dist/web/browser /usr/share/nginx/html

EXPOSE 80
