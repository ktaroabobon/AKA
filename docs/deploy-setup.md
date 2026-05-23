# Deploy Setup

`workflow_dispatch` で単一 workflow `Deploy AKA` (`.github/workflows/deploy.yml`)
を回すために必要な GCP / GitHub 側の事前セットアップ手順をまとめる。
**1 回だけ実行する作業**。

> 旧 workflow `Deploy ai to Cloud Run` (`ai-deploy.yml`) と `Deploy bot to GAS`
> (`bot-deploy.yml`) は廃止された。Actions タブに残っていても起動せず、
> 後述の `Deploy AKA` を使うこと。

---

## 1. GCP: WIF + デプロイ用 Service Account

AKA は 2 種類の SA を使い分ける。

| SA                        | 役割                                                                                            | 必要ロール                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `github-actions-deployer` | GitHub Actions が WIF 経由で impersonate するデプロイ SA。Cloud Build / Cloud Run deploy を回す | `roles/cloudbuild.builds.editor`, `roles/run.admin`, `roles/iam.serviceAccountUser`, `roles/storage.admin`, `roles/artifactregistry.reader` |
| `aka-ai-api-sa`           | Cloud Run の **ランタイム SA**。コンテナ実行時の ADC として Firestore / Gemini API に到達する   | `roles/datastore.user`                                                                                                                      |

ランタイム SA に Firestore 権限が無いと `/chat/genai` が `SessionStoreError` で 500
を返す ([fix #49](https://github.com/ktaroabobon/AKA/pull/49) の不具合事例)。
**デプロイ SA に `roles/datastore.user` を付与しても効かない**点に注意。

```bash
PROJECT_ID=aka-ai-api
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
SA_NAME=github-actions-deployer
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SA_NAME=aka-ai-api-sa
RUNTIME_SA_EMAIL="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
POOL_ID=github-pool
PROVIDER_ID=github-provider
GITHUB_REPO=ktaroabobon/AKA

# 1) デプロイ SA を作成
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="GitHub Actions deployer for AKA"

# 2) デプロイ SA にプロジェクトレベルのロールを付与
#    artifactregistry.reader は gcr.io が Artifact Registry に
#    バックエンド移行されているため Cloud Run deploy の pre-check で必須。
for role in \
  roles/cloudbuild.builds.editor \
  roles/run.admin \
  roles/iam.serviceAccountUser \
  roles/storage.admin \
  roles/artifactregistry.reader \
; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$role"
done

# 2.5) ランタイム SA を作成し、Firestore アクセス権限を付与
gcloud iam service-accounts create "$RUNTIME_SA_NAME" \
  --display-name="AKA AI Cloud Run runtime"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
  --role="roles/datastore.user"

# デプロイ SA がランタイム SA を act-as できるようにする
# (deploy.yml の `--service-account` 指定に必要)
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA_EMAIL" \
  --role="roles/iam.serviceAccountUser" \
  --member="serviceAccount:${SA_EMAIL}"

# 3) Workload Identity Pool を作成
gcloud iam workload-identity-pools create "$POOL_ID" \
  --location=global --display-name="GitHub pool"

# 4) GitHub OIDC プロバイダを作成（リポジトリ条件付き）
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --location=global --workload-identity-pool="$POOL_ID" \
  --display-name="GitHub provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '${GITHUB_REPO}'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# 5) GitHub からの impersonate を許可
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GITHUB_REPO}"

# 6) GitHub Actions に渡す値を出力
echo "GCP_WIF_PROVIDER: projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"
echo "GCP_SERVICE_ACCOUNT: ${SA_EMAIL}"
```

### すでに WIF をセットアップ済みで artifactregistry.reader だけ追加する場合

```bash
gcloud projects add-iam-policy-binding aka-ai-api \
  --member="serviceAccount:github-actions-deployer@aka-ai-api.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.reader"
```

### すでにランタイム SA を作成済みで datastore.user だけ追加する場合

```bash
gcloud projects add-iam-policy-binding aka-ai-api \
  --member="serviceAccount:aka-ai-api-sa@aka-ai-api.iam.gserviceaccount.com" \
  --role="roles/datastore.user"
```

### 各 SA に付与されているロールの確認

```bash
# デプロイ SA
gcloud projects get-iam-policy aka-ai-api \
  --flatten='bindings[].members' \
  --filter='bindings.members:github-actions-deployer@aka-ai-api.iam.gserviceaccount.com' \
  --format='value(bindings.role)'
# → roles/artifactregistry.reader / cloudbuild.builds.editor /
#   iam.serviceAccountUser / run.admin / storage.admin

# ランタイム SA
gcloud projects get-iam-policy aka-ai-api \
  --flatten='bindings[].members' \
  --filter='bindings.members:aka-ai-api-sa@aka-ai-api.iam.gserviceaccount.com' \
  --format='value(bindings.role)'
# → roles/datastore.user
```

---

## 2. GCP: Firestore Native DB と TTL ポリシー

ai サービスが会話履歴 (`conversation` collection) を保存するため、Firestore を
**Native モード** で 1 度だけ作成し、`expiresAt` フィールドに TTL ポリシーを設定する。

### Firestore Native DB の作成

```bash
gcloud firestore databases create \
  --location=asia-northeast1 \
  --type=firestore-native \
  --project=aka-ai-api
```

> すでに `(default)` データベースが Datastore モードで作成済みの場合は、新しい
> プロジェクトでやり直すか、別名 DB を作って `FIRESTORE_DATABASE_ID` で指定する
> (本プロジェクトでは `(default)` を Native で作成する前提)。
> GUI からセットアップしたい場合は GCP Console の Firestore → "Create database"
> で `Native mode` / `asia-northeast1` を選択する。

### TTL ポリシーの設定

`conversation` collection group の `expiresAt` フィールドを TTL に指定する。
これにより 24 時間経過したセッションドキュメントが Firestore 側で自動削除される。

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=conversation \
  --enable-ttl \
  --project=aka-ai-api
```

確認:

```bash
gcloud firestore fields ttls list --project=aka-ai-api
# conversation.expiresAt  ACTIVE
```

> TTL の伝搬には数分〜十数分かかることがある。`State: CREATING` のうちは
> 即時削除されない点に注意。

---

## 3. GAS: clasp credentials

```bash
# bot に紐づく Google アカウントで clasp login
pnpm --filter bot exec clasp login

# 認証情報の中身を Secret に登録するためコピー
pbcopy < ~/.clasprc.json
```

---

## 4. GitHub Secrets

リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で
以下を登録する。

| Secret 名             | 値                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GCP_WIF_PROVIDER`    | 上記 1.6) の出力 (`projects/<NUM>/locations/global/workloadIdentityPools/github-pool/providers/github-provider`) |
| `GCP_SERVICE_ACCOUNT` | `github-actions-deployer@aka-ai-api.iam.gserviceaccount.com`                                                     |
| `CLASPRC_JSON`        | `~/.clasprc.json` の中身を改行込みで貼る                                                                         |

確認:

```bash
gh secret list
# CLASPRC_JSON         ...
# GCP_SERVICE_ACCOUNT  ...
# GCP_WIF_PROVIDER     ...
```

---

## 5. GitHub Environment 「production」（任意）

Settings → Environments → New environment → `production`。

- 個人プロジェクトでは特に protection rule を入れる必要なし
- 厳しめに運用したい場合は `Deployment branches and tags` を `master` のみ
  に限定する
- 承認ゲートを置きたい場合は `Required reviewers` を有効化

---

## 6. デプロイの回し方

GitHub の Actions タブから **Deploy AKA** (`.github/workflows/deploy.yml`) を選び、
`Run workflow` で `workflow_dispatch` する。

- 入力 `ref` にデプロイ対象のブランチ / タグ / SHA を指定（通常は `master`）
- `Deploy AKA` 内で **jobs.bot → jobs.ai** の順に直列実行される
  - `jobs.bot`: clasp credentials を復元し `pnpm --filter bot build` → `clasp push --force`
  - `jobs.ai`: `needs: bot` 付きで WIF 認証 → `gcloud builds submit` → `gcloud run deploy`
    → Cloud Run service URL の `/health` に対し smoke check (curl で HTTP コード確認)
- `jobs.bot` が失敗した場合は `jobs.ai` は実行されず workflow が失敗する
- `/health` smoke check が 2xx 以外なら workflow は失敗で終了する

> 旧 `ai-deploy.yml` / `bot-deploy.yml` は削除済み。これらの workflow を個別に
> 起動する運用は終了しており、必ず `Deploy AKA` 経由で回す。

### smoke check 失敗時の手動 rollback

`Deploy AKA` の ai job 最後の `/health` smoke check が落ちた場合、Cloud Run の
revision は **自動ロールバックされない**。Cloud Run の revision 切替は
運用者が手動で行う前提。

GCP Console から戻す手順:

1. Cloud Run console で `aka-ai-api-service` を開く
2. **Revisions** タブで直前の green revision (smoke check 通過済みのもの) を選ぶ
3. **Manage traffic** → **Migrate traffic** → 該当 revision を **100%** に設定して保存

gcloud で戻す場合:

```bash
# 1) 直近の revision 一覧を確認
gcloud run revisions list \
  --service=aka-ai-api-service \
  --region=asia-northeast1 \
  --project=aka-ai-api

# 2) 一つ前の green revision に 100% トラフィックを切り替え
gcloud run services update-traffic aka-ai-api-service \
  --to-revisions=<prev-revision>=100 \
  --region=asia-northeast1 \
  --project=aka-ai-api
```

> rollback 後、失敗 revision の原因 (Cloud Run ログ / Firestore 権限 / env 変数等)
> を別途調査・修正してから `Deploy AKA` を再実行する。

### IAM 変更後に Cloud Run instance を強制リサイクル

ランタイム SA に新しいロールを付与した直後は、**既存 instance が古い ADC
トークンをキャッシュしたまま**生き残り、しばらくは古い権限で動くため
`PERMISSION_DENIED` が混ざることがある (本 spec 構築時の実例: PR #50 以前)。
Container image / env を変えずに instance だけ recycle するには、label 更新で
新 revision を強制的に切る:

```bash
gcloud run services update aka-ai-api-service \
  --region=asia-northeast1 \
  --project=aka-ai-api \
  --update-labels=force-restart=$(date +%s)
```

Cloud Run が新 revision を作って 100% traffic を切り替え、古い instance を
kill する。無停止で完了。

---

## 7. bot 反映 — GAS の新バージョン発行と LINE Webhook 確認

`jobs.bot` の `clasp push --force` は **スクリプトエディタにコードを書き込む**
だけで、LINE Webhook が叩く Web App URL の **配信バージョンは自動で
進まない**。新コードを本番に反映するには、GAS で「新しいバージョン」を
明示的に発行する必要がある (同じ Web App URL のまま、内部バージョンだけ進める)。

### 手順

1. GAS エディタを開く
   - リポルートで `make console` を実行するか、以下の URL を直接開く:
     - https://script.google.com/home/projects/1Mmc00qLMFH5seUCLg-uYDP8OGX7eKTgMNxYG7nOcevrIqEGA2XqNfnIu/edit

2. エディタ右上の **デプロイ** → **デプロイを管理** を開く

3. LINE Webhook が使っている既存デプロイ (ウェブアプリ) の **編集** (鉛筆アイコン)
   をクリック

4. **バージョン** を「**新しいバージョン**」に切り替え、必要に応じ説明
   (例: `feat: conversation-context`) を入力して **デプロイ**

5. 表示される **ウェブアプリ URL** が変わっていないことを確認
   (`https://script.google.com/macros/s/<deploymentId>/exec` の deploymentId
   は維持される)

> 同じ deployment を編集して新バージョンに切り替える限り URL は不変。
> 「新規デプロイ」を押すと別 deploymentId の URL になってしまい、LINE 側の
> Webhook 更新が必要になるので **既存デプロイの編集経路を使う**こと。

### LINE Messaging API 側の確認

LINE Developers Console:

- https://developers.line.biz/console/channel/1660869337/messaging-api

ここで **Webhook URL** が手順 5 の URL と一致していることを確認する。
通常は何も触らなくてよい (deploymentId 不変のため)。URL を貼り直した場合は
「検証」ボタンで疎通テストすると `Success` が返ることを確認する。

### 動作確認 (smoke)

LINE bot を経由した end-to-end チェック:

1. LINE のグループ or 個チャで「あか」にメンションして任意のメッセージを送る
2. 応答が返る (テンプレ即応 or AI 応答)
3. (任意) Cloud Logging で `chat completed` イベントに該当ターンが流れて
   いること、`piiRedactions` / `historyTurns` が記録されていることを確認
4. (任意) Firestore Console で `conversation/user:{userId}` ドキュメントに
   messages が追記されていることを確認

> bot 経由でランダム応答が連発する場合は ai 側で 500 / 502 が返って
> chatWithAi が null フォールバックしている。Cloud Logging で
> `severity>=WARNING` のフィルタを掛けて根本原因を確認する。
