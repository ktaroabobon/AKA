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
import {
  MessageStoreError,
  type MessageStore,
  type StoredMessage,
} from "../services/messageStore.js";
import type { MaskFn } from "../services/moderation.js";
import { SAFETY_FALLBACK_MESSAGES } from "../prompts/aka.js";
import { pickRandom } from "../lib/pickRandom.js";
import type { Logger } from "../lib/logger.js";

export interface ChatRouteDeps {
  moderation: MaskFn;
  sessionService: SessionService;
  messageStore: MessageStore;
  genaiService: GenaiService;
  logger: Logger;
}

/**
 * 見出し `[...]` を全角に置き換え、本文に仕込んだ見出しで別の発言を偽装させない。
 */
function neutralizeHeadings(text: string): string {
  return text.replace(/\[/g, "［").replace(/\]/g, "］");
}

/**
 * 返信先の発言・画像と今の発話を、Gemini がどれがどれか分かる 1 つの発話にする。
 * 返信先が無ければ今の発話をそのまま返す (従来どおり)。
 * 画像は `[画像]` の印だけを入れる (この文字列は履歴にも入るため、画像のデータや
 * 「添付を見て」の指示は含めない #76。指示はその回の Gemini 呼び出しにだけ付ける)。
 */
function buildUserText(
  maskedPrompt: string,
  quoted: StoredMessage | null,
  hasImage: boolean,
): string {
  const parts: string[] = [];
  if (quoted) {
    const who = quoted.sender === "bot" ? "紅の発言" : "誰かの発言";
    parts.push(`[返信先の${who}]\n${neutralizeHeadings(quoted.text)}`);
  }
  if (hasImage) {
    parts.push("[画像]");
  }
  if (parts.length === 0) return maskedPrompt;
  const current =
    maskedPrompt.trim().length > 0
      ? neutralizeHeadings(maskedPrompt)
      : "（本文なし。返信先について話しかけている）";
  return [...parts, `[今の発話]\n${current}`].join("\n\n");
}

const IMAGE_INSTRUCTION = "（返信先は画像。添付の画像を見て答える）";

export function createChatRoute({
  moderation,
  sessionService,
  messageStore,
  genaiService,
  logger,
}: ChatRouteDeps) {
  const app = new Hono();

  /**
   * 返信先を読む (別のグループの発言は messageStore.get が返さない)。
   * 読み取りに失敗しても、今の発話があれば返信先なしとして応答を続ける。
   * 今の発話が空なら話すことが無いので、失敗をそのまま上げて 500 にする。
   */
  async function findQuoted(
    quotedMessageId: string | undefined,
    sessionKey: string,
    now: Date,
    hasPrompt: boolean,
  ): Promise<StoredMessage | null> {
    if (quotedMessageId === undefined) return null;
    try {
      return await messageStore.get(quotedMessageId, sessionKey, now);
    } catch (err) {
      if (err instanceof MessageStoreError && hasPrompt) {
        logger.warn({ err }, "failed to read quoted message");
        return null;
      }
      throw err;
    }
  }

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
      const {
        sessionKey,
        prompt,
        encrypted_api_key,
        quotedMessageId,
        quotedImage,
      } = c.req.valid("json");

      // Step 1: 入力テキストをマスク (Req 5.1, 5.2, 5.5)
      const maskedInput = moderation(prompt);
      const piiRedactions = maskedInput.redactionCount.pii;
      const profanityRedactions = maskedInput.redactionCount.profanity;

      const now = new Date();

      const hasPrompt = maskedInput.masked.trim().length > 0;
      // 画像のデータはログに出さない (mimeType と base64 の長さだけ)
      const imageLog = quotedImage && {
        mimeType: quotedImage.mimeType,
        base64Length: quotedImage.data.length,
      };

      try {
        // Step 2: 履歴取得 (Req 3.1, 3.2) と返信先の読み取りは互いに依存しないので並行に
        const [history, quoted] = await Promise.all([
          sessionService.getRecent(sessionKey, now),
          // 画像があれば、返信先のテキストが読めなくても話すことはある
          findQuoted(
            quotedMessageId,
            sessionKey,
            now,
            hasPrompt || quotedImage !== undefined,
          ),
        ]);
        const historyTurns = history.length;
        // 本文が空で返信先も無いなら、従来どおり話すことが無い
        if (!hasPrompt && !quoted && !quotedImage) {
          return c.json(
            { error: "invalid_request", message: "prompt must not be empty" },
            400,
          );
        }
        const userText = buildUserText(
          maskedInput.masked,
          quoted,
          quotedImage !== undefined,
        );

        // Step 3: Gemini 呼出 (Req 4.1, 4.4 — 成功時のみ append)
        const startedAt = Date.now();
        let replyText: string;
        try {
          replyText = await genaiService.generate({
            history,
            userText: quotedImage
              ? `${IMAGE_INSTRUCTION}\n\n${userText}`
              : userText,
            encryptedApiKey: encrypted_api_key,
            image: quotedImage,
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
                quotedImage: imageLog,
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
          userText,
          maskedReply.masked,
          now,
        );

        // Req 8.1: 原文は出さず、件数とメタのみ構造化ログ
        logger.info(
          {
            sessionKey,
            historyTurns,
            quoted: quoted !== null,
            quotedImage: imageLog,
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
        if (err instanceof MessageStoreError) {
          logger.error({ err }, "message store failed");
          return c.json({ error: "internal_error" }, 500);
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
