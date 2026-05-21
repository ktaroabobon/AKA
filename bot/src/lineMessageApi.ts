import { getBotId, getChannelAccessToken } from "./config.js";
import { generateReply } from "./controller.js";
import { mentionPhraseList } from "./constants.js";
import type { LineEvent, LineReplyMessage, LineWebhookBody } from "./types/line.js";

const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";

export interface MentionResolution {
  isBotMentioned: boolean;
  userMessage: string;
}

/**
 * LINE Webhook イベントから、Bot 宛のメンションかどうかと、メンション部分を
 * 取り除いた純粋な発話を返す。
 *
 * - 個チャ (source.type === "user") のときは常に「メンションあり」扱い。
 * - グループ／ルームでは `event.message.mention.mentionees` の userId に
 *   BOT_ID が含まれているか、本文がメンションフレーズで始まるかで判定する。
 */
export function isBotMentioned(event: LineEvent): MentionResolution {
  const text =
    event.message && "text" in event.message && typeof event.message.text === "string"
      ? event.message.text
      : "";

  // 個チャはメンションを要求しない
  if (event.source.type === "user") {
    return { isBotMentioned: true, userMessage: text };
  }

  const botId = getBotId();
  const mentionees =
    event.message && "mention" in event.message && event.message.mention
      ? event.message.mention.mentionees ?? []
      : [];
  const mentionedByApi = mentionees.some(
    (m) => m.type === "user" && m.userId === botId,
  );

  let userMessage = text;
  let mentionedByPrefix = false;
  for (const phrase of mentionPhraseList) {
    if (text.startsWith(phrase)) {
      mentionedByPrefix = true;
      userMessage = text.slice(phrase.length).trim();
      break;
    }
  }

  return {
    isBotMentioned: mentionedByApi || mentionedByPrefix,
    userMessage,
  };
}

function buildReplyPayload(
  replyToken: string,
  text: string,
): { replyToken: string; messages: LineReplyMessage[] } {
  return {
    replyToken,
    messages: [{ type: "text", text }],
  };
}

function postReply(payload: ReturnType<typeof buildReplyPayload>): number {
  const response = UrlFetchApp.fetch(LINE_REPLY_URL, {
    method: "post",
    contentType: "application/json; charset=UTF-8",
    headers: {
      Authorization: `Bearer ${getChannelAccessToken()}`,
    },
    payload: JSON.stringify(payload),
  });
  return response.getResponseCode();
}

export interface DoPostOptions {
  /** true にすると LINE API への送信をスキップし、生成したメッセージのみ返す。 */
  skipApiCall?: boolean;
}

/** GAS の doPost エントリ。LINE Webhook からの POST を処理する。 */
export function doPost(
  e: GoogleAppsScript.Events.DoPost,
  options: DoPostOptions = {},
): number | string | null {
  const body = JSON.parse(e.postData.contents) as LineWebhookBody;
  const event = body.events[0];
  if (!event) return null;

  const mention = isBotMentioned(event);
  const reply = generateReply({
    eventType: event.type,
    userMessage: mention.userMessage,
    isBotMentioned: mention.isBotMentioned,
  });

  if (reply === null || !event.replyToken) return null;
  if (options.skipApiCall) return reply;

  return postReply(buildReplyPayload(event.replyToken, reply));
}
