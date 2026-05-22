# セキュリティガイドライン

## シークレットの取扱

- LINE のチャネルアクセストークン (`CHANNEL_ACCESS_TOKEN`)、Bot の `BOT_ID` は **GAS の Script Properties に保管**。コード中にハードコード禁止
- Gemini の API キーは **bot 側で base64 化してリクエストごとに送信**。ai 側でデコードして都度使用し、サーバ側にキャッシュ・保管しない
- `.env` / `.env.local` / `.clasprc.json` は **コミット禁止**（`.gitignore` 済み）
- Cloud Run のサービスアカウント鍵をリポジトリに置かない。デプロイは Workload Identity Federation 推奨（#20 で整備予定）

## コミット前チェックリスト

- [ ] `.env*` がステージに含まれていないこと
- [ ] ハードコードされたシークレット（API キー・トークン）がないこと
- [ ] Script Properties / 環境変数経由でのみシークレットを取得していること

## ユーザー入力のバリデーション

- ai の API は **すべて zod でバリデーション**してから処理する（`@hono/zod-validator`）
- 失敗時は 400 を返し、サーバ内部のスタックトレースをレスポンスに含めない
- bot 側で LINE Webhook の値（mention・message.text）を信用しすぎない。空文字・不正型ガードを行う

## エラーレスポンス

- 上流 API のエラーメッセージを **そのまま LINE のエンドユーザーに転送しない**
- 内部エラー詳細はサーバログ（pino, Stackdriver）にのみ出し、レスポンスはコード化されたエラータイプ（`invalid_request` 等）と中立メッセージに留める

## LINE Webhook の真正性

- 現状 `X-Line-Signature` ヘッダ検証は実装していない（GAS では URL 経由で誰でも叩ける）
- 将来的にチャネルシークレットを Script Properties に保持して HMAC-SHA256 検証する追加 Issue を検討する

## CORS（ai）

- `ai/` は bot からの呼び出しのみを想定。ブラウザクライアントは無いため CORS は厳密化しない
- 将来クライアントを増やすときは Hono のミドルウェアで明示的に許可ドメインを設定する

## 依存関係

- `pnpm audit` を定期的に確認（CI 整備時に組み込む）
- メジャーアップグレードは別 PR で
