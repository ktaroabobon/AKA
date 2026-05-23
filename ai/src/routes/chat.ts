import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { chatRequestSchema } from "../schemas/chat.js";
import { ApiKeyDecodeError } from "../lib/decode.js";
import { GenaiServiceError, type GenaiService } from "../services/genai.js";
import type { Logger } from "../lib/logger.js";

export interface ChatRouteDeps {
  genaiService: GenaiService;
  logger: Logger;
}

export function createChatRoute({ genaiService, logger }: ChatRouteDeps) {
  const app = new Hono();

  app.post(
    "/chat/genai",
    zValidator("json", chatRequestSchema, (result, c) => {
      if (!result.success) {
        return c.json(
          { error: "invalid_request", detail: result.error.flatten() },
          400,
        );
      }
    }),
    async (c) => {
      const request = c.req.valid("json");
      try {
        // NOTE: task 4.4 で GenaiService が `generate(input)` API に書き換わったため
        // ここも一時的にアダプトしている。task 5.2 で本格的に orchestration
        // (moderation / session / sessionKey) を組み込む形に置き換える。
        const reply = await genaiService.generate({
          history: [],
          userText: request.prompt,
          encryptedApiKey: request.encrypted_api_key,
        });
        return c.json({ reply });
      } catch (err) {
        if (err instanceof ApiKeyDecodeError) {
          logger.warn({ err }, "failed to decode api key");
          return c.json({ error: "invalid_api_key" }, 400);
        }
        if (err instanceof GenaiServiceError) {
          logger.error({ err }, "genai service failed");
          return c.json({ error: "genai_failed" }, 502);
        }
        logger.error({ err }, "unexpected error in /chat/genai");
        return c.json({ error: "internal_error" }, 500);
      }
    },
  );

  return app;
}
