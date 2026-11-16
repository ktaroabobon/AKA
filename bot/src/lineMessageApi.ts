import { saveMessage } from "./aiClient.js";
import { getBotId, getChannelAccessToken } from "./config.js";
import { generateReply } from "./controller.js";
import { mentionPhraseList } from "./constants.js";
import { buildSessionKey } from "./lib/sessionKey.js";
import type {
  LineEvent,
  LineReplyMessage,
  LineReplyResponse,
  LineTextMessage,
  LineWebhookBody,
} from "./types/line.js";

const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";

/** テキストメッセージならそれを返す。応答に使う本文と保存する本文をずらさないため 1 か所で判定する。 */
function getTextMessage(event: LineEvent): LineTextMessage | null {
  const message = event.message;
  return message && message.type === "text" && "text" in message
    ? message
    : null;
}

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
  const text = getTextMessage(event)?.text ?? "";

  // 個チャはメンションを要求しない
  if (event.source.type === "user") {
    return { isBotMentioned: true, userMessage: text };
  }

  const botId = getBotId();
  const mentionees =
    event.message && "mention" in event.message && event.message.mention
      ? (event.message.mention.mentionees ?? [])
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

function postReply(
  payload: ReturnType<typeof buildReplyPayload>,
): GoogleAppsScript.URL_Fetch.HTTPResponse {
  return UrlFetchApp.fetch(LINE_REPLY_URL, {
    method: "post",
    contentType: "application/json; charset=UTF-8",
    headers: {
      Authorization: `Bearer ${getChannelAccessToken()}`,
    },
    payload: JSON.stringify(payload),
  });
}

/** reply API の応答から、送ったメッセージの ID を取り出す。取れなければ null。 */
function parseSentMessageId(
  response: GoogleAppsScript.URL_Fetch.HTTPResponse,
): string | null {
  try {
    const parsed = JSON.parse(response.getContentText()) as LineReplyResponse;
    const id = parsed.sentMessages?.[0]?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
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

  const textMessage = event.type === "message" ? getTextMessage(event) : null;
  const mention = isBotMentioned(event);
  const reply = generateReply({
    eventType: event.type,
    userMessage: mention.userMessage,
    isBotMentioned: mention.isBotMentioned,
    source: event.source,
    quotedMessageId: textMessage?.quotedMessageId,
  });

  let result: number | string | null = null;
  let sentMessageId: string | null = null;
  if (reply !== null && event.replyToken) {
    if (options.skipApiCall) {
      result = reply;
    } else {
      const response = postReply(buildReplyPayload(event.replyToken, reply));
      sentMessageId = parseSentMessageId(response);
      result = response.getResponseCode();
    }
  }

  // 返信を遅らせないよう、保存は返信の後に行う
  const sessionKey = buildSessionKey(event.source);
  if (sessionKey === null) return result;
  // メンションの有無に関わらず保存する (後で誰かがこの発言に返信して紅を呼ぶため)
  if (textMessage !== null && textMessage.text.length > 0) {
    saveMessage({
      sessionKey,
      messageId: textMessage.id,
      sender: "user",
      text: textMessage.text,
    });
  }
  if (reply !== null && sentMessageId !== null) {
    saveMessage({
      sessionKey,
      messageId: sentMessageId,
      sender: "bot",
      text: reply,
    });
  }
  return result;
}
