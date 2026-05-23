/**
 * AKA（紅）のキャラクター設定プロンプトと SAFETY フォールバック文言。
 *
 * 本体は隣接する `personal.md` / `safety-fallback.md` に置いて、ここでは
 * 起動時に同期読込して再 export するだけにしている。妹や家族が直接 markdown
 * を編集できるようにするためと、`git diff` でレビューしやすくするため。
 *
 * production では tsc 後に `dist/prompts/*.md` へ build script でコピーされる
 * 前提 (ai/package.json の `build` 参照)。dev は tsx が `src/prompts/` から
 * 直読みする。
 */
import { readFileSync } from "node:fs";

const personalUrl = new URL("./personal.md", import.meta.url);
const fallbackUrl = new URL("./safety-fallback.md", import.meta.url);

export const akaSystemInstruction = readFileSync(personalUrl, "utf-8");

/**
 * Gemini が `safetySettings` でブロックしたターンに代わりに返すフォールバック文言。
 * あかキャラ口調の中立メッセージから 1 つランダム選択する (Requirements 4.3, 4.5)。
 */
export const SAFETY_FALLBACK_MESSAGES = readFileSync(fallbackUrl, "utf-8")
  .split("\n")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
