import { randomMessageList } from "./constants.js";

/** 挨拶。 */
export function sayHello(): string {
  return "こんにちは！ぼく、紅！";
}

/** グループ参加時の挨拶。 */
export function sayGreetings(): string {
  return (
    "こんにちは、僕あか！\n\n" +
    "ちょっとだけ自己紹介するよ\n" +
    "アメリカ生まれ日本育ちのうさぎさん🐰\n" +
    "恥ずかしがり屋で外には10年に1回くらいしか出ないけど、密かに世界進出を狙っています(照)\n\n" +
    "みんなのお手伝いをできることになったのでお手伝いします！\n" +
    "手伝って欲しいことがあったらメッセージの先頭に「あか！」をつけて教えてね。\n" +
    "あ！もちろん個チャなら＠はいらないよ！\n\n" +
    "これからよろしくお願いします！！"
  );
}

/** ランダムなセリフを返す（メンション時のフォールバック）。 */
export function sayRandom(): string {
  const idx = Math.floor(Math.random() * randomMessageList.length);
  return randomMessageList[idx];
}

/** AI サーバが 5xx を返したときの専用フォールバック。 */
export function sayAiServerError(): string {
  return "あかはお昼寝しちゃった…むにゃむにゃ";
}
