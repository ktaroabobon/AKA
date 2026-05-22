import { vi, beforeEach } from "vitest";

const TEST_BOT_ID = "test-bot-id";
const TEST_TOKEN = "test-token";
const TEST_AI_BASE_URL = "https://aka-ai.test.example.com";
const TEST_GEMINI_API_KEY = "test-gemini-key";

const propertyStore: Record<string, string | null> = {
  BOT_ID: TEST_BOT_ID,
  CHANNEL_ACCESS_TOKEN: TEST_TOKEN,
  AI_BASE_URL: TEST_AI_BASE_URL,
  GEMINI_API_KEY: TEST_GEMINI_API_KEY,
};

export function setProperty(key: string, value: string | null): void {
  propertyStore[key] = value;
}

export function resetProperties(): void {
  for (const key of Object.keys(propertyStore)) delete propertyStore[key];
  propertyStore.BOT_ID = TEST_BOT_ID;
  propertyStore.CHANNEL_ACCESS_TOKEN = TEST_TOKEN;
  propertyStore.AI_BASE_URL = TEST_AI_BASE_URL;
  propertyStore.GEMINI_API_KEY = TEST_GEMINI_API_KEY;
}

vi.stubGlobal("PropertiesService", {
  getScriptProperties: () => ({
    getProperty: (key: string) => propertyStore[key] ?? null,
    setProperty: (key: string, value: string) => {
      propertyStore[key] = value;
    },
  }),
});

vi.stubGlobal("UrlFetchApp", {
  fetch: vi.fn(() => ({
    getResponseCode: () => 200,
    getContentText: () => "{}",
  })),
});

vi.stubGlobal("Utilities", {
  base64Encode: (input: string) =>
    Buffer.from(input, "utf-8").toString("base64"),
  Charset: { UTF_8: "utf-8" },
});

beforeEach(() => {
  resetProperties();
});

export const TestConstants = {
  BOT_ID: TEST_BOT_ID,
  TOKEN: TEST_TOKEN,
  AI_BASE_URL: TEST_AI_BASE_URL,
  GEMINI_API_KEY: TEST_GEMINI_API_KEY,
};
