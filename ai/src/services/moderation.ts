/**
 * ModerationService — PII / 罵詈雑言マスキング (純関数)。
 *
 * - 入力テキストを NFKC 正規化してから検出する (全角→半角統一)
 * - PII は `[REDACTED]` で、NG 辞書語は `***` で置換する
 * - 入力 / 出力 / 履歴保存の 3 ポイントで同じ実装を共有する (Req 5.5)
 * - 原文を console.log / pino に出さない (Req 8.2)
 *
 * 辞書 (`vendor/inappropriate-words-ja/{Sexual.txt, Offensive.txt}`) は
 * module 初回 import 時に 1 回だけ読み込んで Trie を構築する。
 */
import { readFileSync } from "node:fs";
import { buildTrie, findMatches, type TrieNode } from "../lib/trie.js";

const PII_PLACEHOLDER = "[REDACTED]";
const PROFANITY_PLACEHOLDER = "***";

export interface MaskResult {
  readonly masked: string;
  readonly redactionCount: {
    readonly pii: number;
    readonly profanity: number;
  };
}

function loadDictionary(filename: string): readonly string[] {
  // ESM の import.meta.url 基準で vendor ファイルを読む。バンドルや CWD に依存しない。
  const url = new URL(
    `../../vendor/inappropriate-words-ja/${filename}`,
    import.meta.url,
  );
  const raw = readFileSync(url, "utf-8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// Module top-level: 起動時に 1 回だけ Trie を構築 (キャッシュ)
const profanityWords: readonly string[] = [
  ...loadDictionary("Sexual.txt"),
  ...loadDictionary("Offensive.txt"),
];
const profanityTrie: TrieNode = buildTrie(profanityWords);

// Luhn アルゴリズム: 与えられた数字列がカード番号として有効か検査
function isLuhnValid(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = digits.charCodeAt(i) - 48; // '0' = 48
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * 連続数字列のうち Luhn 合格のもののみマッチ範囲として返す。
 * 13-19 桁のクレカ候補を抽出し、Luhn を通ったものだけ伏字化する。
 */
function findLuhnRanges(
  text: string,
): readonly { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const re = /\d{13,19}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (isLuhnValid(m[0])) {
      ranges.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  return ranges;
}

/**
 * 既定の PII 正規表現群。順序は重要:
 *   1. メール (記号を含むので先に拾う)
 *   2. 携帯電話 (0[789]0-XXXX-XXXX、固定電話と被るので先)
 *   3. 固定電話
 *   4. 郵便番号 (XXX-XXXX、3+4 桁固定)
 *   5. マイナンバー (12 桁、クレカ Luhn を通らない 12 桁を後で拾う)
 *
 * クレカは Luhn を別途適用するため、ここには含めない。
 */
const PII_PATTERNS: readonly RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /0[789]0[-\s]?\d{4}[-\s]?\d{4}/g,
  /0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{4}/g,
  /\b\d{3}-\d{4}\b/g,
  /\b\d{12}\b/g,
];

interface Range {
  start: number;
  end: number;
  replacement: string;
}

/**
 * すべての置換範囲を末尾から適用してマスク済み文字列を作る。
 * オーバーラップ範囲はカウントから除外 (1 件として数える)。
 */
function applyReplacements(text: string, ranges: readonly Range[]): string {
  if (ranges.length === 0) return text;
  // start 昇順にソートしてからオーバーラップを除外、末尾から置換する
  const sorted = [...ranges].sort((a, b) =>
    a.start === b.start ? b.end - a.end : a.start - b.start,
  );
  const nonOverlapping: Range[] = [];
  let lastEnd = -1;
  for (const r of sorted) {
    if (r.start >= lastEnd) {
      nonOverlapping.push(r);
      lastEnd = r.end;
    }
  }
  let out = text;
  for (let i = nonOverlapping.length - 1; i >= 0; i -= 1) {
    const r = nonOverlapping[i];
    out = out.slice(0, r.start) + r.replacement + out.slice(r.end);
  }
  return out;
}

export function mask(text: string): MaskResult {
  if (text.length === 0) {
    return { masked: "", redactionCount: { pii: 0, profanity: 0 } };
  }

  // Step 1: NFKC 正規化 (全角→半角統一)
  const normalized = text.normalize("NFKC");

  // Step 2: PII 範囲を収集 (Luhn 合格カード + 各正規表現)
  const piiRanges: Range[] = [];
  for (const { start, end } of findLuhnRanges(normalized)) {
    piiRanges.push({ start, end, replacement: PII_PLACEHOLDER });
  }
  for (const re of PII_PATTERNS) {
    // 各正規表現は global flag 付き
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(normalized)) !== null) {
      piiRanges.push({
        start: m.index,
        end: m.index + m[0].length,
        replacement: PII_PLACEHOLDER,
      });
    }
  }

  // オーバーラップを取り除いた件数を PII カウントとする
  const piiCount = countNonOverlapping(piiRanges);

  // Step 3: PII を先にマスクした文字列に対して NG 辞書を当てる
  // (PII 部分は [REDACTED] になっているので NG 検出から逃げる、二重カウント防止)
  const afterPii = applyReplacements(normalized, piiRanges);
  const profanityMatches = findMatches(profanityTrie, afterPii);

  const profanityRanges: Range[] = profanityMatches.map((m) => ({
    start: codePointToCharIndex(afterPii, m.start),
    end: codePointToCharIndex(afterPii, m.end),
    replacement: PROFANITY_PLACEHOLDER,
  }));
  const masked = applyReplacements(afterPii, profanityRanges);

  return {
    masked,
    redactionCount: {
      pii: piiCount,
      profanity: profanityMatches.length,
    },
  };
}

/**
 * コードポイントインデックス → UTF-16 char インデックスに変換。
 * trie.findMatches はコードポイント単位で返すため、置換のため char index に直す。
 */
function codePointToCharIndex(text: string, codePointIndex: number): number {
  let charIndex = 0;
  let cp = 0;
  for (const ch of text) {
    if (cp === codePointIndex) return charIndex;
    charIndex += ch.length;
    cp += 1;
  }
  return charIndex;
}

function countNonOverlapping(ranges: readonly Range[]): number {
  if (ranges.length === 0) return 0;
  const sorted = [...ranges].sort((a, b) =>
    a.start === b.start ? b.end - a.end : a.start - b.start,
  );
  let count = 0;
  let lastEnd = -1;
  for (const r of sorted) {
    if (r.start >= lastEnd) {
      count += 1;
      lastEnd = r.end;
    }
  }
  return count;
}
