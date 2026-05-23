import { describe, it, expect } from "vitest";
import { buildSessionKey } from "../src/lib/sessionKey";
import type { LineSource, LineSourceType } from "../src/types/line";

describe("buildSessionKey", () => {
  it("type=user に userId が含まれていれば 'user:{userId}' を返す", () => {
    const source: LineSource = { type: "user", userId: "U123" };
    expect(buildSessionKey(source)).toBe("user:U123");
  });

  it("type=group に groupId が含まれていれば 'group:{groupId}' を返す", () => {
    const source: LineSource = { type: "group", groupId: "C456" };
    expect(buildSessionKey(source)).toBe("group:C456");
  });

  it("type=room に roomId が含まれていれば 'room:{roomId}' を返す", () => {
    const source: LineSource = { type: "room", roomId: "R789" };
    expect(buildSessionKey(source)).toBe("room:R789");
  });

  it("type=user で userId が undefined なら null", () => {
    const source: LineSource = { type: "user" };
    expect(buildSessionKey(source)).toBeNull();
  });

  it("type=group で groupId が undefined なら null", () => {
    const source: LineSource = { type: "group" };
    expect(buildSessionKey(source)).toBeNull();
  });

  it("type=room で roomId が undefined なら null", () => {
    const source: LineSource = { type: "room" };
    expect(buildSessionKey(source)).toBeNull();
  });

  it("type=user で userId が空文字なら null", () => {
    const source: LineSource = { type: "user", userId: "" };
    expect(buildSessionKey(source)).toBeNull();
  });

  it("type=group で groupId が空文字なら null", () => {
    const source: LineSource = { type: "group", groupId: "" };
    expect(buildSessionKey(source)).toBeNull();
  });

  it("type=room で roomId が空文字なら null", () => {
    const source: LineSource = { type: "room", roomId: "" };
    expect(buildSessionKey(source)).toBeNull();
  });

  it("未対応の type なら null", () => {
    const source: LineSource = {
      type: "unknown" as LineSourceType,
      userId: "U999",
    };
    expect(buildSessionKey(source)).toBeNull();
  });

  it("source オブジェクトを変更しない (副作用なし)", () => {
    const source: LineSource = { type: "user", userId: "U123" };
    const snapshot = { ...source };
    buildSessionKey(source);
    expect(source).toEqual(snapshot);
  });
});
