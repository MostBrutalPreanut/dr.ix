import { backend } from './db';
import { addDays } from './dates';
import { KEEP_DAYS } from './inventory';
import type { InventoryReport } from './types';

const MARK = 'drix:purged:inventory';

/**
 * Deletes stock answers (and their photos) older than KEEP_DAYS. Runs at most once a day per device,
 * from the screens of the people who manage the stock. Photos are found through their answer
 * (same id), so the pictures themselves are never downloaded.
 */
export async function purgeOldInventory(today: string): Promise<void> {
  try {
    if (localStorage.getItem(MARK) === today) return;
  } catch {
    // no storage - just run
  }
  // ids are `${date}|${itemId}`, so everything before the oldest kept date sorts below it
  const old = (await backend.list('inventoryReports', { from: '', to: addDays(today, -KEEP_DAYS) })) as InventoryReport[];
  // the photo goes first: if that fails, the answer stays and points to it for the next try
  const drop = async (r: InventoryReport) => {
    if (r.photo) await backend.remove('inventoryPhotos', r.id);
    await backend.remove('inventoryReports', r.id);
  };
  for (let i = 0; i < old.length; i += 10) await Promise.all(old.slice(i, i + 10).map(drop));
  try {
    localStorage.setItem(MARK, today);
  } catch {
    // fine - it will check again next time
  }
}
