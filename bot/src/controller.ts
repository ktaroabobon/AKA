import * as AKA from "./aka.js";
import { chatWithAiResult, type AiClientResult } from "./aiClient.js";
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
  ai?: (prompt: string, sessionKey: string) => AiClientResult;
  /** AI 呼び出し失敗時の通常フォールバック。 */
  fallback?: () => string;
  /** AKA-AI が 5xx を返したときの専用フォールバック。 */
  serverErrorFallback?: () => string;
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
  const ai = deps.ai ?? chatWithAiResult;
  const fallback = deps.fallback ?? AKA.sayRandom;
  const serverErrorFallback = deps.serverErrorFallback ?? AKA.sayAiServerError;
  const buildKey = deps.sessionKeyBuilder ?? buildSessionKey;

  // sessionKey が取れないなら AI 呼び出しをスキップして fallback (Req 1.5)
  const sessionKey = buildKey(input.source);
  if (sessionKey === null) return fallback();

  const aiResult = ai(input.userMessage, sessionKey);
  if (aiResult.ok) return aiResult.reply;
  if (aiResult.reason === "server_error") return serverErrorFallback();
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
