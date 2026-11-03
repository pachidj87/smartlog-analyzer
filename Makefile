COMPOSE := docker compose

.DEFAULT_GOAL := help

.PHONY: help install dev build test test-unit test-integration test-web seed indexes up down logs

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-18s %s\n", $$1, $$2}'

install: ## Install workspace dependencies
	pnpm install

dev: ## Run the API and the web app in development mode
	pnpm start:api & pnpm start:web

build: ## Build the API and the web app
	pnpm build

test: ## Run unit, integration and web tests
	pnpm test

test-unit: ## Run the API unit tests
	pnpm test:unit

test-integration: ## Run the API integration tests
	pnpm test:integration

test-web: ## Run the Angular tests
	pnpm test:web

seed: ## Insert the demo dataset (ARGS="--reset" to clear first)
	pnpm --filter smartlog-api run seed -- $(ARGS)

indexes: ## Create the MongoDB indexes (ARGS="--dry-run" to preview)
	pnpm --filter smartlog-api run db:indexes -- $(ARGS)

up: ## Start the Docker Compose stack
	$(COMPOSE) up -d --build

down: ## Stop the Docker Compose stack
	$(COMPOSE) down

logs: ## Follow the Docker Compose logs
	$(COMPOSE) logs -f
