import { getAiBaseUrl, getGeminiApiKey } from "./config.js";
import type { components } from "./api/generated.js";

type ChatRequest = components["schemas"]["ChatRequest"];
type ChatResponse = components["schemas"]["ChatResponse"];

export type AiClientFailureReason =
  | "skipped"
  | "fetch_failed"
  | "server_error"
  | "client_error"
  | "invalid_response";

export type AiClientResult =
  | { ok: true; reply: string }
  | { ok: false; reason: AiClientFailureReason; status?: number };

/**
 * AKA-AI の /chat/genai を叩いて応答テキストを取得する。
 * - GAS の UrlFetchApp を使う（fetch は GAS にないため）
 * - Script Properties から API キーを取得し base64 化してリクエストに含める
 * - sessionKey は controller 側で `buildSessionKey` から得る (空文字 / null は controller が AI 呼出をスキップする想定)
 * - 失敗時は reason / status 付きの失敗結果を返す（呼び出し元でフォールバック）
 */
export function chatWithAiResult(
  prompt: string,
  sessionKey: string,
): AiClientResult {
  if (!prompt || prompt.trim().length === 0) {
    return { ok: false, reason: "skipped" };
  }
  if (!sessionKey || sessionKey.length === 0) {
    return { ok: false, reason: "skipped" };
  }

  const url = `${getAiBaseUrl().replace(/\/$/, "")}/chat/genai`;
  const encryptedApiKey = Utilities.base64Encode(
    getGeminiApiKey(),
    Utilities.Charset.UTF_8,
  );

  const body: ChatRequest = {
    sessionKey,
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
    return { ok: false, reason: "fetch_failed" };
  }

  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status !== 200) {
    console.warn(
      `aiClient: /chat/genai returned ${status} (body=${text.slice(0, 200)})`,
    );
    return {
      ok: false,
      reason: status >= 500 ? "server_error" : "client_error",
      status,
    };
  }

  try {
    const parsed = JSON.parse(text) as ChatResponse;
    const reply = parsed.reply;
    return typeof reply === "string" && reply.length > 0
      ? { ok: true, reply }
      : { ok: false, reason: "invalid_response", status };
  } catch (err) {
    console.error("aiClient: failed to parse response", err);
    return { ok: false, reason: "invalid_response", status };
  }
}

/** 既存呼び出し向けの互換 wrapper。失敗時は従来通り null。 */
export function chatWithAi(prompt: string, sessionKey: string): string | null {
  const result = chatWithAiResult(prompt, sessionKey);
  return result.ok ? result.reply : null;
}
