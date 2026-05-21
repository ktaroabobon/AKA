// GAS エントリポイント。
// build.ts が IIFE バンドル後、`_entry.doPost` を呼び出すグローバル関数を
// dist/main.js の末尾に追記する（src/main.ts の export と一致する関数名を
// build.ts の GLOBAL_ENTRY_FUNCTIONS に列挙する）。

export { doPost } from "./lineMessageApi.js";
