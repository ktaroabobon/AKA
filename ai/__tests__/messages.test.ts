import { describe, expect, it, vi } from "vitest";
import { Firestore, Timestamp } from "@google-cloud/firestore";
import { createMessagesRoute } from "../src/routes/messages.js";
import { mask } from "../src/services/moderation.js";
import {
  createMessageStore,
  type MessageStore,
} from "../src/services/messageStore.js";
import type { Logger } from "../src/lib/logger.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// mask() が [REDACTED] に置き換える PII の番兵
const PII_SENTINEL = "090-1234-5678";

function silentLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
}

function makeFakeFirestore(setError?: unknown) {
  const set = vi.fn(async () => {
    if (setError !== undefined) throw setError;
  });
  const doc = vi.fn(() => ({ set }));
  const collection = vi.fn(() => ({ doc }));
  const firestore = { collection } as unknown as Firestore;
  return { firestore, collection, doc, set };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeApp(messageStore: MessageStore) {
  return createMessagesRoute({
    moderation: mask,
    messageStore,
    logger: silentLogger(),
  });
}

const VALID_BODY = {
  sessionKey: "group:C1",
  messageId: "1001",
  sender: "user",
  text: `電話は ${PII_SENTINEL} だよ`,
};

describe("POST /messages", () => {
  it("saves masked text with expiresAt = now + 7 days and returns 204", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-11-16T00:00:00Z");
    vi.setSystemTime(now);
    try {
      const fake = makeFakeFirestore();
      const app = makeApp(createMessageStore(fake.firestore));

      const res = await app.fetch(makeRequest(VALID_BODY));

      expect(res.status).toBe(204);
      expect(fake.collection).toHaveBeenCalledWith("messages");
      expect(fake.doc).toHaveBeenCalledWith("1001");
      expect(fake.set).toHaveBeenCalledTimes(1);
      expect(fake.set).toHaveBeenCalledWith({
        sessionKey: "group:C1",
        sender: "user",
        text: "電話は [REDACTED] だよ",
        expiresAt: Timestamp.fromMillis(now.getTime() + 7 * DAY_MS),
      });
      expect(JSON.stringify(fake.set.mock.calls)).not.toContain(PII_SENTINEL);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns 400 invalid_request for an unknown sender", async () => {
    const fake = makeFakeFirestore();
    const app = makeApp(createMessageStore(fake.firestore));

    const res = await app.fetch(makeRequest({ ...VALID_BODY, sender: "bob" }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "invalid_request",
    });
    expect(fake.set).not.toHaveBeenCalled();
  });

  it.each(["", "a/b", "..", "__x__", "1".repeat(65)])(
    "returns 400 invalid_request for messageId %j that is not a LINE id",
    async (messageId) => {
      const fake = makeFakeFirestore();
      const app = makeApp(createMessageStore(fake.firestore));

      const res = await app.fetch(makeRequest({ ...VALID_BODY, messageId }));

      expect(res.status).toBe(400);
      expect(fake.set).not.toHaveBeenCalled();
    },
  );

  it("returns 400 invalid_request for empty or too long text", async () => {
    const fake = makeFakeFirestore();
    const app = makeApp(createMessageStore(fake.firestore));

    const empty = await app.fetch(makeRequest({ ...VALID_BODY, text: "" }));
    const tooLong = await app.fetch(
      makeRequest({ ...VALID_BODY, text: "あ".repeat(5001) }),
    );

    expect(empty.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(fake.set).not.toHaveBeenCalled();
  });

  it("returns 500 internal_error when Firestore write fails", async () => {
    const fake = makeFakeFirestore(new Error("firestore down"));
    const app = makeApp(createMessageStore(fake.firestore));

    const res = await app.fetch(makeRequest(VALID_BODY));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "internal_error" });
  });
});
