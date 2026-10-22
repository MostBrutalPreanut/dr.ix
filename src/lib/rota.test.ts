import { describe, expect, it } from 'vitest';
import { buildWeek, sortShifts, dayHeading, exportDays, effectiveShifts, hasUnpublishedChanges, myShifts, templateShifts, weekDates, weekText } from './rota';
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
  it('covers 7 days, orders by start time when nothing else is known, and skips unknown shifts / people', () => {
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

  });

  it('keeps the order people were added in, and lets more people than planned in', () => {
    const planned: ShiftDay = { id: '2026-10-12', date: '2026-10-12', shifts: [{ ...templateShifts(1)[0], max: 1 }] };
    const rows = [
      { ...a('2026-10-12', 'eve', 'x', '17:00'), order: 1 },
      { ...a('2026-10-12', 'eve', 'bar', '19:00'), order: 2 },
      { ...a('2026-10-12', 'eve', 'z', '16:30'), order: 3 },
    ];
    expect(buildWeek(WEEK, [planned], rows)[1].shifts[0].staff.map((s) => s.employeeId)).toEqual(['x', 'bar', 'z']);
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
    const text = weekText(days, (id) => id.toUpperCase());
    expect(text).toContain('• A 16:30');
    expect(text).toContain('שני 12.10');
    expect(text).not.toContain('ראשון'); // a closed Sunday is left out
  });

  it('puts the event name in the day heading', () => {
    const event: ShiftDay = { id: '2026-09-20', date: '2026-09-20', shifts: [{ id: 'ev-1', label: 'צביעת מיניאטורות', defaultStart: '18:00', max: 4, event: true }] };
    const days = buildWeek('2026-09-20', [event], []);
    expect(dayHeading(days[0])).toBe('ראשון 20.9 צביעת מיניאטורות');
    expect(exportDays(days).map((d) => d.date)).toContain('2026-09-20');
  });
});

describe('shift order', () => {
  it('orders by opening time: noon before evening, late event last', () => {
    const noon = { id: 'noon', from: '11:00', defaultStart: '11:00' };
    const eve = { id: 'eve', from: '17:00', defaultStart: '17:00' };
    const late = { id: 'ev-1', from: '19:00', defaultStart: '18:30' };
    expect(sortShifts([late, eve, noon]).map((s) => s.id)).toEqual(['noon', 'eve', 'ev-1']);
    const sat: ShiftDay = { id: '2026-10-17', date: '2026-10-17', shifts: [eve, noon].map((s) => ({ ...s, label: s.id, max: 8 })) };
    expect(buildWeek('2026-10-11', [sat], [])[6].shifts.map((s) => s.id)).toEqual(['noon', 'eve']);
  });
});
