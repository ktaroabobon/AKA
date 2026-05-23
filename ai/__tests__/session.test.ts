import { describe, expect, it, vi } from "vitest";
import { Firestore, Timestamp } from "@google-cloud/firestore";
import {
  createSessionService,
  SessionStoreError,
  type ConversationMessage,
} from "../src/services/session.js";

const SESSION_KEY = "U-test:room-test";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface StoredDocument {
  messages: ConversationMessage[];
  lastTurnAt: Timestamp;
  expiresAt: Timestamp;
}

interface FakeFirestoreSetup {
  firestore: Firestore;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

/**
 * SessionService が触る Firestore I/F (`collection().doc().get|set`) のみを満たす
 * 手書き fake。`as unknown as Firestore` で型を満たす (実 Firestore のメソッドは触らないため)。
 */
function makeFakeFirestore(options: {
  initial?: StoredDocument | null;
  getError?: unknown;
  setError?: unknown;
}): FakeFirestoreSetup {
  const { initial = null, getError, setError } = options;

  const get = vi.fn(async () => {
    if (getError !== undefined) {
      throw getError;
    }
    if (initial === null) {
      return {
        exists: false,
        data: () => undefined,
      };
    }
    return {
      exists: true,
      data: () => initial,
    };
  });

  const set = vi.fn(async () => {
    if (setError !== undefined) {
      throw setError;
    }
    return undefined;
  });

  const doc = { get, set };
  const collection = { doc: vi.fn(() => doc) };
  const firestore = {
    collection: vi.fn(() => collection),
  } as unknown as Firestore;

  return { firestore, get, set };
}

function makeMessage(
  role: "user" | "model",
  text: string,
  ts: Timestamp,
): ConversationMessage {
  return { role, text, ts };
}

describe("SessionService.getRecent", () => {
  it("ドキュメント不在の場合は空配列を返す (Req 2.4)", async () => {
    const { firestore, get } = makeFakeFirestore({ initial: null });
    const service = createSessionService(firestore);

    const now = new Date("2026-05-23T12:00:00Z");
    const result = await service.getRecent(SESSION_KEY, now);

    expect(result).toEqual([]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("最終発話から 2h を超過した場合は空配列を返す (Req 3.2)", async () => {
    const now = new Date("2026-05-23T12:00:00Z");
    // 2h + 1s 前 (= ウィンドウ外境界)
    const lastTurnAt = Timestamp.fromMillis(
      now.getTime() - (2 * HOUR_MS + 1000),
    );
    const expiresAt = Timestamp.fromMillis(lastTurnAt.toMillis() + DAY_MS);

    const messages: ConversationMessage[] = [
      makeMessage("user", "古い発話", lastTurnAt),
      makeMessage("model", "古い応答", lastTurnAt),
    ];
    const { firestore } = makeFakeFirestore({
      initial: { messages, lastTurnAt, expiresAt },
    });
    const service = createSessionService(firestore);

    const result = await service.getRecent(SESSION_KEY, now);
    expect(result).toEqual([]);
  });

  it("最終発話から 2h ちょうど未満なら通常通り返す (Req 3.2 境界)", async () => {
    const now = new Date("2026-05-23T12:00:00Z");
    // 2h - 1s 前 (= ウィンドウ内境界)
    const lastTurnAt = Timestamp.fromMillis(
      now.getTime() - (2 * HOUR_MS - 1000),
    );
    const expiresAt = Timestamp.fromMillis(lastTurnAt.toMillis() + DAY_MS);

    const messages: ConversationMessage[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push(
        makeMessage(i % 2 === 0 ? "user" : "model", `msg-${i}`, lastTurnAt),
      );
    }

    const { firestore } = makeFakeFirestore({
      initial: { messages, lastTurnAt, expiresAt },
    });
    const service = createSessionService(firestore);

    const result = await service.getRecent(SESSION_KEY, now);
    expect(result).toHaveLength(20);
    expect(result).toEqual(messages);
  });

  it("21 件以上ある履歴に対し直近 20 件のみを返す (Req 3.1)", async () => {
    const now = new Date("2026-05-23T12:00:00Z");
    const lastTurnAt = Timestamp.fromMillis(now.getTime() - 60 * 1000); // 1 分前

    const messages: ConversationMessage[] = [];
    for (let i = 0; i < 25; i++) {
      messages.push(
        makeMessage(i % 2 === 0 ? "user" : "model", `msg-${i}`, lastTurnAt),
      );
    }
    const expiresAt = Timestamp.fromMillis(lastTurnAt.toMillis() + DAY_MS);

    const { firestore } = makeFakeFirestore({
      initial: { messages, lastTurnAt, expiresAt },
    });
    const service = createSessionService(firestore);

    const result = await service.getRecent(SESSION_KEY, now);
    expect(result).toHaveLength(20);
    // 直近 20 件 = index 5..24 (古い 5 件 = msg-0..msg-4 は落ちる)
    expect(result[0]?.text).toBe("msg-5");
    expect(result[19]?.text).toBe("msg-24");
  });

  it("Firestore get が失敗したら SessionStoreError を投げる (Req 8.3)", async () => {
    const cause = new Error("network down");
    const { firestore } = makeFakeFirestore({ getError: cause });
    const service = createSessionService(firestore);

    const now = new Date("2026-05-23T12:00:00Z");

    await expect(service.getRecent(SESSION_KEY, now)).rejects.toBeInstanceOf(
      SessionStoreError,
    );
    await expect(service.getRecent(SESSION_KEY, now)).rejects.toMatchObject({
      cause,
    });
  });
});

describe("SessionService.append", () => {
  it("初回 append で user / model の 2 件と lastTurnAt / expiresAt を書く (Req 2.3)", async () => {
    const { firestore, set } = makeFakeFirestore({ initial: null });
    const service = createSessionService(firestore);

    const now = new Date("2026-05-23T12:00:00Z");
    await service.append(SESSION_KEY, "こんにちは", "やっほー", now);

    expect(set).toHaveBeenCalledTimes(1);
    const [payload, options] = set.mock.calls[0] ?? [];
    expect(options).toEqual({ merge: false });

    const written = payload as StoredDocument;
    expect(written.messages).toHaveLength(2);
    expect(written.messages[0]).toMatchObject({
      role: "user",
      text: "こんにちは",
    });
    expect(written.messages[1]).toMatchObject({
      role: "model",
      text: "やっほー",
    });
    // Req 2.3: expiresAt = lastTurnAt + 24h
    expect(written.lastTurnAt.toMillis()).toBe(now.getTime());
    expect(written.expiresAt.toMillis()).toBe(now.getTime() + DAY_MS);
    expect(written.expiresAt.toMillis() - written.lastTurnAt.toMillis()).toBe(
      DAY_MS,
    );
  });

  it("既存 19 件 + 新 2 件 で 20 件に trim し、最も古い 1 件を破棄する (Req 2.2)", async () => {
    const now = new Date("2026-05-23T12:00:00Z");
    const oldTs = Timestamp.fromMillis(now.getTime() - 30 * 1000);

    const existing: ConversationMessage[] = [];
    for (let i = 0; i < 19; i++) {
      existing.push(
        makeMessage(i % 2 === 0 ? "user" : "model", `old-${i}`, oldTs),
      );
    }

    const { firestore, set } = makeFakeFirestore({
      initial: {
        messages: existing,
        lastTurnAt: oldTs,
        expiresAt: Timestamp.fromMillis(oldTs.toMillis() + DAY_MS),
      },
    });
    const service = createSessionService(firestore);

    await service.append(SESSION_KEY, "new-user", "new-model", now);

    expect(set).toHaveBeenCalledTimes(1);
    const [payload] = set.mock.calls[0] ?? [];
    const written = payload as StoredDocument;

    expect(written.messages).toHaveLength(20);
    // old-0 が落ち、old-1 が先頭になる
    expect(written.messages[0]?.text).toBe("old-1");
    expect(written.messages[18]).toMatchObject({
      role: "user",
      text: "new-user",
    });
    expect(written.messages[19]).toMatchObject({
      role: "model",
      text: "new-model",
    });
    expect(written.lastTurnAt.toMillis()).toBe(now.getTime());
    expect(written.expiresAt.toMillis()).toBe(now.getTime() + DAY_MS);
  });

  it("Firestore set が失敗したら SessionStoreError を投げる (Req 8.3)", async () => {
    const cause = new Error("write conflict");
    const { firestore } = makeFakeFirestore({
      initial: null,
      setError: cause,
    });
    const service = createSessionService(firestore);

    const now = new Date("2026-05-23T12:00:00Z");
    await expect(
      service.append(SESSION_KEY, "hi", "hello", now),
    ).rejects.toBeInstanceOf(SessionStoreError);
    await expect(
      service.append(SESSION_KEY, "hi", "hello", now),
    ).rejects.toMatchObject({ cause });
  });

  it("append 時の Firestore get が失敗したら SessionStoreError を投げる (Req 8.3)", async () => {
    const cause = new Error("read failure");
    const { firestore } = makeFakeFirestore({ getError: cause });
    const service = createSessionService(firestore);

    const now = new Date("2026-05-23T12:00:00Z");
    await expect(
      service.append(SESSION_KEY, "hi", "hello", now),
    ).rejects.toBeInstanceOf(SessionStoreError);
  });
});
