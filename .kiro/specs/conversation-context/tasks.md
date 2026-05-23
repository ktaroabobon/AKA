# Implementation Plan

> Order implies dependency. `(P)` は **直前の同階タスクと並行実行可能** であることを示す。`_Boundary:_` / `_Depends:_` は非自明な情報のみ明示する。

---

- [ ] 1. Foundation: 依存追加と運用前提ドキュメント
- [x] 1.1 ai に Firestore Admin SDK を依存追加する
  - `ai/package.json` の dependencies に `@google-cloud/firestore` ^8.6.0 を追加
  - リポジトリルートで `pnpm install` を実行し `pnpm-lock.yaml` を再生成
  - `pnpm install` が exit 0、`pnpm -r typecheck` が pass する
  - _Requirements: 2.1, 2.2, 3.1, 8.3_

- [x] 1.2 NG ワード辞書を vendor 取込する
  - `MosasoM/inappropriate-words-ja` (MIT, SHA `e24de6e`) の `Sexual.txt` / `Offensive.txt` / `LICENSE` を `ai/vendor/inappropriate-words-ja/` 配下にコピー
  - 同ディレクトリに `COMMIT` ファイルを作り SHA `e24de6e` を 1 行記録
  - `ls ai/vendor/inappropriate-words-ja/` で 4 ファイル (Sexual.txt / Offensive.txt / LICENSE / COMMIT) が存在する
  - _Requirements: 5.2_

- [x] 1.3 ローカル開発ドキュメントを新規作成する
  - `docs/local-dev.md` を作り、`gcloud auth application-default login` での ADC 取得手順、`make ai/dev` で production Firestore に直接接続する旨、必要な GCP プロジェクト権限 (`roles/datastore.viewer` 以上) を記載
  - Firestore Emulator は採用しないことと、その理由 (個人プロジェクト規模) を明記
  - `docs/local-dev.md` ファイルが存在し、上記節がすべて含まれる
  - _Requirements: 2.1, 8.3_

- [x] 1.4 デプロイドキュメントを更新する
  - `docs/deploy-setup.md` に Firestore Native DB 作成手順、`roles/datastore.user` 追加コマンド、`gcloud firestore fields ttls update expiresAt --collection-group=conversation --enable-ttl` の設定手順、新規 `deploy.yml` の使い方、smoke check 失敗時の手動 Cloud Run revision 戻し手順を追記
  - 既存 `ai-deploy.yml` / `bot-deploy.yml` 節を削除し、単一 `deploy.yml` への移行を案内する
  - `docs/deploy-setup.md` を読めば、新規 user が gcloud / GitHub Actions 経由で本仕様一式をセットアップできる
  - _Requirements: 9.5, 9.6, 9.7_

---

- [ ] 2. API 契約: OpenAPI 拡張と生成型再生成
- [x] 2.1 OpenAPI に sessionKey を追加する
  - `openapi/aka.openapi.yaml` の `ChatRequest` スキーマに必須フィールド `sessionKey` (type: string, minLength: 1) を追加
  - `required` 配列に `sessionKey` を含める
  - yaml の `git diff` で `sessionKey` が現れる
  - _Requirements: 7.1_

- [x] 2.2 生成型を再生成して両 workspace にコミットする
  - `make oapi/types` を実行し `ai/src/api/generated.ts` と `bot/src/api/generated.ts` を更新
  - `make oapi/check-gen` が exit 0 で pass する
  - `ai/src/api/generated.ts` / `bot/src/api/generated.ts` の `ChatRequest` に `sessionKey: string` が型として現れる
  - _Requirements: 7.2, 7.3_

---

- [ ] 3. ai 共通 lib 層と prompts 拡張
- [x] 3.1 Firestore 環境変数を追加する
  - `ai/src/config/env.ts` の zod スキーマに `GCP_PROJECT_ID` (string, min 1) を必須追加
  - 必要に応じて `FIRESTORE_DATABASE_ID` (省略時 `(default)`) も optional で追加
  - `pnpm --filter ai typecheck` が pass し、起動時に新規 env がバリデーションされる
  - _Requirements: 2.1, 8.3_

- [ ] 3.2 Firestore クライアント singleton を実装する
  - `ai/src/lib/firestore.ts` を新設し、module top-level で `new Firestore()` (ADC 経由) を生成して export
  - 必要に応じ `databaseId` を env から渡す
  - `ai/src/services/` から `getFirestore()` で同一インスタンスが取得できる、`pnpm --filter ai typecheck` が pass
  - _Requirements: 2.1_

- [ ] 3.3 (P) Trie ユーティリティを実装する
  - `ai/src/lib/trie.ts` に文字列配列からの Trie 構築 (`buildTrie(words)`) と最長一致探索 (`findMatches(trie, text)`) を実装
  - `ai/__tests__/trie.test.ts` で「複数候補のうち最長一致が選ばれる」「部分一致が false positive を出さない」の 2 ケースを最低限カバー
  - `pnpm --filter ai test trie` が pass
  - _Requirements: 5.2_
  - _Boundary: lib/trie_

- [ ] 3.4 (P) ランダム選択関数を実装する
  - `ai/src/lib/pickRandom.ts` に純関数 `pickRandom<T>(arr: readonly T[]): T` を実装 (空配列は呼出側で防ぐ前提)
  - `ai/__tests__/pickRandom.test.ts` で「全要素が一定確率で返る (試行 1000 回で分布確認)」を sanity チェック
  - `pnpm --filter ai test pickRandom` が pass
  - _Requirements: 4.3, 4.5_
  - _Boundary: lib/pickRandom_

- [ ] 3.5 (P) prompts/aka.ts に SAFETY フォールバック文言を追加する
  - 既存の `akaSystemInstruction` を保持したまま、新たに `SAFETY_FALLBACK_MESSAGES: readonly string[]` (3〜5 種類のあかキャラ口調バリエーション、例: 「うーん、よくわかんないや」「ごめんね、それは難しいなあ」) を export
  - `pnpm --filter ai typecheck` が pass、grep で `SAFETY_FALLBACK_MESSAGES` の export が確認できる
  - _Requirements: 4.5_
  - _Boundary: prompts/aka_

---

- [ ] 4. ai サービス層: Moderation / Session / Genai
- [ ] 4.1 (P) ModerationService を実装する
  - `ai/src/services/moderation.ts` に `mask(text): { masked, redactionCount: { pii, profanity } }` の純関数を実装
  - NFKC 正規化、電話番号 (携帯 / 固定)、メール、クレジットカード (Luhn)、マイナンバー、郵便番号の PII 正規表現と、`ai/vendor/inappropriate-words-ja/` から読んだ Trie マッチを順次適用
  - `ai/__tests__/moderation.test.ts` で「全角 PII が正規化されて伏字化」「Luhn 合格カードのみ伏字化」「NG 辞書語が `***` に置換」「`redactionCount` が正しい」の各ケースを pass
  - 原文をログ出力しない (関数内で `console.log` 等を一切使わない)
  - `pnpm --filter ai test moderation` が pass
  - _Requirements: 5.1, 5.2, 5.3, 5.5, 8.2_
  - _Boundary: services/moderation_
  - _Depends: 1.2, 3.3_

- [ ] 4.2 SessionService を実装する
  - `ai/src/services/session.ts` に `getRecent(sessionKey, now): Promise<ConversationMessage[]>` と `append(sessionKey, userText, modelText, now): Promise<void>` を実装
  - `getRecent` は Firestore からドキュメントを取得し、「直近 20 ターン」かつ「最終発話から 2h 以内」でフィルタ、超過分は除外
  - `append` は 1 ドキュメントに `messages` 配列を append-only round-robin (20 件で trim)、`lastTurnAt = now`、`expiresAt = now + 24h` を `set({ merge: false })` で書く
  - Firestore I/O 失敗は `SessionStoreError` に包んで投げる
  - `pnpm --filter ai typecheck` が pass、`SessionService` が `services/` から import 可能
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 8.3_
  - _Depends: 3.2_

- [ ] 4.3 SessionService の単体テストを書く
  - `ai/__tests__/session.test.ts` で Firestore クライアントを `vi.mock` し、以下を検証:
    - 「21 件以上ある履歴に対し直近 20 件のみ返す」「最終発話から 2h 超過なら空配列を返す」(Req 3.1, 3.2)
    - 「`expiresAt = lastTurnAt + 24h` が設定される」「超過 message を古い順に破棄する」(Req 2.2, 2.3)
    - 「ドキュメント不在 (TTL 削除済み) は空配列を返す」(Req 2.4)
    - 「Firestore I/O 失敗時 `SessionStoreError` を投げる」(Req 8.3)
  - `pnpm --filter ai test session` が pass
  - _Requirements: 2.2, 2.3, 2.4, 3.1, 3.2, 8.3_
  - _Depends: 4.2_

- [ ] 4.4 (P) GenaiService を chats API に書き換える
  - `ai/src/services/genai.ts` を `ai.chats.create({ model, config: { systemInstruction, safetySettings }, history })` + `chat.sendMessage` 形式に refactor
  - `safetySettings` を 4 カテゴリ (`HARASSMENT` / `HATE_SPEECH` / `SEXUALLY_EXPLICIT` / `DANGEROUS_CONTENT`) すべて `BLOCK_MEDIUM_AND_ABOVE` に設定
  - `finishReason === SAFETY` または空 candidates の場合は `GenaiSafetyBlockedError` (新クラス、`GenaiServiceError` を継承) を投げる
  - `ai/__tests__/genai.test.ts` (新設または既存修正) で「正常応答」「SAFETY ブロック時 `GenaiSafetyBlockedError`」「ネットワークエラー時 `GenaiServiceError`」の 3 ケースを pass
  - `pnpm --filter ai test genai` が pass
  - _Requirements: 4.1, 4.2, 4.3_
  - _Boundary: services/genai_
  - _Depends: 3.5_

---

- [ ] 5. ai route 層: zod 拡張と orchestration
- [ ] 5.1 zod スキーマに sessionKey を必須追加する
  - `ai/src/schemas/chat.ts` の `chatRequestSchema` に `sessionKey: z.string().min(1)` を必須として追加
  - 既存の `prompt` / `encrypted_api_key` の制約は変更しない
  - `pnpm --filter ai typecheck` が pass
  - _Requirements: 7.4, 7.5_

- [ ] 5.2 chat ルートを orchestration に書き換える
  - `ai/src/routes/chat.ts` を以下の順に再構成:
    1. `moderation.mask(prompt)` でユーザー発話マスク
    2. `session.getRecent(sessionKey, now)` で履歴取得
    3. `genai.generate({ history, userText: maskedPrompt, encryptedApiKey })` を呼び出し
    4. `moderation.mask(reply)` でモデル応答マスク
    5. `session.append(sessionKey, maskedPrompt, maskedReply, now)` で履歴追記 (Gemini 成功時のみ)
  - エラー変換: `GenaiSafetyBlockedError` → 200 + `pickRandom(SAFETY_FALLBACK_MESSAGES)` を `reply` に、履歴は append しない / `SessionStoreError` → 500 `internal_error` / `GenaiServiceError` (SAFETY 以外) → 502 `genai_failed`
  - pino で `sessionKey`、`historyTurns`、`geminiDurationMs`、`piiRedactions`、`profanityRedactions`、`finishReason` を構造化ログ出力 (原文は出さない)
  - `pnpm --filter ai typecheck` が pass、`curl -X POST /chat/genai` が正常時 200 を返す
  - _Requirements: 2.5, 4.3, 4.4, 4.5, 5.4, 5.5, 7.4, 7.5, 8.1, 8.3_
  - _Depends: 3.4, 3.5, 4.1, 4.3, 4.4, 5.1_

- [ ] 5.3 chat ルートの統合テストを更新する
  - `ai/__tests__/chat.test.ts` に以下のケースを追加 (`vi.mock` で moderation / session / genai を差し替え):
    - 正常系: 順序 (mask → getRecent → genai → mask → append) で呼ばれ 200 を返す
    - SAFETY ブロック: `GenaiSafetyBlockedError` 発生時に 200 + `SAFETY_FALLBACK_MESSAGES` のいずれかが返り、`session.append` が呼ばれない
    - Firestore 失敗: `SessionStoreError` 発生時に 500 `internal_error`
    - バリデーション: `sessionKey` 空文字 / 欠落で 400 `invalid_request`
    - Gemini 一般失敗: `GenaiServiceError` 発生時に 502 `genai_failed`
  - `pnpm --filter ai test chat` が全 pass
  - _Requirements: 4.3, 4.4, 5.3, 7.5, 8.3_

---

- [ ] 6. bot 側: sessionKey 組立と AI 連携
- [ ] 6.1 (P) sessionKey builder を実装する
  - `bot/src/lib/sessionKey.ts` を新設し `buildSessionKey(source: LineEventSource): string | null` を実装
  - `source.type === "group"` → `group:{groupId}`、`"room"` → `room:{roomId}`、`"user"` → `user:{userId}`、対応 ID 欠落 / 未対応 type は `null`
  - `bot/__tests__/sessionKey.test.ts` で 4 ケース (各 type + null) を pass
  - `pnpm --filter bot test sessionKey` が pass
  - _Requirements: 1.1, 1.2, 1.3, 1.5_
  - _Boundary: bot/lib/sessionKey_

- [ ] 6.2 aiClient に sessionKey を同梱する
  - `bot/src/aiClient.ts` の `chatWithAi` に `sessionKey: string` 引数を追加し、`UrlFetchApp.fetch` の payload に同梱
  - 生成型 `components["schemas"]["ChatRequest"]` を使い、手書き interface を作らない
  - HTTP 非 2xx / network エラー / timeout で `null` を返す挙動は維持 (controller 側 fallback 用)
  - `pnpm --filter bot typecheck` が pass、`chatWithAi` のシグネチャに sessionKey が現れる
  - _Requirements: 1.4, 6.3, 6.4, 8.4_
  - _Depends: 2.2_

- [ ] 6.3 controller に sessionKey 経路を組み込む
  - `bot/src/controller.ts` の AI 呼び出し直前で `buildSessionKey(event.source)` を実行し、`null` なら AI 呼び出しをスキップして既存 random fallback に切り替え
  - `null` でなければ `chatWithAi(prompt, encryptedApiKey, sessionKey)` を呼び、応答 / `null` 時の random fallback は既存通り
  - 既存 `deps` 注入パターンに `sessionKeyBuilder` を任意 override として追加 (テスト容易性)
  - `pnpm --filter bot typecheck` が pass、grep で `buildSessionKey(` が controller から参照される
  - _Requirements: 1.5, 6.1, 6.2, 6.3, 6.4, 8.4_
  - _Depends: 6.1, 6.2_

- [ ] 6.4 controller の単体テストを更新する
  - `bot/__tests__/controller.test.ts` に以下を追加:
    - `event.source.type === "user"` で `user:{id}` sessionKey が aiClient に渡る
    - `event.source.type === "group"` でメンション時に `group:{id}` sessionKey が渡る
    - `source` 不正 (`buildSessionKey` が `null`) で AI を呼ばず random fallback
    - `chatWithAi` が `null` を返したら random fallback に倒れる (既存 + sessionKey 経路の再確認)
  - `pnpm --filter bot test controller` が pass
  - _Requirements: 1.5, 6.3, 6.4_
  - _Depends: 6.3_

---

- [ ] 7. 統合 CD workflow
- [ ] 7.1 単一 deploy workflow を新設する
  - `.github/workflows/deploy.yml` を新規作成し、`on: workflow_dispatch` (input: `ref` デフォルト master) を設定
  - jobs:
    - `bot`: 既存 `bot-deploy.yml` 相当 (checkout / pnpm setup / clasp credentials 復元 / `pnpm --filter bot build` / `clasp push --force`)
    - `ai`: `needs: bot`、既存 `ai-deploy.yml` 相当 (WIF 認証 / `gcloud builds submit` / `gcloud run deploy` / `/health` smoke check)
  - smoke check で curl の HTTP code が 2xx でなければ workflow を失敗で終了する
  - GitHub の Actions タブで `Deploy AKA` が dispatch でき、bot → ai 順に直列実行され、smoke check が成功すれば green
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 9.7_

- [ ] 7.2 既存個別 workflow を削除する
  - `.github/workflows/ai-deploy.yml` と `.github/workflows/bot-deploy.yml` を削除
  - リポジトリの Actions タブから旧 workflow が消え、`Deploy AKA` のみが残る
  - _Requirements: 9.5_

---

- [ ] 8. 統合検証
- [ ] 8.1 全 quality check を通す
  - リポルートで `make lint` (= `pnpm lint`)、`make typecheck` (= `pnpm -r typecheck`)、`pnpm --filter bot test`、`pnpm --filter ai test`、`make oapi/check-gen` を順に実行
  - すべて exit 0 で pass する
  - _Requirements: 7.3, 全 spec の回帰確認_

- [ ] 8.2 ローカル smoke check
  - `gcloud auth application-default login` 済みの環境で `make ai/dev` を起動
  - `curl -s http://localhost:8080/health` が 200 を返す
  - `curl -s -X POST http://localhost:8080/chat/genai -H 'content-type: application/json' -d '{"sessionKey":"user:test","prompt":"おはよう","encrypted_api_key":"..."}'` が 200 で `reply` を含む JSON を返す
  - Firestore コンソールで `conversation/user:test` ドキュメントに `messages`, `lastTurnAt`, `expiresAt` が書き込まれていることを確認
  - _Requirements: 2.1, 2.3, 4.1, 5.3_
  - _Depends: 8.1_

---

## Implementation Notes

- 新規 / 編集した `.md` ファイルは必ず `pnpm exec prettier --write <path>` を実行してから提出すること。Prettier 整形漏れは CI / レビューで弾かれる (task 1.3 の reject 事例)。
- task 2.1+2.2 のコミット直後は **bot typecheck が一時的に壊れる** (aiClient が sessionKey を渡していないため)。これは task 6.2 で解消する想定。中間状態なので task 8.1 の quality check は最後に回す。
