// google calendar apiとやりとりをするファイル

// // 以下にカレンダーID、イベントの開始日、終了日を設定してください。
// const calendarId = 'primary';
// const startDate = new Date('2023-04-01T00:00:00');
// const endDate = new Date('2023-04-30T00:00:00');

const GoogleCalendarApi = {
  // 開始日（startDate）と終了日（endDate）の間のイベントを取得
  getEvents(startDate, endDate, calendarId=CALENDARID) {
    // イベントを取得する
    return Calendar.Events.list(calendarId, {
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
  },
  // 昼食のイベントだけ抜き出す
  getLunchEvent(startDate, endDate, calendarId=CALENDARID) {
    // 対象期間のイベントの取得
    allEvents = GoogleCalendarApi.getEvents(startDate, endDate, calendarId)

    // 「昼食」という文字列がイベント名に入っているものをリストに取得
    const lunchEvents = allEvents.items.filter(event => {
      const eventName = event.summary || '';
      return MyDictionary.lunchKeywords.some(keyword => eventName.includes(keyword))
    });
    return lunchEvents;
  },
  // 夕食のイベントだけ抜き出す
  getDinnerEvent(startDate, endDate, calendarId=CALENDARID) {
    // 対象期間のイベントの取得
    allEvents = GoogleCalendarApi.getEvents(startDate, endDate, calendarId)

    // 「夕食」という文字列がイベント名に入っているものをリストに取得
    const dinnerEvents = allEvents.items.filter(event => {
      const eventName = event.summary || '';
      return MyDictionary.dinnerKeywords.some(keyword => eventName.includes(keyword))
    });
    return dinnerEvents;
  },
};

