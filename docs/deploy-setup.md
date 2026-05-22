# Deploy Setup

`workflow_dispatch` で `Deploy ai to Cloud Run` / `Deploy bot to GAS`
を回すために必要な GCP / GitHub 側の事前セットアップ手順をまとめる。
**1 回だけ実行する作業**。

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
roles/iam.serviceAccountUser
roles/run.admin
roles/storage.admin
```

---

## 2. GAS: clasp credentials

```bash
# bot に紐づく Google アカウントで clasp login
pnpm --filter bot exec clasp login

# 認証情報の中身を Secret に登録するためコピー
pbcopy < ~/.clasprc.json
```

---

## 3. GitHub Secrets

リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で
以下を登録する。

| Secret 名 | 値 |
|---|---|
| `GCP_WIF_PROVIDER` | 上記 1.6) の出力 (`projects/<NUM>/locations/global/workloadIdentityPools/github-pool/providers/github-provider`) |
| `GCP_SERVICE_ACCOUNT` | `github-actions-deployer@aka-ai-api.iam.gserviceaccount.com` |
| `CLASPRC_JSON` | `~/.clasprc.json` の中身を改行込みで貼る |

確認:

```bash
gh secret list
# CLASPRC_JSON         ...
# GCP_SERVICE_ACCOUNT  ...
# GCP_WIF_PROVIDER     ...
```

---

## 4. GitHub Environment 「production」（任意）

Settings → Environments → New environment → `production`。

- 個人プロジェクトでは特に protection rule を入れる必要なし
- 厳しめに運用したい場合は `Deployment branches and tags` を `master` のみ
  に限定する
- 承認ゲートを置きたい場合は `Required reviewers` を有効化

---

## 5. デプロイの回し方

GitHub の Actions タブから：

- **Deploy ai to Cloud Run** → `workflow_dispatch` で実行（`ref` は通常 `master`）
- **Deploy bot to GAS** → `workflow_dispatch` で実行

任意の `ref`（ブランチ / タグ / SHA）を指定可能。
