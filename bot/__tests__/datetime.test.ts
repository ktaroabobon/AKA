import { describe, expect, it } from "vitest";
import {
  formatDateToMonthDay,
  setDateToMidnight,
} from "../src/datetime.js";

describe("formatDateToMonthDay", () => {
  it("formats date as M/D", () => {
    expect(formatDateToMonthDay(new Date(2026, 4, 9))).toBe("5/9");
  });
});

describe("setDateToMidnight", () => {
  it("resets time to 00:00:00.000", () => {
    const d = new Date(2026, 4, 22, 13, 45, 30, 123);
    const m = setDateToMidnight(d);
    expect(m.getHours()).toBe(0);
    expect(m.getMinutes()).toBe(0);
    expect(m.getSeconds()).toBe(0);
    expect(m.getMilliseconds()).toBe(0);
    expect(m.getFullYear()).toBe(2026);
    expect(m.getDate()).toBe(22);
  });
});
