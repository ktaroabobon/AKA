import { z } from "zod";

// 5 MB の画像を base64 にした長さ (#76)
const MAX_IMAGE_BASE64_LENGTH = 4 * Math.ceil((5 * 1024 * 1024) / 3);

export const chatRequestSchema = z
  .object({
    sessionKey: z.string().min(1, "sessionKey must not be empty"),
    prompt: z.string(),
    encrypted_api_key: z.string().min(1, "encrypted_api_key must not be empty"),
    quotedMessageId: z.string().min(1).optional(),
    quotedImage: z
      .object({
        mimeType: z.enum([
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
        ]),
        data: z.string().min(1).max(MAX_IMAGE_BASE64_LENGTH),
      })
      .optional(),
  })
  // メンションだけで本文が空でも、返信先があれば受け付ける (#75, #76)
  .refine(
    (v) =>
      v.prompt.length > 0 ||
      v.quotedMessageId !== undefined ||
      v.quotedImage !== undefined,
    { message: "prompt must not be empty", path: ["prompt"] },
  );

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatResponseSchema = z.object({
  reply: z.string(),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;
