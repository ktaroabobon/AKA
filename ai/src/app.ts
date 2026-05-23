import { Hono } from "hono";
import { createHealthRoute } from "./routes/health.js";
import { createChatRoute } from "./routes/chat.js";
import { createGenaiService } from "./services/genai.js";
import { createSessionService } from "./services/session.js";
import { mask } from "./services/moderation.js";
import { getFirestore } from "./lib/firestore.js";
import { createLogger } from "./lib/logger.js";
import type { Env } from "./config/env.js";

export function createApp(env: Env) {
  const logger = createLogger(env);
  const genaiService = createGenaiService(env);
  const sessionService = createSessionService(getFirestore());

  const app = new Hono();

  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    logger.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Date.now() - start,
      },
      "request",
    );
  });

  app.onError((err, c) => {
    logger.error({ err }, "unhandled error");
    return c.json({ error: "internal_error" }, 500);
  });

  app.route("/", createHealthRoute());
  app.route(
    "/",
    createChatRoute({
      moderation: mask,
      sessionService,
      genaiService,
      logger,
    }),
  );

  return { app, logger };
}
