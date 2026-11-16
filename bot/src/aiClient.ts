import { getAiBaseUrl, getGeminiApiKey } from "./config.js";
import type { components } from "./api/generated.js";

type ChatRequest = components["schemas"]["ChatRequest"];
type ChatResponse = components["schemas"]["ChatResponse"];
type SaveMessageRequest = components["schemas"]["SaveMessageRequest"];

export type AiClientFailureReason =
  | "skipped"
  | "fetch_failed"
  | "server_error"
  | "client_error"
  | "invalid_response";

export type AiClientResult =
  | { ok: true; reply: string }
  | { ok: false; reason: AiClientFailureReason; status?: number };

function aiUrl(path: string): string {
  return `${getAiBaseUrl().replace(/\/$/, "")}${path}`;
}

/**
 * AKA-AI の /messages にメッセージを保存する (#75)。
 * LINE は返信先の本文を後から返さないので、受け取った / 送った時点で保存しておく。
 * 保存に失敗しても応答は止めないため、例外は投げずにログだけ残す。
 */
export function saveMessage(input: SaveMessageRequest): void {
  try {
    const response = UrlFetchApp.fetch(aiUrl("/messages"), {
      method: "post",
      contentType: "application/json; charset=UTF-8",
      payload: JSON.stringify(input),
      muteHttpExceptions: true,
    });
    const status = response.getResponseCode();
    if (status !== 204) {
      console.warn(
        `aiClient: /messages returned ${status} (body=${response.getContentText().slice(0, 200)})`,
      );
    }
  } catch (err) {
    console.error("aiClient: /messages fetch failed", err);
  }
}

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

  const url = aiUrl("/chat/genai");
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
