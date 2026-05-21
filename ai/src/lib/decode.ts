/**
 * GAS から base64 でエンコードされて送られてくる API キーをデコードする。
 * 旧 Python 実装の `decode_util.decode_api_key` を踏襲。
 */
export function decodeApiKey(encrypted: string): string {
  try {
    const decoded = Buffer.from(encrypted, "base64").toString("utf-8");
    if (!decoded) {
      throw new Error("decoded value is empty");
    }
    return decoded;
  } catch (cause) {
    throw new ApiKeyDecodeError("Failed to decode encrypted_api_key", {
      cause,
    });
  }
}

export class ApiKeyDecodeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ApiKeyDecodeError";
  }
}
