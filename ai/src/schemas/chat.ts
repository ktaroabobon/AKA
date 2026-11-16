import { z } from "zod";

export const chatRequestSchema = z
  .object({
    sessionKey: z.string().min(1, "sessionKey must not be empty"),
    prompt: z.string(),
    encrypted_api_key: z.string().min(1, "encrypted_api_key must not be empty"),
    quotedMessageId: z.string().min(1).optional(),
  })
  // メンションだけで本文が空でも、返信先があれば受け付ける (#75)
  .refine((v) => v.prompt.length > 0 || v.quotedMessageId !== undefined, {
    message: "prompt must not be empty",
    path: ["prompt"],
  });

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatResponseSchema = z.object({
  reply: z.string(),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;
