export interface TipWorker {
  id: string;
  /** Reinforcement ("מתגבר") workers get a share proportional to hours worked. */
  reinforcement?: boolean;
  /** Hours worked - only used for reinforcement workers. */
  hours?: number;
}

export const FULL_SHIFT_HOURS = 8;
export const SATURDAY_FULL_SHIFT_HOURS = 14;

export function fullShiftHours(weekday: number): number {
  return weekday === 6 ? SATURDAY_FULL_SHIFT_HOURS : FULL_SHIFT_HOURS;
}

/**
 * Splits a day's tips between the workers.
 *
 * Regular workers all get an equal, full share (also on Saturday, where the noon and
 * evening crews split together). A reinforcement worker gets a share proportional to the
 * hours worked out of a full shift (8h, or 14h on Saturday). The whole amount is always
 * distributed: results are in agorot-exact amounts that add up to `total`.
 */
export function splitTips(
  total: number,
  workers: TipWorker[],
  shiftHours: number = FULL_SHIFT_HOURS,
): Record<string, number> {
  if (workers.length === 0) return {};
  if (shiftHours <= 0) throw new Error('shiftHours must be positive');

  const weights = workers.map((w) => {
    if (!w.reinforcement) return 1;
    const hours = Math.max(0, w.hours ?? shiftHours);
    return hours / shiftHours;
  });
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const totalAgorot = Math.round(total * 100);

  if (weightSum === 0) return Object.fromEntries(workers.map((w) => [w.id, 0]));

  const exact = weights.map((w) => (totalAgorot * w) / weightSum);
  const floors = exact.map(Math.floor);
  let remainder = totalAgorot - floors.reduce((a, b) => a + b, 0);

  // Largest remainder method: hand out the leftover agorot one by one.
  const order = exact
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }

  return Object.fromEntries(workers.map((w, i) => [w.id, floors[i] / 100]));
}

type EntryIn = { date: string; amount: number; shift?: string; at?: string };
type WorkerIn = { date: string; employeeId: string; shift?: string; reinforcement?: boolean; hours?: number; at?: string };

/**
 * A day is one tips shift (the main one, key ''), unless more shifts were added (not on Saturday,
 * where noon and evening share together). Every extra shift has a name, which is also its key.
 * Returns the main shift first, then the others in the order they were started.
 */
export function shiftsOf(docs: { shift?: string; at?: string }[]): string[] {
  const first = new Map<string, string>();
  for (const d of docs) {
    const key = d.shift ?? '';
    const at = d.at ?? '';
    if (key && (!first.has(key) || at < first.get(key)!)) first.set(key, at);
  }
  return ['', ...[...first.entries()].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0], 'he')).map(([k]) => k)];
}

/** id of a "worked" mark: the main shift keeps the original `${date}|${employeeId}`. */
export function tipWorkerId(date: string, shift: string, employeeId: string): string {
  return shift ? `${date}|${shift}|${employeeId}` : `${date}|${employeeId}`;
}

/** A shift name that is safe inside an id. */
export const cleanShiftName = (name: string) => name.replace(/[|~]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);

export interface ShiftTips {
  /** '' = the day's main shift */
  shift: string;
  total: number;
  workers: TipWorker[];
  /** split of the shift's total (empty when nobody is marked as working) */
  shares: Record<string, number>;
}

export interface DayTips {
  date: string;
  total: number;
  /** every shift splits its own amount between its own workers */
  shifts: ShiftTips[];
  /** what every person got that day, all shifts together */
  shares: Record<string, number>;
}

/** Tips of one business day: per shift, the sum of its entries split between the people who worked it. */
export function dayTips(date: string, entries: EntryIn[], workers: WorkerIn[], weekday: number): DayTips {
  const es = entries.filter((e) => e.date === date);
  const ws = workers.filter((w) => w.date === date);
  const shifts = shiftsOf([...es, ...ws])
    .map((shift): ShiftTips => {
      const total = Math.round(es.filter((e) => (e.shift ?? '') === shift).reduce((n, e) => n + e.amount * 100, 0)) / 100;
      const list: TipWorker[] = ws
        .filter((w) => (w.shift ?? '') === shift)
        .map((w) => ({ id: w.employeeId, reinforcement: w.reinforcement, hours: w.hours }));
      return { shift, total, workers: list, shares: splitTips(total, list, fullShiftHours(weekday)) };
    })
    // an unused main shift is left out when the day has other shifts
    .filter((s, _, all) => s.shift !== '' || all.length === 1 || s.total > 0 || s.workers.length > 0);
  const agorot: Record<string, number> = {};
  for (const s of shifts) for (const [id, v] of Object.entries(s.shares)) agorot[id] = (agorot[id] ?? 0) + Math.round(v * 100);
  const total = shifts.reduce((n, s) => n + Math.round(s.total * 100), 0) / 100;
  return { date, total, shifts, shares: Object.fromEntries(Object.entries(agorot).map(([id, a]) => [id, a / 100])) };
}

/** Every day of the given entries/workers, newest first. */
export function monthDays(
  entries: EntryIn[],
  workers: WorkerIn[],
  weekdayOf: (date: string) => number,
): DayTips[] {
  const dates = [...new Set([...entries.map((e) => e.date), ...workers.map((w) => w.date)])].sort().reverse();
  return dates.map((d) => dayTips(d, entries, workers, weekdayOf(d)));
}

/** What every person earned over the days (agorot-exact). */
export function totalsByPerson(days: DayTips[]): Record<string, number> {
  const agorot: Record<string, number> = {};
  for (const d of days) for (const [id, v] of Object.entries(d.shares)) agorot[id] = (agorot[id] ?? 0) + Math.round(v * 100);
  return Object.fromEntries(Object.entries(agorot).map(([id, a]) => [id, a / 100]));
}
