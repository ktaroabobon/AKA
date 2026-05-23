import { describe, expect, it, vi } from "vitest";
import { mask } from "../src/services/moderation.js";

describe("ModerationService.mask", () => {
  it("PII / NG なしのテキストは redactionCount が両方 0 のままで返る", () => {
    const result = mask("おはよう、今日も元気だよ");
    expect(result.redactionCount.pii).toBe(0);
    expect(result.redactionCount.profanity).toBe(0);
    // NFKC により masked === text と一致するとは限らないが、伏字は入らない
    expect(result.masked).not.toContain("[REDACTED]");
    expect(result.masked).not.toContain("***");
  });

  it("半角の携帯電話番号 / メール / 郵便番号を [REDACTED] に置換する", () => {
    const result = mask(
      "連絡先は 090-1234-5678 か foo@example.com、〒123-4567 まで",
    );
    expect(result.masked).not.toContain("090-1234-5678");
    expect(result.masked).not.toContain("foo@example.com");
    expect(result.masked).not.toContain("123-4567");
    // 3 件の PII (電話 / メール / 郵便番号)
    expect(result.redactionCount.pii).toBe(3);
    expect(result.redactionCount.profanity).toBe(0);
    // 置換結果には [REDACTED] が含まれる
    expect(result.masked).toContain("[REDACTED]");
  });

  it("NFKC 正規化により全角の電話番号 / メールも検出する", () => {
    // 全角数字・ハイフン・記号を NFKC で半角化してから検出
    const fullwidthPhone = "０９０－１２３４－５６７８";
    const fullwidthEmail = "ＡＢＣ@ｅｘａｍｐｌｅ.ｃｏｍ";
    const result = mask(`電話 ${fullwidthPhone} メール ${fullwidthEmail}`);

    expect(result.masked).not.toContain("０９０");
    expect(result.masked).not.toContain("ｅｘａｍｐｌｅ");
    expect(result.redactionCount.pii).toBe(2);
    expect(result.masked).toContain("[REDACTED]");
  });

  it("Luhn 合格のクレカ番号のみ伏字化し、Luhn 不合格はそのまま残す", () => {
    const valid = "4242424242424242"; // Luhn 合格
    const invalid = "1234567812345678"; // Luhn 不合格

    const validResult = mask(`カード: ${valid}`);
    expect(validResult.masked).not.toContain(valid);
    expect(validResult.masked).toContain("[REDACTED]");
    expect(validResult.redactionCount.pii).toBe(1);

    const invalidResult = mask(`番号: ${invalid}`);
    expect(invalidResult.masked).toContain(invalid);
    expect(invalidResult.redactionCount.pii).toBe(0);
  });

  it("12 桁のマイナンバーを伏字化する (クレカ Luhn 不合格でも 12 桁で拾う)", () => {
    // 12 桁・Luhn 不合格 → マイナンバー扱い
    const result = mask("マイナンバー: 123456789012");
    expect(result.masked).not.toContain("123456789012");
    expect(result.masked).toContain("[REDACTED]");
    expect(result.redactionCount.pii).toBe(1);
  });

  it("NG 辞書語 (Offensive.txt の語) を *** に置換する", () => {
    // Offensive.txt に含まれる「バカ」「クソ」を含む文
    const result = mask("お前バカだろ、クソだな");
    expect(result.masked).not.toContain("バカ");
    expect(result.masked).not.toContain("クソ");
    expect(result.masked).toContain("***");
    expect(result.redactionCount.profanity).toBeGreaterThanOrEqual(2);
    expect(result.redactionCount.pii).toBe(0);
  });

  it("PII と NG の混在を両方カウントする", () => {
    // 電話番号 1 件 + メール 1 件 + NG 語 1 件
    const result = mask("バカ、090-1234-5678 か foo@example.com に連絡しろ");
    expect(result.redactionCount.pii).toBe(2);
    expect(result.redactionCount.profanity).toBeGreaterThanOrEqual(1);
    expect(result.masked).toContain("[REDACTED]");
    expect(result.masked).toContain("***");
  });

  it("関数内で console.log / info / warn / error を呼ばない (Req 8.2 原文ログ禁止)", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mask("foo@example.com バカ 090-1234-5678");

    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("同じ入力に対して常に同じ結果を返す (純関数)", () => {
    const input = "テスト foo@example.com バカ";
    const a = mask(input);
    const b = mask(input);
    expect(a).toEqual(b);
  });
});
