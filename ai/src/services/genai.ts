import { GoogleGenAI } from "@google/genai";
import type { ChatRequest } from "../schemas/chat.js";
import { decodeApiKey } from "../lib/decode.js";
import { akaSystemInstruction } from "../prompts/aka.js";
import type { Env } from "../config/env.js";

export class GenaiServiceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GenaiServiceError";
  }
}

export interface GenaiService {
  chat(request: ChatRequest): Promise<string>;
}

export function createGenaiService(env: Env): GenaiService {
  return {
    async chat(request) {
      const apiKey = decodeApiKey(request.encrypted_api_key);
      const ai = new GoogleGenAI({ apiKey });

      try {
        const response = await ai.models.generateContent({
          model: env.GEMINI_MODEL,
          contents: request.prompt,
          config: {
            systemInstruction: akaSystemInstruction,
          },
        });

        const reply = response.text ?? "";
        if (!reply) {
          throw new GenaiServiceError("Gemini returned an empty response");
        }
        return reply;
      } catch (cause) {
        if (cause instanceof GenaiServiceError) throw cause;
        throw new GenaiServiceError("Failed to call Gemini", { cause });
      }
    },
  };
}
