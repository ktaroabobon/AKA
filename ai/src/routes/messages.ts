import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { saveMessageRequestSchema } from "../schemas/messages.js";
import {
  MessageStoreError,
  type MessageStore,
} from "../services/messageStore.js";
import type { MaskFn } from "./chat.js";
import type { Logger } from "../lib/logger.js";

export interface MessagesRouteDeps {
  moderation: MaskFn;
  messageStore: MessageStore;
  logger: Logger;
}

export function createMessagesRoute({
  moderation,
  messageStore,
  logger,
}: MessagesRouteDeps) {
  const app = new Hono();

  app.post(
    "/messages",
    zValidator("json", saveMessageRequestSchema, (result, c) => {
      if (!result.success) {
        return c.json(
          { error: "invalid_request", detail: z.flattenError(result.error) },
          400,
        );
      }
    }),
    async (c) => {
      const { sessionKey, messageId, sender, text } = c.req.valid("json");

      // 原文は保存しない (マスク後のみ)
      const masked = moderation(text);

      try {
        await messageStore.save(
          { messageId, sessionKey, sender, text: masked.masked },
          new Date(),
        );
      } catch (err) {
        if (err instanceof MessageStoreError) {
          logger.error({ err }, "message store failed");
          return c.json({ error: "internal_error" }, 500);
        }
        throw err;
      }

      logger.info(
        {
          sessionKey,
          sender,
          piiRedactions: masked.redactionCount.pii,
          profanityRedactions: masked.redactionCount.profanity,
        },
        "message saved",
      );
      return c.body(null, 204);
    },
  );

  return app;
}
