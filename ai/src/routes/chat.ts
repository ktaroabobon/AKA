import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { chatRequestSchema } from "../schemas/chat.js";
import { ApiKeyDecodeError } from "../lib/decode.js";
import {
  GenaiSafetyBlockedError,
  GenaiServiceError,
  type GenaiService,
} from "../services/genai.js";
import { SessionStoreError, type SessionService } from "../services/session.js";
import type { MaskResult } from "../services/moderation.js";
import { SAFETY_FALLBACK_MESSAGES } from "../prompts/aka.js";
import { pickRandom } from "../lib/pickRandom.js";
import type { Logger } from "../lib/logger.js";

/**
 * 入力 / 出力 / 履歴保存の 3 ポイントで共有する mask 関数。
 * `services/moderation.ts` の `mask` を関数として注入することで Req 5.5 を担保する。
 */
export type MaskFn = (text: string) => MaskResult;

export interface ChatRouteDeps {
  moderation: MaskFn;
  sessionService: SessionService;
  genaiService: GenaiService;
  logger: Logger;
}

export function createChatRoute({
  moderation,
  sessionService,
  genaiService,
  logger,
}: ChatRouteDeps) {
  const app = new Hono();

  app.post(
    "/chat/genai",
    zValidator("json", chatRequestSchema, (result, c) => {
      if (!result.success) {
        return c.json(
          { error: "invalid_request", detail: z.flattenError(result.error) },
          400,
        );
      }
    }),
    async (c) => {
      const { sessionKey, prompt, encrypted_api_key } = c.req.valid("json");

      // Step 1: 入力テキストをマスク (Req 5.1, 5.2, 5.5)
      const maskedInput = moderation(prompt);
      const piiRedactions = maskedInput.redactionCount.pii;
      const profanityRedactions = maskedInput.redactionCount.profanity;

      const now = new Date();

      try {
        // Step 2: 履歴取得 (Req 3.1, 3.2)
        const history = await sessionService.getRecent(sessionKey, now);
        const historyTurns = history.length;

        // Step 3: Gemini 呼出 (Req 4.1, 4.4 — 成功時のみ append)
        const startedAt = Date.now();
        let replyText: string;
        try {
          replyText = await genaiService.generate({
            history,
            userText: maskedInput.masked,
            encryptedApiKey: encrypted_api_key,
          });
        } catch (err) {
          const geminiDurationMs = Date.now() - startedAt;
          if (err instanceof GenaiSafetyBlockedError) {
            // Req 4.3 / 4.5: 中立メッセージをランダム選択、履歴に append しない
            const fallback = pickRandom(SAFETY_FALLBACK_MESSAGES);
            logger.warn(
              {
                sessionKey,
                historyTurns,
                geminiDurationMs,
                piiRedactions,
                profanityRedactions,
                finishReason: "SAFETY",
              },
              "gemini safety blocked",
            );
            return c.json({ reply: fallback });
          }
          throw err;
        }
        const geminiDurationMs = Date.now() - startedAt;

        // Step 4: 応答テキストをマスク (Req 5.3, 5.5)
        const maskedReply = moderation(replyText);
        const replyPii = maskedReply.redactionCount.pii;
        const replyProfanity = maskedReply.redactionCount.profanity;

        // Step 5: 履歴追記 (Req 2.5, 4.4, 5.4 — マスク後のみを保存)
        await sessionService.append(
          sessionKey,
          maskedInput.masked,
          maskedReply.masked,
          now,
        );

        // Req 8.1: 原文は出さず、件数とメタのみ構造化ログ
        logger.info(
          {
            sessionKey,
            historyTurns,
            geminiDurationMs,
            piiRedactions: piiRedactions + replyPii,
            profanityRedactions: profanityRedactions + replyProfanity,
            finishReason: "STOP",
          },
          "chat completed",
        );

        return c.json({ reply: maskedReply.masked });
      } catch (err) {
        if (err instanceof ApiKeyDecodeError) {
          logger.warn({ err }, "failed to decode api key");
          return c.json({ error: "invalid_api_key" }, 400);
        }
        if (err instanceof SessionStoreError) {
          // Req 8.3: Firestore I/O 失敗は 500 internal_error
          logger.error({ err }, "session store failed");
          return c.json({ error: "internal_error" }, 500);
        }
        if (err instanceof GenaiServiceError) {
          // SAFETY 以外の Gemini 失敗 → 502 (SafetyBlocked は内側で先に return 済み)
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
