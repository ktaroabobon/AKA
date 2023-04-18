// 日付に関する操作を行うファイル

const Datetime = {
  // 特定の時刻より前は今日の日付を、それ以降は明日の日付を取得する関数
  getDateBasedOnTime: function(specificTime) {
    const now = new Date();
    const currentHour = now.getHours();

    if (currentHour < specificTime) {
      return now;
    } else {
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      return tomorrow;
    }
  },

  // Date型から「月/日」のような形に変換する関数
  formatDateToMonthDay: function(date) {
  const month = date.getMonth() + 1; // 月は0から始まるため、1を足す
  const day = date.getDate();

  return `${month}/${day}`;
  },

  // Date型の日時の時刻を0時に変更する関数
  setDateToMidnight(date) {
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);
    return newDate;
  },
}
