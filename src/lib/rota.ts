import type { PublishedDay, PublishedShift, ShiftAssignment, ShiftDay, ShiftDef } from './types';
import { WEEKDAY_NAMES, addDays, weekdayOf } from './dates';
import { tn } from './i18n';

/** The most people that fit in one shift. */
export const MAX_STAFF = 4;

const EVENING: ShiftDef = { id: 'eve', label: tn('ערב'), from: '17:30', to: '00:00', defaultStart: '17:00', max: MAX_STAFF };
const SAT_NOON: ShiftDef = { id: 'noon', label: tn('צהריים'), from: '11:00', to: '17:00', defaultStart: '11:00', max: MAX_STAFF };
const SAT_EVENING: ShiftDef = { ...EVENING, from: '17:00' };

/** The regular week: Sunday closed, Monday-Friday one evening shift, Saturday noon + evening. */
export function templateShifts(weekday: number): ShiftDef[] {
  if (weekday === 0) return [];
  if (weekday === 6) return [{ ...SAT_NOON }, { ...SAT_EVENING }];
  return [{ ...EVENING }];
}

/** Start times offered as quick choices. */
export const START_CHOICES = ['11:00', '16:30', '17:00', '17:30', '19:00', '20:00'];

export function effectiveShifts(date: string, day?: Pick<ShiftDay, 'shifts'>): ShiftDef[] {
  return day ? day.shifts : templateShifts(weekdayOf(date));
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export const requestKey = (date: string, shiftId: string) => `${date}|${shiftId}`;
export const assignmentId = (date: string, shiftId: string, employeeId: string) => `${date}|${shiftId}|${employeeId}`;

/** The week as the team will see it (draft assignments of shifts that still exist, ordered by start time). */
export function buildWeek(weekStart: string, days: ShiftDay[], assignments: ShiftAssignment[], isEmployee: (id: string) => boolean = () => true): PublishedDay[] {
  return weekDates(weekStart).map((date) => {
    const day = days.find((d) => d.date === date);
    const shifts: PublishedShift[] = effectiveShifts(date, day).map((s) => ({
      ...s,
      staff: assignments
        .filter((a) => a.date === date && a.shiftId === s.id && isEmployee(a.employeeId))
        .map((a) => ({ employeeId: a.employeeId, start: a.start }))
        .sort((a, b) => a.start.localeCompare(b.start) || a.employeeId.localeCompare(b.employeeId))
        .slice(0, s.max),
    }));
    const out: PublishedDay = { date, shifts };
    if (day?.note) out.note = day.note;
    if (day?.noteEn) out.noteEn = day.noteEn;
    return out;
  });
}

/** True when the draft differs from what was published (published timestamps are ignored). */
export function hasUnpublishedChanges(published: PublishedDay[] | undefined, draft: PublishedDay[]): boolean {
  return !published || JSON.stringify(published) !== JSON.stringify(draft);
}

/** The shifts a person works on one day of a published week. */
export function myShifts(days: PublishedDay[], date: string, employeeId: string): { shift: PublishedShift; start: string }[] {
  const day = days.find((d) => d.date === date);
  if (!day) return [];
  return day.shifts.flatMap((shift) => {
    const mine = shift.staff.find((s) => s.employeeId === employeeId);
    return mine ? [{ shift, start: mine.start }] : [];
  });
}

/** "17:30–00:00" / "מ-11:00" style hours; empty when nothing is set. */
export function hoursOf(s: Pick<ShiftDef, 'from' | 'to'>): string {
  if (s.from && s.to) return `${s.from}–${s.to}`;
  return s.from ?? s.to ?? '';
}

export const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** "20.9" */
export const shortDate = (date: string) => `${Number(date.slice(8))}.${Number(date.slice(5, 7))}`;

/**
 * Heading of a day in the export: "שני 20.9 צביעת מיניאטורות" (weekday, date, then the names of the
 * day's events and its note). Always Hebrew - the export is for the team's WhatsApp, whatever the app language is.
 */
export function dayHeading(d: PublishedDay): string {
  const parts = [...d.shifts.filter((s) => s.event).map((s) => s.label), ...(d.note ? [d.note] : [])];
  return [WEEKDAY_NAMES[weekdayOf(d.date)], shortDate(d.date), ...[...new Set(parts)]].join(' ');
}

/** Days that appear in the export: closed days without an event or note are left out. */
export const exportDays = (days: PublishedDay[]): PublishedDay[] => days.filter((d) => d.shifts.length > 0 || d.note);

/** Plain text of a published week for WhatsApp (Hebrew only, chronological). */
export function weekText(days: PublishedDay[], nameOf: (id: string) => string): string {
  const lines: string[] = [];
  for (const d of exportDays(days)) {
    lines.push(`*${dayHeading(d)}*`);
    for (const s of d.shifts) {
      lines.push(`${s.label}${hoursOf(s) ? ` ${hoursOf(s)}` : ''}`);
      if (s.staff.length === 0) lines.push('-');
      for (const w of s.staff) lines.push(`• ${nameOf(w.employeeId)} ${w.start}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

// ---------- worker colors ----------

/** Colors offered as quick choices (the pastel set of the manager's spreadsheet). */
export const COLOR_PALETTE = ['#6aa84f', '#ea9999', '#b4a7d6', '#ff9900', '#f6b26b', '#a4c2f4', '#ffe599', '#76a5af', '#d5a6bd', '#93c47d'];

export const isHexColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** A color for somebody who was never given one (stable per person). */
export function defaultColor(employeeId: string): string {
  let h = 0;
  for (const ch of employeeId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOR_PALETTE[h % COLOR_PALETTE.length];
}

/** Black or white text, whichever reads better on the color. */
export function textOn(color: string): string {
  const n = parseInt(color.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#111' : '#fff';
}
