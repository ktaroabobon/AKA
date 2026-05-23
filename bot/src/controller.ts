import * as AKA from "./aka.js";
import { chatWithAi } from "./aiClient.js";
import { buildSessionKey } from "./lib/sessionKey.js";
import type { LineSource } from "./types/line.js";

export type EventType = "message" | "join" | string;

export interface GenerateReplyInput {
  eventType: EventType;
  userMessage: string;
  isBotMentioned: boolean;
  source: LineSource;
}

export interface GenerateReplyDeps {
  /** AKA-AI を叩いて応答を取得する関数。テストで差し替え可能。 */
  ai?: (prompt: string, sessionKey: string) => string | null;
  /** AI 呼び出し失敗時のフォールバック。 */
  fallback?: () => string;
  /** LINE source から sessionKey を組み立てる関数。テストで差し替え可能。 */
  sessionKeyBuilder?: (source: LineSource) => string | null;
}

/** 入力に対する応答テキストを生成する。応答すべきでないときは null。 */
export function generateReply(
  input: GenerateReplyInput,
  deps: GenerateReplyDeps = {},
): string | null {
  if (input.eventType === "join") {
    return AKA.sayGreetings();
  }
  if (input.eventType !== "message") {
    return null;
  }

  // 完全一致は誰でも触れる
  const exact = generateExactMatchReply(input.userMessage);
  if (exact !== null) return exact;

  // メンション無しのグループは反応しない
  if (!input.isBotMentioned) return null;

  // 自己紹介
  const selfIntro = generateSelfIntroductionReply(input.userMessage);
  if (selfIntro !== null) return selfIntro;

  // AI に投げる。失敗時はランダム応答にフォールバック
  const ai = deps.ai ?? chatWithAi;
  const fallback = deps.fallback ?? AKA.sayRandom;
  const buildKey = deps.sessionKeyBuilder ?? buildSessionKey;

  // sessionKey が取れないなら AI 呼び出しをスキップして fallback (Req 1.5)
  const sessionKey = buildKey(input.source);
  if (sessionKey === null) return fallback();

  const aiReply = ai(input.userMessage, sessionKey);
  if (aiReply !== null && aiReply.length > 0) return aiReply;
  return fallback();
}

/** メッセージが完全一致したときの応答。 */
export function generateExactMatchReply(userMessage: string): string | null {
  if (userMessage === "こんにちは") return AKA.sayHello();
  return null;
}

/** 「自己紹介」を含むときの応答。 */
export function generateSelfIntroductionReply(
  userMessage: string,
): string | null {
  if (userMessage.includes("自己紹介")) return AKA.sayGreetings();
  return null;
}
