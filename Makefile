PYTHON ?= python3.12
VENV := backend/.venv
PY := $(VENV)/bin/python

.DEFAULT_GOAL := help
.PHONY: help setup env ipfs chain deploy seed fresh backend frontend test lint format

help: ## Show available commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  \033[1m%-10s\033[0m %s\n", $$1, $$2}'

setup: $(VENV) env ## Install all dependencies and create backend/.env
	cd frontend && npm ci
	cd contracts && npm ci

$(VENV): backend/pyproject.toml
	$(PYTHON) -m venv $(VENV)
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -e "backend[dev]"
	@touch $(VENV)

env: backend/.env ## Create backend/.env with freshly generated encryption keys

backend/.env:
	@$(PYTHON) -c "import base64, pathlib, secrets; \
	key = lambda: base64.b64encode(secrets.token_bytes(32)).decode(); \
	text = pathlib.Path('backend/.env.example').read_text(); \
	text = text.replace('\nENCRYPTION_KEY=\n', f'\nENCRYPTION_KEY={key()}\n', 1); \
	text = text.replace('\nWALLET_ENCRYPTION_KEY=\n', f'\nWALLET_ENCRYPTION_KEY={key()}\n', 1); \
	pathlib.Path('backend/.env').write_text(text)"
	@echo "Created backend/.env with new ENCRYPTION_KEY and WALLET_ENCRYPTION_KEY"

ipfs: ## Start a local IPFS (Kubo) node in Docker
	docker compose up -d ipfs

chain: ## Run a local Hardhat chain (foreground)
	cd contracts && npm run node

deploy: ## Deploy the registry contract to the local chain
	cd contracts && npm run deploy:local -- --reset

seed: ## Create demo accounts and sample studies (needs chain, contract and IPFS)
	cd backend && .venv/bin/python -m app.seed

fresh: deploy ## After restarting the chain: redeploy, reset the local database, reseed
	rm -f backend/data/medichain.db backend/data/medichain.db-wal backend/data/medichain.db-shm
	$(MAKE) seed

backend: ## Run the API with auto-reload on :8000
	cd backend && .venv/bin/uvicorn app.main:create_app --factory --reload --no-access-log --host 127.0.0.1 --port 8000

frontend: ## Run the web app on http://localhost:3000
	cd frontend && npm run dev

test: ## Run every test suite
	cd backend && .venv/bin/pytest -q
	cd frontend && npm test
	cd contracts && npm test

lint: ## Lint, type-check and verify formatting
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .
	cd frontend && npm run lint && npm run typecheck && npm run format:check

format: ## Auto-format all code
	cd backend && .venv/bin/ruff format . && .venv/bin/ruff check --fix .
	cd frontend && npm run format
