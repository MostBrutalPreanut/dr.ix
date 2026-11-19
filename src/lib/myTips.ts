import { backend, isShared } from './db';
import { rpc } from './gateway';
import { weekdayOf } from './dates';
import { monthDays } from './tips';
import type { MyShiftTips } from './tips';
import type { TipEntry, TipWorkerDoc } from './types';


/**
 * The signed-in person's own share of the tips, per tips shift with an amount, from `from` to `to` (dates, inclusive).
 * On the shared server the amounts stay manager-only: the gateway (api_my_tips) works the split out and
 * hands back nothing but this person's own share. The single-device demo computes it the same way here.
 */
export async function myTips(from: string, to: string, employeeId: string): Promise<MyShiftTips[]> {
  if (isShared) return rpc<MyShiftTips[]>('api_my_tips', { p_from: from, p_to: to });
  const range = { from, to: `${to}~` };
  const entries = (await backend.list('tipEntries', range)) as TipEntry[];
  const workers = (await backend.list('tipWorkers', range)) as TipWorkerDoc[];
  return monthDays(entries, workers, weekdayOf)
    .reverse()
    .flatMap((d) => d.shifts.filter((s) => s.total > 0 && s.shares[employeeId] !== undefined).map((s) => ({ date: d.date, shift: s.shift, amount: s.shares[employeeId] })));
}
