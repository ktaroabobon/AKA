SHELL := /bin/bash
MAKEFLAGS += --no-print-directory

.PHONY: help install cp build deploy console ai/dev ai/build ai/test lint format typecheck oapi/types oapi/check-gen

help:
	@echo "AKA monorepo — make targets"
	@echo ""
	@echo "  install         Install all workspace dependencies (pnpm install)"
	@echo "  cp              Copy ai/.env.sample to ai/.env (skipped if .env exists)"
	@echo ""
	@echo "  bot (GAS)"
	@echo "    build         Build bot for GAS (bundles src/main.ts via build.ts)"
	@echo "    deploy        Build and push to the GAS project in bot/.clasp.json"
	@echo "    console       Open the bot's GAS console in the browser"
	@echo ""
	@echo "  ai (Hono on Cloud Run)"
	@echo "    ai/dev        Run ai locally (pnpm --filter ai dev)"
	@echo "    ai/build      Build ai"
	@echo "    ai/test       Run ai tests"
	@echo ""
	@echo "  Quality"
	@echo "    lint          Run ESLint at the repo root"
	@echo "    format        Check Prettier formatting"
	@echo "    typecheck     Run tsc --noEmit across workspaces"
	@echo ""
	@echo "  OpenAPI"
	@echo "    oapi/types       Generate TS types from openapi/aka.openapi.yaml"
	@echo "    oapi/check-gen   Fail if generated types are out of date (for CI)"

install:
	pnpm install

cp:
	@if [ -f ai/.env ]; then \
		echo "ai/.env already exists. Edit it or remove it before re-copying."; \
	else \
		cp ai/.env.sample ai/.env; \
		echo "ai/.env を ai/.env.sample から作成しました。"; \
		echo "GCP_PROJECT_ID と GEMINI_API_KEY を実値に書き換えてください。"; \
	fi

# ---------------- bot (GAS) ----------------

build:
	cd bot && pnpm tsx build.ts

deploy: build
	cd bot && pnpm clasp push

console:
	@SCRIPT_ID=$$(grep -o '"scriptId"[[:space:]]*:[[:space:]]*"[^"]*"' bot/.clasp.json | cut -d'"' -f4); \
	if [ -n "$$SCRIPT_ID" ]; then \
		URL="https://script.google.com/d/$$SCRIPT_ID/edit"; \
		echo "Opening $$URL"; \
		open "$$URL"; \
	else \
		echo "Error: scriptId not found in bot/.clasp.json"; \
		exit 1; \
	fi

# ---------------- ai (Hono) ----------------

ai/dev:
	pnpm --filter ai dev

ai/build:
	pnpm --filter ai build

ai/test:
	pnpm --filter ai test

# ---------------- Quality ----------------

lint:
	pnpm lint

format:
	pnpm format

typecheck:
	pnpm typecheck

# ---------------- OpenAPI ----------------

oapi/types:
	pnpm gen:types

oapi/check-gen:
	@$(MAKE) oapi/types > /dev/null
	@if ! git diff --exit-code --quiet ai/src/api/generated.ts bot/src/api/generated.ts; then \
		echo "Generated types are out of date. Run 'make oapi/types' and commit the result." >&2; \
		git diff --stat ai/src/api/generated.ts bot/src/api/generated.ts >&2; \
		exit 1; \
	fi
