import { getAiBaseUrl, getGeminiApiKey } from "./config.js";
import type { components } from "./api/generated.js";

type ChatRequest = components["schemas"]["ChatRequest"];
type ChatResponse = components["schemas"]["ChatResponse"];

/**
 * AKA-AI の /chat/genai を叩いて応答テキストを取得する。
 * - GAS の UrlFetchApp を使う（fetch は GAS にないため）
 * - Script Properties から API キーを取得し base64 化してリクエストに含める
 * - 失敗時は null を返す（呼び出し元でフォールバック）
 */
export function chatWithAi(prompt: string): string | null {
  if (!prompt || prompt.trim().length === 0) return null;

  const url = `${getAiBaseUrl().replace(/\/$/, "")}/chat/genai`;
  const encryptedApiKey = Utilities.base64Encode(
    getGeminiApiKey(),
    Utilities.Charset.UTF_8,
  );

  const body: ChatRequest = {
    prompt,
    encrypted_api_key: encryptedApiKey,
  };

  let response: GoogleAppsScript.URL_Fetch.HTTPResponse;
  try {
    response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json; charset=UTF-8",
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });
  } catch (err) {
    console.error("aiClient: UrlFetchApp.fetch failed", err);
    return null;
  }

  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status !== 200) {
    console.warn(
      `aiClient: /chat/genai returned ${status} (body=${text.slice(0, 200)})`,
    );
    return null;
  }

  try {
    const parsed = JSON.parse(text) as ChatResponse;
    const reply = parsed.reply;
    return typeof reply === "string" && reply.length > 0 ? reply : null;
  } catch (err) {
    console.error("aiClient: failed to parse response", err);
    return null;
  }
}
