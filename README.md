# AKA

妹のぬいぐるみ「紅（あか）」を LINE Bot 化した会話プロジェクトの monorepo。

## 構成

```
AKA/
  bot/    GAS(TypeScript) — LINE Webhook 受信と応答ルーティング（#18 で実装）
  ai/     Cloud Run(TypeScript + Hono) — LLM 応答バックエンド（#19 で実装）
```

- `bot/` は GAS 上で動く LINE Bot。`doPost(e)` で LINE Webhook を受け、必要に応じて `ai/` を呼び出す。
- `ai/` は Cloud Run 上で動く Hono サーバ。Gemini（`@google/genai`）を呼んで応答を生成する。
- リポジトリは pnpm workspace で管理され、ランタイムは `mise.toml` で固定。

## 必要なツール

- [mise](https://mise.jdx.dev/) — `mise install` でリポジトリ指定の Node / pnpm がそろう
- (Bot 用) Google アカウント / [clasp](https://github.com/google/clasp)
- (AI 用) Google Cloud SDK / Docker

## クイックスタート

```bash
mise install
pnpm install
```

### Bot (GAS)

```bash
make build       # bot/src を esbuild で IIFE バンドルして bot/dist に出力
make deploy      # build 後に clasp push で GAS プロジェクトへデプロイ
make console     # bot/.clasp.json の scriptId から GAS エディタを開く
```

### AI (Hono on Cloud Run)

```bash
make ai/dev      # ローカル開発サーバ
make ai/build    # ビルド
make ai/test     # vitest
```

### 品質チェック

```bash
make lint
make format
make typecheck
```

## ロードマップ

進行中のサブ Issue は [#16](https://github.com/ktaroabobon/AKA/issues/16) を参照。
