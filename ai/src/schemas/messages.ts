import { z } from "zod";

// LINE のテキストメッセージの上限が 5000 文字
const MAX_TEXT_LENGTH = 5000;

// LINE のメッセージ ID は数字の文字列。doc id に `/`・`..`・`__x__` を入れないよう数字に限る
export const lineMessageIdSchema = z
  .string()
  .regex(/^[0-9]{1,64}$/, "messageId must be 1-64 digits");

export const saveMessageRequestSchema = z.object({
  sessionKey: z.string().min(1, "sessionKey must not be empty"),
  messageId: lineMessageIdSchema,
  sender: z.enum(["user", "bot"]),
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
});

export const findMessageQuerySchema = z.object({
  sessionKey: z.string().min(1, "sessionKey must not be empty"),
});
