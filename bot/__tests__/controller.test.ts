import { describe, expect, it, vi } from "vitest";
import "./setup.js";
import { generateReply } from "../src/controller.js";
import type { AiClientResult } from "../src/aiClient.js";
import type { LineSource } from "../src/types/line.js";

const USER_SOURCE: LineSource = { type: "user", userId: "U123" };
const GROUP_SOURCE: LineSource = { type: "group", groupId: "C456" };
const INVALID_SOURCE: LineSource = { type: "user" }; // userId 欠落

function aiReply(reply: string): AiClientResult {
  return { ok: true, reply };
}

function aiFailure(
  reason:
    | "skipped"
    | "fetch_failed"
    | "server_error"
    | "client_error"
    | "invalid_response",
  status?: number,
): AiClientResult {
  return status === undefined
    ? { ok: false, reason }
    : { ok: false, reason, status };
}

describe("generateReply", () => {
  it("join event returns greeting", () => {
    const reply = generateReply({
      eventType: "join",
      userMessage: "",
      isBotMentioned: false,
      source: USER_SOURCE,
    });
    expect(reply).toContain("こんにちは、僕あか");
  });

  it("exact match こんにちは responds to anyone (no AI call)", () => {
    const ai = vi.fn();
    const reply = generateReply(
      {
        eventType: "message",
        userMessage: "こんにちは",
        isBotMentioned: false,
        source: USER_SOURCE,
      },
      { ai },
    );
    expect(reply).toBe("こんにちは！ぼく、紅！");
    expect(ai).not.toHaveBeenCalled();
  });

  it("self introduction when mentioned (no AI call)", () => {
    const ai = vi.fn();
    const reply = generateReply(
      {
        eventType: "message",
        userMessage: "自己紹介して",
        isBotMentioned: true,
        source: USER_SOURCE,
      },
      { ai },
    );
    expect(reply).toContain("こんにちは、僕あか");
    expect(ai).not.toHaveBeenCalled();
  });

  it("non-mentioned, non-exact-match → null (no AI call)", () => {
    const ai = vi.fn();
    const reply = generateReply(
      {
        eventType: "message",
        userMessage: "おはよう",
        isBotMentioned: false,
        source: GROUP_SOURCE,
      },
      { ai },
    );
    expect(reply).toBeNull();
    expect(ai).not.toHaveBeenCalled();
  });

  it("user 1:1: passes user:{id} sessionKey to AI", () => {
    const ai = vi.fn(() => aiReply("あかはね〜、今日も元気だよ〜！"));
    const fallback = vi.fn(() => "(should not be called)");
    const reply = generateReply(
      {
        eventType: "message",
        userMessage: "今何してたの？",
        isBotMentioned: true,
        source: USER_SOURCE,
      },
      { ai, fallback },
    );
    expect(ai).toHaveBeenCalledWith("今何してたの？", "user:U123");
    expect(reply).toBe("あかはね〜、今日も元気だよ〜！");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("group mention: passes group:{id} sessionKey to AI", () => {
    const ai = vi.fn(() => aiReply("ぼくはね〜、グループでも元気〜！"));
    const reply = generateReply(
      {
        eventType: "message",
        userMessage: "今何してたの？",
        isBotMentioned: true,
        source: GROUP_SOURCE,
      },
      { ai },
    );
    expect(ai).toHaveBeenCalledWith("今何してたの？", "group:C456");
    expect(reply).toBe("ぼくはね〜、グループでも元気〜！");
  });

  it("invalid source (buildSessionKey returns null) → skip AI, use fallback", () => {
    const ai = vi.fn();
    const fallback = vi.fn(() => "random!");
    const reply = generateReply(
      {
        eventType: "message",
        userMessage: "なんか喋って",
        isBotMentioned: true,
        source: INVALID_SOURCE,
      },
      { ai, fallback },
    );
    expect(ai).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledOnce();
    expect(reply).toBe("random!");
  });

  it("custom sessionKeyBuilder is used when provided", () => {
    const ai = vi.fn(() => aiReply("ok"));
    const sessionKeyBuilder = vi.fn(() => "override:Z");
    generateReply(
      {
        eventType: "message",
        userMessage: "なんか喋って",
        isBotMentioned: true,
        source: USER_SOURCE,
      },
      { ai, sessionKeyBuilder },
    );
    expect(sessionKeyBuilder).toHaveBeenCalledWith(USER_SOURCE);
    expect(ai).toHaveBeenCalledWith("なんか喋って", "override:Z");
  });

  it("AI failure (null) → fallback is used (sessionKey path)", () => {
    const ai = vi.fn(() => aiFailure("fetch_failed"));
    const fallback = vi.fn(() => "random!");
    const reply = generateReply(
      {
        eventType: "message",
        userMessage: "なんか喋って",
        isBotMentioned: true,
        source: USER_SOURCE,
      },
      { ai, fallback },
    );
    expect(ai).toHaveBeenCalledOnce();
    expect(ai).toHaveBeenCalledWith("なんか喋って", "user:U123");
    expect(fallback).toHaveBeenCalledOnce();
    expect(reply).toBe("random!");
  });

  it("AI invalid response → fallback is used", () => {
    const ai = vi.fn(() => aiFailure("invalid_response", 200));
    const fallback = vi.fn(() => "random!");
    const reply = generateReply(
      {
        eventType: "message",
        userMessage: "なんか喋って",
        isBotMentioned: true,
        source: USER_SOURCE,
      },
      { ai, fallback },
    );
    expect(reply).toBe("random!");
  });

  it("AI 5xx response → server error fallback is used", () => {
    const ai = vi.fn(() => aiFailure("server_error", 502));
    const fallback = vi.fn(() => "random!");
    const serverErrorFallback = vi.fn(
      () => "あかはお昼寝しちゃった…むにゃむにゃ",
    );
    const reply = generateReply(
      {
        eventType: "message",
        userMessage: "なんか喋って",
        isBotMentioned: true,
        source: USER_SOURCE,
      },
      { ai, fallback, serverErrorFallback },
    );
    expect(reply).toBe("あかはお昼寝しちゃった…むにゃむにゃ");
    expect(serverErrorFallback).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
  });
});
