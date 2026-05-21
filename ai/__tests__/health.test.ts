import { describe, expect, it } from "vitest";
import { createHealthRoute } from "../src/routes/health.js";

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const app = createHealthRoute();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok" });
  });
});
