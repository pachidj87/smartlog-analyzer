COMPOSE := docker compose

.DEFAULT_GOAL := help

.PHONY: help install dev build test test-unit test-integration test-web seed indexes migrate up down logs

help: ## Mostrar esta ayuda
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-18s %s\n", $$1, $$2}'

install: ## Instalar dependencias del workspace
	pnpm install

dev: ## Ejecutar la API y la web en desarrollo
	pnpm start:api & pnpm start:web

build: ## Compilar la API y la web
	pnpm build

test: ## Ejecutar pruebas unitarias, de integración y web
	pnpm test

test-unit: ## Ejecutar pruebas unitarias de la API
	pnpm test:unit

test-integration: ## Ejecutar pruebas HTTP de integración
	pnpm test:integration

test-web: ## Ejecutar pruebas Angular
	pnpm test:web

seed: ## Insertar datos demo (ARGS="--reset" para limpiar primero)
	pnpm --filter smartlog-api run seed -- $(ARGS)

indexes: ## Crear índices MongoDB (ARGS="--dry-run" para previsualizar)
	pnpm --filter smartlog-api run db:indexes -- $(ARGS)

migrate: ## Aplicar migraciones MongoDB (ARGS="--dry-run" para previsualizar)
	pnpm --filter smartlog-api run db:migrate -- $(ARGS)

up: ## Iniciar el stack de Docker Compose
	$(COMPOSE) up -d --build

down: ## Detener el stack de Docker Compose
	$(COMPOSE) down

logs: ## Seguir los logs de Docker Compose
	$(COMPOSE) logs -f
