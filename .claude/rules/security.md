# セキュリティ

- LINE のチャネルアクセストークンなどは GAS の Script Properties に、ai の設定は環境変数に置く。`.env*` / `.clasprc.json` を commit しない
- Gemini の API キーは bot がリクエストごとに送る。ai はデコードしてその場で使い、保持・キャッシュ・ログ出力をしない
- ai の入力はすべて zod で検証する。失敗は 400 で、内部の詳細を応答に含めない
- 上流（Gemini）のエラー文を LINE の利用者へそのまま返さない。詳細はサーバのログにだけ出し、応答はコード化したエラー種別にする
- LINE Webhook の値（mention・text）を信用しすぎず、空文字・不正な型を弾く
