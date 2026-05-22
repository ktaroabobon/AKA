# コーディングスタイル

## 基本

- pnpm workspace のルートで ESLint / Prettier / TypeScript を一元管理
- `tsconfig.base.json` を `bot/tsconfig.json` と `ai/tsconfig.json` から extends する

## TypeScript

- strict モード有効（base config）
- 関数の戻り値型は **public な関数では明示**。内部の小さな関数は推論に任せて OK
- `any` は基本禁止。やむを得ない場合はコメントで理由を残す
- 未使用変数は `_` プレフィックスで許可

## モジュール / import

- ai は `"type": "module"` (ESM)。**相対 import には `.js` 拡張子を付ける**（TS でも `.js`）
- bot は esbuild で IIFE バンドルするため `.js` 拡張子は付けない
- import 順序：
  1. Node 標準（`node:fs/promises` など）
  2. 外部ライブラリ
  3. 同パッケージ内（`./` / `../`）
  4. 型のみの import は `import type ...` を使う

## 命名

- ファイル: lowerCamelCase（`lineMessageApi.ts`）。GAS 側は旧 `.gs` 命名と揃えるため `lineMessageApi` のように API 名 + Camel
- 型: PascalCase。`interface` と `type` は意味で使い分け（拡張性が要るなら interface、union や別名なら type）
- 定数: `as const` で配列・オブジェクトを固める

## マジック値

- マジック文字列・マジックナンバーは原則 `constants.ts` か `config.ts` に集約
- LINE / Gemini の URL や API キー名（`CHANNEL_ACCESS_TOKEN` 等）はコード中にハードコードせず、定数化または Script Properties / 環境変数経由

## エラー処理

- ライブラリ層では汎用エラーを **ドメイン固有エラー** に包んで投げる（例: `GenaiServiceError`, `ApiKeyDecodeError`）
- ハンドラ層（Hono の route, GAS の controller）でドメインエラーを補足し、適切なレスポンスへ変換

## コメント

- 「何を」ではなく「なぜ」を書く
- 読めば分かることは書かない
- TODO は GitHub Issue 番号を含める（`// TODO #21: 会話履歴を渡す`）

## ファイル末尾

- 改行で終わる（Prettier がやってくれる）
