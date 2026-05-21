import * as AKA from "./aka.js";

export type EventType = "message" | "join" | string;

export interface GenerateReplyInput {
  eventType: EventType;
  userMessage: string;
  isBotMentioned: boolean;
}

/** 入力に対する応答テキストを生成する。応答すべきでないときは null。 */
export function generateReply(input: GenerateReplyInput): string | null {
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

  // フォールバック：ランダム（後で AKA-AI 呼び出しに置き換える予定 - #21）
  return AKA.sayRandom();
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
