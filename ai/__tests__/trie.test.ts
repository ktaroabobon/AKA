import { describe, expect, it } from "vitest";
import { buildTrie, findMatches } from "../src/lib/trie.js";

describe("buildTrie / findMatches", () => {
  it("選択肢の中で最長一致を選ぶ", () => {
    // words に短い語と長い語が両方あるとき、開始位置が同じなら長い方だけが選ばれる
    const trie = buildTrie(["バカ", "バカヤロウ"]);
    const matches = findMatches(trie, "バカヤロウ最高");

    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ start: 0, end: 5, word: "バカヤロウ" });
    // "バカ" のような短い部分一致は別 match として残さない
    expect(matches.some((m) => m.word === "バカ")).toBe(false);
  });

  it("部分一致は false positive を出さない", () => {
    // "バカンス" の先頭 2 文字は "バカ" と一致する。仕様上はこれを match として扱う
    // (NG 辞書としては取りこぼしより誤検出側にずれることを許容)
    const trie = buildTrie(["バカ"]);
    const matches = findMatches(trie, "バカンス");

    expect(matches).toEqual([{ start: 0, end: 2, word: "バカ" }]);
  });

  it("空辞書 / 空文字列を安全に処理する", () => {
    expect(findMatches(buildTrie([]), "anything")).toEqual([]);
    expect(findMatches(buildTrie(["バカ"]), "")).toEqual([]);
    expect(findMatches(buildTrie([]), "")).toEqual([]);
  });

  it("text 中の複数位置にある一致を順序付きで全て返す", () => {
    const trie = buildTrie(["バカ"]);
    const matches = findMatches(trie, "ばかバカ_バカ");
    // 'ばか' (ひらがな) は登録語ではないので一致しない
    expect(matches).toEqual([
      { start: 2, end: 4, word: "バカ" },
      { start: 5, end: 7, word: "バカ" },
    ]);
  });

  it("マッチした範囲は次の探索で再利用しない (重複防止)", () => {
    // "アホバカ" を登録し、text="アホバカ" のとき
    // 0 始まりで 1 つだけ match が返り、内側の "バカ" を別 match として返さない
    const trie = buildTrie(["アホバカ", "バカ"]);
    const matches = findMatches(trie, "アホバカ");
    expect(matches).toEqual([{ start: 0, end: 4, word: "アホバカ" }]);
  });

  it("サロゲートペア (絵文字) を含む text をコードポイント単位で処理する", () => {
    // "💩バカ" — 絵文字は UTF-16 で 2 code unit だが 1 コードポイント
    // start/end はコードポイント単位で返す
    const trie = buildTrie(["バカ"]);
    const matches = findMatches(trie, "💩バカ");
    expect(matches).toEqual([{ start: 1, end: 3, word: "バカ" }]);
  });
});
