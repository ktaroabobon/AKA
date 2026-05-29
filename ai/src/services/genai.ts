/**
 * GenaiService — `@google/genai` の chats API (multi-turn) を使った Gemini 呼び出し。
 *
 * - `ai.chats.create({ model, config: { systemInstruction, safetySettings }, history })`
 *   でセッションを毎リクエスト生成し、`chat.sendMessage({ message: userText })` で応答取得
 * - `safetySettings` は 4 カテゴリ (HARASSMENT / HATE_SPEECH / SEXUALLY_EXPLICIT /
 *   DANGEROUS_CONTENT) を `BLOCK_MEDIUM_AND_ABOVE` で固定 (Req 4.2)
 * - `GEMINI_MODEL` を primary とし、`GEMINI_FALLBACK_MODELS` をカンマ区切りの
 *   fallback 候補として 429/5xx/ネットワーク系の一過性失敗時だけ順番に試す。
 * - SAFETY ブロック (`finishReason === SAFETY`)・空 candidates・空 text は
 *   `GenaiSafetyBlockedError` を投げる。route 層が捕捉して履歴に保存せず、
 *   中立メッセージを返す (Req 4.3)
 * - それ以外の Gemini エラーは `GenaiServiceError` で包む (cause 保持)
 * - `decodeApiKey` から伝播する `ApiKeyDecodeError` は包まず再 throw
 *   (route 層が 400 invalid_api_key として直接処理する)
 */
import {
  type Content,
  FinishReason,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/genai";

import type { Env } from "../config/env.js";
import { ApiKeyDecodeError, decodeApiKey } from "../lib/decode.js";
import type { Logger } from "../lib/logger.js";
import { akaSystemInstruction } from "../prompts/aka.js";
import type { ConversationMessage } from "./session.js";

export class GenaiServiceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GenaiServiceError";
  }
}

/**
 * Gemini `safetySettings` でブロックされた / 空応答だったケース。
 * `GenaiServiceError` を継承するため、`err instanceof GenaiServiceError` も真。
 * route 層は instanceof で先に `GenaiSafetyBlockedError` をハンドルすること。
 */
export class GenaiSafetyBlockedError extends GenaiServiceError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GenaiSafetyBlockedError";
  }
}

export interface GenaiGenerateInput {
  history: ConversationMessage[];
  userText: string;
  encryptedApiKey: string;
}

export interface GenaiService {
  generate(input: GenaiGenerateInput): Promise<string>;
}

const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({
  category,
  threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
}));

function toContent(m: ConversationMessage): Content {
  return { role: m.role, parts: [{ text: m.text }] };
}

function getErrorStatusCode(cause: unknown): number | undefined {
  if (cause === null || typeof cause !== "object") return undefined;
  const record = cause as Record<string, unknown>;
  if (typeof record.status === "number") return record.status;
  if (typeof record.code === "number") return record.code;
  const response = record.response;
  if (response !== null && typeof response === "object") {
    const responseRecord = response as Record<string, unknown>;
    if (typeof responseRecord.status === "number") return responseRecord.status;
  }
  const error = record.error;
  if (error !== null && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    if (typeof errorRecord.code === "number") return errorRecord.code;
  }
  return undefined;
}

function logAttempt(
  logger: Logger | undefined,
  input: {
    model: string;
    attempt: number;
    status: "success" | "error" | "safety_blocked";
    fallbackUsed: boolean;
    durationMs: number;
    upstreamStatusCode?: number;
    finishReason?: string;
  },
) {
  if (!logger) return;
  const logPayload = {
    model: input.model,
    attempt: input.attempt,
    status: input.status,
    fallbackUsed: input.fallbackUsed,
    durationMs: input.durationMs,
    ...(input.upstreamStatusCode === undefined
      ? {}
      : { upstreamStatusCode: input.upstreamStatusCode }),
    ...(input.finishReason === undefined
      ? {}
      : { finishReason: input.finishReason }),
  };
  const message =
    input.status === "success"
      ? "genai attempt completed"
      : input.status === "safety_blocked"
        ? "genai attempt safety blocked"
        : "genai attempt failed";
  if (input.status === "error") {
    logger.warn(logPayload, message);
  } else {
    logger.info(logPayload, message);
  }
}

function getModelCandidates(env: Env): string[] {
  const models = [
    env.GEMINI_MODEL,
    ...env.GEMINI_FALLBACK_MODELS.split(","),
  ].map((model) => model.trim());
  const seen = new Set<string>();
  return models.filter((model) => {
    if (model.length === 0 || seen.has(model)) return false;
    seen.add(model);
    return true;
  });
}

function isRetryableUpstreamFailure(statusCode: number | undefined): boolean {
  if (statusCode === undefined) return true;
  return [429, 500, 502, 503, 504].includes(statusCode);
}

async function generateWithModel(input: {
  ai: GoogleGenAI;
  model: string;
  history: ConversationMessage[];
  userText: string;
  attempt: number;
  fallbackUsed: boolean;
  logger?: Logger;
}): Promise<string> {
  const chat = input.ai.chats.create({
    model: input.model,
    config: {
      systemInstruction: akaSystemInstruction,
      safetySettings: SAFETY_SETTINGS,
    },
    history: input.history.map(toContent),
  });

  let response;
  const startedAt = Date.now();
  try {
    response = await chat.sendMessage({ message: input.userText });
  } catch (cause) {
    // ApiKeyDecodeError は decodeApiKey からのみ伝播する想定だが念のため
    if (cause instanceof ApiKeyDecodeError) throw cause;
    logAttempt(input.logger, {
      model: input.model,
      attempt: input.attempt,
      status: "error",
      fallbackUsed: input.fallbackUsed,
      durationMs: Date.now() - startedAt,
      upstreamStatusCode: getErrorStatusCode(cause),
    });
    throw new GenaiServiceError("Failed to call Gemini", { cause });
  }

  // Req 4.3: SAFETY ブロック / 空 candidates / 空 text は SafetyBlockedError
  const candidates = response.candidates ?? [];
  const finishReason = candidates[0]?.finishReason;
  if (finishReason === FinishReason.SAFETY) {
    logAttempt(input.logger, {
      model: input.model,
      attempt: input.attempt,
      status: "safety_blocked",
      fallbackUsed: input.fallbackUsed,
      durationMs: Date.now() - startedAt,
      finishReason,
    });
    throw new GenaiSafetyBlockedError(
      "Gemini blocked the response by safetySettings",
    );
  }
  if (candidates.length === 0) {
    logAttempt(input.logger, {
      model: input.model,
      attempt: input.attempt,
      status: "safety_blocked",
      fallbackUsed: input.fallbackUsed,
      durationMs: Date.now() - startedAt,
      finishReason,
    });
    throw new GenaiSafetyBlockedError(
      "Gemini returned no candidates (treated as safety block)",
    );
  }

  const reply = response.text;
  if (!reply) {
    logAttempt(input.logger, {
      model: input.model,
      attempt: input.attempt,
      status: "safety_blocked",
      fallbackUsed: input.fallbackUsed,
      durationMs: Date.now() - startedAt,
      finishReason,
    });
    throw new GenaiSafetyBlockedError(
      "Gemini returned an empty response (treated as safety block)",
    );
  }
  logAttempt(input.logger, {
    model: input.model,
    attempt: input.attempt,
    status: "success",
    fallbackUsed: input.fallbackUsed,
    durationMs: Date.now() - startedAt,
    finishReason,
  });
  return reply;
}

export function createGenaiService(env: Env, logger?: Logger): GenaiService {
  return {
    async generate({ history, userText, encryptedApiKey }) {
      // ApiKeyDecodeError はそのまま投げる (route 層が 400 invalid_api_key として直接処理)
      const apiKey = decodeApiKey(encryptedApiKey);
      const ai = new GoogleGenAI({ apiKey });
      const models = getModelCandidates(env);
      let lastError: GenaiServiceError | undefined;

      for (const [index, model] of models.entries()) {
        try {
          return await generateWithModel({
            ai,
            model,
            history,
            userText,
            attempt: index + 1,
            fallbackUsed: index > 0,
            logger,
          });
        } catch (err) {
          if (err instanceof ApiKeyDecodeError) throw err;
          if (err instanceof GenaiSafetyBlockedError) throw err;
          if (!(err instanceof GenaiServiceError)) throw err;

          lastError = err;
          const statusCode = getErrorStatusCode(err.cause);
          const isLastAttempt = index === models.length - 1;
          if (isLastAttempt || !isRetryableUpstreamFailure(statusCode)) {
            throw err;
          }
        }
      }

      throw lastError ?? new GenaiServiceError("No Gemini models configured");
    },
  };
}
