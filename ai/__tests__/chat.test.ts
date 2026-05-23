import { describe, expect, it, vi } from "vitest";
import {
  createChatRoute,
  type ChatRouteDeps,
  type MaskFn,
} from "../src/routes/chat.js";
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
    masked: `[masked]${text}`,
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

function makeApp(deps: Partial<ChatRouteDeps> = {}) {
  const moderation = deps.moderation ?? makeMask();
  const sessionService = deps.sessionService ?? makeSession();
  const genaiService = deps.genaiService ?? makeGenai();
  const logger = deps.logger ?? silentLogger();
  return {
    app: createChatRoute({ moderation, sessionService, genaiService, logger }),
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
});
