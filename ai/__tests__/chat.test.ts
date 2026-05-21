import { describe, expect, it, vi } from "vitest";
import { createChatRoute } from "../src/routes/chat.js";
import {
  GenaiServiceError,
  type GenaiService,
} from "../src/services/genai.js";
import {
  OpenAINotSupportedError,
  type OpenAIService,
} from "../src/services/openai.js";
import { ApiKeyDecodeError } from "../src/lib/decode.js";
import type { Logger } from "../src/lib/logger.js";

function silentLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
  } as unknown as Logger;
}

function makeRoute(overrides: {
  genaiService?: Partial<GenaiService>;
  openaiService?: Partial<OpenAIService>;
}) {
  const genaiService: GenaiService = {
    chat: vi.fn(async () => "default genai reply"),
    ...overrides.genaiService,
  };
  const openaiService: OpenAIService = {
    chat: vi.fn(async () => {
      throw new OpenAINotSupportedError();
    }),
    ...overrides.openaiService,
  };
  return createChatRoute({
    genaiService,
    openaiService,
    logger: silentLogger(),
  });
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/chat/genai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /chat/genai", () => {
  it("returns reply on success", async () => {
    const app = makeRoute({
      genaiService: { chat: vi.fn(async () => "あかはねー、元気だよ！") },
    });
    const res = await app.fetch(
      makeRequest({ prompt: "こんにちは", encrypted_api_key: "x" }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ reply: "あかはねー、元気だよ！" });
  });

  it("returns 400 when prompt is missing", async () => {
    const app = makeRoute({});
    const res = await app.fetch(makeRequest({ encrypted_api_key: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when api key cannot be decoded", async () => {
    const app = makeRoute({
      genaiService: {
        chat: vi.fn(async () => {
          throw new ApiKeyDecodeError("bad key");
        }),
      },
    });
    const res = await app.fetch(
      makeRequest({ prompt: "hi", encrypted_api_key: "x" }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_api_key" });
  });

  it("returns 502 when genai service fails", async () => {
    const app = makeRoute({
      genaiService: {
        chat: vi.fn(async () => {
          throw new GenaiServiceError("upstream down");
        }),
      },
    });
    const res = await app.fetch(
      makeRequest({ prompt: "hi", encrypted_api_key: "x" }),
    );
    expect(res.status).toBe(502);
  });
});

describe("POST /chat/openai", () => {
  it("returns 501 because OpenAI is not supported", async () => {
    const app = makeRoute({});
    const res = await app.fetch(
      new Request("http://localhost/chat/openai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "hi", encrypted_api_key: "x" }),
      }),
    );
    expect(res.status).toBe(501);
    await expect(res.json()).resolves.toMatchObject({
      error: "openai_not_supported",
    });
  });
});
