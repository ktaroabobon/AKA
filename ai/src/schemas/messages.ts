import { z } from "zod";

// LINE のテキストメッセージの上限が 5000 文字
const MAX_TEXT_LENGTH = 5000;

export const saveMessageRequestSchema = z.object({
  sessionKey: z.string().min(1, "sessionKey must not be empty"),
  messageId: z.string().min(1, "messageId must not be empty"),
  sender: z.enum(["user", "bot"]),
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
});

export const findMessageQuerySchema = z.object({
  sessionKey: z.string().min(1, "sessionKey must not be empty"),
});
