function getEventAttendeesStatus() {
  // 以下にカレンダーID、イベントの開始日、終了日を設定してください。
  const calendarId = 'primary';
  const date = new Date()
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);



  console.log(Datetime.formatDateToMonthDay(startDate))
 
  lunchEvents = GoogleCalendarApi.getLunchEvent(startDate, endDate)

  function formatDate(date) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  lunchEvents.forEach(event => {
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
        const name = MyDictionary[attendee.email];
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
    console.log(text);
  });
}

function testRandomMessage() {
  const message = AKA.sayRandom()
  console.log(message)
}

function testgetProperty() {
  console.log(PropertiesService.getScriptProperties().getProperty("CHANNEL_ACCESS_TOKEN"))
}
