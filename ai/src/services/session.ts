/**
 * SessionService — Firestore `conversation/{sessionKey}` の CRUD と
 * 「履歴ウィンドウ (直近 20 ターン AND 最終発話から 2h 以内)」の計算。
 *
 * - ドキュメント形: `{ messages: Message[], lastTurnAt: Timestamp, expiresAt: Timestamp }`
 * - Message = `{ role: "user" | "model", text: string, ts: Timestamp }`
 * - `getRecent`: ドキュメント取得 → ウィンドウフィルタ → 末尾 20 件を返す (空配列もあり得る)
 * - `append`: 既存 messages に user / model の 2 件を末尾追加し、20 件に trim、
 *   `lastTurnAt = now`、`expiresAt = now + 24h` を `set({ merge: false })` で書く
 * - Firestore I/O 失敗は `SessionStoreError` に包んで投げる (Req 8.3)
 *
 * `getFirestore()` を直接呼ばず、`createSessionService(firestore)` で DI 可能にしている
 * (テスト容易性のため)。route 層が起動時に singleton から取得した Firestore を渡す想定。
 */
import { Firestore, Timestamp } from "@google-cloud/firestore";

const COLLECTION = "conversation";
const MAX_TURNS = 20;
const WINDOW_MS = 2 * 60 * 60 * 1000; // 2 時間
const TTL_MS = 24 * 60 * 60 * 1000; // 24 時間

export interface ConversationMessage {
  readonly role: "user" | "model";
  readonly text: string;
  readonly ts: Timestamp;
}

interface SessionDocument {
  readonly messages: ConversationMessage[];
  readonly lastTurnAt: Timestamp;
  readonly expiresAt: Timestamp;
}

export class SessionStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SessionStoreError";
  }
}

export interface SessionService {
  getRecent(sessionKey: string, now: Date): Promise<ConversationMessage[]>;
  append(
    sessionKey: string,
    userText: string,
    modelText: string,
    now: Date,
  ): Promise<void>;
}

export function createSessionService(firestore: Firestore): SessionService {
  return {
    async getRecent(sessionKey, now) {
      let snapshot;
      try {
        snapshot = await firestore.collection(COLLECTION).doc(sessionKey).get();
      } catch (cause) {
        throw new SessionStoreError(
          `Failed to read conversation/${sessionKey}`,
          { cause },
        );
      }

      if (!snapshot.exists) {
        return [];
      }

      const data = snapshot.data() as SessionDocument | undefined;
      if (!data) {
        return [];
      }

      // Req 3.2: 最終発話から 2h 超過なら過去履歴を渡さない
      const lastTurnMs = data.lastTurnAt.toMillis();
      if (now.getTime() - lastTurnMs > WINDOW_MS) {
        return [];
      }

      // Req 3.1 / 3.3: 直近 20 ターンのみ返す (保存窓 = 送信窓)
      const messages = data.messages ?? [];
      if (messages.length <= MAX_TURNS) {
        return [...messages];
      }
      return messages.slice(messages.length - MAX_TURNS);
    },

    async append(sessionKey, userText, modelText, now) {
      const docRef = firestore.collection(COLLECTION).doc(sessionKey);

      let existing: ConversationMessage[] = [];
      try {
        const snapshot = await docRef.get();
        if (snapshot.exists) {
          const data = snapshot.data() as SessionDocument | undefined;
          if (data?.messages) {
            existing = data.messages;
          }
        }
      } catch (cause) {
        throw new SessionStoreError(
          `Failed to read conversation/${sessionKey}`,
          { cause },
        );
      }

      const ts = Timestamp.fromDate(now);
      const appended: ConversationMessage[] = [
        ...existing,
        { role: "user", text: userText, ts },
        { role: "model", text: modelText, ts },
      ];

      // Req 2.2: 20 ターン上限。超過分は古い順に破棄
      const trimmed =
        appended.length <= MAX_TURNS
          ? appended
          : appended.slice(appended.length - MAX_TURNS);

      const next: SessionDocument = {
        messages: trimmed,
        lastTurnAt: ts,
        // Req 2.3: expiresAt = lastTurnAt + 24h (TTL policy が消去対象とする)
        expiresAt: Timestamp.fromMillis(now.getTime() + TTL_MS),
      };

      try {
        await docRef.set(next, { merge: false });
      } catch (cause) {
        throw new SessionStoreError(
          `Failed to write conversation/${sessionKey}`,
          { cause },
        );
      }
    },
  };
}
