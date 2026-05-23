import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.5-flash"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  GCP_PROJECT_ID: z.string().min(1),
  FIRESTORE_DATABASE_ID: z.string().min(1).default("(default)"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  return parsed.data;
}
