import { describe, expect, it, vi } from "vitest";
import { createChatRoute, type ChatRouteDeps } from "../src/routes/chat.js";
import type { MaskFn } from "../src/services/moderation.js";
import {
  GenaiSafetyBlockedError,
  GenaiServiceError,
  type GenaiService,
} from "../src/services/genai.js";
import {
  SessionStoreError,
  type ConversationMessage,
  type SessionService,
} from "../src/services/session.js";
import type {
  MessageStore,
  StoredMessage,
} from "../src/services/messageStore.js";
import { Timestamp } from "@google-cloud/firestore";
import { SAFETY_FALLBACK_MESSAGES } from "../src/prompts/aka.js";
import type { Logger } from "../src/lib/logger.js";

function silentLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
  } as unknown as Logger;
}

function makeMask(): MaskFn {
  return vi.fn((text: string) => ({
    // 実物の mask() と同じく空文字は空文字のまま
    masked: text === "" ? "" : `[masked]${text}`,
    redactionCount: { pii: 0, profanity: 0 },
  }));
}

function makeSession(overrides: Partial<SessionService> = {}): SessionService {
  return {
    getRecent: vi.fn(async () => [] as ConversationMessage[]),
    append: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makeGenai(overrides: Partial<GenaiService> = {}): GenaiService {
  return {
    generate: vi.fn(async () => "gemini reply"),
    ...overrides,
  };
}

function makeMessageStore(stored: StoredMessage | null = null): MessageStore {
  return {
    save: vi.fn(async () => undefined),
    get: vi.fn(async () => stored),
  };
}

function makeApp(deps: Partial<ChatRouteDeps> = {}) {
  const moderation = deps.moderation ?? makeMask();
  const sessionService = deps.sessionService ?? makeSession();
  const messageStore = deps.messageStore ?? makeMessageStore();
  const genaiService = deps.genaiService ?? makeGenai();
  const logger = deps.logger ?? silentLogger();
  return {
    app: createChatRoute({
      moderation,
      sessionService,
      messageStore,
      genaiService,
      logger,
    }),
    moderation,
    sessionService,
    genaiService,
    logger,
  };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/chat/genai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /chat/genai", () => {
  it("orchestrates mask → getRecent → genai → mask → append and returns masked reply", async () => {
    const moderation = makeMask();
    const sessionService = makeSession();
    const genaiService = makeGenai({
      generate: vi.fn(async () => "あかはねー、元気だよ！"),
    });
    const { app } = makeApp({ moderation, sessionService, genaiService });

    const res = await app.fetch(
      makeRequest({
        sessionKey: "U-abc:room-1",
        prompt: "こんにちは",
        encrypted_api_key: "enc-key",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      reply: "[masked]あかはねー、元気だよ！",
    });

    // 入力 (prompt) と 出力 (reply) で 2 回 mask が呼ばれる
    expect(moderation).toHaveBeenCalledTimes(2);
    expect(moderation).toHaveBeenNthCalledWith(1, "こんにちは");
    expect(moderation).toHaveBeenNthCalledWith(2, "あかはねー、元気だよ！");

    // getRecent は sessionKey と now (Date) で呼ばれる
    expect(sessionService.getRecent).toHaveBeenCalledTimes(1);
    const getRecentCall = (sessionService.getRecent as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(getRecentCall[0]).toBe("U-abc:room-1");
    expect(getRecentCall[1]).toBeInstanceOf(Date);

    // genai は masked 入力 + 空履歴 + encrypted_api_key で呼ばれる
    expect(genaiService.generate).toHaveBeenCalledTimes(1);
    expect(genaiService.generate).toHaveBeenCalledWith({
      history: [],
      userText: "[masked]こんにちは",
      encryptedApiKey: "enc-key",
    });

    // append は masked 入出力と now (Date) で呼ばれる
    expect(sessionService.append).toHaveBeenCalledTimes(1);
    const appendCall = (sessionService.append as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(appendCall[0]).toBe("U-abc:room-1");
    expect(appendCall[1]).toBe("[masked]こんにちは");
    expect(appendCall[2]).toBe("[masked]あかはねー、元気だよ！");
    expect(appendCall[3]).toBeInstanceOf(Date);
  });

  it("returns a SAFETY fallback message and does not append when Gemini blocks the response", async () => {
    const moderation = makeMask();
    const sessionService = makeSession();
    const genaiService = makeGenai({
      generate: vi.fn(async () => {
        throw new GenaiSafetyBlockedError("blocked by safety");
      }),
    });
    const { app } = makeApp({ moderation, sessionService, genaiService });

    const res = await app.fetch(
      makeRequest({
        sessionKey: "U-abc:room-1",
        prompt: "危ない話",
        encrypted_api_key: "enc-key",
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { reply: string };
    expect(SAFETY_FALLBACK_MESSAGES).toContain(body.reply);

    // SAFETY 時は履歴に保存しない (Req 4.4)
    expect(sessionService.append).not.toHaveBeenCalled();
    // 入力 mask は呼ばれているが、応答 mask は呼ばれない (fallback 文言はそのまま返す)
    expect(moderation).toHaveBeenCalledTimes(1);
    expect(moderation).toHaveBeenCalledWith("危ない話");
  });

  it("returns 500 internal_error when sessionService.getRecent throws SessionStoreError", async () => {
    const sessionService = makeSession({
      getRecent: vi.fn(async () => {
        throw new SessionStoreError("firestore unreachable");
      }),
    });
    const genaiService = makeGenai();
    const { app } = makeApp({ sessionService, genaiService });

    const res = await app.fetch(
      makeRequest({
        sessionKey: "U-abc:room-1",
        prompt: "hi",
        encrypted_api_key: "enc-key",
      }),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "internal_error" });

    // Firestore 取得失敗時は Gemini を呼ばない
    expect(genaiService.generate).not.toHaveBeenCalled();
    expect(sessionService.append).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_request when sessionKey is empty", async () => {
    const { app, genaiService, sessionService } = makeApp();

    const res = await app.fetch(
      makeRequest({
        sessionKey: "",
        prompt: "hi",
        encrypted_api_key: "enc-key",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "invalid_request",
    });
    expect(genaiService.generate).not.toHaveBeenCalled();
    expect(sessionService.getRecent).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_request when sessionKey is missing", async () => {
    const { app, genaiService, sessionService } = makeApp();

    const res = await app.fetch(
      makeRequest({
        prompt: "hi",
        encrypted_api_key: "enc-key",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "invalid_request",
    });
    expect(genaiService.generate).not.toHaveBeenCalled();
    expect(sessionService.getRecent).not.toHaveBeenCalled();
  });

  it("returns 502 genai_failed when genaiService.generate throws a non-safety GenaiServiceError", async () => {
    const sessionService = makeSession();
    const genaiService = makeGenai({
      generate: vi.fn(async () => {
        throw new GenaiServiceError("upstream down");
      }),
    });
    const { app } = makeApp({ sessionService, genaiService });

    const res = await app.fetch(
      makeRequest({
        sessionKey: "U-abc:room-1",
        prompt: "hi",
        encrypted_api_key: "enc-key",
      }),
    );

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "genai_failed" });

    // 上流失敗時は履歴に保存しない
    expect(sessionService.append).not.toHaveBeenCalled();
  });

  it("returns 500 internal_error when sessionService.append throws SessionStoreError", async () => {
    const sessionService = makeSession({
      append: vi.fn(async () => {
        throw new SessionStoreError("firestore write failed");
      }),
    });
    const genaiService = makeGenai();
    const { app } = makeApp({ sessionService, genaiService });

    const res = await app.fetch(
      makeRequest({
        sessionKey: "U-abc:room-1",
        prompt: "hi",
        encrypted_api_key: "enc-key",
      }),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "internal_error" });

    expect(genaiService.generate).toHaveBeenCalledTimes(1);
    expect(sessionService.append).toHaveBeenCalledTimes(1);
  });

  describe("quotedMessageId (#75)", () => {
    const QUOTED: StoredMessage = {
      sessionKey: "group:C1",
      sender: "user",
      text: "週末は海に行くよ",
      expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
    };

    async function postWithQuote(
      stored: StoredMessage | null,
      prompt = "この話どう思う？",
    ) {
      const messageStore = makeMessageStore(stored);
      const { app, genaiService, sessionService } = makeApp({
        messageStore,
      });
      const res = await app.fetch(
        makeRequest({
          sessionKey: "group:C1",
          prompt,
          encrypted_api_key: "enc-key",
          quotedMessageId: "2001",
        }),
      );
      const generate = genaiService.generate as ReturnType<typeof vi.fn>;
      return { res, messageStore, generate, sessionService };
    }

    it("includes the quoted text in the user text for the same sessionKey", async () => {
      const { res, messageStore, generate, sessionService } =
        await postWithQuote(QUOTED);

      expect(res.status).toBe(200);
      expect(messageStore.get).toHaveBeenCalledWith("2001", expect.any(Date));
      const userText =
        "[返信先の誰かの発言]\n週末は海に行くよ\n\n[今の発話]\n[masked]この話どう思う？";
      expect(generate.mock.calls[0][0].userText).toBe(userText);
      // 組み立てた発話が user の 1 行として履歴に入る
      const appendCall = (sessionService.append as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      expect(appendCall[1]).toBe(userText);
    });

    it("labels a quoted bot message as 紅の発言", async () => {
      const { generate } = await postWithQuote({ ...QUOTED, sender: "bot" });

      expect(generate.mock.calls[0][0].userText).toBe(
        "[返信先の紅の発言]\n週末は海に行くよ\n\n[今の発話]\n[masked]この話どう思う？",
      );
    });

    it("ignores a quoted message from another sessionKey", async () => {
      const { generate } = await postWithQuote({
        ...QUOTED,
        sessionKey: "group:OTHER",
      });

      expect(generate.mock.calls[0][0].userText).toBe(
        "[masked]この話どう思う？",
      );
    });

    it("answers without the quote when it is not found", async () => {
      const { generate } = await postWithQuote(null);

      expect(generate.mock.calls[0][0].userText).toBe(
        "[masked]この話どう思う？",
      );
    });

    it("calls Gemini about the quote even when the prompt is empty", async () => {
      const { res, generate } = await postWithQuote(QUOTED, "");

      expect(res.status).toBe(200);
      expect(generate.mock.calls[0][0].userText).toBe(
        "[返信先の誰かの発言]\n週末は海に行くよ\n\n[今の発話]\n（本文なし。返信先の発言について話しかけている）",
      );
    });

    it("returns 400 invalid_request when the prompt is empty and the quote is not found", async () => {
      const { res, generate } = await postWithQuote(null, "");

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        error: "invalid_request",
      });
      expect(generate).not.toHaveBeenCalled();
    });
  });
});
