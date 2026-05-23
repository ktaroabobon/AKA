import type { LineSource } from "../types/line";

/**
 * 会話セッションを一意に識別するキー。
 * source.type に応じて group / room / user のいずれかをプレフィックスに持つ。
 */
export type SessionKey = `${"group" | "room" | "user"}:${string}`;

/**
 * LINE Webhook の source オブジェクトから会話セッションキーを生成する純関数。
 * 想定外の type、対応する ID が undefined または空文字の場合は null を返す。
 * controller 側で null を受け取った場合は AI 呼出を中止する (要件 1.5)。
 */
export function buildSessionKey(source: LineSource): SessionKey | null {
  switch (source.type) {
    case "user":
      return source.userId ? `user:${source.userId}` : null;
    case "group":
      return source.groupId ? `group:${source.groupId}` : null;
    case "room":
      return source.roomId ? `room:${source.roomId}` : null;
    default:
      return null;
  }
}
