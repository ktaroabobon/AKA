DOCKER_COMPOSE_VERSION_CHECKER := $(shell docker compose > /dev/null 2>&1 ; echo $$?)
ifeq ($(DOCKER_COMPOSE_VERSION_CHECKER), 0)
	DOCKER_COMPOSE_IMPL=docker compose
else
	DOCKER_COMPOSE_IMPL=docker-compose
endif


# Make command for all
.PHONY: help
help:
	@echo "HELP FOR ALL"
	cat ./Makefile
	@echo "---------------"

.PHONY: setup
setup:
	cp .env.sample .env

.PHONY: build
build:
	$(MAKE) compose/build
	$(MAKE) compose/up

.PHONY: compose/build
compose/build:
	$(DOCKER_COMPOSE_IMPL) build --no-cache

.PHONY: compose/up
compose/up:
	$(DOCKER_COMPOSE_IMPL) up


.PHONY: compose/down/d
compose/down/d:
	$(DOCKER_COMPOSE_IMPL) down

.PHONY: compose/rebuild
compose/rebuild:
	$(MAKE) compose/build
	$(MAKE) compose/up

.PHONY: compose/rebuild/d
compose/rebuild/d:
	$(MAKE) compose/down/d
	$(MAKE) compose/build
	$(MAKE) compose/up

.PHONY: rebuild/d
rebuild/d:
	$(MAKE) compose/rebuild/d

.PHONY: logs
logs:
	$(DOCKER_COMPOSE_IMPL) logs -f

.PHONY: login
login: 
	$(DOCKER_COMPOSE_IMPL) exec api bash

.PHONY: check
check:
	$(DOCKER_COMPOSE_IMPL) exec api /bin/sh -c "uv run ruff check"

.PHONY: fmt
fmt:
	$(DOCKER_COMPOSE_IMPL) exec api /bin/sh -c "uv run ruff format"

.PHONY: health
health:
	curl http://localhost:8080/health

.PHONY: docs
docs:
	open http://localhost:8080/docs

# .envファイルに記載してあるGEMINI_API_KEYの値をbase64エンコードして、pbcopyにコピーする
.PHONY: genai/encode
genai/encode:
	@echo $(shell cat ./api/.env | grep GEMINI_API_KEY | cut -d '=' -f 2 | tr -d '\n' | base64) | pbcopy
	@echo "GEMINI_API_KEYの値をbase64エンコードして、pbcopyにコピーしました"

# .envファイルに記載してあるOPENAI_API_KEYの値をbase64エンコードして、pbcopyにコピーする
.PHONY: openai/encode
openai/encode:
	@echo $(shell cat ./api/.env | grep OPENAI_API_KEY | cut -d '=' -f 2 | tr -d '\n' | base64) | pbcopy
	@echo "OPENAI_API_KEYの値をbase64エンコードして、pbcopyにコピーしました"

.PHONY: token
token:
	gcloud auth print-identity-token | pbcopy