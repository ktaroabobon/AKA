# テストルール

## フレームワーク

- **vitest** を bot / ai 双方で使用
- bot 側：`bot/__tests__/**/*.test.ts`
- ai 側：`ai/__tests__/**/*.test.ts`

## コマンド

| コマンド                         | 用途                      |
| -------------------------------- | ------------------------- |
| `pnpm --filter bot test`         | bot のテスト実行          |
| `pnpm --filter ai test`          | ai のテスト実行           |
| `pnpm --filter <pkg> test:watch` | ウォッチモード            |
| `pnpm -r typecheck`              | 両 workspace の型チェック |

## テストを書く基準

### 必須

- メンション判定・応答ルーティングなど **複雑な条件分岐を含むロジック**
- ai のルート（200 / 400 / 502 / 501 系のエラー分岐）
- ユーティリティ関数（複数パターンの入出力があるもの）
- バリデーション（zod スキーマや手書きパース）

### 推奨

- API 呼び出しのエラーハンドリング（Gemini が落ちたケースなど）
- バグ修正箇所（回帰テスト）

### 不要

- 単純な定数定義ファイル
- 型定義ファイル
- LLM の出力品質そのもの（テストではなく手動の対話で確認）

## GAS API のモック（bot）

GAS のグローバル API（`PropertiesService`, `UrlFetchApp`, `Calendar`）は `vi.stubGlobal` でモック化する。`bot/__tests__/setup.ts` に共通のスタブを集約してあるので、各テストはそれを `import "./setup.js"` する。

```ts
import "./setup.js"; // PropertiesService 等のスタブを有効化
```

## ai 側のモック

- 外部 API（`@google/genai`）は **サービス層のインターフェース**（`GenaiService`）をテストダブルで差し替える
- Hono のルートは `app.fetch(new Request(...))` か `app.request(...)` で直接叩いて統合テスト

## テスト構成

- `describe` でグループ化、`it` でケースを記述
- 正常系 + 異常系を最低限カバー
- アサーションは **期待値が明確**になる粒度で（`toContain` で逃げない）

## カバレッジ

- 現状は導入していない。必要に応じて `@vitest/coverage-v8` を後付け（#20 の CI 整備時に検討）
