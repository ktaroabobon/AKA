# Deploy Setup

`workflow_dispatch` で単一 workflow `Deploy AKA` (`.github/workflows/deploy.yml`)
を回すために必要な GCP / GitHub 側の事前セットアップ手順をまとめる。
**1 回だけ実行する作業**。

> 旧 workflow `Deploy ai to Cloud Run` (`ai-deploy.yml`) と `Deploy bot to GAS`
> (`bot-deploy.yml`) は廃止された。Actions タブに残っていても起動せず、
> 後述の `Deploy AKA` を使うこと。

---

## 1. GCP: WIF + デプロイ用 Service Account

```bash
PROJECT_ID=aka-ai-api
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
SA_NAME=github-actions-deployer
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
POOL_ID=github-pool
PROVIDER_ID=github-provider
GITHUB_REPO=ktaroabobon/AKA

# 1) Service Account を作成
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="GitHub Actions deployer for AKA"

# 2) SA にプロジェクトレベルのロールを付与
#    artifactregistry.reader は gcr.io が Artifact Registry に
#    バックエンド移行されているため Cloud Run deploy の pre-check で必須。
#    datastore.user は ai サービスが Firestore の conversation collection に
#    読み書きするために必要 (Cloud Run の実行 SA に ADC 経由で付与される)。
for role in \
  roles/cloudbuild.builds.editor \
  roles/run.admin \
  roles/iam.serviceAccountUser \
  roles/storage.admin \
  roles/artifactregistry.reader \
  roles/datastore.user \
; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$role"
done

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

### すでに WIF をセットアップ済みで datastore.user だけ追加する場合

```bash
gcloud projects add-iam-policy-binding aka-ai-api \
  --member="serviceAccount:github-actions-deployer@aka-ai-api.iam.gserviceaccount.com" \
  --role="roles/datastore.user"
```

### SA に付与されているロールの確認

```bash
gcloud projects get-iam-policy aka-ai-api \
  --flatten='bindings[].members' \
  --filter='bindings.members:github-actions-deployer@aka-ai-api.iam.gserviceaccount.com' \
  --format='value(bindings.role)'
```

期待する出力:

```
roles/artifactregistry.reader
roles/cloudbuild.builds.editor
roles/datastore.user
roles/iam.serviceAccountUser
roles/run.admin
roles/storage.admin
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
