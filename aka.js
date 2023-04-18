// 紅のセリフを生成するファイル

const AKA = {
  say: function(message) {
    // 一般的なメッセージを生成する関数
    return `${message}\nだよ！`
  },

  sayHello: function() {
    // 挨拶をする
    return `こんにちは！ぼく、紅！`
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
  }
};


const randomMessageList = [
  'あかはねー、元気だよ！',
  'この前のドブ運動会で優勝したよ！',
  '僕は灰色ウサギじゃなくて、し・ろ・う・さ・ぎ！！',
  '僕の名前は赤じゃなくて、紅だよ！',
  '♪レンジで〜3分〜したならば〜〜〜',
  '今度セカンドアルバム発売するから聴いてね！\n曲は...まだ作ってない！',
  'にんじんください！',
]