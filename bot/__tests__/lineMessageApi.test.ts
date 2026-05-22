import { describe, expect, it } from "vitest";
import "./setup.js";
import { TestConstants } from "./setup.js";
import { isBotMentioned } from "../src/lineMessageApi.js";
import type { LineEvent } from "../src/types/line.js";

function buildEvent(
  partial: Partial<LineEvent> & {
    text?: string;
    mentionees?: Array<{
      type: "user" | "all";
      userId?: string;
      index?: number;
      length?: number;
    }>;
    sourceType?: "user" | "group" | "room";
  },
): LineEvent {
  const mentionees = partial.mentionees ?? [];
  return {
    type: "message",
    replyToken: "rt",
    timestamp: 0,
    source: {
      type: partial.sourceType ?? "group",
      groupId: "g",
    },
    message: {
      id: "m",
      type: "text",
      text: partial.text ?? "",
      ...(mentionees.length > 0
        ? {
            mention: {
              mentionees: mentionees.map((m, i) => ({
                index: m.index ?? i,
                length: m.length ?? 1,
                type: m.type,
                userId: m.userId,
              })),
            },
          }
        : {}),
    } as LineEvent["message"],
    ...partial,
  } as LineEvent;
}

describe("isBotMentioned", () => {
  it("group: mentionees contains bot userId → mentioned, text unchanged", () => {
    const event = buildEvent({
      sourceType: "group",
      text: "@紅 こんにちは",
      mentionees: [{ type: "user", userId: TestConstants.BOT_ID }],
    });
    const result = isBotMentioned(event);
    expect(result.isBotMentioned).toBe(true);
    expect(result.userMessage).toBe("@紅 こんにちは");
  });

  it("group: prefix match strips the prefix", () => {
    const event = buildEvent({
      sourceType: "group",
      text: "あか、おはよう",
    });
    const result = isBotMentioned(event);
    expect(result.isBotMentioned).toBe(true);
    expect(result.userMessage).toBe("おはよう");
  });

  it("group: no mention and no prefix → not mentioned", () => {
    const event = buildEvent({
      sourceType: "group",
      text: "おはよう",
    });
    const result = isBotMentioned(event);
    expect(result.isBotMentioned).toBe(false);
    expect(result.userMessage).toBe("おはよう");
  });

  it("user (個チャ): always mentioned", () => {
    const event = buildEvent({
      sourceType: "user",
      text: "こんにちは",
    });
    const result = isBotMentioned(event);
    expect(result.isBotMentioned).toBe(true);
    expect(result.userMessage).toBe("こんにちは");
  });

  it("group: mentionees contains other user only → not mentioned", () => {
    const event = buildEvent({
      sourceType: "group",
      text: "@誰か おはよう",
      mentionees: [{ type: "user", userId: "someone-else" }],
    });
    const result = isBotMentioned(event);
    expect(result.isBotMentioned).toBe(false);
  });
});
