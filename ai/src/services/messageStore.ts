/**
 * MessageStore — Firestore `messages/{messageId}` に LINE のメッセージを保存する。
 *
 * LINE は返信先 (`quotedMessageId`) の本文を後から返さないため、受け取った時点で
 * マスク後のテキストだけを 7 日間保存しておく (#75)。
 * - ドキュメント形: `{ sessionKey, sender: "user" | "bot", text, expiresAt }`
 * - `expiresAt` は保存時刻 + 7 日 (TTL ポリシーが消去対象とする)
 * - `get` は期限切れ (TTL の削除は遅れることがある) を見つからない扱いにする
 * - Firestore I/O 失敗は `MessageStoreError` に包んで投げる
 */
import { Firestore, Timestamp } from "@google-cloud/firestore";

const COLLECTION = "messages";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 日

export type MessageSender = "user" | "bot";

export interface StoredMessage {
  readonly sessionKey: string;
  readonly sender: MessageSender;
  readonly text: string;
  readonly expiresAt: Timestamp;
}

export class MessageStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MessageStoreError";
  }
}

export interface SaveMessageInput {
  messageId: string;
  sessionKey: string;
  sender: MessageSender;
  /** マスク済みのテキスト。原文を渡さないこと。 */
  text: string;
}

export interface MessageStore {
  save(input: SaveMessageInput, now: Date): Promise<void>;
  get(messageId: string, now: Date): Promise<StoredMessage | null>;
}

export function createMessageStore(firestore: Firestore): MessageStore {
  return {
    async save({ messageId, sessionKey, sender, text }, now) {
      const doc: StoredMessage = {
        sessionKey,
        sender,
        text,
        expiresAt: Timestamp.fromMillis(now.getTime() + TTL_MS),
      };
      try {
        await firestore.collection(COLLECTION).doc(messageId).set(doc);
      } catch (cause) {
        throw new MessageStoreError(`Failed to write messages/${messageId}`, {
          cause,
        });
      }
    },

    async get(messageId, now) {
      let snapshot;
      try {
        snapshot = await firestore.collection(COLLECTION).doc(messageId).get();
      } catch (cause) {
        throw new MessageStoreError(`Failed to read messages/${messageId}`, {
          cause,
        });
      }
      const data = snapshot.data() as StoredMessage | undefined;
      if (!data || data.expiresAt.toMillis() <= now.getTime()) return null;
      return data;
    },
  };
}
