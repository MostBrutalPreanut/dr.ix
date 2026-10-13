import type { PublicEmployee } from './types';

/** Hues of the colour palette (one colour per person, like the colour coding of the paper rota). */
const HUES = [0, 28, 48, 78, 130, 165, 190, 215, 245, 275, 305, 335];
export const PALETTE_SIZE = HUES.length;

export interface PersonColor {
  background: string;
  color: string;
}

export function colorStyle(index: number): PersonColor {
  const i = ((index % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE;
  return { background: `hsl(${HUES[i]} 62% 40%)`, color: '#fff' };
}

/** Stable fallback when nobody picked a colour for this person yet. */
function hashIndex(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % PALETTE_SIZE;
}

export function colorIndexOf(id: string, saved: Record<string, number> | undefined): number {
  return saved?.[id] ?? hashIndex(id);
}

/** Gives every person without a colour the first unused one (then reuses), without touching the rest. */
export function fillColors(people: Pick<PublicEmployee, 'id'>[], saved: Record<string, number> = {}): Record<string, number> {
  const next = { ...saved };
  for (const p of people) {
    if (next[p.id] !== undefined) continue;
    const used = new Set(Object.values(next));
    let i = 0;
    while (used.has(i) && i < PALETTE_SIZE) i += 1;
    next[p.id] = i < PALETTE_SIZE ? i : hashIndex(p.id);
  }
  return next;
}
