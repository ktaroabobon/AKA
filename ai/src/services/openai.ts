import type { ChatRequest } from "../schemas/chat.js";

export class OpenAINotSupportedError extends Error {
  constructor() {
    super("OpenAI のモデルはサポートされていません。");
    this.name = "OpenAINotSupportedError";
  }
}

export interface OpenAIService {
  chat(request: ChatRequest): Promise<string>;
}

export function createOpenAIService(): OpenAIService {
  return {
    async chat() {
      throw new OpenAINotSupportedError();
    },
  };
}
