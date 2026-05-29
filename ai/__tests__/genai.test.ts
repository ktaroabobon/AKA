import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "@google-cloud/firestore";

// ------------------------------------------------------------------
// @google/genai のモック
// `chats.create({...})` が返す chat オブジェクトの `sendMessage` を制御する。
// vi.mock の factory は hoist されるため、内部で全モックを生成する。
// ------------------------------------------------------------------

vi.mock("@google/genai", () => {
  const sendMessage = vi.fn();
  const create = vi.fn(() => ({ sendMessage }));
  class GoogleGenAI {
    public chats = { create };
    constructor(public init: { apiKey: string }) {}
  }
  return {
    GoogleGenAI,
    HarmCategory: {
      HARM_CATEGORY_HARASSMENT: "HARM_CATEGORY_HARASSMENT",
      HARM_CATEGORY_HATE_SPEECH: "HARM_CATEGORY_HATE_SPEECH",
      HARM_CATEGORY_SEXUALLY_EXPLICIT: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      HARM_CATEGORY_DANGEROUS_CONTENT: "HARM_CATEGORY_DANGEROUS_CONTENT",
    },
    HarmBlockThreshold: {
      BLOCK_MEDIUM_AND_ABOVE: "BLOCK_MEDIUM_AND_ABOVE",
    },
    FinishReason: {
      SAFETY: "SAFETY",
      STOP: "STOP",
    },
    // テストから参照するためにモックも export しておく
    __mocks__: { sendMessage, create },
  };
});

// 上記モックから sendMessage / create を取り出すためのアクセサ
async function getMocks(): Promise<{
  sendMessage: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
}> {
  const mod = (await import("@google/genai")) as unknown as {
    __mocks__: {
      sendMessage: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
  return mod.__mocks__;
}

import {
  createGenaiService,
  GenaiSafetyBlockedError,
  GenaiServiceError,
  type GenaiGenerateInput,
} from "../src/services/genai.js";
import { akaSystemInstruction } from "../src/prompts/aka.js";
import type { ConversationMessage } from "../src/services/session.js";
import type { Env } from "../src/config/env.js";
import type { Logger } from "../src/lib/logger.js";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    PORT: 8080,
    LOG_LEVEL: "info",
    GEMINI_MODEL: "gemini-test-model",
    GEMINI_FALLBACK_MODELS: "",
    NODE_ENV: "test",
    GCP_PROJECT_ID: "test-project",
    FIRESTORE_DATABASE_ID: "(default)",
    ...overrides,
  };
}

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
  } as unknown as Logger;
}

// base64("test-api-key") = "dGVzdC1hcGkta2V5"
const ENCRYPTED_API_KEY = Buffer.from("test-api-key", "utf-8").toString(
  "base64",
);

function makeInput(
  overrides: Partial<GenaiGenerateInput> = {},
): GenaiGenerateInput {
  return {
    history: [],
    userText: "こんにちは",
    encryptedApiKey: ENCRYPTED_API_KEY,
    ...overrides,
  };
}

beforeEach(async () => {
  const { sendMessage, create } = await getMocks();
  sendMessage.mockReset();
  create.mockClear();
  // create の戻り値はリセットすると undefined になるので再設定
  create.mockImplementation(() => ({ sendMessage }));
});

describe("GenaiService.generate", () => {
  it("正常応答: sendMessage が text を返したらそれを返す", async () => {
    const { sendMessage } = await getMocks();
    sendMessage.mockResolvedValueOnce({
      text: "あかはねー、元気だよ！",
      candidates: [{ finishReason: "STOP" }],
    });

    const service = createGenaiService(makeEnv());
    const reply = await service.generate(makeInput({ userText: "やっほー" }));

    expect(reply).toBe("あかはねー、元気だよ！");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({ message: "やっほー" });
  });

  it("正常応答を model / attempt / status / fallbackUsed / durationMs 付きで構造化ログに出す", async () => {
    const { sendMessage } = await getMocks();
    sendMessage.mockResolvedValueOnce({
      text: "あかはねー、元気だよ！",
      candidates: [{ finishReason: "STOP" }],
    });
    const logger = makeLogger();

    const service = createGenaiService(makeEnv(), logger);
    await service.generate(makeInput());

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-test-model",
        attempt: 1,
        status: "success",
        fallbackUsed: false,
        durationMs: expect.any(Number),
        finishReason: "STOP",
      }),
      "genai attempt completed",
    );
  });

  it("chats.create に systemInstruction と safetySettings 4 カテゴリ (BLOCK_MEDIUM_AND_ABOVE) が渡される (Req 4.1, 4.2)", async () => {
    const { sendMessage, create } = await getMocks();
    sendMessage.mockResolvedValueOnce({
      text: "ok",
      candidates: [{ finishReason: "STOP" }],
    });

    const service = createGenaiService(makeEnv());
    await service.generate(makeInput());

    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0]?.[0] as {
      model: string;
      history: unknown;
      config: {
        systemInstruction: string;
        safetySettings: { category: string; threshold: string }[];
      };
    };
    expect(arg.model).toBe("gemini-test-model");
    expect(arg.config.systemInstruction).toBe(akaSystemInstruction);

    const settings = arg.config.safetySettings;
    expect(settings).toHaveLength(4);
    const categories = settings.map((s) => s.category).sort();
    expect(categories).toEqual(
      [
        "HARM_CATEGORY_DANGEROUS_CONTENT",
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      ].sort(),
    );
    for (const s of settings) {
      expect(s.threshold).toBe("BLOCK_MEDIUM_AND_ABOVE");
    }
  });

  it("ConversationMessage[] history を Content[] に変換して chats.create に渡す (Req 4.1)", async () => {
    const { sendMessage, create } = await getMocks();
    sendMessage.mockResolvedValueOnce({
      text: "ok",
      candidates: [{ finishReason: "STOP" }],
    });

    const ts = Timestamp.fromMillis(0);
    const history: ConversationMessage[] = [
      { role: "user", text: "おはよう", ts },
      { role: "model", text: "おはよ〜", ts },
    ];

    const service = createGenaiService(makeEnv());
    await service.generate(makeInput({ history }));

    const arg = create.mock.calls[0]?.[0] as {
      history: { role: string; parts: { text: string }[] }[];
    };
    expect(arg.history).toEqual([
      { role: "user", parts: [{ text: "おはよう" }] },
      { role: "model", parts: [{ text: "おはよ〜" }] },
    ]);
  });

  it("SAFETY ブロック: finishReason === SAFETY の場合は GenaiSafetyBlockedError (Req 4.3)", async () => {
    const { sendMessage } = await getMocks();
    sendMessage.mockResolvedValue({
      text: "",
      candidates: [{ finishReason: "SAFETY" }],
    });

    const service = createGenaiService(makeEnv());

    await expect(service.generate(makeInput())).rejects.toBeInstanceOf(
      GenaiSafetyBlockedError,
    );
    await expect(service.generate(makeInput())).rejects.toBeInstanceOf(
      GenaiServiceError,
    );
  });

  it("空 text (undefined): GenaiSafetyBlockedError として扱う (Req 4.3)", async () => {
    const { sendMessage } = await getMocks();
    sendMessage.mockResolvedValueOnce({
      text: undefined,
      candidates: [{ finishReason: "STOP" }],
    });

    const service = createGenaiService(makeEnv());
    await expect(service.generate(makeInput())).rejects.toBeInstanceOf(
      GenaiSafetyBlockedError,
    );
  });

  it("空 candidates: GenaiSafetyBlockedError として扱う (Req 4.3)", async () => {
    const { sendMessage } = await getMocks();
    sendMessage.mockResolvedValueOnce({
      text: "",
      candidates: [],
    });

    const service = createGenaiService(makeEnv());
    await expect(service.generate(makeInput())).rejects.toBeInstanceOf(
      GenaiSafetyBlockedError,
    );
  });

  it("ネットワーク等の一般エラー: GenaiServiceError で包む (SAFETY 系ではない)", async () => {
    const cause = new Error("network down");
    const { sendMessage } = await getMocks();
    sendMessage.mockRejectedValue(cause);

    const service = createGenaiService(makeEnv());

    await expect(service.generate(makeInput())).rejects.toBeInstanceOf(
      GenaiServiceError,
    );
    await expect(service.generate(makeInput())).rejects.not.toBeInstanceOf(
      GenaiSafetyBlockedError,
    );
    await expect(service.generate(makeInput())).rejects.toMatchObject({
      cause,
    });
  });

  it("Gemini 呼び出し失敗を statusCode 付きで構造化ログに出す", async () => {
    const cause = { status: 503, message: "high demand" };
    const { sendMessage } = await getMocks();
    sendMessage.mockRejectedValueOnce(cause);
    const logger = makeLogger();

    const service = createGenaiService(makeEnv(), logger);

    await expect(service.generate(makeInput())).rejects.toBeInstanceOf(
      GenaiServiceError,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-test-model",
        attempt: 1,
        status: "error",
        fallbackUsed: false,
        durationMs: expect.any(Number),
        upstreamStatusCode: 503,
      }),
      "genai attempt failed",
    );
  });

  it("retryable error の場合は fallback model を順番に試す", async () => {
    const { sendMessage, create } = await getMocks();
    sendMessage
      .mockRejectedValueOnce({ status: 503, message: "high demand" })
      .mockResolvedValueOnce({
        text: "fallback reply",
        candidates: [{ finishReason: "STOP" }],
      });
    const logger = makeLogger();

    const service = createGenaiService(
      makeEnv({ GEMINI_FALLBACK_MODELS: "gemini-fallback-1" }),
      logger,
    );
    const reply = await service.generate(makeInput());

    expect(reply).toBe("fallback reply");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: "gemini-test-model",
    });
    expect(create.mock.calls[1]?.[0]).toMatchObject({
      model: "gemini-fallback-1",
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-test-model",
        attempt: 1,
        status: "error",
        fallbackUsed: false,
        upstreamStatusCode: 503,
      }),
      "genai attempt failed",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-fallback-1",
        attempt: 2,
        status: "success",
        fallbackUsed: true,
      }),
      "genai attempt completed",
    );
  });

  it("non-retryable error の場合は fallback model を試さない", async () => {
    const { sendMessage, create } = await getMocks();
    sendMessage.mockRejectedValueOnce({ status: 400, message: "bad request" });

    const service = createGenaiService(
      makeEnv({ GEMINI_FALLBACK_MODELS: "gemini-fallback-1" }),
    );

    await expect(service.generate(makeInput())).rejects.toBeInstanceOf(
      GenaiServiceError,
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: "gemini-test-model",
    });
  });

  it("SAFETY ブロックの場合は fallback model を試さない", async () => {
    const { sendMessage, create } = await getMocks();
    sendMessage.mockResolvedValueOnce({
      text: "",
      candidates: [{ finishReason: "SAFETY" }],
    });

    const service = createGenaiService(
      makeEnv({ GEMINI_FALLBACK_MODELS: "gemini-fallback-1" }),
    );

    await expect(service.generate(makeInput())).rejects.toBeInstanceOf(
      GenaiSafetyBlockedError,
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
});
