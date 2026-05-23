import { describe, expect, it, vi, beforeEach } from "vitest";
import "./setup.js";
import { TestConstants } from "./setup.js";
import { chatWithAi } from "../src/aiClient.js";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("UrlFetchApp", { fetch: fetchMock });
});

function fakeResponse(status: number, body: unknown) {
  return {
    getResponseCode: () => status,
    getContentText: () =>
      typeof body === "string" ? body : JSON.stringify(body),
  };
}

describe("chatWithAi", () => {
  it("posts to <AI_BASE_URL>/chat/genai with base64-encoded key", () => {
    fetchMock.mockReturnValue(fakeResponse(200, { reply: "あかだよ〜" }));

    const result = chatWithAi("おはよう", "user:U123");

    expect(result).toBe("あかだよ〜");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${TestConstants.AI_BASE_URL}/chat/genai`);
    expect(options).toMatchObject({
      method: "post",
      contentType: "application/json; charset=UTF-8",
      muteHttpExceptions: true,
    });
    const body = JSON.parse(options.payload as string);
    expect(body.prompt).toBe("おはよう");
    expect(body.sessionKey).toBe("user:U123");
    const expectedEncoded = Buffer.from(
      TestConstants.GEMINI_API_KEY,
      "utf-8",
    ).toString("base64");
    expect(body.encrypted_api_key).toBe(expectedEncoded);
  });

  it("returns null for empty prompt without calling fetch", () => {
    const result = chatWithAi("   ", "user:U123");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when sessionKey is empty without calling fetch", () => {
    const result = chatWithAi("hi", "");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null on non-200 response", () => {
    fetchMock.mockReturnValue(fakeResponse(502, { error: "genai_failed" }));
    expect(chatWithAi("hi", "user:U123")).toBeNull();
  });

  it("returns null when reply is empty string", () => {
    fetchMock.mockReturnValue(fakeResponse(200, { reply: "" }));
    expect(chatWithAi("hi", "user:U123")).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    fetchMock.mockReturnValue(fakeResponse(200, "<<not json>>"));
    expect(chatWithAi("hi", "user:U123")).toBeNull();
  });

  it("returns null on UrlFetchApp throw", () => {
    fetchMock.mockImplementation(() => {
      throw new Error("network down");
    });
    expect(chatWithAi("hi", "user:U123")).toBeNull();
  });
});
