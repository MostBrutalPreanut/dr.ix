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

/** Plain text of a published week for WhatsApp. */
export function weekText(days: PublishedDay[], nameOf: (id: string) => string, dateLabel: (date: string) => string, closedText: string): string {
  const lines: string[] = [];
  for (const d of days) {
    const staffed = d.shifts.length > 0;
    const head = `*${WEEKDAY_NAMES[weekdayOf(d.date)]} ${dateLabel(d.date)}*${d.note ? ` - ${d.note}` : ''}`;
    lines.push(head);
    if (!staffed) {
      lines.push(closedText);
    } else {
      for (const s of d.shifts) {
        lines.push(`${s.label}${hoursOf(s) ? ` ${hoursOf(s)}` : ''}`);
        if (s.staff.length === 0) lines.push('-');
        for (const w of s.staff) lines.push(`• ${nameOf(w.employeeId)} ${w.start}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}
