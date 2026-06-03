/**
 * Transaction Dates are plain calendar dates with no timezone conversion, so
 * search and monthly reports match the date the user entered (PRD stories 33).
 * Plain dates are "YYYY-MM-DD" strings; months are "YYYY-MM" strings. Operational
 * timestamps (audit/history) are handled separately as epoch millis.
 */
export type PlainDate = string; // "YYYY-MM-DD"
export type PlainMonth = string; // "YYYY-MM"

const PLAIN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PLAIN_MONTH_RE = /^\d{4}-\d{2}$/;

export function isValidPlainDate(value: string): value is PlainDate {
  if (!PLAIN_DATE_RE.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  if (month < 1 || month > 12) {
    return false;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

export function isValidPlainMonth(value: string): value is PlainMonth {
  if (!PLAIN_MONTH_RE.test(value)) {
    return false;
  }
  const month = Number(value.split("-")[1]);
  return month >= 1 && month <= 12;
}

/** Returns the "YYYY-MM" bucket a plain date belongs to. */
export function monthOf(date: PlainDate): PlainMonth {
  return date.slice(0, 7);
}

/** Today's plain date for a given timezone offset is intentionally not derived
 * here; callers pass a Date (usually `new Date()`) and we read its local parts. */
export function toPlainDate(date: Date): PlainDate {
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function currentMonth(date: Date): PlainMonth {
  return toPlainDate(date).slice(0, 7);
}

/**
 * The date a new Transaction should default to while a given month is in view.
 * If `today` falls in the selected month, use today (the common case — recording
 * as you go); otherwise anchor to the first of the selected month so the create
 * lands inside the month the user is looking at, not silently in the current one.
 */
export function defaultDateInMonth(month: PlainMonth, today: Date): PlainDate {
  const todayDate = toPlainDate(today);
  return monthOf(todayDate) === month ? todayDate : `${month}-01`;
}

/** Moves a "YYYY-MM" month by `delta` months (negative moves backward). */
export function addMonths(month: PlainMonth, delta: number): PlainMonth {
  const [year, monthIndex] = month.split("-").map(Number) as [number, number];
  const zeroBased = year * 12 + (monthIndex - 1) + delta;
  const newYear = Math.floor(zeroBased / 12);
  const newMonth = (zeroBased % 12) + 1;
  return `${newYear.toString().padStart(4, "0")}-${newMonth.toString().padStart(2, "0")}`;
}

/** Inclusive list of months between two months, ascending. */
export function monthRange(from: PlainMonth, to: PlainMonth): PlainMonth[] {
  const months: PlainMonth[] = [];
  let cursor = from;
  while (cursor <= to) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
}
