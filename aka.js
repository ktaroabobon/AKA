// 紅のセリフを生成するファイル

const AKA = {
  say: function (message) {
    // 一般的なメッセージを生成する関数
    return `${message}\nだよ！`
  },

  sayHello: function () {
    // 挨拶をする
    return `こんにちは！ぼく、紅！`
  },

  sayGreetings: function () {
    // 参加時の挨拶をする
    return `こんにちは、僕あか！\n\nちょっとだけ自己紹介するよ\nアメリカ生まれ日本育ちのうさぎさん🐰\n恥ずかしがり屋で外には10年に1回くらいしか出ないけど、密かに世界進出を狙っています(照)\n\nみんなのお手伝いをできることになったのでお手伝いします！\n手伝って欲しいことがあったらメッセージの先頭に「あか！」をつけて教えてね。\nあ！もちろん個チャなら＠はいらないよ！\n\nこれからよろしくお願いします！！`
  },

  talkAboutMealEvents(mealEvents) {
    // 食事のイベントについて話す
    function formatDate(date) {
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    }

    let outputText = '';

    mealEvents.forEach(event => {
      const eventDate = new Date(event.start.dateTime || event.start.date);
      const mealType = event.summary.match(/昼食|夕食/)[0];
      let text = `${formatDate(eventDate)}の${mealType}について！\n\n`;

      const menu = event.summary.replace(/昼食|夕食/g, '').trim() || '未定';
      text += `メニュー：${menu}\n\n`;

      const eatingPeople = [];
      const notEatingPeople = [];
      const notAnsweredPeople = [];

      if (event.attendees) {
        event.attendees.forEach(attendee => {
          const name = PropertiesService.getScriptProperties().getProperty(attendee.email);
          switch (attendee.responseStatus) {
            case 'accepted':
              eatingPeople.push(name);
              break;
            case 'declined':
              notEatingPeople.push(name);
              break;
            case 'tentative':
            case 'delegated':
            case 'needsAction':
            default:
              notAnsweredPeople.push(name);
              break;
          }
        });

        if (eatingPeople.length > 0) {
          text += '食べる人\n';
          eatingPeople.forEach(name => {
            text += `- ${name}\n`;
          });
          text += '\n';
        }

        if (notEatingPeople.length > 0) {
          text += '食べない人\n';
          notEatingPeople.forEach(name => {
            text += `- ${name}\n`;
          });
          text += '\n';
        }

        if (notAnsweredPeople.length > 0) {
          text += 'まだ答えてない人\n';
          notAnsweredPeople.forEach(name => {
            text += `- ${name}\n`;
          });
        }
      } else {
        text += '招待者なし\n';
      }

      text += '\n---------------------\n';

      outputText += text
    });

    return outputText;
  },

  sayRandom() {
    const randomIndex = Math.floor(Math.random() * randomMessageList.length);
    return randomMessageList[randomIndex];
  },
};
