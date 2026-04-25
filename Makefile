.PHONY: dev test lint format clean install run build help

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies with uv
	uv sync --all-extras

dev: ## Run FastAPI dev server with hot reload
	uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

run: ## Run FastAPI production server
	uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4

test: ## Run tests with pytest
	uv run pytest tests/ -v --tb=short

lint: ## Run ruff linter and format checker
	uv run ruff check .
	uv run ruff format --check .

format: ## Auto-format code with ruff
	uv run ruff check --fix .
	uv run ruff format .

clean: ## Remove build artifacts and caches
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	rm -rf dist/ build/ htmlcov/ .coverage coverage.xml

build: ## Build the package
	uv build
