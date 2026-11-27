# アーキテクチャ

- `bot/`: LINE Bot（Google Apps Script）。Webhook の受信・メンションの判定・応答の振り分け。テンプレで返せるものは bot で返し、それ以外を ai へ送る
- `ai/`: LLM 応答のバックエンド（Cloud Run の Hono）。`routes/`（zod で検証）→ `services/`（Gemini などの外部 API）。外部 API の例外は services でドメインのエラーに包み、routes でレスポンスに変える
- `openapi/aka.openapi.yaml`: bot と ai の間の契約の SSoT。両側の `src/api/generated.ts` はここから生成する
- bot は GAS で動く: HTTP は `UrlFetchApp.fetch`（`fetch` は使えない）、設定は Script Properties。esbuild で IIFE にまとめる
- 相対 import には bot / ai とも `.js` を付ける
- LINE のトークンは bot の外へ出さない（返信先の画像も bot が取ってから ai へ渡す）
