# API 通信ルール

## 真実の所在 (Source of Truth)

- `bot/` と `ai/` の間の API 仕様は `openapi/aka.openapi.yaml` が **SSOT**
- yaml を編集したら必ず `make oapi/types` を走らせ、`ai/src/api/generated.ts` と `bot/src/api/generated.ts` を再生成してコミットする
- CI が `make oapi/check-gen` で差分検出するため、コミット忘れは落ちる

## 型の取り扱い（最重要）

- `*/src/api/generated.ts` は **手動編集禁止**（PreToolUse hook で将来ブロック予定）
- 新規にリクエスト／レスポンス型を `interface` で書き起こすことは禁止。必ず `generated.ts` の `components["schemas"][...]` を import する
- ai 側の `zod` スキーマ（`ai/src/schemas/`）は **OpenAPI と整合させる**。zod 側を変えたら yaml も合わせて更新する

## エンドポイント追加・変更の手順

1. `openapi/aka.openapi.yaml` を編集
2. `make oapi/types` で `*/src/api/generated.ts` を再生成
3. `ai/src/schemas/` の zod を yaml に合わせて更新
4. `ai/src/routes/` で zod 経由のバリデーション
5. `bot/` から呼ぶ場合は `bot/src/api/generated.ts` の型を使ったクライアントを書く
6. 双方のテストを追加・更新

## エラーレスポンス

OpenAPI で `ErrorResponse` として定義済み：

```ts
type ErrorResponse = {
  error: string; // invalid_request / invalid_api_key / genai_failed / internal_error
  message?: string; // 補足
  detail?: unknown; // バリデーションエラーなど
};
```

- 4xx は **クライアントの問題**、502 は **上流（Gemini）の問題**、500 は **サーバ内部エラー**として区別する
- エラー詳細をユーザー（LINE Bot 経由のエンドユーザー）に直接見せない。bot 側で吸収して中立的なメッセージにフォールバック

## bot → ai の呼び出し

- bot は GAS 上のため `UrlFetchApp.fetch` を使用（`fetch` は使えない）
- AI のベース URL は Script Properties から取得（ハードコード禁止）
- 認証は当面なし。将来 Cloud Run の認証を入れる場合は別途検討
- Gemini API キーは bot 側で base64 化してリクエストごとに送る（ai 側はサーバ持ち API キーを持たない）

## ai → 外部 API

- Gemini は `@google/genai` SDK 経由
- 外部 API の例外は必ずサービス層でカスタムエラー（`GenaiServiceError` 等）に包んでから上に投げる
