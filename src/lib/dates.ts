const TZ = 'Asia/Jerusalem';

/** Shifts end after midnight - until this hour the "business day" is still yesterday. */
const BUSINESS_DAY_CUTOFF_HOUR = 5;

let locale = 'he-IL';
export function setDateLocale(l: string): void {
  locale = l;
}

export const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Current calendar date + hour in Israel, independent of the device time zone. */
function israelParts(now: Date): { key: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { key: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

function toUtcNoon(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

export function addDays(key: string, days: number): string {
  const d = toUtcNoon(key);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The business day a moment belongs to (a 00:30 closing still counts as the evening before). */
export function businessDate(now: Date = new Date()): string {
  const { key, hour } = israelParts(now);
  return hour < BUSINESS_DAY_CUTOFF_HOUR ? addDays(key, -1) : key;
}

export function weekdayOf(key: string): number {
  return toUtcNoon(key).getUTCDay();
}

/** Sunday that starts the week containing `key`. */
export function weekStart(key: string): string {
  return addDays(key, -weekdayOf(key));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcNoon(b).getTime() - toUtcNoon(a).getTime()) / 86_400_000);
}

/** Number of whole weeks from the anchor's week to the week of `key` (can be negative). */
export function weekIndex(key: string, anchor: string): number {
  return daysBetween(weekStart(anchor), weekStart(key)) / 7;
}

export function formatLongDate(key: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(toUtcNoon(key));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
