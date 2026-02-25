# Makefile for S3 Manager local development
# Supports Docker, Podman, and other OCI-compliant runtimes
# Auto-detects available runtime and compose command

.PHONY: help start stop restart logs clean build shell test test-unit test-integration test-e2e test-coverage test-docker

# Detect container runtime
RUNTIME := $(shell command -v podman 2> /dev/null && echo podman || echo docker)

# Detect compose command based on runtime
ifeq ($(RUNTIME),podman)
    COMPOSE := $(shell command -v podman-compose 2> /dev/null && echo podman-compose || (podman compose version > /dev/null 2>&1 && echo "podman compose" || echo ""))
    COMPOSE_FILE := podman-compose.yml
else
    COMPOSE := $(shell docker compose version > /dev/null 2>&1 && echo "docker compose" || (command -v docker-compose 2> /dev/null && echo docker-compose || echo ""))
    COMPOSE_FILE := docker-compose.yml
endif

# Fallback to docker-compose.yml if podman-compose.yml doesn't exist
ifeq ($(wildcard $(COMPOSE_FILE)),)
    COMPOSE_FILE := docker-compose.yml
endif

# Check if compose command is available
ifeq ($(COMPOSE),)
    $(error No compose command found. Please install docker-compose or podman-compose)
endif

help: ## Show this help message
	@echo "S3 Manager - Local Development Commands"
	@echo "Using runtime: $(RUNTIME)"
	@echo "Using compose: $(COMPOSE)"
	@echo "Using file: $(COMPOSE_FILE)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

start: ## Start all services
	@echo "Starting services with $(RUNTIME)..."
	$(COMPOSE) -f $(COMPOSE_FILE) up -d
	@echo "Waiting for services to be ready..."
	@sleep 5
	@echo "✓ Services started!"
	@echo "Access the application at: http://localhost:8080"

stop: ## Stop all services
	@echo "Stopping services..."
	$(COMPOSE) -f $(COMPOSE_FILE) down

restart: stop start ## Restart all services

logs: ## View logs from all services
	$(COMPOSE) -f $(COMPOSE_FILE) logs -f

logs-app: ## View logs from S3 Manager app only
	$(COMPOSE) -f $(COMPOSE_FILE) logs -f s3-manager

logs-s3: ## View logs from LocalStack only
	$(COMPOSE) -f $(COMPOSE_FILE) logs -f localstack

clean: ## Stop services and remove volumes (delete all data)
	@echo "Stopping services and removing volumes..."
	$(COMPOSE) -f $(COMPOSE_FILE) down -v
	@echo "✓ Cleaned up!"

build: ## Build/rebuild the application image
	@echo "Building application image..."
	$(COMPOSE) -f $(COMPOSE_FILE) build

rebuild: clean build start ## Clean, rebuild, and start services

shell: ## Open a shell in the running app container
	$(RUNTIME) exec -it s3-manager-app /bin/sh

shell-localstack: ## Open a shell in the LocalStack container
	$(RUNTIME) exec -it s3-manager-localstack /bin/bash

ps: ## Show running containers
	$(COMPOSE) -f $(COMPOSE_FILE) ps

test-s3: ## Test S3 connectivity
	@echo "Testing S3 endpoint..."
	@curl -s http://localhost:4566/_localstack/health | grep -q "\"s3\": \"available\"" && echo "✓ S3 is available" || echo "✗ S3 is not available"

test-app: ## Test application endpoint
	@echo "Testing application endpoint..."
	@curl -s http://localhost:8080/auth/user > /dev/null && echo "✓ Application is responding" || echo "✗ Application is not responding"

test: test-s3 test-app ## Test connectivity (basic health checks)

# Testing commands
test-unit: ## Run unit tests (fast, no external dependencies)
	@echo "Running unit tests..."
	pytest -m unit -v

test-api: ## Run backend API tests (requires LocalStack)
	@echo "Running backend API tests..."
	pytest tests/test_api_*.py -v

test-integration: ## Run integration tests (requires LocalStack)
	@echo "Running integration tests..."
	pytest -m integration -v

test-e2e: ## Run E2E UI tests (requires app + LocalStack + browser)
	@echo "Running E2E tests..."
	playwright install chromium
	pytest tests/test_e2e_*.py -v --headed

test-e2e-headless: ## Run E2E tests in headless mode
	@echo "Running E2E tests (headless)..."
	playwright install chromium
	pytest tests/test_e2e_*.py -v

test-all: ## Run all tests
	@echo "Running all tests..."
	pytest -v

test-coverage: ## Run tests with coverage report
	@echo "Running tests with coverage..."
	pytest --cov=app --cov-report=html --cov-report=term-missing -v
	@echo ""
	@echo "✓ Coverage report generated in htmlcov/index.html"

test-docker: ## Run tests in Docker containers
	@echo "Running tests in Docker..."
	$(COMPOSE) -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test-runner
	$(COMPOSE) -f docker-compose.test.yml down -v

test-docker-e2e: ## Run E2E tests in Docker containers
	@echo "Running E2E tests in Docker..."
	$(COMPOSE) -f docker-compose.test.yml --profile e2e up --abort-on-container-exit --exit-code-from e2e-runner
	$(COMPOSE) -f docker-compose.test.yml --profile e2e down -v

test-watch: ## Run tests in watch mode (re-run on file changes)
	@echo "Running tests in watch mode..."
	pytest-watch -v

test-quick: ## Run quick smoke tests
	@echo "Running quick tests..."
	pytest tests/test_api_browse.py::TestBrowseEndpoint::test_browse_root_no_buckets -v
	@echo "✓ Quick smoke test passed!"

status: ## Show service status
	@echo "Container Runtime: $(RUNTIME)"
	@echo "Compose Command: $(COMPOSE)"
	@echo "Compose File: $(COMPOSE_FILE)"
	@echo ""
	@echo "Service Status:"
	@$(COMPOSE) -f $(COMPOSE_FILE) ps

env: ## Create .env.local file
	@if [ ! -f .env.local ]; then \
		echo "Creating .env.local file..."; \
		echo "LOCAL_DEV_MODE=true" > .env.local; \
		echo "FLASK_DEBUG=true" >> .env.local; \
		echo "SECRET_KEY=dev-secret-key-change-in-production" >> .env.local; \
		echo "DEFAULT_ROLE=S3-Admin" >> .env.local; \
		echo "S3_ENDPOINT=http://localhost:4566" >> .env.local; \
		echo "S3_ACCESS_KEY=test" >> .env.local; \
		echo "S3_SECRET_KEY=test" >> .env.local; \
		echo "S3_REGION=us-east-1" >> .env.local; \
		echo "S3_USE_SSL=false" >> .env.local; \
		echo "S3_VERIFY_SSL=false" >> .env.local; \
		echo "SESSION_COOKIE_SECURE=false" >> .env.local; \
		echo "✓ Created .env.local"; \
	else \
		echo ".env.local already exists"; \
	fi

# Podman-specific commands
podman-generate-systemd: ## Generate systemd service files (Podman only)
ifeq ($(RUNTIME),podman)
	@echo "Generating systemd service files..."
	@mkdir -p systemd
	$(RUNTIME) generate systemd --files --name s3-manager-app > systemd/s3-manager-app.service
	$(RUNTIME) generate systemd --files --name s3-manager-localstack > systemd/s3-manager-localstack.service
	@echo "✓ Generated systemd files in ./systemd/"
else
	@echo "This command is only available with Podman"
endif

podman-install-systemd: podman-generate-systemd ## Install systemd services (Podman only, requires sudo)
ifeq ($(RUNTIME),podman)
	@echo "Installing systemd services..."
	@sudo cp systemd/*.service /etc/systemd/system/
	@sudo systemctl daemon-reload
	@echo "✓ Installed systemd services"
	@echo "Enable with: sudo systemctl enable s3-manager-app s3-manager-localstack"
	@echo "Start with: sudo systemctl start s3-manager-app s3-manager-localstack"
else
	@echo "This command is only available with Podman"
endif

# Development helpers
dev: env start ## Setup and start development environment
	@echo ""
	@echo "=========================================="
	@echo "Development environment is ready!"
	@echo "=========================================="
	@echo ""
	@echo "Application: http://localhost:8080"
	@echo "LocalStack: http://localhost:4566"
	@echo ""
	@echo "View logs: make logs"
	@echo "Stop services: make stop"
	@echo ""

info: ## Show runtime information
	@echo "Container Runtime Information:"
	@echo "  Runtime: $(RUNTIME)"
	@which $(RUNTIME) | head -n 1 | xargs echo "  Path:"
	@$(RUNTIME) --version | head -n 1 | xargs echo "  Version:"
	@echo ""
	@echo "Compose Information:"
	@echo "  Command: $(COMPOSE)"
	@$(COMPOSE) version 2>/dev/null | head -n 1 | xargs echo "  Version:" || echo "  Version: (unable to determine)"
	@echo ""
	@echo "Compose File: $(COMPOSE_FILE)"
	@echo ""

# Default target
.DEFAULT_GOAL := help
