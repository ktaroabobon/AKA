// 受け取ったメッセージの内容に対する返答を呼び出すファイル

const Controller = {
  // リプライを生成する関数
  generateReply: function (userMessage, isBotMentioned) {
    let replyMessage = NaN;

    // 完全一致のメッセージ
    replyMessage = Controller.generateExactMatchReply(userMessage)
    if (!Number.isNaN(replyMessage)) {
      return replyMessage
    }

    // BOTがメンションされている場合
    if (isBotMentioned) {
      // 特定の単語が含まれる際のメッセージ
      replyMessage = Controller.generateReplyForWordInUserMessage(userMessage)
      if (!Number.isNaN(replyMessage)) {
        return replyMessage
      }

      // ランダムなメッセージ
      replyMessage = Controller.generateRandomMessage()
      return replyMessage
    }
  },

  // ランダムなメッセージを生成する
  generateRandomMessage: function () {
    return AKA.sayRandom()
  },

  // userMessageが完全一致する際のメッセージ
  generateExactMatchReply: function (userMessage) {
    // userMessageが「こんにちは」の場合
    if (userMessage === 'こんにちは') {
      return AKA.sayHello()
    } else {
      return NaN
    }
  },

  // userMessageに特定の単語が含まれる際のメッセージ
  generateReplyForWordInUserMessage: function (userMessage) {
    const mealType = this.getMealTypeFromMessage(userMessage);
    if (mealType) {
      return this.handleMealEvent(userMessage, mealType);
    }
    return NaN
  },

  getMealTypeFromMessage: function (userMessage) {
    for (const lunchKeyword of MyDictionary.lunchKeywords) {
      if (userMessage.includes(lunchKeyword)) {
        return 'lunch';
      }
    }

    for (const dinnerKeyword of MyDictionary.dinnerKeywords) {
      if (userMessage.includes(dinnerKeyword)) {
        return 'dinner';
      }
    }

    return null;
  },

  // 食事イベントについてのメッセージを返す
  handleMealEvent: function (userMessage, mealType) {
    // 日付を調べる
    let date = NaN;

    // 今日に関するキーワードが含まれている場合
    for (const todayKeyword of MyDictionary.todayKeywords) {
      if (userMessage.includes(todayKeyword)) {
        date = Datetime.setDateToMidnight(new Date());
      }
    }

    // 明日に関するキーワードが含まれている場合
    if (Number.isNaN(date)) {
      for (const tomorrowKeyword of MyDictionary.tomorrowKeywords) {
        if (userMessage.includes(tomorrowKeyword)) {
          date = new Date();
          date = Datetime.setDateToMidnight(date.setDate(date.getDate() + 1));
        }
      }
    }

    // その他
    if (Number.isNaN(date)) {
      date = Datetime.getDateBasedOnTime(13);
    }

    const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

    const events = (mealType === 'lunch') ? GoogleCalendarApi.getLunchEvent(startDate, endDate) : GoogleCalendarApi.getDinnerEvent(startDate, endDate);

    return AKA.talkAboutMealEvents(events);
  }
};
