import type { Difficulty, Game, GameStyle } from './types';

export interface GameQuery {
  players: number;
  /** Age of the youngest guest, if known. */
  youngestAge?: number;
  /** Empty = any style. */
  styles: GameStyle[];
  /** Empty = any difficulty. */
  difficulties: Difficulty[];
}

const DIFFICULTY_RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

export function matchesQuery(game: Game, q: GameQuery): boolean {
  if (q.players < game.minPlayers || q.players > game.maxPlayers) return false;
  // Unknown minimum age never excludes a game - the staff can still see the missing data.
  if (q.youngestAge !== undefined && game.minAge !== undefined && game.minAge > q.youngestAge) {
    return false;
  }
  if (q.styles.length > 0 && !game.styles.some((s) => q.styles.includes(s))) return false;
  if (q.difficulties.length > 0 && !q.difficulties.includes(game.difficulty)) return false;
  return true;
}

function score(game: Game, q: GameQuery): number {
  let s = 0;
  if (game.featured) s += 3;
  // Prefer games that suit the group size well rather than ones stretched to their limit.
  const span = Math.max(1, game.maxPlayers - game.minPlayers);
  const middle = game.minPlayers + span / 2;
  s -= Math.abs(q.players - middle) / (span + 4);
  // When the youngest guest's age is given, games with a known suitable minimum age come before
  // games whose age was never entered (the staff must check those themselves).
  if (q.youngestAge !== undefined && game.minAge === undefined) s -= 2;
  // Easier games are quicker to teach - break ties in their favour.
  s -= DIFFICULTY_RANK[game.difficulty] * 0.3;
  // Games that match more of the requested styles come first.
  s += game.styles.filter((st) => q.styles.includes(st)).length * 0.5;
  return s;
}

/** Ranked matches (best first). Use slice() for "more suggestions". */
export function recommend(games: Game[], q: GameQuery): Game[] {
  return games
    .filter((g) => matchesQuery(g, q))
    .map((g) => ({ g, s: score(g, q) }))
    .sort((a, b) => b.s - a.s || a.g.name.localeCompare(b.g.name, 'he'))
    .map((x) => x.g);
}
