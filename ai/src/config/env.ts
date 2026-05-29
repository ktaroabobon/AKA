import { z } from "zod";

const commaSeparatedListSchema = z.preprocess(
  (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return value;
    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  },
  z.array(z.string().min(1)).min(1),
);

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  GEMINI_MODELS: commaSeparatedListSchema.default(["gemini-3.5-flash"]),
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
