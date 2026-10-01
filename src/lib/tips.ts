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

export interface DayTips {
  date: string;
  total: number;
  workers: TipWorker[];
  /** split of the day's total (empty when nobody is marked as working) */
  shares: Record<string, number>;
}

/** Tips of one business day: sum of the entries, split between the people who worked. */
export function dayTips(
  date: string,
  entries: { date: string; amount: number }[],
  workers: { date: string; employeeId: string; reinforcement?: boolean; hours?: number }[],
  weekday: number,
): DayTips {
  const total = Math.round(entries.filter((e) => e.date === date).reduce((n, e) => n + e.amount * 100, 0)) / 100;
  const list: TipWorker[] = workers
    .filter((w) => w.date === date)
    .map((w) => ({ id: w.employeeId, reinforcement: w.reinforcement, hours: w.hours }));
  return { date, total, workers: list, shares: splitTips(total, list, fullShiftHours(weekday)) };
}

/** Every day of the given entries/workers, newest first. */
export function monthDays(
  entries: { date: string; amount: number }[],
  workers: { date: string; employeeId: string; reinforcement?: boolean; hours?: number }[],
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
