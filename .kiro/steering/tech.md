# Technology Stack

## Architecture

**Monorepo (pnpm workspace)** で 2 つの実行環境にまたがる:

- `bot/` — Google Apps Script 上で動く LINE Bot (Webhook 受信 / メンション判定 / ルーティング)
- `ai/` — Cloud Run 上で動く Hono サーバ (LLM 応答生成)
- `openapi/` — bot / ai 間の API 契約 (OpenAPI 3.1 が SSOT)

bot → ai は HTTP (`UrlFetchApp.fetch`) で疎結合。両側は OpenAPI から自動生成した型 (`*/src/api/generated.ts`) のみを使う。

## Core Technologies

- **Language**: TypeScript 5.7 (strict, `tsconfig.base.json` を両 workspace で継承)
- **bot Runtime**: Google Apps Script (esbuild で IIFE バンドル後 clasp push)
- **ai Runtime**: Node.js 22 / Cloud Run、ESM (`type: "module"`)
- **ai Framework**: Hono 4.x + `@hono/zod-validator`
- **LLM**: `@google/genai` v1.0.0 (Gemini API)
- **API 契約**: OpenAPI 3.1 + `openapi-typescript` で TS 型を生成

## Key Libraries

主要ライブラリ (役割と pattern に直結するもののみ):

- **`zod`**: ai のリクエスト / 環境変数バリデーション。OpenAPI と整合させる
- **`pino`**: ai の構造化ログ (Cloud Logging へ直接流す)。原文 (PII を含み得るユーザー発話・モデル応答) を出さず、件数とメタのみ記録する
- **`@google-cloud/firestore`**: 会話履歴ストア (Native mode、ADC 認証)
- **`dotenv`**: ai のローカル開発で `ai/.env` を起動時にロード。production (Cloud Run) では `--set-env-vars` が優先され `.env` は同梱されないので影響なし

## Development Standards

### Type Safety

- TS strict モード必須
- 公開関数は戻り値型を明示、内部の小さな関数は推論可
- `any` は基本禁止。やむを得ない場合はコメントで理由を残す
- 未使用変数は `_` プレフィックスで許可

### Code Quality

- **ESLint 9 flat config** + **Prettier** をルートで一元管理 (`eslint.config.mjs` / `.prettierrc`)
- 生成型 (`*/src/api/generated.ts`) は **手動編集禁止** — OpenAPI 再生成のみ

### Testing

- **vitest** を bot / ai 双方で使用
- bot 側は `vi.stubGlobal` で GAS API (`PropertiesService`, `UrlFetchApp`) をスタブ (`bot/__tests__/setup.ts` に集約)
- ai 側は外部 API (`@google/genai`) を **サービス層インタフェース** ごとモック化
- `describe` / `it` で正常系 + 異常系を最低限カバー、`toContain` で逃げない

## Development Environment

### Required Tools

- **mise** (`mise install` で Node 22 / pnpm 11.2.2 が揃う)
- bot 用: Google アカウント / `@google/clasp`
- ai 用: Google Cloud SDK / Docker

### Common Commands

```bash
# 初期セットアップ
mise install && pnpm install
make cp               # ai/.env を ai/.env.sample から作成 (既存があれば skip)

# bot (GAS)
make build            # esbuild で IIFE バンドル
make deploy           # build 後に clasp push

# ai (Hono)
make ai/dev           # ローカル開発サーバ (ai/.env を dotenv で自動読込)
make ai/build         # tsc ビルド + src/prompts/*.md を dist/prompts/ にコピー
make ai/test          # vitest

# 品質
make lint
make format           # prettier --check (書き込みは pnpm format:write)
make typecheck

# OpenAPI
make oapi/types       # 型再生成
make oapi/check-gen   # CI 用: 生成型と yaml の差分検出
```

## Key Technical Decisions

- **OpenAPI を SSOT** にして bot / ai 間の型ズレを CI で機械検出 (`make oapi/check-gen`)
- **依存方向の固定**: ai 内は `lib / vendor → schemas → services → routes → app` の一方向。逆参照しない
- **ドメインエラー包み込み**: ライブラリ層の汎用 Error は `GenaiServiceError` 等の **ドメイン固有 Error** に包んでから上位へ投げ、ハンドラ層 (route / controller) で `ErrorResponse` に変換
- **シークレット非ハードコード**: LINE トークンは GAS Script Properties、Gemini API キーは **bot 側で base64 化してリクエストごとに送信** (ai 側はサーバ持ちキーを保持しない)
- **bot は Hono 不可**: GAS の制約で Hono は使えず、`UrlFetchApp.fetch` 直叩きと `doPost` グローバル関数 export で構築

## デプロイ

- 単一 workflow **`Deploy AKA`** (`.github/workflows/deploy.yml`, `workflow_dispatch` のみ) で
  **bot → ai** を直列実行する。`jobs.ai` は `needs: bot` ゲートで bot 失敗時には起動しない。
  最後に Cloud Run の `/health` smoke check (curl) を行い、非 2xx なら workflow を失敗で終了
- bot job: `CLASPRC_JSON` Secret を復元 → `pnpm --filter bot build` → `clasp push --force`
- ai job: WIF (`GCP_WIF_PROVIDER` / `GCP_SERVICE_ACCOUNT`) → Cloud Build → Cloud Run。
  Cloud Run のランタイム SA は `aka-ai-api-sa` で、Firestore 用に `roles/datastore.user` を必須付与
- 詳細セットアップ (IAM / Secret 登録 / Firestore TTL / GAS 新バージョン発行) は `docs/deploy-setup.md`

---

_Document standards and patterns, not every dependency_
