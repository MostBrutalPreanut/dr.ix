import { describe, expect, it } from 'vitest';
import { splitTips } from './tips';
import { addDays, businessDate, weekIndex, weekdayOf } from './dates';
import { dueTasks, isScheduledOn, completionId } from './schedule';
import { recommend } from './games';
import type { Game, Task, TaskCompletion } from './types';

const sum = (r: Record<string, number>) =>
  Math.round(Object.values(r).reduce((a, b) => a + b, 0) * 100) / 100;

describe('splitTips', () => {
  it('splits equally between regular workers', () => {
    const r = splitTips(1000, [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
    expect(r).toEqual({ a: 250, b: 250, c: 250, d: 250 });
  });

  it('gives a reinforcement worker a share proportional to hours (8h shift)', () => {
    // weights: 3 regular (1) + 4h/8h (0.5) = 3.5
    const r = splitTips(700, [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'x', reinforcement: true, hours: 4 }]);
    expect(r).toEqual({ a: 200, b: 200, c: 200, x: 100 });
  });

  it('uses 14 hours as a full shift on Saturday', () => {
    // weights: 2 regular + 7h/14h (0.5) = 2.5
    const r = splitTips(500, [{ id: 'a' }, { id: 'b' }, { id: 'x', reinforcement: true, hours: 7 }], 14);
    expect(r).toEqual({ a: 200, b: 200, x: 100 });
  });

  it('always distributes the full amount, to the agora', () => {
    const r = splitTips(100, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(sum(r)).toBe(100);
    const r2 = splitTips(333.33, [{ id: 'a' }, { id: 'b' }, { id: 'x', reinforcement: true, hours: 3 }]);
    expect(sum(r2)).toBe(333.33);
  });

  it('handles an empty crew', () => {
    expect(splitTips(100, [])).toEqual({});
  });
});

describe('dates', () => {
  it('counts the hours after midnight as the previous business day', () => {
    // 2026-10-01 00:30 Israel time (UTC+3 in summer time: 21:30 UTC the day before)
    expect(businessDate(new Date('2026-09-30T21:30:00Z'))).toBe('2026-09-30');
    expect(businessDate(new Date('2026-10-01T09:00:00Z'))).toBe('2026-10-01');
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('computes weekdays and week index (weeks start on Sunday)', () => {
    expect(weekdayOf('2026-10-01')).toBe(4); // Thursday
    expect(weekIndex('2026-10-01', '2026-10-01')).toBe(0);
    expect(weekIndex('2026-10-04', '2026-10-01')).toBe(1); // next Sunday
    expect(weekIndex('2026-09-26', '2026-10-01')).toBe(-1); // Saturday of previous week
  });
});

const task = (over: Partial<Task>): Task => ({
  id: 't',
  title: 'T',
  description: '',
  weekday: 1,
  everyNWeeks: 1,
  weekOffset: 0,
  active: true,
  order: 0,
  ...over,
});

describe('recurring tasks', () => {
  const anchor = '2026-09-28'; // a Monday: week A starts on Sunday 2026-09-27

  it('schedules every-two-weeks tasks only in their week', () => {
    const t = task({ everyNWeeks: 2, weekOffset: 0 });
    expect(isScheduledOn(t, '2026-09-28', anchor)).toBe(true); // week A, Monday
    expect(isScheduledOn(t, '2026-10-05', anchor)).toBe(false); // week B
    expect(isScheduledOn(t, '2026-10-12', anchor)).toBe(true); // week A again
    expect(isScheduledOn(t, '2026-09-21', anchor)).toBe(false); // week before (B)
    expect(isScheduledOn(task({ everyNWeeks: 2, weekOffset: 1 }), '2026-10-05', anchor)).toBe(true);
  });

  it('skips inactive tasks and other weekdays', () => {
    expect(isScheduledOn(task({ active: false }), '2026-09-28', anchor)).toBe(false);
    expect(isScheduledOn(task({ weekday: 2 }), '2026-09-28', anchor)).toBe(false);
  });

  it('carries unfinished tasks over as late, but drops completed ones', () => {
    const t = task({ id: 'sink', weekday: 1 });
    // Tuesday 2026-09-29: Monday's task is still open -> late
    const open = dueTasks([t], [], '2026-09-29', anchor);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ dueDate: '2026-09-28', late: true, done: false });

    const completion = (at: string): TaskCompletion[] => [
      { id: completionId('sink', '2026-09-28'), taskId: 'sink', dueDate: '2026-09-28', by: 'e', at },
    ];
    // finished on Monday itself: gone on Tuesday
    expect(dueTasks([t], completion('2026-09-28T15:00:00Z'), '2026-09-29', anchor)).toHaveLength(0);
    // ...but visible (checked) on the day itself
    expect(dueTasks([t], completion('2026-09-28T15:00:00Z'), '2026-09-28', anchor)[0]).toMatchObject({ done: true, late: false });
    // a late task ticked today stays on the list as done instead of vanishing
    const ticked = dueTasks([t], completion('2026-09-29T08:00:00Z'), '2026-09-29', anchor);
    expect(ticked).toHaveLength(1);
    expect(ticked[0]).toMatchObject({ done: true, late: true });
  });

  it('does not count days before the app went into use as missed', () => {
    const t = task({ id: 'sink', weekday: 1 });
    expect(dueTasks([t], [], '2026-09-29', anchor, '2026-09-29')).toHaveLength(0);
    expect(dueTasks([t], [], '2026-09-29', anchor, '2026-09-28')).toHaveLength(1);
  });

  it('puts late tasks before today\'s', () => {
    const a = task({ id: 'a', weekday: 1, order: 5 });
    const b = task({ id: 'b', weekday: 2, order: 1 });
    const r = dueTasks([a, b], [], '2026-09-29', anchor);
    expect(r.map((x) => x.task.id)).toEqual(['a', 'b']);
  });
});

const game = (over: Partial<Game>): Game => ({
  id: 'g',
  name: 'G',
  minPlayers: 2,
  maxPlayers: 4,
  styles: ['strategy'],
  difficulty: 'easy',
  ...over,
});

describe('recommend', () => {
  const games = [
    game({ id: '1', name: 'Splendor', maxPlayers: 4, featured: true }),
    game({ id: '2', name: 'Party', minPlayers: 3, maxPlayers: 10, styles: ['funny'] }),
    game({ id: '3', name: 'Adults', maxPlayers: 6, minAge: 16, styles: ['funny'] }),
    game({ id: '4', name: 'Hard', maxPlayers: 4, difficulty: 'hard' }),
  ];

  it('filters by group size', () => {
    expect(recommend(games, { players: 8, styles: [], difficulties: [] }).map((g) => g.id)).toEqual(['2']);
  });

  it('excludes games with a minimum age above the youngest guest, keeps unknown ones', () => {
    const r = recommend(games, { players: 4, youngestAge: 8, styles: ['funny'], difficulties: [] });
    expect(r.map((g) => g.id)).toEqual(['2']);
  });

  it('ranks games with unknown minimum age below known-suitable ones when an age is given', () => {
    const list = [
      game({ id: 'unknown', name: 'A', maxPlayers: 6 }),
      game({ id: 'known', name: 'B', maxPlayers: 6, minAge: 6 }),
    ];
    expect(recommend(list, { players: 4, youngestAge: 8, styles: [], difficulties: [] }).map((g) => g.id)).toEqual(['known', 'unknown']);
  });

  it('filters by style and difficulty and ranks featured first', () => {
    const r = recommend(games, { players: 3, styles: [], difficulties: ['easy'] });
    expect(r[0].id).toBe('1');
    expect(r.find((g) => g.id === '4')).toBeUndefined();
  });
});

import { categoriesOf, formatRestockList, isDueOn, latestReports, levelOf, moveItem, parseBulk, restockList } from './inventory';
import type { InventoryItem, InventoryReport } from './types';

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: 'i', name: 'חלב', category: 'מקרר', mode: 'status', days: [], active: true, order: 10, ...over,
});
const rep = (over: Partial<InventoryReport>): InventoryReport => ({
  id: 'r', date: '2026-10-01', itemId: 'i', by: 'e', at: '2026-10-01T10:00:00Z', ...over,
});

describe('inventory', () => {
  it('asks about an item on its days only (no days = every day, inactive = never)', () => {
    expect(isDueOn(item({}), 3)).toBe(true);
    expect(isDueOn(item({ days: [6] }), 6)).toBe(true);
    expect(isDueOn(item({ days: [6] }), 5)).toBe(false);
    expect(isDueOn(item({ active: false }), 3)).toBe(false);
  });

  it('reads the level from a status answer or a count', () => {
    expect(levelOf(item({}), rep({ level: 'low' }))).toBe('low');
    expect(levelOf(item({}), undefined)).toBeUndefined();
    const counted = item({ mode: 'count', min: 2 });
    expect(levelOf(counted, rep({ count: 0 }))).toBe('out');
    expect(levelOf(counted, rep({ count: 2 }))).toBe('low');
    expect(levelOf(counted, rep({ count: 3 }))).toBe('ok');
    expect(levelOf(item({ mode: 'count' }), rep({ count: 1 }))).toBe('ok'); // no minimum set: only 0 is a problem
    expect(levelOf(item({}), rep({ level: 'out', restocked: true }))).toBe('ok'); // bought since
  });

  it('keeps the newest answer per item', () => {
    const latest = latestReports([
      rep({ id: 'a', date: '2026-09-28', level: 'out' }),
      rep({ id: 'b', date: '2026-10-01', at: '2026-10-01T09:00:00Z', level: 'low' }),
      rep({ id: 'c', date: '2026-10-01', at: '2026-10-01T18:00:00Z', level: 'ok' }),
    ]);
    expect(latest.get('i')?.id).toBe('c');
  });

  it('builds the shopping list: out before low, never reported / fine / inactive items left out', () => {
    const items = [
      item({ id: 'a', name: 'א', order: 10 }),
      item({ id: 'b', name: 'ב', order: 20 }),
      item({ id: 'c', name: 'ג', order: 30 }),
      item({ id: 'd', name: 'ד', order: 40, active: false }),
      item({ id: 'e', name: 'ה', order: 50 }),
    ];
    const latest = latestReports([
      rep({ id: '1', itemId: 'a', level: 'low' }),
      rep({ id: '2', itemId: 'b', level: 'out', date: '2026-09-29' }),
      rep({ id: '3', itemId: 'c', level: 'ok' }),
      rep({ id: '4', itemId: 'd', level: 'out' }),
    ]);
    const lines = restockList(items, latest, '2026-10-01');
    expect(lines.map((l) => `${l.item.name}:${l.level}:${l.ageDays}`)).toEqual(['ב:out:2', 'א:low:0']);
    const text = formatRestockList(lines, '1.10');
    expect(text).toContain('• ב (נגמר)');
    expect(text).toContain('• א (מעט)');
    expect(formatRestockList([], '1.10')).toContain('אין חוסרים');
  });

  it('shows counts with their unit in the shopping list', () => {
    const it = item({ id: 'k', name: 'חביות', mode: 'count', unit: 'חביות' });
    const lines = restockList([it], latestReports([rep({ itemId: 'k', count: 0 })]), '2026-10-01');
    expect(formatRestockList(lines, 'x')).toContain('• חביות (0 חביות)');
  });

  it('orders categories by their first item and swaps neighbours', () => {
    const items = [item({ id: 'a', category: 'ב', order: 20 }), item({ id: 'b', category: 'א', order: 10 }), item({ id: 'c', category: 'ב', order: 30 })];
    expect(categoriesOf(items)).toEqual(['א', 'ב']);
    const swapped = moveItem(items, 'c', -1);
    expect(swapped.map((i) => `${i.id}:${i.order}`).sort()).toEqual(['a:30', 'c:20']);
    expect(moveItem(items, 'a', -1)).toEqual([]); // already first in its category
  });

  it('adds items from pasted lines, skipping blanks, bullets and duplicates', () => {
    let n = 0;
    const out = parseBulk('חלב\n\n - גבינה \n• קפה\nחלב', { category: 'מקרר', mode: 'status', days: [] }, [item({ name: 'קפה', order: 90 })], () => `n${++n}`);
    expect(out.map((i) => i.name)).toEqual(['חלב', 'גבינה']);
    expect(out.map((i) => i.order)).toEqual([91, 92]);
  });
});

import { dayTips, monthDays, totalsByPerson } from './tips';

describe('tips by day and month', () => {
  const entries = [
    { date: '2026-10-01', amount: 100 },
    { date: '2026-10-01', amount: 50.5 },
    { date: '2026-10-02', amount: 90 },
  ];
  const workers = [
    { date: '2026-10-01', employeeId: 'a' },
    { date: '2026-10-01', employeeId: 'b' },
    { date: '2026-10-01', employeeId: 'c', reinforcement: true, hours: 4 },
    { date: '2026-10-02', employeeId: 'a' },
  ];
  it('sums entries and splits to the agora', () => {
    const d = dayTips('2026-10-01', entries, workers, 4);
    expect(d.total).toBe(150.5);
    expect(Object.values(d.shares).reduce((n, v) => n + v, 0)).toBeCloseTo(150.5, 2);
    expect(d.shares.c).toBeLessThan(d.shares.a);
  });
  it('totals per person across days', () => {
    const days = monthDays(entries, workers, () => 4);
    expect(days.map((d) => d.date)).toEqual(['2026-10-02', '2026-10-01']);
    const t = totalsByPerson(days);
    expect(t.a).toBeCloseTo(90 + dayTips('2026-10-01', entries, workers, 4).shares.a, 2);
  });
  it('a day with tips but nobody marked has no shares', () => {
    expect(dayTips('2026-10-02', entries, [], 4).shares).toEqual({});
  });
});
