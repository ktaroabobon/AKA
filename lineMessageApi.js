// line message apiとやりとりをするファイル

const ResponseMessageFormat = {
  getTextFormat(text) {
    return [{
      'type': 'text',
      'text': text,
    }]
  }
}

const doPost = (e, skipApiCall = false) => {
  const replyToken = JSON.parse(e.postData.contents).events[0].replyToken;
  // 投稿したメッセージが入ってくる
  const userMessage = JSON.parse(e.postData.contents).events[0].message.text;
  const url = 'https://api.line.me/v2/bot/message/reply';

  // BOTに対するメンションがあるかどうか
  const mentionedUsers = JSON.parse(e.postData.contents).events[0].message.mention ? JSON.parse(e.postData.contents).events[0].message.mention.mentionees.filter(
    mentionee => mentionee.type === 'user'
  ) : [];
  let isBotMentioned = mentionedUsers.some(mentionee => mentionee.userId === BOTID);

  // 個チャの場合はメンションがついてることにする
  const isGroupChat = JSON.parse(e.postData.contents).events[0].source.type === 'group';
  if (!isGroupChat) {
    isBotMentioned = true;
  }

  if (skipApiCall) {
    return {
      getResponseCode: () => 200,
    };
  }

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

