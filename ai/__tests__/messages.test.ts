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

describe("MessageStore.get", () => {
  function makeReadFirestore(data: unknown) {
    const get = vi.fn(async () => ({
      exists: data !== undefined,
      data: () => data,
    }));
    const firestore = {
      collection: vi.fn(() => ({ doc: vi.fn(() => ({ get })) })),
    } as unknown as Firestore;
    return firestore;
  }

  const now = new Date("2026-11-16T00:00:00Z");
  const stored = {
    sessionKey: "group:C1",
    sender: "user",
    text: "hi",
    expiresAt: Timestamp.fromMillis(now.getTime() + 1000),
  };

  it("returns the stored message before expiresAt", async () => {
    const store = createMessageStore(makeReadFirestore(stored));
    await expect(store.get("m-1", now)).resolves.toEqual(stored);
  });

  it("returns null when expired or missing", async () => {
    const expired = {
      ...stored,
      expiresAt: Timestamp.fromMillis(now.getTime() - 1),
    };
    await expect(
      createMessageStore(makeReadFirestore(expired)).get("m-1", now),
    ).resolves.toBeNull();
    await expect(
      createMessageStore(makeReadFirestore(undefined)).get("m-1", now),
    ).resolves.toBeNull();
  });
});

describe("GET /messages/:messageId (#76)", () => {
  function makeStore(get: MessageStore["get"]): MessageStore {
    return { save: vi.fn(async () => undefined), get: vi.fn(get) };
  }
  const stored = {
    sessionKey: "group:C1",
    sender: "user" as const,
    text: "hi",
    expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
  };

  async function find(store: MessageStore, query = "?sessionKey=group%3AC1") {
    return makeApp(store).fetch(
      new Request(`http://localhost/messages/m-1${query}`),
    );
  }

  it("returns 204 without the text when the same sessionKey has it", async () => {
    const store = makeStore(async () => stored);

    const res = await find(store);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(store.get).toHaveBeenCalledWith("m-1", expect.any(Date));
  });

  it("returns 404 not_found when missing or from another sessionKey", async () => {
    const missing = await find(makeStore(async () => null));
    const other = await find(
      makeStore(async () => ({ ...stored, sessionKey: "group:OTHER" })),
    );

    expect(missing.status).toBe(404);
    expect(other.status).toBe(404);
    await expect(other.json()).resolves.toEqual({ error: "not_found" });
  });

  it("returns 400 invalid_request without sessionKey", async () => {
    const res = await find(
      makeStore(async () => stored),
      "",
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "invalid_request",
    });
  });

  it("returns 500 internal_error when Firestore read fails", async () => {
    const res = await find(
      makeStore(async () => {
        throw new MessageStoreError("down");
      }),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "internal_error" });
  });
});
