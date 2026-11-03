/**
 * Event date helpers: one place that decides how an event's date reads and
 * whether the event is still ahead, happening today, or over.
 *
 * Dates are stored as UTC ISO strings and always shown in the viewer's own
 * timezone, so an organiser in Mumbai and a sponsor in London both see the
 * right local day and time.
 */

const LOCALES = {
  en: "en-IN",
  hi: "hi-IN",
  kn: "kn-IN",
  te: "te-IN",
  ta: "ta-IN",
  ml: "ml-IN",
  ur: "ur-IN",
};

export const PHASE = {
  UPCOMING: "upcoming",
  TODAY: "today",
  OVER: "over",
};

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Combine `<input type="date">` and `<input type="time">` values (local time) into an ISO string. */
export function combineDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const local = new Date(`${dateStr}T${timeStr}`);
  return Number.isNaN(local.getTime()) ? null : local.toISOString();
}

/** Today's date as YYYY-MM-DD in local time, for the date input's `min`. */
export function todayInputValue(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Weekday, date and time for display, in the viewer's language and timezone.
 * Returns null when there is no usable date.
 */
export function formatEventDate(value, lang = "en") {
  const date = toDate(value);
  if (!date) return null;
  const locale = LOCALES[lang] || LOCALES.en;
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date);
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
  return { weekday, date: day, time, label: `${weekday}, ${day} · ${time}` };
}

/**
 * Where the event stands relative to `now`.
 *
 * - "today":    the event is on today's calendar date (local time)
 * - "over":     the event's calendar day has ended
 * - "upcoming": the event is on a later day
 *
 * An event counts as over once its whole day has passed, not the moment its
 * start time does, so a 10 AM hackathon still reads "today" at 4 PM.
 */
export function eventPhase(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return null;
  const eventDay = startOfDay(date).getTime();
  const today = startOfDay(now).getTime();
  if (eventDay < today) return PHASE.OVER;
  if (eventDay === today) return PHASE.TODAY;
  return PHASE.UPCOMING;
}

/** Whole calendar days from today until the event (0 = today, negative = past). */
export function daysUntil(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return null;
  return Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
}

/** True when the event's day has passed. */
export function isEventOver(value, now = new Date()) {
  return eventPhase(value, now) === PHASE.OVER;
}
