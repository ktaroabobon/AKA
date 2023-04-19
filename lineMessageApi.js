// line message apiとやりとりをするファイル

const ResponseMessageFormat = {
  getTextFormat(text) {
    return [{
      'type': 'text',
      'text': text,
    }]
  }
}

const isBotMentioned = (event) => {
  // BOTに対するメンションがあるかどうか
  const mentionedUsers = event.message.mention ? event.message.mention.mentionees.filter(
    mentionee => mentionee.type === 'user'
  ) : [];
  let isBotMentioned = mentionedUsers.some(mentionee => mentionee.userId === BOTID);

  // 個チャの場合はメンションがついてることにする
  const isGroupChat = event.source.type === 'group';
  if (!isGroupChat) {
    isBotMentioned = true;
  }

  // メッセージの先頭にBOTの名前がある場合はメンションがついてることにする
  if (event.message.text) {
    for (const mentionPhrase of mentionPhraseList) {
      if (event.message.text.startsWith(mentionPhrase)) {
        isBotMentioned = true;
      }
    }
  }

  return isBotMentioned;
}

const doPost = (e, skipApiCall = false) => {
  const event = JSON.parse(e.postData.contents).events[0];
  const replyToken = event.replyToken;
  // 投稿したメッセージが入ってくる
  const userMessage = event.message.text;
  const url = 'https://api.line.me/v2/bot/message/reply';

  if (skipApiCall) {
    return {
      getResponseCode: () => 200,
    };
  }

  // イベントタイプを取得
  const eventType = event.type;

  const response =
    UrlFetchApp.fetch(url, {
      'headers': {
        'Content-Type': 'application/json; charset=UTF-8',
        'Authorization': 'Bearer ' + TOKEN,
      },
      'method': 'post',
      'payload': JSON.stringify({
        'replyToken': replyToken,
        'messages': ResponseMessageFormat.getTextFormat(Controller.generateReply(eventType, userMessage, isBotMentioned(event))),
      }),
    });
  return response.getResponseCode();
};

