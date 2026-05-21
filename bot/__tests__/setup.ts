import { vi, beforeEach } from "vitest";

const TEST_BOT_ID = "test-bot-id";
const TEST_TOKEN = "test-token";
const TEST_CALENDAR_ID = "primary";

const propertyStore: Record<string, string | null> = {
  BOT_ID: TEST_BOT_ID,
  CHANNEL_ACCESS_TOKEN: TEST_TOKEN,
  CALENDAR_ID: TEST_CALENDAR_ID,
};

export function setProperty(key: string, value: string | null): void {
  propertyStore[key] = value;
}

export function resetProperties(): void {
  for (const key of Object.keys(propertyStore)) delete propertyStore[key];
  propertyStore.BOT_ID = TEST_BOT_ID;
  propertyStore.CHANNEL_ACCESS_TOKEN = TEST_TOKEN;
  propertyStore.CALENDAR_ID = TEST_CALENDAR_ID;
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
  fetch: vi.fn(() => ({ getResponseCode: () => 200 })),
});

vi.stubGlobal("Calendar", {
  Events: {
    list: vi.fn(() => ({ items: [] })),
  },
});

beforeEach(() => {
  resetProperties();
});

export const TestConstants = {
  BOT_ID: TEST_BOT_ID,
  TOKEN: TEST_TOKEN,
};
