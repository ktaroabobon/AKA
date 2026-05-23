import { describe, expect, it } from "vitest";

import { pickRandom } from "../src/lib/pickRandom.js";

describe("pickRandom", () => {
  it("各要素が概ね一定確率で返る (試行 1000 回、各要素 ≥ 1 回出現)", () => {
    const items = ["a", "b", "c", "d"] as const;
    const counts = new Map<string, number>();
    for (const x of items) counts.set(x, 0);

    for (let i = 0; i < 1000; i++) {
      const v = pickRandom(items);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }

    for (const x of items) {
      expect(counts.get(x) ?? 0).toBeGreaterThan(0);
    }
  });

  it("空配列で呼び出すと例外を投げる", () => {
    expect(() => pickRandom([])).toThrow(/empty/);
  });
});
