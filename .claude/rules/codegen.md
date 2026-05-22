# コード自動生成・OpenAPI 同期ルール

## 基本原則

- `openapi/aka.openapi.yaml` を SSOT とし、`openapi-typescript` で `ai/src/api/generated.ts` と `bot/src/api/generated.ts` を生成する
- `*/src/api/generated.ts` は **編集禁止**（自動生成ヘッダのとおり）
- 手書き DTO 禁止。`interface *Response/*Request` を新規追加せず、生成型を import する

## コマンド

| 対象       | コマンド                                | 説明                                                    |
| ---------- | --------------------------------------- | ------------------------------------------------------- |
| 型再生成   | `make oapi/types`（= `pnpm gen:types`） | yaml から TS 型を生成                                   |
| 整合性検証 | `make oapi/check-gen`                   | 生成型と yaml の差分を CI で検証（差分があれば exit 1） |

## API 実装の順序

新規エンドポイント追加・既存 API 変更時：

1. `openapi/aka.openapi.yaml` を編集
2. `make oapi/types` で `ai/src/api/generated.ts` / `bot/src/api/generated.ts` を再生成
3. `ai/src/schemas/` の zod を yaml に合わせて更新
4. `ai/src/routes/` の zValidator が新スキーマを使うようにする
5. bot から呼ぶ部分は `bot/src/api/generated.ts` の型で fetch クライアントを実装
6. 両側のテストを追加／更新
7. コミット時に `ai/src/api/generated.ts` と `bot/src/api/generated.ts` も忘れず含める

## PR 前チェック

- [ ] `make oapi/types` を実行して差分がコミットに含まれているか
- [ ] `make oapi/check-gen` が exit 0
- [ ] ai 側 zod と yaml の schemas が整合しているか目視確認
- [ ] `pnpm -r typecheck` / `pnpm --filter ai test` / `pnpm --filter bot test` 全 pass

## 関連ガード

- CI: `make oapi/check-gen` が `git diff --exit-code ai/src/api/generated.ts bot/src/api/generated.ts` で乖離を検出
