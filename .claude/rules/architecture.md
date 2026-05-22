# アーキテクチャルール

AKA は **monorepo** で、2 つの実行環境にまたがるシステム。

## ディレクトリと役割

| パス       | 役割                                                       | 実行環境            |
| ---------- | ---------------------------------------------------------- | ------------------- |
| `bot/`     | LINE Bot（Webhook 受信・メンション判定・応答ルーティング） | Google Apps Script  |
| `ai/`      | LLM 応答バックエンド（Hono）                               | Cloud Run (Node.js) |
| `openapi/` | `bot/` と `ai/` 間の API 契約（OpenAPI 3.1）               | —                   |

両パッケージは **pnpm workspace** で管理し、共通の `tsconfig.base.json` を継承する。ランタイムは `mise.toml` で固定。

## レイヤー分離

### `bot/src/`

| サブディレクトリ / モジュール | 役割                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `main.ts`                     | GAS のエントリ。`doPost` を export し、`build.ts` が末尾にグローバル関数として再公開する |
| `lineMessageApi.ts`           | LINE Webhook の受信・メンション判定・返信送信                                            |
| `controller.ts`               | 受信メッセージから応答テキストを生成するルーティング                                     |
| `aka.ts`                      | テンプレ応答（挨拶 / 自己紹介 / ランダム）                                               |
| `constants.ts`                | ランダム応答・メンションフレーズなどの定数（`as const`）                                 |
| `config.ts`                   | Script Properties からの設定取得（関数経由でアクセス、テスト容易性のため）               |
| `types/`                      | LINE Webhook など外部依存の型                                                            |
| `api/generated.ts`            | OpenAPI から生成された型（手書き禁止）                                                   |

### `ai/src/`

| サブディレクトリ   | 役割                                                         |
| ------------------ | ------------------------------------------------------------ |
| `index.ts`         | `@hono/node-server` でサーバ起動                             |
| `app.ts`           | ロガーミドルウェア・エラーハンドラ・ルート結合               |
| `routes/`          | エンドポイント定義（zValidator で zod 経由のバリデーション） |
| `services/`        | 外部 API（Gemini など）呼び出しの薄いラッパー                |
| `schemas/`         | zod スキーマ。OpenAPI の対応 schema と整合させる             |
| `prompts/`         | LLM に渡すキャラ設定                                         |
| `config/`          | 環境変数を zod でバリデーションして提供                      |
| `lib/`             | logger / decode などのユーティリティ                         |
| `api/generated.ts` | OpenAPI から生成された型（手書き禁止）                       |

## 通信フロー

```
LINE → bot/ (GAS Webhook)
       ├─ 完全一致 / 自己紹介 / 挨拶 など → テンプレで応答
       └─ それ以外 → ai/ (Cloud Run) へ POST /chat/genai → 応答テキストを LINE に返信
```

- bot から ai への呼び出しは `UrlFetchApp.fetch` を使う（GAS の実行環境のため）
- リクエスト／レスポンスの型は OpenAPI 生成型を **import して** 使う（手書き型禁止、後述）
