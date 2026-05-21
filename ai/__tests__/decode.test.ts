import { describe, expect, it } from "vitest";
import { ApiKeyDecodeError, decodeApiKey } from "../src/lib/decode.js";

describe("decodeApiKey", () => {
  it("decodes base64-encoded api key", () => {
    const encoded = Buffer.from("my-secret-key", "utf-8").toString("base64");
    expect(decodeApiKey(encoded)).toBe("my-secret-key");
  });

  it("throws ApiKeyDecodeError for empty input", () => {
    expect(() => decodeApiKey("")).toThrow(ApiKeyDecodeError);
  });
});
