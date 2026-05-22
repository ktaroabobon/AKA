import { describe, expect, it, vi } from "vitest";
import "./setup.js";
import { generateReply } from "../src/controller.js";

describe("generateReply", () => {
  it("join event returns greeting", () => {
    const reply = generateReply({
      eventType: "join",
      userMessage: "",
      isBotMentioned: false,
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
      },
      { ai },
    );
    expect(reply).toContain("こんにちは、僕あか");
    expect(ai).not.toHaveBeenCalled();
  });

  it("non-mentioned, non-exact-match → null (no AI call)", () => {
    const ai = vi.fn();
    const reply = generateReply(
      { eventType: "message", userMessage: "おはよう", isBotMentioned: false },
      { ai },
    );
    expect(reply).toBeNull();
    expect(ai).not.toHaveBeenCalled();
  });

  it("mentioned with free-form prompt → calls AI and returns its reply", () => {
    const ai = vi.fn(() => "あかはね〜、今日も元気だよ〜！");
    const fallback = vi.fn(() => "(should not be called)");
    const reply = generateReply(
      {
        eventType: "message",
        userMessage: "今何してたの？",
        isBotMentioned: true,
      },
      { ai, fallback },
    );
    expect(ai).toHaveBeenCalledWith("今何してたの？");
    expect(reply).toBe("あかはね〜、今日も元気だよ〜！");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("AI failure → fallback is used", () => {
    const ai = vi.fn(() => null);
    const fallback = vi.fn(() => "random!");
    const reply = generateReply(
      {
        eventType: "message",
        userMessage: "なんか喋って",
        isBotMentioned: true,
      },
      { ai, fallback },
    );
    expect(ai).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledOnce();
    expect(reply).toBe("random!");
  });

  it("AI returns empty string → fallback is used", () => {
    const ai = vi.fn(() => "");
    const fallback = vi.fn(() => "random!");
    const reply = generateReply(
      {
        eventType: "message",
        userMessage: "なんか喋って",
        isBotMentioned: true,
      },
      { ai, fallback },
    );
    expect(reply).toBe("random!");
  });
});
