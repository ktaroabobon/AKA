import { getChannelAccessToken } from "./config.js";
import type { components } from "./api/generated.js";

type QuotedImage = NonNullable<
  components["schemas"]["ChatRequest"]["quotedImage"]
>;

const LINE_CONTENT_URL = "https://api-data.line.me/v2/bot/message";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_MIME_TYPES: readonly QuotedImage["mimeType"][] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

function isImageMimeType(value: string): value is QuotedImage["mimeType"] {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * 返信先の画像を LINE の取得用 API から取る (#76)。
 * チャネルアクセストークンを ai に渡さないため、bot (GAS) 側で取る。
 * 2xx・許可した画像の Content-Type・5 MB 以下のときだけ返し、それ以外は null
 * (画像なしとして応答を続ける)。
 */
export function fetchQuotedImage(messageId: string): QuotedImage | null {
  let response: GoogleAppsScript.URL_Fetch.HTTPResponse;
  try {
    response = UrlFetchApp.fetch(
      `${LINE_CONTENT_URL}/${encodeURIComponent(messageId)}/content`,
      {
        method: "get",
        headers: { Authorization: `Bearer ${getChannelAccessToken()}` },
        muteHttpExceptions: true,
      },
    );
  } catch (err) {
    console.error("lineContent: fetch failed", err);
    return null;
  }

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) return null;

  const headers = response.getHeaders() as Record<string, string>;
  const contentTypeKey = Object.keys(headers).find(
    (key) => key.toLowerCase() === "content-type",
  );
  const mimeType = (contentTypeKey ? headers[contentTypeKey] : "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!isImageMimeType(mimeType)) return null;

  const bytes = response.getContent();
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;

  return { mimeType, data: Utilities.base64Encode(bytes) };
}
