import { CONFIG } from './index';

export const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Masters', 'Grand Masters'] as const;
/** Ranked rules. `points` are total RP: 100 per division, Bronze 4 starts at 0 and Grand Masters 1 (3100+) has no cap. */
export const RANKED = { wins: 3, summarySeconds: 25, mode: 'standard', level: 5, division: 100, divisions: TIERS.length * 4,
  base: 30, scale: 800, min: 5, max: 55, shieldGames: 3, window: { start: 300, step: 150, everyMs: 15_000, openMs: 90_000 } } as const;
/** Streak multiplier by run length including this game: the 3rd straight result is the first bonus. */
export const STREAK = [1, 1, 1, 1.3, 1.45, 1.6, 1.75] as const;
export const streakMultiplier = (run: number) => STREAK[Math.max(0, Math.min(STREAK.length - 1, run))];

export type MatchRules = { wins: number; summarySeconds: number };
export const matchRules = (kind?: string): MatchRules => kind === 'ranked' ? { wins: RANKED.wins, summarySeconds: RANKED.summarySeconds } : { wins: CONFIG.winsRequired, summarySeconds: CONFIG.roundSummarySeconds };

export type Rank = { tier: number; division: number; points: number };
/** 0 = Bronze 4 … 31 = Grand Masters 1. */
export const divisionIndex = (total: number) => Math.min(RANKED.divisions - 1, Math.floor(Math.max(0, total) / RANKED.division));
export function rankOf(total: number): Rank {
  const index = divisionIndex(total);
  return { tier: Math.floor(index / 4), division: 4 - index % 4, points: Math.max(0, total) - index * RANKED.division };
}
export const rankName = (r: Rank) => `${TIERS[r.tier]} ${r.division}`;
export const expected = (me: number, opponent: number) => 1 / (1 + 10 ** ((opponent - me) / RANKED.scale));
/** Opponent rating range the ranked queue accepts after waiting this long; Infinity matches anyone. */
export const rankedWindow = (elapsedMs: number) => elapsedMs >= RANKED.window.openMs ? Infinity : RANKED.window.start + RANKED.window.step * Math.floor(Math.max(0, elapsedMs) / RANKED.window.everyMs);
/** Repeat matches against the same opponent within 24 hours: full, then half, then nothing. */
export const repeatDecay = (priorMatches: number) => priorMatches <= 0 ? 1 : priorMatches === 1 ? 0.5 : 0;

export type RankState = { points: number; streak: number; shield: number };
export type RankStep = RankState & { delta: number; multiplier: number };
/**
 * One ranked result. `streak` is signed (+wins / −losses in a row). `noGain` zeroes a win when the loser barely played.
 * Mirrored by `trace_private.rank_step` in the ranked migration; keep the two identical.
 */
export function rankStep(state: RankState, opponent: number, won: boolean, decay = 1, noGain = false): RankStep {
  const e = expected(state.points, opponent), run = won ? (state.streak > 0 ? state.streak + 1 : 1) : (state.streak < 0 ? 1 - state.streak : 1);
  const base = Math.max(RANKED.min, Math.min(RANKED.max, 2 * RANKED.base * (won ? 1 - e : e))), multiplier = streakMultiplier(run);
  const delta = won && noGain ? 0 : Math.round(base * multiplier * decay) * (won ? 1 : -1);
  let points = Math.max(0, state.points + delta);
  // The promotion shield keeps a recent promotion from being lost straight away.
  if (!won && state.shield > 0) points = Math.max(points, divisionIndex(state.points) * RANKED.division);
  const promoted = divisionIndex(points) > divisionIndex(state.points);
  // Discounted repeats and thrown wins don't build streaks, so an alt can't pump the multiplier.
  if (decay < 1 || (won && noGain)) return { points, delta: points - state.points, multiplier, streak: state.streak, shield: promoted ? RANKED.shieldGames : state.shield };
  return { points, delta: points - state.points, multiplier, streak: Math.max(-99, Math.min(99, won ? run : -run)), shield: promoted ? RANKED.shieldGames : Math.max(0, state.shield - 1) };
}
