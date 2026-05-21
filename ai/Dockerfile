# syntax=docker/dockerfile:1.7

# ---- builder ----
FROM node:22-alpine AS builder

WORKDIR /workspace

# pnpm を有効化
RUN corepack enable

# monorepo の依存関係を解決するため、必要な manifest を先にコピー
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY ai/package.json ai/tsconfig.json ./ai/

# devDependencies も含めてインストール（tsc に必要）
RUN pnpm install --frozen-lockfile --filter ai...

# ソースをコピーしてビルド
COPY ai/src ./ai/src
RUN pnpm --filter ai build

# 本番用に prod のみ再インストール（ai 単体で完結させる）
WORKDIR /workspace/ai
RUN pnpm install --prod --frozen-lockfile --ignore-workspace

# ---- runner ----
FROM node:22-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /workspace/ai/dist ./dist
COPY --from=builder /workspace/ai/node_modules ./node_modules
COPY --from=builder /workspace/ai/package.json ./package.json

EXPOSE 8080
USER node

CMD ["node", "dist/index.js"]
