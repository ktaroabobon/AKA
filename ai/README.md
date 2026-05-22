# ai

AKA の LLM 応答バックエンド。Hono を Node.js ランタイムで動かし、Cloud Run にデプロイする。

## エンドポイント

| Method | Path          | 説明                    |
| ------ | ------------- | ----------------------- |
| GET    | `/health`     | ヘルスチェック          |
| POST   | `/chat/genai` | Gemini を使って応答生成 |

リクエスト／レスポンスの詳細は `src/schemas/chat.ts` の zod スキーマを参照。

## API キーの渡し方

GAS 側から base64 エンコードした API キーをリクエストごとに送る方式を引き継いでいる。

```json
{
  "prompt": "こんにちは",
  "encrypted_api_key": "<base64-encoded gemini api key>"
}
```

## ローカル開発

ルートで `pnpm install` 済みなら：

```bash
make ai/dev       # tsx watch（ホットリロード）
make ai/build     # tsc でビルド
make ai/test      # vitest
```

`.env` は `ai/.env.sample` をコピーして作成。

## デプロイ

`ai/Dockerfile` でマルチステージビルド。Cloud Run の既存サービス（`aka-ai-api-service`）に
デプロイする。CI/CD 整備は #20 で行う。

```bash
docker build -t aka-ai -f ai/Dockerfile ai
docker run -p 8080:8080 --env-file ai/.env aka-ai
```
