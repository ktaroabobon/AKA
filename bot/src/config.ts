// Script Properties に保存された設定値の取得。
// GAS 上では PropertiesService.getScriptProperties() を使う。

const KEY_CHANNEL_ACCESS_TOKEN = "CHANNEL_ACCESS_TOKEN";
const KEY_BOT_ID = "BOT_ID";
const KEY_AI_BASE_URL = "AI_BASE_URL";
const KEY_GEMINI_API_KEY = "GEMINI_API_KEY";

function getProperty(key: string): string | null {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function getRequired(key: string): string {
  const value = getProperty(key);
  if (!value) {
    throw new Error(`Required Script Property "${key}" is not set`);
  }
  return value;
}

export function getChannelAccessToken(): string {
  return getRequired(KEY_CHANNEL_ACCESS_TOKEN);
}

export function getBotId(): string {
  return getRequired(KEY_BOT_ID);
}

/**
 * AKA-AI(Cloud Run) のベース URL。
 * 例: https://aka-ai-api-service-225636122497.asia-northeast1.run.app
 */
export function getAiBaseUrl(): string {
  return getRequired(KEY_AI_BASE_URL);
}

/** Gemini の生 API キー（base64 化前）。 */
export function getGeminiApiKey(): string {
  return getRequired(KEY_GEMINI_API_KEY);
}
