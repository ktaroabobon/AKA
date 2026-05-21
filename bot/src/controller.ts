import * as AKA from "./aka.js";
import * as GoogleCalendar from "./googleCalendarApi.js";
import * as Datetime from "./datetime.js";
import {
  dinnerKeywords,
  lunchKeywords,
  todayKeywords,
  tomorrowKeywords,
} from "./constants.js";

export type EventType = "message" | "join" | string;
type MealType = "lunch" | "dinner";

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

  // キーワード（食事）
  const word = generateReplyForWordInUserMessage(input.userMessage);
  if (word !== null) return word;

  // フォールバック：ランダム
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

/** ユーザーメッセージから食事タイプを判定する。 */
export function getMealTypeFromMessage(userMessage: string): MealType | null {
  if (lunchKeywords.some((k) => userMessage.includes(k))) return "lunch";
  if (dinnerKeywords.some((k) => userMessage.includes(k))) return "dinner";
  return null;
}

/** 食事系のキーワードが含まれていればカレンダーから整形した応答を返す。 */
export function generateReplyForWordInUserMessage(
  userMessage: string,
): string | null {
  const mealType = getMealTypeFromMessage(userMessage);
  if (mealType === null) return null;
  return handleMealEvent(userMessage, mealType);
}

function resolveDateFromMessage(userMessage: string): Date {
  if (todayKeywords.some((k) => userMessage.includes(k))) {
    return Datetime.setDateToMidnight(new Date());
  }
  if (tomorrowKeywords.some((k) => userMessage.includes(k))) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return Datetime.setDateToMidnight(tomorrow);
  }
  return Datetime.getDateBasedOnTime(13);
}

/** 指定された食事タイプの予定をカレンダーから取得し、応答テキストを返す。 */
export function handleMealEvent(
  userMessage: string,
  mealType: MealType,
): string {
  const date = resolveDateFromMessage(userMessage);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

  const events =
    mealType === "lunch"
      ? GoogleCalendar.getLunchEvents(start, end)
      : GoogleCalendar.getDinnerEvents(start, end);

  return AKA.talkAboutMealEvents(events);
}
