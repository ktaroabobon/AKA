# AKA(LINE BOT)

AKA(LINE BOT)のプロジェクトのリポジトリです。

## 使い方

### 1. リポジトリをクローン

```bash
$ git clone
```

### 2. パッケージをインストール

```bash
$ npm install
```

### 3. 環境変数を設定

```bash
$ cp .env.sample .env
```

### 4. ローカルサーバーを起動

```bash
$ npm start
```

### 5. LINE Developersでチャネルを作成

[LINE Developers](https://developers.line.biz/ja/)にアクセスし、チャネルを作成します。

### 6. チャネルの設定

チャネルの設定を行います。

- Webhook URLに`https://<your-domain>/webhook`を設定
- アクセストークンを発行し、`.env`に設定
- チャネルシークレットを発行し、`.env`に設定
- チャネルアクセストークンを発行し、`.env`に設定
- メッセージ送信の許可を有効にする
- フォロー、アンフォロー、ブロック、アンブロックの許可を有効にする
- プロバイダーの許可を有効にする
- グループ、ルームの許可を有効にする

## 開発の仕方

### 1. リポジトリをクローン

```bash
$ git clone
```

### 2. パッケージをインストール

```bash
$ npm install
```

### claspからgoogle accountにログイン

```bash
$ clasp login
```

### claspでプロジェクトを選択

```bash
$ clasp clone <script id>
```

script idは、[Google Apps Script](https://script.google.com/home)で確認できます。

### gasのコードをローカルにダウンロード

```bash
$ clasp pull
```
