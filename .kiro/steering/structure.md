# Project Structure

## Organization Philosophy

**Monorepo (pnpm workspace)** で 2 つの実行環境を分離する。各 workspace の内部は **層 (lib / schemas / services / routes / app)** で責務を切り、依存方向を一方向に固定する。

「個人プロジェクトとしてのシンプルさ」を最優先 (`.claude/rules/simplicity.md` 系の YAGNI / KISS と整合)。ファサード層や将来用フラグは入れない。

## Directory Patterns

### `bot/` — LINE Bot (GAS)

**Location**: `/bot/src/`
**Purpose**: LINE Webhook 受信、メンション判定、応答ルーティング
**Pattern**: フラットなモジュール構成。GAS 制約のためレイヤ分けは最小限

主要モジュール:

- `main.ts` — GAS エントリ。`doPost` を export し、`build.ts` がグローバル関数として再公開
- `lineMessageApi.ts` — LINE Webhook 受信 / メンション判定 / 返信送信
- `controller.ts` — 受信メッセージから応答テキストを生成するルーティング
- `aka.ts` — テンプレ応答 (挨拶 / 自己紹介 / ランダム)
- `constants.ts` / `config.ts` — 定数 (`as const`) / Script Properties アクセス
- `types/` — 外部依存 (LINE Webhook 等) の型
- `api/generated.ts` — OpenAPI 自動生成型 (**手書き禁止**)

### `ai/` — LLM 応答バックエンド (Hono on Cloud Run)

**Location**: `/ai/src/`
**Purpose**: HTTP API として LLM 応答を返す
**Pattern**: `routes → services → external API` の 3 層 + `lib` / `schemas` / `config` / `prompts`

依存方向 (一方向):

```
lib / vendor → config → schemas → services → routes → app → index
```

主要ディレクトリ:

- `index.ts` — `@hono/node-server` でサーバ起動
- `app.ts` — middleware (logger / errorHandler) + routes 集約
- `routes/` — エンドポイント定義 (`zValidator` で zod 経由バリデーション)
- `services/` — 外部 API (Gemini など) を呼ぶ薄いラッパ。**ドメイン Error** で包んで投げる
- `schemas/` — zod スキーマ。OpenAPI と整合させる
- `prompts/` — LLM に渡すキャラ設定。本文は隣接する `*.md` (例: `personal.md`, `safety-fallback.md`) に置き、`prompts/aka.ts` などの薄い loader が `readFileSync(new URL("./*.md", import.meta.url))` で読み込む。`tsc` は md をコピーしないので、`ai/package.json` の `build` で `cp src/prompts/*.md dist/prompts/` を実行して dist に同梱する
- `config/` — 環境変数を zod でバリデーションして提供
- `lib/` — logger / decode などのユーティリティ
- `vendor/` — npm に無い辞書等を vendor 取込 (LICENSE 同梱必須)。runtime は `import.meta.url` 基準で `readFileSync` し、Docker image では `ai/Dockerfile` の runner ステージで明示 COPY して `/app/vendor/...` に配置する
- `api/generated.ts` — OpenAPI 自動生成型 (**手書き禁止**)

### `openapi/` — API 契約 (SSOT)

**Location**: `/openapi/`
**Purpose**: bot / ai 間の API 契約を一元管理
**Pattern**: yaml を編集 → `make oapi/types` → `*/src/api/generated.ts` 再生成 → コミットに含める

### `.kiro/` — Spec-Driven Development

**Location**: `/.kiro/`
**Purpose**: Kiro 流のフェーズドリブン仕様管理
**Pattern**:

- `steering/` — プロジェクトメモリ (`product.md` / `tech.md` / `structure.md`)
- `specs/{feature}/` — フィーチャごとに `spec.json` / `requirements.md` / `design.md` / `tasks.md` / `research.md`

## Naming Conventions

- **ファイル**: lowerCamelCase (`lineMessageApi.ts`, `aiClient.ts`)
- **型 / インタフェース**: PascalCase (`LineEventSource`, `ChatRequest`)
- **定数**: `as const` で配列・オブジェクトを固める。マジック値は `constants.ts` / `config.ts` に集約
- **エラー型**: `{Domain}Error` (`GenaiServiceError`, `SessionStoreError`, `ApiKeyDecodeError`)

## Import Organization

優先順:

1. Node 標準 (`node:fs/promises` 等)
2. 外部ライブラリ (`hono`, `zod`, `@google/genai`)
3. 同パッケージ内 (`./` / `../`)
4. 型のみは `import type ...`

```typescript
import { readFile } from "node:fs/promises";
import { Hono } from "hono";
import { z } from "zod";

import { genaiService } from "../services/genai.js"; // ESM: .js 拡張子
import type { ChatRequest } from "../api/generated.js";
```

**ESM 拡張子ルール**:

- **ai** は `"type": "module"` (ESM)。相対 import は **`.js` 拡張子必須** (TS でも `.js` と書く)
- **bot** は esbuild で IIFE バンドルするため `.js` 拡張子を **付けない**

## Code Organization Principles

- **依存方向は厳守**: ai の `services` は `routes` を import しない (逆方向の参照禁止)
- **生成型は import のみ**: `*/src/api/generated.ts` を手で書き換えない。新規 DTO を `interface` で書き起こさず、`components["schemas"][...]` を import
- **副作用は service / route の入口に閉じ込める**: `lib`、`schemas`、純関数ユーティリティは副作用なし
- **エラーは境界で変換**: service が投げる Domain Error を route 層で `ErrorResponse{error, message?, detail?}` に変換、4xx / 5xx / 502 を意味で使い分ける
- **テストは workspace ごと**: `bot/__tests__/`, `ai/__tests__/` に配置。bot 側は `import "./setup.js"` で GAS グローバルをスタブ

---

_Document patterns, not file trees. New files following patterns shouldn't require updates_
