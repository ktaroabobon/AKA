import { randomMessageList } from "./constants.js";

type CalendarEvent = GoogleAppsScript.Calendar.Schema.Event;

/** 一般的なメッセージに語尾「だよ！」を付けて返す。 */
export function say(message: string): string {
  return `${message}\nだよ！`;
}

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

function formatDateForMeal(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function classifyAttendees(event: CalendarEvent): {
  eating: string[];
  notEating: string[];
  notAnswered: string[];
} {
  const eating: string[] = [];
  const notEating: string[] = [];
  const notAnswered: string[] = [];

  const props = PropertiesService.getScriptProperties();

  for (const attendee of event.attendees ?? []) {
    const email = attendee.email ?? "";
    const name = props.getProperty(email) ?? email;
    switch (attendee.responseStatus) {
      case "accepted":
        eating.push(name);
        break;
      case "declined":
        notEating.push(name);
        break;
      case "tentative":
      case "delegated":
      case "needsAction":
      default:
        notAnswered.push(name);
        break;
    }
  }

  return { eating, notEating, notAnswered };
}

/** 食事イベントについて整形した文字列を返す。 */
export function talkAboutMealEvents(events: CalendarEvent[]): string {
  let output = "";

  for (const event of events) {
    const summary = event.summary ?? "";
    const startStr = event.start?.dateTime ?? event.start?.date ?? "";
    const eventDate = startStr ? new Date(startStr) : new Date();

    const mealType = (summary.match(/昼食|夕食/) ?? [""])[0];
    const menu = summary.replace(/昼食|夕食/g, "").trim() || "未定";

    let text = `${formatDateForMeal(eventDate)}の${mealType}について！\n\nメニュー：${menu}\n\n`;

    if (event.attendees && event.attendees.length > 0) {
      const { eating, notEating, notAnswered } = classifyAttendees(event);

      if (eating.length > 0) {
        text += "食べる人\n" + eating.map((n) => `- ${n}`).join("\n") + "\n\n";
      }
      if (notEating.length > 0) {
        text +=
          "食べない人\n" + notEating.map((n) => `- ${n}`).join("\n") + "\n\n";
      }
      if (notAnswered.length > 0) {
        text +=
          "まだ答えてない人\n" +
          notAnswered.map((n) => `- ${n}`).join("\n") +
          "\n";
      }
    } else {
      text += "招待者なし\n";
    }

    text += "\n---------------------\n";
    output += text;
  }

  return output;
}

/** ランダムなセリフを返す。 */
export function sayRandom(): string {
  const idx = Math.floor(Math.random() * randomMessageList.length);
  return randomMessageList[idx];
}
