import { describe, expect, it, vi, beforeEach } from "vitest";
import "./setup.js";
import { TestConstants } from "./setup.js";
import { chatWithAi, chatWithAiResult } from "../src/aiClient.js";

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
    expect(body).not.toHaveProperty("quotedMessageId");
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

  it("returns server_error result on 5xx response", () => {
    fetchMock.mockReturnValue(fakeResponse(502, { error: "genai_failed" }));
    expect(chatWithAiResult("hi", "user:U123")).toEqual({
      ok: false,
      reason: "server_error",
      status: 502,
    });
  });

  it("returns client_error result on 4xx response", () => {
    fetchMock.mockReturnValue(fakeResponse(400, { error: "invalid_request" }));
    expect(chatWithAiResult("hi", "user:U123")).toEqual({
      ok: false,
      reason: "client_error",
      status: 400,
    });
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

  it("sends quotedMessageId and allows an empty prompt with it (#75)", () => {
    // 1 回目: GET /messages (返信先テキストあり) / 2 回目: /chat/genai
    fetchMock
      .mockReturnValueOnce(fakeResponse(204, ""))
      .mockReturnValueOnce(fakeResponse(200, { reply: "ok" }));

    expect(chatWithAiResult("", "group:C1", "q-1")).toEqual({
      ok: true,
      reply: "ok",
    });
    const body = JSON.parse(fetchMock.mock.calls[1][1].payload as string);
    expect(body.prompt).toBe("");
    expect(body.quotedMessageId).toBe("q-1");
  });
});

describe("chatWithAiResult: quoted message lookup and image (#76)", () => {
  const LOOKUP_URL = `${TestConstants.AI_BASE_URL}/messages/2001?sessionKey=group%3AC1`;
  const CONTENT_URL = "https://api-data.line.me/v2/bot/message/2001/content";
  const CHAT_URL = `${TestConstants.AI_BASE_URL}/chat/genai`;
  const PNG = {
    getResponseCode: () => 200,
    getHeaders: () => ({ "Content-Type": "image/png" }),
    getContent: () => [1, 2, 3],
  };

  function route(lookup: () => unknown, content: () => unknown) {
    fetchMock.mockImplementation((url: string) => {
      if (url === LOOKUP_URL) return lookup();
      if (url === CONTENT_URL) return content();
      if (url === CHAT_URL) return fakeResponse(200, { reply: "ok" });
      throw new Error(`unexpected ${url}`);
    });
  }
  const urls = () => fetchMock.mock.calls.map(([u]) => u);
  const chatBody = () =>
    JSON.parse(
      fetchMock.mock.calls.find(([u]) => u === CHAT_URL)![1].payload as string,
    );
  const throws = () => {
    throw new Error("network down");
  };

  it("skips an empty prompt when neither quoted text nor image is found", () => {
    route(
      () => fakeResponse(404, ""),
      () => fakeResponse(404, ""),
    );

    expect(chatWithAiResult("", "group:C1", "2001")).toEqual({
      ok: false,
      reason: "skipped",
    });
    expect(urls()).toEqual([LOOKUP_URL, CONTENT_URL]);
  });

  it("sends an empty prompt with only the image", () => {
    route(
      () => fakeResponse(404, ""),
      () => PNG,
    );

    expect(chatWithAiResult("", "group:C1", "2001").ok).toBe(true);
    expect(chatBody()).toMatchObject({
      prompt: "",
      quotedMessageId: "2001",
      quotedImage: { mimeType: "image/png" },
    });
  });

  it.each([
    ["returns 5xx", () => fakeResponse(500, "")],
    ["throws", throws],
  ])(
    "does not fetch the image and leaves the quote to ai when the lookup %s",
    (_label, lookup) => {
      route(lookup, () => PNG);

      expect(chatWithAiResult("", "group:C1", "2001").ok).toBe(true);
      expect(urls()).toEqual([LOOKUP_URL, CHAT_URL]);
      expect(chatBody()).not.toHaveProperty("quotedImage");
    },
  );

  it("answers without the image when the content fetch throws", () => {
    route(() => fakeResponse(404, ""), throws);

    expect(chatWithAiResult("これ何？", "group:C1", "2001").ok).toBe(true);
    expect(chatBody()).not.toHaveProperty("quotedImage");
  });

  it("does not look up an empty quotedMessageId", () => {
    route(throws, throws);

    expect(chatWithAiResult("hi", "group:C1", "").ok).toBe(true);
    expect(urls()).toEqual([CHAT_URL]);
    expect(chatBody()).not.toHaveProperty("quotedMessageId");
  });
});
