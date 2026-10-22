import type { PublicEmployee } from './types';

/** Hues of the colour palette (one colour per person, like the colour coding of the paper rota). */
const HUES = [0, 28, 48, 78, 130, 165, 190, 215, 245, 275, 305, 335];
export const PALETTE_SIZE = HUES.length;

export interface PersonColor {
  background: string;
  color: string;
}

/** A saved colour: a palette index (the automatic ones) or a "#rrggbb" picked by a manager. */
export type SavedColor = number | string;

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** White or black text, whichever reads better on the colour. */
function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111' : '#fff';
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

/** The colour of a person: their picked colour, else their automatic one. */
export function personColor(id: string, saved: Record<string, SavedColor> | undefined): PersonColor {
  const v = saved?.[id];
  if (isHex(v)) return { background: v, color: textOn(v) };
  return colorStyle(typeof v === 'number' ? v : hashIndex(id));
}

/** The "#rrggbb" of a person's colour, for the colour picker. */
export function hexOf(id: string, saved: Record<string, SavedColor> | undefined): string {
  const v = saved?.[id];
  if (isHex(v)) return v.toLowerCase();
  const i = typeof v === 'number' ? v : hashIndex(id);
  const h = HUES[((i % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE];
  const [sat, light] = [0.62, 0.4];
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => Math.round(255 * (light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${[f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Gives every person without a colour the first unused one (then reuses), without touching the rest. */
export function fillColors(people: Pick<PublicEmployee, 'id'>[], saved: Record<string, SavedColor> = {}): Record<string, SavedColor> {
  const next = { ...saved };
  for (const p of people) {
    if (next[p.id] !== undefined) continue;
    const used = new Set(Object.values(next).filter((x) => typeof x === 'number'));
    let i = 0;
    while (used.has(i) && i < PALETTE_SIZE) i += 1;
    next[p.id] = i < PALETTE_SIZE ? i : hashIndex(p.id);
  }
  return next;
}
