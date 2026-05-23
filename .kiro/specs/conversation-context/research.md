# Gap Analysis: conversation-context

> 既存コードベースと要件の差分を整理し、実装方針判断の材料を提供する。意思決定はせず、選択肢と根拠を提示する。

調査対象: `/Users/ktaroabobon/workspace/AKA` (monorepo: `bot/`, `ai/`, `openapi/`)
調査日: 2026-05-22

---

## 1. Current State Investigation

### 1.1 アーキテクチャ概観

| パス       | 役割                              | 実行環境           | 状態                                 |
| ---------- | --------------------------------- | ------------------ | ------------------------------------ |
| `bot/`     | LINE Webhook / メンション判定     | GAS (esbuild IIFE) | TS 化済、AI fallback 実装済          |
| `ai/`      | LLM 応答 (Hono / `@google/genai`) | Cloud Run Node 22  | 単一ターン Gemini 呼び出しのみ       |
| `openapi/` | bot ↔ ai の API 契約              | —                  | `ChatRequest` に `sessionKey` 未定義 |

### 1.2 主要モジュール状態

#### `ai/`

| ファイル                       | 現状                                                                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai/src/services/genai.ts`     | `@google/genai` v1.0.0、`ai.models.generateContent({ contents: prompt })` の **単一ターン**。`akaSystemInstruction` をハードコード systemInstruction として渡している。`safetySettings` 設定なし。`GenaiServiceError` 定義済 |
| `ai/src/routes/chat.ts`        | zod スキーマ `{ prompt, encrypted_api_key }`。`sessionKey` なし                                                                                                                                                              |
| `ai/src/schemas/`              | 上記 chat スキーマのみ                                                                                                                                                                                                       |
| `ai/src/prompts/aka.ts`        | 100 行超のキャラ設定 string literal。 multi-turn 渡し方は未対応                                                                                                                                                              |
| `ai/src/config/env.ts`         | `PORT`, `LOG_LEVEL`, `GEMINI_MODEL`, `NODE_ENV` のみ。**Firestore 関連 env 未定義**                                                                                                                                          |
| `ai/src/api/generated.ts`      | `ChatRequest = { prompt, encrypted_api_key }`, `ChatResponse = { reply }`                                                                                                                                                    |
| `ai/src/app.ts`                | Hono ロガー / errorHandler 設定済、`/health` + `/chat/genai` を結合                                                                                                                                                          |
| `ai/package.json` dependencies | `@google/genai ^1.0.0`、`hono`, `pino`, `zod` 等。**`@google-cloud/firestore` 未導入**                                                                                                                                       |

#### `bot/`

| ファイル                    | 現状                                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------- |
| `bot/src/controller.ts`     | ルーティングは `join → 完全一致 → メンション+自己紹介 → メンション+フリー文 → AI fallback (chatWithAi)` と段階化済。AI 失敗時の random fallback も実装済 |
| `bot/src/aiClient.ts`       | `UrlFetchApp.fetch` で `/chat/genai` POST。`{ prompt, encrypted_api_key }` 送信。エラー時 `null` 返却                                                    |
| `bot/src/lineMessageApi.ts` | `event.source.type` の参照箇所は `isBotMentioned()` (L34-45)。`user / group / room` 全分岐対応済                                                         |
| `bot/src/types/line.ts`     | `LineSourceType = "user"                                                                                                                                 | "group" | "room"` 定義済 |
| `bot/src/api/generated.ts`  | ai 側と同じ生成型、`sessionKey` なし                                                                                                                     |

#### `openapi/aka.openapi.yaml`

- `/health` GET, `/chat/genai` POST
- `ChatRequest`: `{ prompt: string (minLength:1), encrypted_api_key: string (minLength:1) }`
- `ChatResponse`: `{ reply: string }`
- エラーコード 400/500/502 定義済

### 1.3 テスト基盤

| ファイル                           | 現状                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ai/__tests__/chat.test.ts`        | vitest + `vi.mock` で `GenaiService` テストダブル化。正常 / `ApiKeyDecodeError` / `GenaiServiceError` / unexpected error 系を網羅 |
| `bot/__tests__/controller.test.ts` | `generateReply` に `deps.ai = vi.fn()` を注入する DI パターン                                                                     |
| 共通                               | `bot/__tests__/setup.ts` で GAS グローバル (`PropertiesService` 等) を `vi.stubGlobal` でスタブ                                   |

### 1.4 デプロイ周辺

| 項目                   | 現状                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ai/Dockerfile`        | Node 22-alpine 2 段ビルド、pnpm 11.2.2 (corepack)、`pnpm --filter ai --prod --legacy deploy`                                                                                               |
| `cloudbuild.yaml`      | docker build → asia.gcr.io push、`logging: CLOUD_LOGGING_ONLY`                                                                                                                             |
| `docs/deploy-setup.md` | WIF SA `github-actions-deployer` に付与済ロール: `cloudbuild.builds.editor / run.admin / iam.serviceAccountUser / storage.admin / artifactregistry.reader`。**Firestore 系ロールは未付与** |

---

## 2. Requirements Feasibility Analysis

### 2.1 Requirement → Asset Map

| 要件 (要件 ID)                                          | 関連既存資産                                       | Gap タグ                                                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Req 1 セッションキー組立 (`group:` / `room:` / `user:`) | `bot/src/lineMessageApi.ts` (`source.type` 判定済) | **Missing**: `bot/src/aiClient.ts` で sessionKey を組み立てて送る関数が無い                                                    |
| Req 2 Firestore 履歴保存 + 24h TTL                      | (なし)                                             | **Missing**: Firestore Admin SDK 導入、`ai/src/services/session.ts` 新設、TTL policy 設定、SA に `roles/datastore.user` 追加   |
| Req 3 履歴ウィンドウ (20 ターン AND 2h)                 | (なし)                                             | **Missing**: ウィンドウ計算ロジック (session service 内)                                                                       |
| Req 4 multi-turn Gemini 呼び出し + safetySettings       | `ai/src/services/genai.ts` (単一ターン構造)        | **Missing/Refactor**: `ai.chats.create({ history, config })` + `sendMessage` への書き換え、`safetySettings` 4 カテゴリ設定追加 |
| Req 5 PII + 罵詈雑言マスキング (3 ポイント)             | (なし)                                             | **Missing**: `ai/src/services/moderation.ts` 新設、`MosasoM/inappropriate-words-ja` 辞書 vendor 取込み、PII 正規表現セット     |
| Req 6 ルーティング (テンプレ→AI→fallback)               | `bot/src/controller.ts` (既に該当構造)             | **Minor**: AI 呼び出し引数に sessionKey を追加するのみ                                                                         |
| Req 7 OpenAPI `sessionKey` 必須 + 型再生成              | `openapi/aka.openapi.yaml` `ChatRequest`           | **Missing**: yaml に `sessionKey: string (minLength:1, required)` 追加 → `make oapi/types`                                     |
| Req 8 観測性 (構造化ログ)                               | `ai/src/app.ts` Hono logger / `pino` 導入済        | **Constraint**: 既存 logger を再利用、マスキング件数や sessionKey をログフィールドに追加                                       |

### 2.2 技術的需要

- **データモデル**: Firestore document  
  `conversation/{sessionKey}` ⇒ `{ messages: [{role, text, ts}], lastTurnAt, expiresAt }`
- **API 拡張**: `ChatRequest.sessionKey: string` (必須) を OpenAPI に追加
- **新サービス**:
  - `session.ts` (Firestore 読み書き + 履歴ウィンドウ計算)
  - `moderation.ts` (PII 正規表現 + NG 辞書 Trie マッチ)
- **依存追加**: `@google-cloud/firestore` (ai 側のみ)。**npm 上の罵詈雑言ライブラリは追加しない** (辞書を vendor 取込み)
- **デプロイ**: SA に `roles/datastore.user` 追加、Firestore 有効化 + TTL policy 設定

### 2.3 既存パターン制約

- **TS strict + ESM (`type: module`)**: 相対 import に `.js` 拡張子必須
- **ai 側 zod スキーマと OpenAPI を同期**: 片方変えたら両方変える (`.claude/rules/api.md`)
- **生成型手書き禁止**: `*/src/api/generated.ts` に手を入れない (PreToolUse hook 予定)
- **エラーは Domain Error で包む**: `GenaiServiceError` パターンに準拠 → `SessionStoreError`, `ModerationError` 等の新設候補
- **テスト DI**: bot は `deps.ai` 注入、ai は `vi.mock` でサービス層差し替え — 同じパターンを `SessionService` `ModerationService` にも適用可

### 2.4 Research Needed

以下は **設計フェーズで詰める** べき項目 (gap analysis では決めない):

1. **Firestore Admin SDK の Cloud Run 認証**: ADC で SA の権限を継承するだけで OK か、明示的 init が必要か → [Cloud Run + Firestore Admin SDK のサンプル確認]
2. **Firestore TTL policy の設定方法**: Console / CLI / Terraform のどれで設定すべきか (`docs/deploy-setup.md` に追記する手順)
3. **`@google/genai` chats API のセッション再利用**: 各リクエストごとに `chats.create({ history })` するのが正解か、それとも cache すべきか (Cloud Run は短命なので毎回 create で問題ないはず)
4. **`MosasoM/inappropriate-words-ja` 辞書のサイズと Trie 構築コスト**: モジュール初期化時に一度だけ Trie を構築する戦略で問題ないか
5. **PII 正規表現の Unicode 正規化粒度**: NFKC で「０９０ー１２３４ー５６７８」(全角) を「090-1234-5678」に揃えてから match で十分か (具体的なケース確認)
6. **Firestore 書き込み失敗時の挙動**: Req 8.3 で「500 を返す」と決まっているが、Gemini 呼び出しは成功している場合に LINE エンドユーザーには応答を返すべきか / fallback に倒すべきか (Req 6.3 との関係整理)
7. **複数インスタンス並行書き込みの整合性**: 同一 sessionKey に対し連投メッセージが並行処理された時、Firestore のトランザクションをどう張るか (`runTransaction` の必要性)

---

## 3. Implementation Approach Options

### Option A: 既存サービスを拡張 + 必要箇所のみ新規 ⭐ Recommended

**該当範囲**:

- **拡張**: `ai/src/services/genai.ts` を multi-turn 対応に書き換え、`ai/src/routes/chat.ts` の zod スキーマに `sessionKey` 追加、`bot/src/aiClient.ts` に sessionKey フィールド追加、`bot/src/controller.ts` で sessionKey を引数化
- **新規**: `ai/src/services/session.ts` (Firestore CRUD + ウィンドウ計算)、`ai/src/services/moderation.ts` (PII + NG 辞書)、`ai/src/vendor/inappropriate-words-ja/` (辞書テキスト)、`ai/src/config/env.ts` に Firestore 系 env 追加

**整合性**: 既存の `services/` 配下にサービスを増やすだけで、レイヤー (`routes → services → vendor`) は変えない。zod / OpenAPI 同期、Domain Error 包み込みパターンも踏襲。

**Trade-offs**:

- ✅ ファイル増は service 2 個 + vendor のみ。レビュー範囲が局所化
- ✅ `simplicity.md` の YAGNI / KISS と整合 (個人プロジェクト規模に適切)
- ✅ 既存テスト基盤 (vi.mock / deps 注入) をそのまま流用可
- ❌ `genai.ts` の書き換えは内部的に大きい (`generateContent` → `chats.create + sendMessage`)。テスト書き直し必要

### Option B: 「会話オーケストレータ」サービスを新設し既存 genai を低レイヤ化

**該当範囲**:

- 新設: `ai/src/services/conversation.ts` (session + moderation + genai を統括するファサード)
- `routes/chat.ts` は `conversationService.handle(req)` を呼ぶだけにする
- `genai.ts` は純粋な Gemini API ラッパに留める

**Trade-offs**:

- ✅ 責務が綺麗に分かれ、後の Vertex AI memory 等への移行も差し替えやすい
- ❌ 個人プロジェクトとしてはレイヤが過剰 (`.claude/rules/simplicity.md` の「ファサード化を将来のために入れない」と整合しない)
- ❌ レビュー対象ファイル数が増える、テストも統合 / 単体の両方が必要

### Option C: Hybrid (Option A をベースに「マスキングだけ別レイヤ化」)

**該当範囲**:

- Option A に加え、`moderation.ts` を「入力前 hook / 出力後 hook」として明示的にラップする小さな middleware を `app.ts` に追加
- session / genai は services のまま

**Trade-offs**:

- ✅ マスキングをロジック中央でなく境界 (middleware) で適用するので「漏れがない」設計に近づく
- ❌ ただし Hono middleware で Request body を変更するのは難しく、特に履歴保存用に「マスク済みテキスト」を service 層に渡す必要があり、結局 service 層でも処理が要る
- ❌ 利点が小さく、複雑度が増す

---

## 4. Effort / Risk

| 項目       | 評価              | 根拠                                                                                                                                                                                                                                |
| ---------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Effort** | **M (3〜7 days)** | 既存パターン (Hono routes + services + zod + OpenAPI 同期) を踏襲できるが、Firestore SDK 新規導入、`@google/genai` chat API への書き換え、マスキング辞書整備、テスト追記、デプロイ SA 更新まで含めると数日                          |
| **Risk**   | **Medium**        | Firestore 認証 / TTL policy / chat API は **既知技術だが本プロジェクトで初導入**。pnpm workspace + Dockerfile での依存解決は前 sprint で安定化済 (Cloud Build / Cloud Run の経験あり)。マスキングは規模が小さく単体テストで担保可能 |

### 想定リスク

| リスク                                                                  | 緩和策                                                                                                         |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Firestore Admin SDK の ADC 認証が Cloud Run で動かない                  | `ai-deploy.yml` の smoke test (`/health`) を拡張し、Firestore へ書き込めるかも検証                             |
| `@google/genai` の `chats.create` が `generateContent` と挙動が異なる   | 旧 `generateContent` ベースのテストを完全に置き換え、history 渡しの動作を vi.mock で詳細検証                   |
| 辞書 Trie 構築コストで cold start が顕著に伸びる                        | module top-level で 1 回構築 → メモリに保持 (Cloud Run instance は数分生存)。問題があれば lazy init に切り替え |
| Firestore TTL policy の設定漏れで履歴が無限蓄積                         | デプロイ手順に明示、CI で `gcloud firestore fields ttls list` を smoke check に追加検討                        |
| sessionKey が空 / 不正でも Firestore に書き込んで polluted state を作る | zod で minLength:1 必須、route 層で fail fast                                                                  |

---

## 5. Recommendations for Design Phase

### Preferred Approach

**Option A (既存サービスを拡張 + 必要箇所のみ新規)** を推奨。

理由:

- `.claude/rules/simplicity.md` の YAGNI / KISS と整合
- 既存 services レイヤ規約 (Domain Error 包み込み、zod / OpenAPI 同期、テスト DI) をそのまま延長
- 新規追加は `session.ts` `moderation.ts` の 2 ファイル + vendor 辞書のみで、変更スコープが明確
- Option B のような「将来のための抽象化」は本プロジェクト規模に対し過剰

### 設計フェーズで決めるべき主要事項

1. **Firestore コレクション設計**: ドキュメント形 (`messages` array vs sub-collection)、TTL フィールド命名、index 要否
2. **`SessionService` のインタフェース**: `getRecent(sessionKey, now)` / `append(sessionKey, userMsg, modelMsg, now)` の 2 メソッド構成で十分か
3. **`ModerationService` のインタフェース**: `mask(text): { masked, redactionCount }` の純粋関数で OK か
4. **`GenaiService` の引数**: 既存 `request: { prompt, encrypted_api_key }` を `{ history, userText, encryptedApiKey }` に変更する形
5. **エラー型階層**: `SessionStoreError`, `ModerationError` を追加するか、既存 `GenaiServiceError` の `cause` で吸収するか
6. **Firestore トランザクション戦略**: 並行書き込みを `runTransaction` で守るか、最終書き込み優先 (LWW) で割り切るか

### Research Items to Carry Forward

設計フェーズで `WebSearch` / 公式 docs を当たる項目:

- `@google/genai` v1.0.0 の `chats.create` シグネチャと `Content` 型 (`{ role: 'user'|'model', parts: [{ text }] }`)
- `@google-cloud/firestore` Admin SDK の Node.js での ADC 初期化と TTL policy 設定手順
- Gemini `safetySettings` の API パラメータ実体 (TS 型の HarmCategory / HarmBlockThreshold 一覧)
- `MosasoM/inappropriate-words-ja` の最新コミット (2021-12 以降の更新がないか) / vendor 取込時のライセンス表記方法

### 設計フェーズ着手前の確認事項 (運用)

- WIF SA に `roles/datastore.user` を付与しておく (デプロイ前提条件)
- Firestore (Native mode) を `aka-ai-api` プロジェクトで有効化
- Firestore TTL policy を `conversation` collection の `expiresAt` フィールドに設定

---

## Output Checklist

- [x] Requirement-to-Asset Map with gaps tagged (Missing / Refactor / Constraint / Minor)
- [x] Options A/B/C with short rationale and trade-offs
- [x] Effort (M) と Risk (Medium) を根拠付きで提示
- [x] Recommendations: Option A 推奨 + 設計フェーズで決めるべき事項
- [x] Research Items: 設計フェーズで持ち越す調査項目

---

# Design Phase Discovery (2026-05-23)

設計フェーズ着手時に Light Discovery + 外部依存調査 + Synthesis を実施。

## 1. 外部依存の最新仕様

### 1.1 `@google-cloud/firestore` (Node Admin SDK)

| 項目           | 結論                                                             | 出典          |
| -------------- | ---------------------------------------------------------------- | ------------- |
| 最新安定版     | **v8.6.0** (Node 22 対応)                                        | npm           |
| Cloud Run 認証 | `new Firestore()` のみで ADC 経由動作。明示的な credentials 不要 | 公式 docs     |
| DB モード      | **Native mode**（作成後変更不可）                                | 公式          |
| IAM role       | **`roles/datastore.user`** (Native 含む読み書き両用)             | Firestore IAM |
| ESM import     | `import { Firestore, Timestamp } from "@google-cloud/firestore"` | npm           |

### 1.2 `@google/genai` v1.0.0 chats API

```ts
const chat = ai.chats.create({
  model,
  config: { safetySettings, systemInstruction },
  history: [{ role: "user", parts: [{ text: "..." }] }],
});
const res = await chat.sendMessage({ message: "hi" });
// res.text (getter), res.candidates[0].finishReason, .safetyRatings, .content
```

- `Content`: `{ role: 'user' | 'model', parts: Part[] }`
- `HarmCategory` enum: `HARM_CATEGORY_HARASSMENT` / `_HATE_SPEECH` / `_SEXUALLY_EXPLICIT` / `_DANGEROUS_CONTENT` / `_CIVIC_INTEGRITY`
- `HarmBlockThreshold` enum: `BLOCK_NONE` / `BLOCK_ONLY_HIGH` / `BLOCK_MEDIUM_AND_ABOVE` / `BLOCK_LOW_AND_ABOVE` / `OFF`
- SAFETY ブロック判定: `res.candidates?.[0]?.finishReason === FinishReason.SAFETY`

### 1.3 `MosasoM/inappropriate-words-ja`

| 項目         | 結論                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 実態         | `.txt` のみ (Sexual.txt / Sexual_with_mask.txt / Sexual_with_bopo.txt / Offensive.txt / bopomofo_map.txt)、総 ~64KB          |
| ライセンス   | MIT (Copyright 2020 K Hashimoto)                                                                                             |
| 最終コミット | **2021-12-01** (`e24de6e`) — メンテ停止状態                                                                                  |
| 取込方針     | `ai/vendor/inappropriate-words-ja/` 配下に `Sexual.txt` + `Offensive.txt` + `LICENSE` + `COMMIT` (SHA ピン留めメモ) をコピー |

### 1.4 Firestore TTL policy

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=conversation --enable-ttl
```

- TTL field 型: **`Timestamp` 必須**
- 削除遅延: expiration から **typically 24 時間以内**（即時ではない、クエリには TTL 経過後もしばらく見える）
- 1 collection group につき TTL field は 1 つ
- サブコレクションは自動削除されない

## 2. Synthesis 結果

### 2.1 Generalization (一般化)

- **PII マスク + 罵詈雑言マスク** は「テキストを規則で置換する」共通操作 → 単一 `ModerationService.mask(text)` インタフェースに統合し、内部で複数ルール (PII 正規表現群 + 辞書 Trie マッチ) を順次適用
- 入力 / 出力 / 履歴保存の 3 ポイントで **同一関数** を再利用 (Req 5.5 を実装レベルで保証)

### 2.2 Build vs Adopt

| 要素               | 判断                                                     | 根拠                                                            |
| ------------------ | -------------------------------------------------------- | --------------------------------------------------------------- |
| Firestore SDK      | **Adopt** `@google-cloud/firestore` v8.6.0               | ADC で Cloud Run と自然統合、SA に role 追加だけで動作          |
| Gemini multi-turn  | **Adopt** `@google/genai` v1.0.0 `chats.create`          | 履歴管理 API 完備、systemInstruction も同 config で渡せる       |
| NG 辞書            | **Adopt** `MosasoM/inappropriate-words-ja` (vendor 取込) | 日本語特化辞書として最有力、64KB と軽量                         |
| TTL 自動削除       | **Adopt** Firestore native TTL policy                    | gcloud 一発設定、コード側はフィールド書込のみ                   |
| PII 正規表現セット | **Build** (自前 ~60 行)                                  | Node.js 向け良質日本語 PII OSS が存在しない (gap analysis 結論) |
| Trie マッチ実装    | **Build** (自前)                                         | 辞書 64KB の Trie 構築コストは数 ms。npm 依存追加不要           |
| 履歴ウィンドウ計算 | **Build** (純関数)                                       | 「時間 AND ターン数」の合成は仕様固有、ライブラリ化価値なし     |

### 2.3 Simplification

- **オーケストレータ層を作らない**: `ai/src/routes/chat.ts` 内で `moderation` → `session` → `genai` → `session.append` の順に直接呼ぶ。Option A の方針徹底
- **エラー階層は 3 つだけ追加**: `SessionStoreError` / `ModerationError` / `GenaiSafetyBlockedError` (既存 `GenaiServiceError` の sibling)。細分化はしない
- **Trie 構築は module top-level 1 回**: lazy init や cache は不要 (Cloud Run instance lifetime 内で 1 度のみ実行)
- **session ドキュメント形は `messages` 配列を持つ単一ドキュメント**: subcollection 化しない (Req 2.2 で 20 ターン上限のため、ドキュメントサイズ上限 1MB は遠い)

## 3. 設計フェーズで判明した運用前提

- Firestore (Native mode) を `aka-ai-api` プロジェクトで **DB 作成**しておく必要あり (一度作ると mode 変更不可)
- WIF SA に `roles/datastore.user` 付与 (`docs/deploy-setup.md` 更新タスク化)
- `gcloud firestore fields ttls update expiresAt --collection-group=conversation --enable-ttl` をデプロイ前に手動実行 (1 回のみ)
