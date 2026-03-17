# AI Intelligence Hub — Build Targets
# Run `make help` for available targets

.PHONY: help setup dev build start electron-dev electron-build electron-mac electron-win icons clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ── Client-Server Mode ──────────────────────────────────────────────────────

setup: ## Install all dependencies and create .env
	npm run setup

dev: ## Start dev mode (Vite HMR + Express backend)
	npm run dev

build: ## Build frontend for production
	npm run build

start: ## Start production server (Express serves frontend)
	npm run start

# ── Docker ──────────────────────────────────────────────────────────────────

docker-build: ## Build Docker image
	docker compose build

docker-up: ## Start with Docker Compose
	docker compose up -d

docker-down: ## Stop Docker containers
	docker compose down

# ── Electron Desktop App ────────────────────────────────────────────────────

electron-dev: ## Run Electron in dev mode (Vite HMR + Electron window)
	npm run electron:dev

electron-start: ## Build and launch Electron app locally
	npm run electron:start

icons: ## Generate app icons (requires librsvg on macOS)
	npm run electron:icons

electron-mac: icons ## Build macOS installer (.dmg)
	npm run electron:build:mac

electron-win: ## Build Windows installer (.exe)
	npm run electron:build:win

electron-all: icons ## Build installers for all platforms
	npm run electron:build:all

# ── Maintenance ─────────────────────────────────────────────────────────────

clean: ## Remove build artifacts
	rm -rf dist-electron/ frontend/dist/ node_modules/.cache
	@echo "Cleaned build artifacts. Run 'npm install' to reinstall dependencies."
