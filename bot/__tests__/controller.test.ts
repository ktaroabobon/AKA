import { describe, expect, it, vi } from "vitest";
import "./setup.js";
import { generateReply } from "../src/controller.js";

vi.mock("../src/googleCalendarApi.js", () => ({
  getEvents: vi.fn(() => ({ items: [] })),
  getLunchEvents: vi.fn(() => []),
  getDinnerEvents: vi.fn(() => []),
}));

describe("generateReply", () => {
  it("join event returns greeting", () => {
    const reply = generateReply({
      eventType: "join",
      userMessage: "",
      isBotMentioned: false,
    });
    expect(reply).toContain("こんにちは、僕あか");
  });

  it("exact match こんにちは responds to anyone", () => {
    const reply = generateReply({
      eventType: "message",
      userMessage: "こんにちは",
      isBotMentioned: false,
    });
    expect(reply).toBe("こんにちは！ぼく、紅！");
  });

  it("self introduction when mentioned", () => {
    const reply = generateReply({
      eventType: "message",
      userMessage: "自己紹介して",
      isBotMentioned: true,
    });
    expect(reply).toContain("こんにちは、僕あか");
  });

  it("non-mentioned, non-exact-match → null", () => {
    const reply = generateReply({
      eventType: "message",
      userMessage: "おはよう",
      isBotMentioned: false,
    });
    expect(reply).toBeNull();
  });

  it("mentioned with random fallback returns non-empty string", () => {
    const reply = generateReply({
      eventType: "message",
      userMessage: "何かしゃべって",
      isBotMentioned: true,
    });
    expect(typeof reply).toBe("string");
    expect((reply as string).length).toBeGreaterThan(0);
  });
});
