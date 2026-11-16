// LINE Messaging API Webhook の最低限の型定義

export type LineSourceType = "user" | "group" | "room";

export interface LineSource {
  type: LineSourceType;
  userId?: string;
  groupId?: string;
  roomId?: string;
}

export interface LineMentionee {
  index: number;
  length: number;
  type: "user" | "all";
  userId?: string;
}

export interface LineMessageMention {
  mentionees: LineMentionee[];
}

export interface LineTextMessage {
  id: string;
  type: "text";
  text: string;
  mention?: LineMentionee[] extends never ? never : LineMessageMention;
  /** 返信（引用）先のメッセージ ID。本文は Webhook に入らない。 */
  quotedMessageId?: string;
}

export type LineMessage = LineTextMessage | { id: string; type: string };

export type LineEventType =
  | "message"
  | "follow"
  | "unfollow"
  | "join"
  | "leave"
  | "memberJoined"
  | "memberLeft"
  | "postback";

export interface LineEvent {
  type: LineEventType;
  replyToken?: string;
  source: LineSource;
  timestamp: number;
  message?: LineMessage;
}

export interface LineWebhookBody {
  destination: string;
  events: LineEvent[];
}

export interface LineReplyMessage {
  type: "text";
  text: string;
}

/** reply API の応答。送ったメッセージの ID が入る。 */
export interface LineReplyResponse {
  sentMessages?: Array<{ id: string }>;
}
