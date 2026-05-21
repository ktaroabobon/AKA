// 日付に関するユーティリティ

/**
 * 指定時刻より前なら今日、それ以降なら明日の Date を返す。
 */
export function getDateBasedOnTime(specificHour: number): Date {
  const now = new Date();
  if (now.getHours() < specificHour) {
    return now;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return tomorrow;
}

/** Date を「M/D」表記の文字列に変換する。 */
export function formatDateToMonthDay(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}/${day}`;
}

/** Date を 00:00:00.000 にリセットした新しい Date を返す。 */
export function setDateToMidnight(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}
