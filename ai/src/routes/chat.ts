import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { chatRequestSchema } from "../schemas/chat.js";
import { ApiKeyDecodeError } from "../lib/decode.js";
import {
  GenaiServiceError,
  type GenaiService,
} from "../services/genai.js";
import {
  OpenAINotSupportedError,
  type OpenAIService,
} from "../services/openai.js";
import type { Logger } from "../lib/logger.js";

export interface ChatRouteDeps {
  genaiService: GenaiService;
  openaiService: OpenAIService;
  logger: Logger;
}

export function createChatRoute({
  genaiService,
  openaiService,
  logger,
}: ChatRouteDeps) {
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
        const reply = await genaiService.chat(request);
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

  app.post(
    "/chat/openai",
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
        const reply = await openaiService.chat(request);
        return c.json({ reply });
      } catch (err) {
        if (err instanceof OpenAINotSupportedError) {
          return c.json({ error: "openai_not_supported", message: err.message }, 501);
        }
        logger.error({ err }, "unexpected error in /chat/openai");
        return c.json({ error: "internal_error" }, 500);
      }
    },
  );

  return app;
}
