# Local Development

`ai/` をローカル (`make ai/dev` または `pnpm --filter ai dev`) で起動して
Firestore へ接続するための前提・手順をまとめる。**初回 1 回だけ実行する作業**。

---

## 概要

`ai/` の会話履歴は Firestore (`conversation` collection) に永続化される。
ローカル開発時は **Firestore Emulator を使わず**、`gcloud auth application-default login`
で取得した個人の ADC (Application Default Credentials) を使って
production Firestore に直接接続する。

`make ai/dev` で立ち上がる Node.js プロセスは `new Firestore()` の暗黙認証経由で
ADC を解決するため、事前に ADC ファイルが手元に存在することが必要。

---

## 前提

- **gcloud CLI** がインストール済みであること
  (`gcloud --version` で確認。未インストールなら
  [Google Cloud SDK のインストール手順](https://cloud.google.com/sdk/docs/install) を参照)
- 対象 GCP プロジェクト (本リポジトリでは `aka-ai-api`) に Google アカウントが
  参加しており、後述の IAM ロールが付与されていること
- `mise` / `pnpm` などのリポジトリ標準ツールチェーンがセットアップ済みであること
  (`mise install` 済み)

---

## ADC 取得手順

以下を 1 回だけ実行する。

```bash
# 1) ローカルの gcloud をログイン対象 GCP プロジェクトに紐付ける
gcloud config set project aka-ai-api

# 2) ADC を取得 (ブラウザが開いて Google アカウントの同意を求められる)
gcloud auth application-default login
```

成功すると `~/.config/gcloud/application_default_credentials.json` が生成され、
`ai/` プロセスはこのファイルを暗黙的に読み込んで Firestore 認証を行う。

確認:

```bash
ls -l ~/.config/gcloud/application_default_credentials.json
gcloud auth application-default print-access-token | head -c 20
```

---

## 必要権限

ADC に紐付く Google アカウントには、対象 GCP プロジェクトで
以下のロールが付与されている必要がある。

| 用途                                     | 最小ロール               |
| ---------------------------------------- | ------------------------ |
| Firestore データの **read のみ**         | `roles/datastore.viewer` |
| Firestore データの **read + write 検証** | `roles/datastore.user`   |

ローカルで `make ai/dev` から会話を流して Firestore への書き込み挙動も確認したい
場合は `roles/datastore.user` を付与する。read だけで十分なら `roles/datastore.viewer`
で足りる。

付与例 (プロジェクトオーナーが実行):

```bash
gcloud projects add-iam-policy-binding aka-ai-api \
  --member="user:your.account@example.com" \
  --role="roles/datastore.user"
```

---

## 環境変数

`ai/` の `config/env.ts` は Firestore 接続先プロジェクトを `GCP_PROJECT_ID` から
読み取る。ローカル起動時は `.env` か shell に下記を設定する。

```bash
# ai/.env またはシェル起動スクリプトに記述
export GCP_PROJECT_ID=aka-ai-api
```

`.env` を使う場合はリポジトリの `.gitignore` 対象であることを確認してから
コミットせずに保管すること (Gemini API キー等の他の秘密値と混在させない)。

---

## Firestore Emulator を採用しない理由

design.md / requirements.md の合意のとおり、本プロジェクトでは
**Firestore Emulator を導入しない**。理由は次のとおり。

- 個人プロジェクト規模のため、Emulator のセットアップ・データ初期化・
  TTL 動作差異の検証コストが見合わない
- ADC 経由で production Firestore に直接繋いだほうが、本番と同一の
  挙動 (TTL ポリシー、インデックス、認証) を確認できる
- ローカル開発で使う `sessionKey` は実トラフィックと衝突しない命名規則
  (テスト用プレフィックス) で運用すれば事故リスクは小さい

production Firestore に直接書き込むため、ローカル検証で残ったテストデータが
気になる場合は `gcloud firestore` コマンドや GCP Console から手動で削除する。
