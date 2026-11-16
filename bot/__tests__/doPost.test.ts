import { beforeEach, describe, expect, it, vi } from "vitest";
import "./setup.js";
import { TestConstants } from "./setup.js";
import { doPost } from "../src/lineMessageApi.js";
import type { LineEvent } from "../src/types/line.js";

const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const MESSAGES_URL = `${TestConstants.AI_BASE_URL}/messages`;
const CHAT_URL = `${TestConstants.AI_BASE_URL}/chat/genai`;

const fetchMock = vi.fn();

function fakeResponse(
  status: number,
  body: unknown = "",
  headers: Record<string, string> = {},
  content: number[] = [],
) {
  return {
    getResponseCode: () => status,
    getContentText: () =>
      typeof body === "string" ? body : JSON.stringify(body),
    getHeaders: () => headers,
    getContent: () => content,
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

describe("doPost: quoted image (#76)", () => {
  const LOOKUP_URL = `${MESSAGES_URL}/q-1?sessionKey=group%3AC1`;
  const CONTENT_URL = "https://api-data.line.me/v2/bot/message/q-1/content";
  const IMAGE_BYTES = [0x89, 0x50, 0x4e, 0x47];

  function quotedEvent(mentioned: boolean): LineEvent {
    const event = groupTextEvent("@紅 これ何？", mentioned);
    event.message = {
      ...event.message!,
      quotedMessageId: "q-1",
    } as LineEvent["message"];
    return event;
  }

  function routesWith(content: Route): Record<string, Route> {
    return {
      [LOOKUP_URL]: () => fakeResponse(404, { error: "not_found" }),
      [CONTENT_URL]: content,
      [CHAT_URL]: () => fakeResponse(200, { reply: "うさぎだね！" }),
    };
  }

  it("sends quotedImage when the quoted text is not stored and LINE returns an image", () => {
    routeFetch(
      routesWith(() =>
        fakeResponse(200, "", { "Content-Type": "image/png" }, IMAGE_BYTES),
      ),
    );

    post(quotedEvent(true));

    const contentCall = fetchMock.mock.calls.find(([u]) => u === CONTENT_URL);
    expect(contentCall?.[1]).toMatchObject({
      method: "get",
      headers: { Authorization: `Bearer ${TestConstants.TOKEN}` },
    });
    expect(callsTo(CHAT_URL)[0].quotedImage).toEqual({
      mimeType: "image/png",
      data: Buffer.from(IMAGE_BYTES).toString("base64"),
    });
  });

  it.each([
    ["404", () => fakeResponse(404)],
    [
      "a non-image Content-Type",
      () => fakeResponse(200, "", { "content-type": "video/mp4" }, [1]),
    ],
    [
      "more than 5 MB",
      () =>
        fakeResponse(
          200,
          "",
          { "Content-Type": "image/jpeg" },
          new Array(5 * 1024 * 1024 + 1).fill(0),
        ),
    ],
  ])("replies without quotedImage when LINE returns %s", (_label, content) => {
    routeFetch(routesWith(content));

    const result = post(quotedEvent(true));

    expect(result).toBe(204);
    const [chatBody] = callsTo(CHAT_URL);
    expect(chatBody.quotedMessageId).toBe("q-1");
    expect(chatBody).not.toHaveProperty("quotedImage");
  });

  it("does not call the content API without a mention", () => {
    routeFetch(routesWith(() => fakeResponse(200)));

    post(quotedEvent(false));

    expect(fetchMock.mock.calls.some(([u]) => u === CONTENT_URL)).toBe(false);
    expect(callsTo(CHAT_URL)).toEqual([]);
  });

  it("does not call the content API when the quoted text is stored", () => {
    routeFetch({
      ...routesWith(() => fakeResponse(200)),
      [LOOKUP_URL]: () => fakeResponse(204),
    });

    post(quotedEvent(true));

    expect(fetchMock.mock.calls.some(([u]) => u === CONTENT_URL)).toBe(false);
    expect(callsTo(CHAT_URL)[0]).not.toHaveProperty("quotedImage");
  });
});
