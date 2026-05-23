/**
 * GenaiService — `@google/genai` の chats API (multi-turn) を使った Gemini 呼び出し。
 *
 * - `ai.chats.create({ model, config: { systemInstruction, safetySettings }, history })`
 *   でセッションを毎リクエスト生成し、`chat.sendMessage({ message: userText })` で応答取得
 * - `safetySettings` は 4 カテゴリ (HARASSMENT / HATE_SPEECH / SEXUALLY_EXPLICIT /
 *   DANGEROUS_CONTENT) を `BLOCK_MEDIUM_AND_ABOVE` で固定 (Req 4.2)
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

export function createGenaiService(env: Env): GenaiService {
  return {
    async generate({ history, userText, encryptedApiKey }) {
      // ApiKeyDecodeError はそのまま投げる (route 層が 400 invalid_api_key として直接処理)
      const apiKey = decodeApiKey(encryptedApiKey);
      const ai = new GoogleGenAI({ apiKey });

      const chat = ai.chats.create({
        model: env.GEMINI_MODEL,
        config: {
          systemInstruction: akaSystemInstruction,
          safetySettings: SAFETY_SETTINGS,
        },
        history: history.map(toContent),
      });

      let response;
      try {
        response = await chat.sendMessage({ message: userText });
      } catch (cause) {
        // ApiKeyDecodeError は decodeApiKey からのみ伝播する想定だが念のため
        if (cause instanceof ApiKeyDecodeError) throw cause;
        throw new GenaiServiceError("Failed to call Gemini", { cause });
      }

      // Req 4.3: SAFETY ブロック / 空 candidates / 空 text は SafetyBlockedError
      const candidates = response.candidates ?? [];
      const finishReason = candidates[0]?.finishReason;
      if (finishReason === FinishReason.SAFETY) {
        throw new GenaiSafetyBlockedError(
          "Gemini blocked the response by safetySettings",
        );
      }
      if (candidates.length === 0) {
        throw new GenaiSafetyBlockedError(
          "Gemini returned no candidates (treated as safety block)",
        );
      }

      const reply = response.text;
      if (!reply) {
        throw new GenaiSafetyBlockedError(
          "Gemini returned an empty response (treated as safety block)",
        );
      }
      return reply;
    },
  };
}
