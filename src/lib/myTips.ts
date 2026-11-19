import { backend, isShared } from './db';
import { rpc } from './gateway';
import { weekdayOf } from './dates';
import { monthDays } from './tips';
import type { MyDayTips } from './tips';
import type { TipEntry, TipWorkerDoc } from './types';


/**
 * The signed-in person's own share of the tips, per business day from `from` to `to` (dates, inclusive).
 * On the shared server the amounts stay manager-only: the gateway (api_my_tips) works the split out and
 * hands back nothing but this person's own share. The single-device demo computes it the same way here.
 */
export async function myTips(from: string, to: string, employeeId: string): Promise<MyDayTips[]> {
  if (isShared) return rpc<MyDayTips[]>('api_my_tips', { p_from: from, p_to: to });
  const range = { from, to: `${to}~` };
  const entries = (await backend.list('tipEntries', range)) as TipEntry[];
  const workers = (await backend.list('tipWorkers', range)) as TipWorkerDoc[];
  return monthDays(entries, workers, weekdayOf)
    .filter((d) => d.shares[employeeId] !== undefined)
    .map((d) => ({ date: d.date, amount: d.shares[employeeId] }))
    .reverse();
}
