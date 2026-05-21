import { z } from "zod";

export const chatRequestSchema = z.object({
  prompt: z.string().min(1, "prompt must not be empty"),
  encrypted_api_key: z.string().min(1, "encrypted_api_key must not be empty"),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatResponseSchema = z.object({
  reply: z.string(),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;
