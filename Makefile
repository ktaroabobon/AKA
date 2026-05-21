SHELL := /bin/bash
MAKEFLAGS += --no-print-directory

.PHONY: help install build deploy console ai/dev ai/build ai/test lint format typecheck

help:
	@echo "AKA monorepo — make targets"
	@echo ""
	@echo "  install         Install all workspace dependencies (pnpm install)"
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

install:
	pnpm install

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
