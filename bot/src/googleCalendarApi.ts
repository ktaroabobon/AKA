import { getCalendarId } from "./config.js";
import { dinnerKeywords, lunchKeywords } from "./constants.js";

type CalendarEvent = GoogleAppsScript.Calendar.Schema.Event;
type EventsList = GoogleAppsScript.Calendar.Schema.Events;

function fetchEvents(
  startDate: Date,
  endDate: Date,
  calendarId: string,
): EventsList {
  return Calendar.Events!.list(calendarId, {
    timeMin: startDate.toISOString(),
    timeMax: endDate.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });
}

function pickByKeywords(
  events: EventsList,
  keywords: readonly string[],
): CalendarEvent[] {
  return (events.items ?? []).filter((event) => {
    const summary = event.summary ?? "";
    return keywords.some((keyword) => summary.includes(keyword));
  });
}

export function getEvents(
  startDate: Date,
  endDate: Date,
  calendarId: string = getCalendarId(),
): EventsList {
  return fetchEvents(startDate, endDate, calendarId);
}

export function getLunchEvents(
  startDate: Date,
  endDate: Date,
  calendarId: string = getCalendarId(),
): CalendarEvent[] {
  return pickByKeywords(
    fetchEvents(startDate, endDate, calendarId),
    lunchKeywords,
  );
}

export function getDinnerEvents(
  startDate: Date,
  endDate: Date,
  calendarId: string = getCalendarId(),
): CalendarEvent[] {
  return pickByKeywords(
    fetchEvents(startDate, endDate, calendarId),
    dinnerKeywords,
  );
}
