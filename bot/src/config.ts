// Script Properties に保存された設定値の取得。
// GAS 上では PropertiesService.getScriptProperties() を使う。

const KEY_CHANNEL_ACCESS_TOKEN = "CHANNEL_ACCESS_TOKEN";
const KEY_BOT_ID = "BOT_ID";
const KEY_CALENDAR_ID = "CALENDAR_ID";

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

export function getCalendarId(): string {
  return getProperty(KEY_CALENDAR_ID) ?? "primary";
}
