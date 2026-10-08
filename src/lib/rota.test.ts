import { describe, expect, it } from 'vitest';
import { buildWeek, effectiveShifts, hasUnpublishedChanges, myShifts, templateShifts, weekDates, weekText } from './rota';
import type { ShiftAssignment, ShiftDay } from './types';

const WEEK = '2026-10-11'; // a Sunday
const a = (date: string, shiftId: string, employeeId: string, start = '17:00'): ShiftAssignment => ({ id: `${date}|${shiftId}|${employeeId}`, date, shiftId, employeeId, start });

describe('weekly template', () => {
  it('Sunday closed, weekdays one evening shift, Saturday noon + evening', () => {
    expect(templateShifts(0)).toEqual([]);
    expect(templateShifts(2).map((s) => s.id)).toEqual(['eve']);
    expect(templateShifts(6).map((s) => s.id)).toEqual(['noon', 'eve']);
    expect(templateShifts(6)[0].defaultStart).toBe('11:00');
  });

  it('a day document replaces the template (closed day, event on a closed Sunday)', () => {
    const closed: ShiftDay = { id: '2026-10-13', date: '2026-10-13', shifts: [] };
    expect(effectiveShifts('2026-10-13', closed)).toEqual([]);
    const event: ShiftDay = { id: WEEK, date: WEEK, shifts: [{ id: 'ev-1', label: 'טריוויה', defaultStart: '18:30', max: 4, event: true }] };
    expect(effectiveShifts(WEEK, event).map((s) => s.id)).toEqual(['ev-1']);
  });
});

describe('buildWeek', () => {
  it('covers 7 days, orders by start time, caps at the shift size and skips unknown shifts / people', () => {
    expect(weekDates(WEEK)).toHaveLength(7);
    const assignments = [
      a('2026-10-12', 'eve', 'b', '17:00'),
      a('2026-10-12', 'eve', 'a', '16:30'),
      a('2026-10-12', 'gone', 'a'),
      a('2026-10-12', 'eve', 'ghost'),
    ];
    const days = buildWeek(WEEK, [], assignments, (id) => id !== 'ghost');
    expect(days).toHaveLength(7);
    const mon = days.find((d) => d.date === '2026-10-12')!;
    expect(mon.shifts).toHaveLength(1);
    expect(mon.shifts[0].staff.map((s) => s.employeeId)).toEqual(['a', 'b']);
    expect(days[0].shifts).toEqual([]);

    const capped: ShiftDay = { id: '2026-10-12', date: '2026-10-12', shifts: [{ ...templateShifts(1)[0], max: 1 }] };
    expect(buildWeek(WEEK, [capped], assignments)[1].shifts[0].staff).toHaveLength(1);
  });

  it('detects unpublished changes', () => {
    const draft = buildWeek(WEEK, [], [a('2026-10-12', 'eve', 'a')]);
    expect(hasUnpublishedChanges(undefined, draft)).toBe(true);
    expect(hasUnpublishedChanges(draft, buildWeek(WEEK, [], [a('2026-10-12', 'eve', 'a')]))).toBe(false);
    expect(hasUnpublishedChanges(draft, buildWeek(WEEK, [], [a('2026-10-12', 'eve', 'a', '16:30')]))).toBe(true);
  });

  it('finds a person\'s shifts and prints a WhatsApp text', () => {
    const days = buildWeek(WEEK, [], [a('2026-10-12', 'eve', 'a', '16:30')]);
    expect(myShifts(days, '2026-10-12', 'a')[0].start).toBe('16:30');
    expect(myShifts(days, '2026-10-12', 'b')).toEqual([]);
    const text = weekText(days, (id) => id.toUpperCase(), (d) => d.slice(8), 'closed');
    expect(text).toContain('• A 16:30');
    expect(text).toContain('closed');
  });
});
