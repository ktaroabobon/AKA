// line message apiとやりとりをするファイル

const ResponseMessageFormat = {
  getTextFormat(text) {
    return [{
      'type': 'text',
      'text': text,
    }]
  }
}

const doPost = (e) => {
  const replyToken = JSON.parse(e.postData.contents).events[0].replyToken;
  // 投稿したメッセージが入ってくる
  const userMessage = JSON.parse(e.postData.contents).events[0].message.text;
  const url = 'https://api.line.me/v2/bot/message/reply';

  // BOTに対するメンションがあるかどうか
  const metionsedUsers = JSON.parse(e.postData.contents).events[0].message.mention.mentionees.filter(
    mentionee => mentionee.type === 'user'
  );
  const isBotMentioned = metionsedUsers.some(mentionee => mentionee.userId === BOTID);

  const response =
    UrlFetchApp.fetch(url, {
      'headers': {
        'Content-Type': 'application/json; charset=UTF-8',
        'Authorization': 'Bearer ' + TOKEN,
      },
      'method': 'post',
      'payload': JSON.stringify({
        'replyToken': replyToken,
        'messages': ResponseMessageFormat.getTextFormat(Controller.generateReply(userMessage, isBotMentioned)),
      }),
    });
  return response.getResponseCode();
};

