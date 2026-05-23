/**
 * 配列から要素を 1 つランダムに返す純関数。
 * 空配列は呼び出し側で防ぐ前提とし、ガードしない (`as` で型を絞らない、
 * undefined を返さない、というシンプルな契約を維持する)。
 */
export function pickRandom<T>(arr: readonly T[]): T {
  if (arr.length === 0) {
    throw new Error("pickRandom: empty array is not allowed");
  }
  const i = Math.floor(Math.random() * arr.length);
  return arr[i] as T;
}
