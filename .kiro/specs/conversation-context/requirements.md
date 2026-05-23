# Requirements Document

## Project Description (Input)

### 誰が困っているか

妹（とその家族）が LINE で AKA(ぬいぐるみ Bot「あか」) と会話したいが、現状あかは **直前のやり取りを覚えていない** ため、会話が一問一答で途切れて雑談として成立しにくい。GitHub Issue [#21](https://github.com/ktaroabobon/AKA/issues/21) と親ロードマップ [#16](https://github.com/ktaroabobon/AKA/issues/16) で追跡。

### 現状

- `bot/` (GAS) の `controller.ts` は「完全一致(挨拶/自己紹介) → メンション時は AI 転送 → AI 失敗時はランダム」というルーティング済 (#21 直前で導入)。
- `ai/` (Cloud Run / Hono) の `services/genai.ts` は Gemini を **毎リクエスト 1 ターン** で叩くだけで、会話履歴を一切持たない（ステートレス）。`ai.models.generateContent({ contents: prompt })` 形式の単発呼び出し。
- 結果として、AI 応答自体は返ってくるが「さっき言ったこと」を踏まえた応答ができず、会話の流れが続かない。
- 関連 Issue: [#15](https://github.com/ktaroabobon/AKA/issues/15)（gpt/LLM 化）は本仕様で実質吸収される。

### どう変えるか（合意済み方針）

1. **履歴ストア**: Firestore に `conversation` collection を作り、セッション単位で履歴 (`role: user/model`, `text`, `timestamp`) を保持する。Firestore TTL policy で 24h で自動消去。
2. **セッションキー**: LINE `source.type` に応じて `group:{groupId}` / `room:{roomId}` / `user:{userId}` で分ける。**「誰が発言したか」は Phase 1 では保存・送信しない**（後追い Issue で検討）。
3. **ルーティング**: `bot/src/controller.ts` を「完全一致 → AI 転送 → AI 失敗時はランダム」に再構成。完全一致(挨拶 / 自己紹介) は即応性のためテンプレで残す。
4. **AI 側 SDK**: `@google/genai` の `chats.create({ history, config: { systemInstruction } })` + `sendMessage` を使い、復元した履歴を渡してマルチターンで叩く。
5. **OpenAPI**: `ChatRequest` に `sessionKey: string` を追加（必須）。yaml → `make oapi/types` で型再生成。
6. **デプロイ**: WIF 用 SA に `roles/datastore.user` を追加（`docs/deploy-setup.md` を更新）。
7. **モデル**: Gemini 続行 (`gemini-3.5-flash`)。OpenAI 並行サポートは導入しない。

### 本仕様のスコープ外（別 Issue 化候補）

- 「誰が話したか」を履歴に乗せる
- `@あか 忘れて` 等の手動リセットコマンド
- 履歴の要約・長期記憶 (Vertex AI memory / RAG)

### マスキング戦略（合意済み）

「まずいメッセージ」を入力 / 出力 / Firestore 保存前の **3 ポイント** で伏字化する。

- **対象**:
  - **個人情報 (PII)**: 電話番号 (携帯 / 固定)、メール、クレジットカード (Luhn)、マイナンバー (12 桁)、郵便番号
  - **罵詈雑言 / 不適切表現**: `MosasoM/inappropriate-words-ja` (MIT) の辞書を vendor 取り込み
- **適用ポイント**:
  1. **入力側**: ユーザー発話を Gemini に送る前にマスク（Google 側に PII を残さない）
  2. **Firestore 履歴**: 保存前にマスク（履歴ログにも PII を残さない）
  3. **出力側**: Gemini の応答を LINE に返す前に再度マスク（オウム返し対策）
- **補助**: Gemini `safetySettings` を 4 カテゴリ `BLOCK_MEDIUM_AND_ABOVE` で設定（性的/暴力/差別系を LLM 側でブロック）
- **実装強度**: 最小案
  - 自前 PII 正規表現 + `inappropriate-words-ja` 辞書 (Trie マッチ、NFKC 正規化前処理)
  - npm 依存追加なし（辞書のみ vendor 取り込み、ライセンス MIT のため CREDITS に明記）
  - `kuromojin` 等の形態素解析は導入しない (Cloud Run コールドスタート増を回避)
- **位置**: `ai/src/services/moderation.ts` (新設) に集約。`genai.ts` から呼び出し

### 履歴ウィンドウ戦略（合意済み）

- **カットオフ方式**: ハイブリッド (時間 AND ターン数)。両条件を AND で満たす履歴のみ AI に渡す。
- **時間カットオフ M**: 2 時間。最後の発話から 2h 以上空いた場合、それ以前は会話の区切りとみなして送信対象から外す（Firestore からも 24h TTL で消える）。
- **ターン上限 N**: 20 ターン (user + model 合算)。
- **保存上限と送信上限を揃える**: Firestore に保存する履歴長 = AI に送信する履歴長 = 20。保存窓と送信窓を分けない（個人プロジェクトとしてシンプルに保つ）。
- **TTL**: 24 時間 (Firestore TTL policy)。これは「セッションごと消滅」のための上限で、送信窓 (M=2h) とは別概念。

### デプロイ統合方針（合意済み）

- **bot → ai の順序を保証**: `ChatRequest.sessionKey` 必須化が破壊的変更のため、bot を先にデプロイ → 古い AI は余分フィールドを zod の既定 (strip) で無視 → 続けて ai をデプロイ。逆順だと古い bot からの呼び出しが 400 → random fallback に短時間落ちる。
- **既存 `ai-deploy.yml` / `bot-deploy.yml` を 1 つの `deploy.yml` に統合**: 順序ミスを CI レベルで根絶する。
- **トリガー**: `workflow_dispatch` のみ。push / tag 自動トリガーは導入しない。
- **失敗ハンドリング**: bot deploy が失敗したら ai deploy を実行せず終了。ai deploy 後の `/health` smoke check 失敗は手動ロールバック (revision 戻し) とする。

### SAFETY フォールバック文言の集約（合意済み）

- Gemini `safetySettings` ブロック時に返す中立メッセージは **3〜5 種類** のあかキャラ口調バリエーションを `ai/src/prompts/aka.ts` に集約 (例: 「うーん、よくわかんないや」「ごめんね、それは難しいなあ」)、ランダム選択して返す。
- bot 側の random fallback (HTTP 失敗時) とは別概念。

### ローカル開発の Firestore 認証（合意済み）

- `make ai/dev` 起動時は **`gcloud auth application-default login`** で個人 ADC を使い、production Firestore に直接接続。Firestore Emulator は導入しない (個人プロジェクト規模)。
- `docs/local-dev.md` (新規) に手順を記載。

### 未確定で要件フェーズで詰める論点

- **AI 失敗時のフォールバック**: 既存のランダム応答にそのまま落とすかどうか（その際、保存途中の会話履歴側の整合をどう保つか）
- **重複送信 / リトライ時の冪等性**: Firestore に書く前に Gemini を叩く順序
- **トークン安全マージン**: ターン数 20 で実質どれくらいトークンを消費するか、念のための上限を別途設けるか

---

## Introduction

LINE Bot「あか」は AI 応答自体は返せるが、毎リクエストがステートレスな単発呼び出しのため会話の流れを把握できない。ユーザー（妹と家族）が「あかとおしゃべりしている」体験を得られるよう、会話履歴をセッション単位で保持し、マルチターンで Gemini に渡す構成へ拡張する。あわせて、ユーザー発話と LLM 応答の両方に対し PII と罵詈雑言のマスキングを適用し、外部 LLM と保存履歴のいずれにも不適切情報が残らない構成にする。

関連 Issue: [#21](https://github.com/ktaroabobon/AKA/issues/21)（本 spec が解決）、[#15](https://github.com/ktaroabobon/AKA/issues/15)（実質吸収）、ロードマップ親 [#16](https://github.com/ktaroabobon/AKA/issues/16)。

## Boundary Context

- **In scope**:
  - LINE ソース種別 (group / room / user) に応じた会話セッションの識別
  - 直近会話履歴の Firestore への保存 / 読み出し / TTL 失効
  - 履歴を伴うマルチターン Gemini 呼び出し
  - bot 側のルーティング再構成（テンプレ即応 → AI 転送 → AI 失敗時フォールバック）
  - 入力 / 出力 / 履歴保存前の 3 ポイントでの PII + 罵詈雑言マスキング
  - OpenAPI 契約 (`ChatRequest.sessionKey` 必須) と生成型の更新
  - **既存 `ai-deploy.yml` / `bot-deploy.yml` を統合した単一 `deploy.yml` workflow** の構築 (bot → ai 順序固定)
  - **ローカル開発で `gcloud` ADC を使う前提を明文化** (`docs/local-dev.md` 新設)
- **Out of scope** (別 Issue 化候補):
  - 発話者個人 (例: 「お兄ちゃん」「お姉ちゃん」) の識別を履歴に乗せる
  - 「@あか 忘れて」等の手動リセットコマンド
  - 履歴の要約・長期記憶 (Vertex AI memory / RAG)
  - LINE Webhook 真正性検証 (X-Line-Signature)
  - OpenAI 等 Gemini 以外の LLM サポート
  - Firestore Emulator 導入 (ローカルから production Firestore に直接接続する)
  - push / tag 自動デプロイ (workflow_dispatch のみ維持)
- **Adjacent expectations**:
  - `openapi/aka.openapi.yaml` を SSOT として `*/src/api/generated.ts` を再生成する CI 制約 (`make oapi/check-gen`) を引き続き満たす
  - bot は GAS 上 (`UrlFetchApp.fetch`) で動作する制約は変えない
  - ai の WIF デプロイ SA に `roles/datastore.user` を追加する運用作業が前提
  - 既存の WIF / `CLASPRC_JSON` Secret 構成は変更しない (workflow 統合のみ)

## Requirements

### Requirement 1: 会話セッションの識別

**Objective:** あかと会話するユーザーとして、家族グループ・複数人トーク・1:1 DM のいずれであっても、自分側の会話文脈が他のセッションと混ざらないよう適切な単位でセッションを分離してほしい。

#### Acceptance Criteria

1. When LINE Webhook の `source.type` が `group` である, the Bot Controller shall セッションキーを `group:{groupId}` 形式で組み立てる。
2. When LINE Webhook の `source.type` が `room` である, the Bot Controller shall セッションキーを `room:{roomId}` 形式で組み立てる。
3. When LINE Webhook の `source.type` が `user` (1:1 トーク) である, the Bot Controller shall セッションキーを `user:{userId}` 形式で組み立てる。
4. When Bot Controller が AI Conversation Service にチャットリクエストを送る, the Bot Controller shall 組み立てたセッションキーをリクエスト本文の `sessionKey` フィールドに含める。
5. If LINE Webhook の `source` からセッション ID が取得できない, the Bot Controller shall AI への転送を中止し既存のフォールバック応答に切り替える。

### Requirement 2: 会話履歴の永続化と TTL

**Objective:** あかが「さっき言ったこと」を覚えていられるよう、セッションごとに会話履歴を一定期間保持してほしい。

#### Acceptance Criteria

1. When AI Conversation Service が Gemini からの応答を受け取り正常に完了する, the AI Conversation Service shall ユーザー発話とモデル応答のペアをセッションキー紐付けで Firestore に保存する。
2. The AI Conversation Service shall 1 セッションあたり最大 20 ターン (user + model 合算) のみ保持し、超過分は古い順に破棄する。
3. The AI Conversation Service shall 各セッションドキュメントに最終発話時刻から 24 時間後を示す TTL フィールドを設定する。
4. While セッションドキュメントが Firestore TTL ポリシーにより削除済みである, the AI Conversation Service shall 当該セッションを「履歴なし」として扱い、新規セッションとして応答する。
5. The AI Conversation Service shall Firestore に保存するテキストとして Requirement 5 で規定するマスキング適用後のテキストのみを使用し、原文を永続化しない。

### Requirement 3: 履歴ウィンドウ戦略

**Objective:** あかが古すぎる文脈を引きずって不自然な応答にならないよう、AI に渡す履歴を適切な長さに制限してほしい。

#### Acceptance Criteria

1. When AI Conversation Service が Gemini を呼び出す, the AI Conversation Service shall Firestore から取得した履歴のうち「直近 20 ターン以内」かつ「最終発話時刻から 2 時間以内」の両条件を満たす履歴のみをプロンプトに含める。
2. If 直近の発話から 2 時間以上経過している, the AI Conversation Service shall 過去履歴を Gemini に渡さず新規会話として問い合わせる。
3. The AI Conversation Service shall Firestore に保存する履歴の上限ターン数と Gemini に送る履歴の上限ターン数を同一の 20 に揃える。

### Requirement 4: マルチターン Gemini 呼び出し

**Objective:** ユーザーとして、あかが直前の会話を踏まえた自然な応答を返してほしい。

#### Acceptance Criteria

1. When AI Conversation Service が Gemini を呼び出す, the AI Conversation Service shall キャラクター設定をシステム指示として、過去会話履歴を role 付き (user / model) シーケンスとして 1 リクエストに同梱する。
2. The AI Conversation Service shall Gemini の安全フィルタを 4 カテゴリ (ハラスメント / ヘイト / 性的 / 危険) すべて「中程度以上ブロック」相当の閾値で適用する。
3. If Gemini が安全フィルタにより空応答を返す, the AI Conversation Service shall あかキャラ口調の中立メッセージ (3〜5 種類のバリエーションから 1 つランダム選択) を返し、当該ターンを履歴に保存しない。
4. The AI Conversation Service shall Gemini 呼び出しの成功時のみユーザー発話とモデル応答の両方を 1 操作で履歴に追記する（部分書き込みを起こさない）。
5. The AI Conversation Service shall SAFETY 用中立メッセージのバリエーション定義を `ai/src/prompts/aka.ts` に集約する (キャラ設定と同居)。

### Requirement 5: PII および罵詈雑言のマスキング

**Objective:** ユーザー発話に含まれる個人情報や不適切表現が、外部 LLM および保存履歴に残らないようにしてほしい。

#### Acceptance Criteria

1. When AI Conversation Service がユーザー発話を受信する, the AI Conversation Service shall Gemini 呼び出し前にテキストを Unicode 正規化し、電話番号 (携帯 / 固定)、メールアドレス、クレジットカード番号 (Luhn 合格)、マイナンバー、郵便番号を伏字化する。
2. When AI Conversation Service がユーザー発話を受信する, the AI Conversation Service shall 日本語 NG ワード辞書 (`MosasoM/inappropriate-words-ja`) に基づき罵詈雑言・不適切表現を伏字化する。
3. When Gemini が応答を返す, the AI Conversation Service shall モデル応答にも同一ルールで PII および罵詈雑言マスキングを適用してから LINE へ返却する。
4. The AI Conversation Service shall マスキング適用後のテキストのみを Firestore 履歴に保存し、原文を永続化しない。
5. The AI Conversation Service shall マスキング処理を入力 / 出力 / 履歴保存の 3 ポイントで同一実装を共有して適用する。

### Requirement 6: 応答ルーティング

**Objective:** 既存の即応性（挨拶・自己紹介への定型反応）を保ちつつ、それ以外の発話は AI に委ねてほしい。

#### Acceptance Criteria

1. When 受信メッセージが完全一致 / 挨拶 / 自己紹介の定型パターンに合致する, the Bot Controller shall AI を呼ばずテンプレ応答を返す。
2. When 受信メッセージが定型パターンに合致せず、グループでメンションされているか 1:1 DM である, the Bot Controller shall AI Conversation Service に転送して応答を取得する。
3. If AI Conversation Service への呼び出しが失敗（HTTP 非 2xx / タイムアウト / ネットワークエラー）, the Bot Controller shall 既存のランダム応答にフォールバックする。
4. If AI Conversation Service への呼び出しが失敗した, the Bot Controller shall 当該ターンを履歴に保存させない（bot 側から再送・補完を行わない）。

### Requirement 7: API 契約と型の同期

**Objective:** bot と ai 間の API が SSOT (OpenAPI) と一致し、生成型のみを使用するチーム規約を維持してほしい。

#### Acceptance Criteria

1. The OpenAPI Schema shall `ChatRequest` に必須フィールド `sessionKey: string` を含む。
2. When OpenAPI yaml が変更される, the Developer shall `make oapi/types` を実行して `ai/src/api/generated.ts` と `bot/src/api/generated.ts` を再生成しコミットに含める。
3. The CI Pipeline shall `make oapi/check-gen` で生成型と yaml の差分を検出し、差分があればビルドを失敗させる。
4. The AI Conversation Service shall `ChatRequest.sessionKey` をスキーマバリデーションで必須として扱う。
5. If `ChatRequest.sessionKey` が空文字または不正型である, the AI Conversation Service shall HTTP 400 と `ErrorResponse{error: "invalid_request"}` を返す。

### Requirement 8: 観測性とエラー透過

**Objective:** 運用者として、会話履歴やマスキングに起因する障害を切り分けられるようにしてほしい。

#### Acceptance Criteria

1. The AI Conversation Service shall 各リクエストに対しセッションキー、履歴ターン数、Gemini 呼び出し所要時間、マスキング適用件数を構造化ログとして出力する。
2. The AI Conversation Service shall マスキングで置換された原文をログに出力しない。
3. If Firestore へのアクセスが失敗する（権限不足 / quota / ネットワーク）, the AI Conversation Service shall HTTP 500 と `ErrorResponse{error: "internal_error"}` を返し、Bot Controller 側のフォールバックを発火させる。
4. The Bot Controller shall AI 呼び出し失敗時に内部エラー詳細を LINE エンドユーザーに転送しない。

### Requirement 9: 統合 CD ワークフロー

**Objective:** 運用者として、bot と ai のデプロイ順序ミスにより API 契約不一致 (400) が出ないよう、1 つの workflow で正しい順序を強制したい。

#### Acceptance Criteria

1. The CI/CD Pipeline shall 単一の `Deploy AKA` workflow を持ち、`workflow_dispatch` のみで起動する。push / tag 自動トリガーは導入しない。
2. When `Deploy AKA` が起動する, the CI/CD Pipeline shall **bot → ai の順** に直列実行する (bot deploy 完了後に ai deploy を開始)。
3. If bot deploy が失敗する, the CI/CD Pipeline shall ai deploy を実行せず workflow を失敗で終了する。
4. When ai deploy が完了する, the CI/CD Pipeline shall `/health` への smoke check を実行し、応答が 2xx でなければ workflow を失敗で終了する。
5. The CI/CD Pipeline shall 既存の `Deploy ai to Cloud Run` (`ai-deploy.yml`) と `Deploy bot to GAS` (`bot-deploy.yml`) を削除し、新規 `deploy.yml` に統合する。
6. The CI/CD Pipeline shall 既存の WIF (Workload Identity Federation) 設定および `CLASPRC_JSON` Secret 構成を変更せず、そのまま流用する。
7. If ai deploy の smoke check が失敗する, the CI/CD Pipeline shall Cloud Run revision の自動ロールバックは行わず、運用者が手動で前 revision に戻す前提とする (失敗ログのみ残す)。
