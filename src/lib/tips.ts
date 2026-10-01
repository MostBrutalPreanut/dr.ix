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
