# syntax=docker/dockerfile:1.7

# ---- builder ----
FROM node:22-alpine AS builder

WORKDIR /workspace

# pnpm を有効化（packageManager で固定したバージョンが使われる）
RUN corepack enable

# monorepo の依存解決に必要な manifest をすべて先にコピー
# bot 側もワークスペース定義に必要なため manifest だけ含める
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY ai/package.json ai/tsconfig.json ./ai/
COPY bot/package.json bot/tsconfig.json ./bot/

# ai とその推移的依存を frozen で導入（devDependencies 含む、tsc に必要）
RUN pnpm install --frozen-lockfile --filter ai...

# ソースをコピーしてビルド（tsc → ai/dist）
COPY ai/src ./ai/src
RUN pnpm --filter ai build

# 本番ランタイム用に prod 依存だけを独立ツリーとして取り出す。
# pnpm deploy は対象パッケージの prod 依存を /prod-out/node_modules に
# hoist 済みの状態で展開し、package.json も /prod-out 直下に置く。
# pnpm 10+ では inject-workspace-packages を要求するため --legacy で
# 旧来の挙動（workspace の symlink 解決）を使う。
RUN pnpm --filter ai --prod --legacy deploy /prod-out

# ---- runner ----
FROM node:22-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /prod-out/package.json ./package.json
COPY --from=builder /prod-out/node_modules ./node_modules
COPY --from=builder /workspace/ai/dist ./dist

EXPOSE 8080
USER node

CMD ["node", "dist/index.js"]
