import { backend, seedIfEmpty } from '../lib/db';
import { seedChecklists } from './checklists';
import { seedInventory } from './inventory';
import { seedGames } from './games';
import { seedSettings, seedTasks } from './tasks';
import { seedHandbook } from '../lib/handbook';

/**
 * Writes the starting content (handbook, games, checklists, tasks, settings) of every
 * collection that has never been used. Runs when a manager signs in, so that employees who
 * open a screen first never see it empty.
 */
export async function seedAll(): Promise<void> {
  const jobs: Array<[string, () => Promise<{ id: string }[]> | { id: string }[]]> = [
    ['handbook', seedHandbook],
    ['games', seedGames],
    ['checklists', seedChecklists],
    ['tasks', seedTasks],
    ['settings', seedSettings],
    ['inventoryItems', seedInventory],
  ];
  for (const [name, seed] of jobs) {
    await seedIfEmpty(name, await backend.list(name), seed);
  }
}
