/**
 * 純粋な Trie 実装。NG ワード辞書による最長一致検出に使う。
 *
 * - `buildTrie` で文字列配列から Trie を構築
 * - `findMatches` で text 中の各位置から最長一致した登録語をすべて返す
 *
 * Unicode 安全性のため、入力テキストは Array.from で
 * コードポイント単位に分解してから探索する。
 * start / end はコードポイントインデックス。
 */

export interface TrieNode {
  readonly children: Map<string, TrieNode>;
  /** 終端ノードに登録された語。中間ノードは null。 */
  readonly word: string | null;
}

export interface TrieMatch {
  /** マッチ開始のコードポイントインデックス (inclusive) */
  readonly start: number;
  /** マッチ終了のコードポイントインデックス (exclusive) */
  readonly end: number;
  /** 一致した登録語 */
  readonly word: string;
}

interface MutableTrieNode {
  children: Map<string, MutableTrieNode>;
  word: string | null;
}

function createNode(): MutableTrieNode {
  return { children: new Map(), word: null };
}

export function buildTrie(words: readonly string[]): TrieNode {
  const root = createNode();
  for (const word of words) {
    if (word.length === 0) continue;
    let node = root;
    // コードポイント単位で挿入 (絵文字・サロゲートペア対応)
    for (const ch of word) {
      let next = node.children.get(ch);
      if (next === undefined) {
        next = createNode();
        node.children.set(ch, next);
      }
      node = next;
    }
    node.word = word;
  }
  return root;
}

export function findMatches(
  trie: TrieNode,
  text: string,
): readonly TrieMatch[] {
  if (text.length === 0) return [];

  const chars = Array.from(text);
  const matches: TrieMatch[] = [];

  let i = 0;
  while (i < chars.length) {
    const match = longestMatchFrom(trie, chars, i);
    if (match !== null) {
      matches.push(match);
      i = match.end; // 重複防止: マッチ範囲はスキップ
    } else {
      i += 1;
    }
  }
  return matches;
}

function longestMatchFrom(
  trie: TrieNode,
  chars: readonly string[],
  start: number,
): TrieMatch | null {
  let node: TrieNode = trie;
  let best: TrieMatch | null = null;

  for (let j = start; j < chars.length; j += 1) {
    const next: TrieNode | undefined = node.children.get(chars[j]);
    if (next === undefined) break;
    node = next;
    if (node.word !== null) {
      // 同じ start からより長い語が出るたびに更新 → 最長一致
      best = { start, end: j + 1, word: node.word };
    }
  }
  return best;
}
