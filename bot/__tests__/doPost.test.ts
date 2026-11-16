import { beforeEach, describe, expect, it, vi } from "vitest";
import "./setup.js";
import { TestConstants } from "./setup.js";
import { doPost } from "../src/lineMessageApi.js";
import type { LineEvent } from "../src/types/line.js";

const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const MESSAGES_URL = `${TestConstants.AI_BASE_URL}/messages`;
const CHAT_URL = `${TestConstants.AI_BASE_URL}/chat/genai`;

const fetchMock = vi.fn();

function fakeResponse(status: number, body: unknown = "") {
  return {
    getResponseCode: () => status,
    getContentText: () =>
      typeof body === "string" ? body : JSON.stringify(body),
  };
}

type Route = (options: { payload: string }) => ReturnType<typeof fakeResponse>;

/** URL ごとの応答を差し替える。未指定の URL は 204。 */
function routeFetch(routes: Record<string, Route>) {
  fetchMock.mockImplementation((url: string, options: { payload: string }) => {
    const route = routes[url];
    return route ? route(options) : fakeResponse(204);
  });
}

function callsTo(url: string) {
  return fetchMock.mock.calls
    .filter(([u]) => u === url)
    .map(([, options]) => JSON.parse((options as { payload: string }).payload));
}

function groupTextEvent(text: string, mentioned: boolean): LineEvent {
  return {
    type: "message",
    replyToken: "rt",
    timestamp: 0,
    source: { type: "group", groupId: "C1", userId: "U1" },
    message: {
      id: "msg-in",
      type: "text",
      text,
      ...(mentioned
        ? {
            mention: {
              mentionees: [
                {
                  index: 0,
                  length: 2,
                  type: "user",
                  userId: TestConstants.BOT_ID,
                },
              ],
            },
          }
        : {}),
    },
  };
}

function post(event: LineEvent) {
  return doPost({
    postData: {
      contents: JSON.stringify({ destination: "d", events: [event] }),
    },
  } as GoogleAppsScript.Events.DoPost);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("UrlFetchApp", { fetch: fetchMock });
});

describe("doPost: message saving (#75)", () => {
  it("saves a non-mentioned group text as sender user and does not reply", () => {
    routeFetch({});

    const result = post(groupTextEvent("今日は雨だね", false));

    expect(result).toBeNull();
    expect(callsTo(MESSAGES_URL)).toEqual([
      {
        sessionKey: "group:C1",
        messageId: "msg-in",
        sender: "user",
        text: "今日は雨だね",
      },
    ]);
    expect(callsTo(LINE_REPLY_URL)).toEqual([]);
    expect(callsTo(CHAT_URL)).toEqual([]);
  });

  it("saves the bot reply with the id from sentMessages", () => {
    routeFetch({
      [CHAT_URL]: () => fakeResponse(200, { reply: "雨もいいね！" }),
      [LINE_REPLY_URL]: () =>
        fakeResponse(200, { sentMessages: [{ id: "msg-out" }] }),
    });

    const result = post(groupTextEvent("@紅 雨だね", true));

    expect(result).toBe(200);
    expect(callsTo(MESSAGES_URL)).toEqual([
      {
        sessionKey: "group:C1",
        messageId: "msg-in",
        sender: "user",
        text: "@紅 雨だね",
      },
      {
        sessionKey: "group:C1",
        messageId: "msg-out",
        sender: "bot",
        text: "雨もいいね！",
      },
    ]);
  });

  it("still replies when saving fails", () => {
    routeFetch({
      [MESSAGES_URL]: () => {
        throw new Error("network down");
      },
      [CHAT_URL]: () => fakeResponse(200, { reply: "雨もいいね！" }),
      [LINE_REPLY_URL]: () =>
        fakeResponse(200, { sentMessages: [{ id: "msg-out" }] }),
    });

    const result = post(groupTextEvent("@紅 雨だね", true));

    expect(result).toBe(200);
    expect(callsTo(LINE_REPLY_URL)).toEqual([
      { replyToken: "rt", messages: [{ type: "text", text: "雨もいいね！" }] },
    ]);
  });

  it("sends quotedMessageId to /chat/genai when mentioned (#75)", () => {
    routeFetch({
      [CHAT_URL]: () => fakeResponse(200, { reply: "海いいね！" }),
    });
    const event = groupTextEvent("@紅 この話どう思う？", true);
    event.message = {
      ...event.message!,
      quotedMessageId: "q-1",
    } as LineEvent["message"];

    post(event);

    expect(callsTo(CHAT_URL)).toMatchObject([{ quotedMessageId: "q-1" }]);
  });

  it("sends an empty prompt with quotedMessageId for a mention-only reply", () => {
    routeFetch({
      [CHAT_URL]: () => fakeResponse(200, { reply: "海いいね！" }),
    });
    const event = groupTextEvent("あか、", false);
    event.message = {
      ...event.message!,
      quotedMessageId: "2001",
    } as LineEvent["message"];

    post(event);

    expect(callsTo(CHAT_URL)).toMatchObject([
      { prompt: "", quotedMessageId: "2001" },
    ]);
  });

  it("does not call AI for a non-mentioned reply with quotedMessageId", () => {
    routeFetch({});
    const event = groupTextEvent("それな", false);
    event.message = {
      ...event.message!,
      quotedMessageId: "q-1",
    } as LineEvent["message"];

    expect(post(event)).toBeNull();
    expect(callsTo(CHAT_URL)).toEqual([]);
  });

  it("saves the user message after the reply is sent", () => {
    routeFetch({
      [CHAT_URL]: () => fakeResponse(200, { reply: "雨もいいね！" }),
      [LINE_REPLY_URL]: () =>
        fakeResponse(200, { sentMessages: [{ id: "msg-out" }] }),
    });

    post(groupTextEvent("@紅 雨だね", true));

    const urls = fetchMock.mock.calls.map(([u]) => u);
    expect(urls.indexOf(LINE_REPLY_URL)).toBeLessThan(
      urls.indexOf(MESSAGES_URL),
    );
  });

  it.each([
    ["no sentMessages", { other: 1 }],
    ["a non-JSON body", "<<not json>>"],
  ])(
    "does not save the bot reply when the reply API returns %s",
    (_l, body) => {
      routeFetch({
        [CHAT_URL]: () => fakeResponse(200, { reply: "雨もいいね！" }),
        [LINE_REPLY_URL]: () => fakeResponse(200, body),
      });

      post(groupTextEvent("@紅 雨だね", true));

      expect(callsTo(MESSAGES_URL).map((b) => b.sender)).toEqual(["user"]);
    },
  );

  it("does not save without a sessionKey or for a non-text message", () => {
    routeFetch({});
    const noKey = groupTextEvent("今日は雨だね", false);
    noKey.source = { type: "group" };
    const sticker = groupTextEvent("", false);
    sticker.message = { id: "s-1", type: "sticker" };

    post(noKey);
    post(sticker);

    expect(callsTo(MESSAGES_URL)).toEqual([]);
  });
});
