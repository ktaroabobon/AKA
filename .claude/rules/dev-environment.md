# 開発環境

- ランタイムは `mise.toml` で固定し、依存は pnpm workspace で入れる（`make install`）
- 検証は CI と同じものを回す: `pnpm lint` / `pnpm format` / `pnpm -r typecheck` / `pnpm --filter ai test` / `pnpm --filter bot test` / `pnpm --filter bot build` / `make oapi/check-gen`
- API を変えるときは `openapi/aka.openapi.yaml` を直してから `make oapi/types` で型を作り直し、ai の zod を合わせる。`*/src/api/generated.ts` は手で書かず、リクエスト・レスポンスの型を手書きしない
- テストは vitest。bot の GAS のグローバル（`PropertiesService` など）は `bot/__tests__/setup.ts` のスタブを使う。ai の外部 API はサービス層の interface を差し替える
- LLM の出力の質はテストでなく、手で対話して確かめる
