import { isMode, type ModeId } from '@trace/shared';
import { accuracy, type CombatStats } from '@trace/shared/combat';

export type CareerRound = { round: number; result: 'won' | 'lost' | 'draw'; reason: string; duration: number; stats: CombatStats | null };
export type CareerPlayer = { name: string; me: boolean; bot: boolean; outcome: 'win' | 'loss' | 'cancelled'; roundsWon: number; damage: number; received: number; xp: number; combat: CombatStats | null; rounds: CareerRound[] };
export type CareerRank = { before: number; after: number; delta: number; multiplier: number; decay: number; flagged: boolean };
export type CareerMatch = { id: string; kind: 'public' | 'private' | 'ai' | 'ranked'; mode: ModeId; status: 'completed' | 'forfeit' | 'cancelled'; reason: string; startedAt: string; completedAt: string; me: CareerPlayer; them: CareerPlayer; rank: CareerRank | null };

type Raw = Record<string, unknown>;
const object = (v: unknown): Raw | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : null;
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : 0;
const text = (v: unknown) => typeof v === 'string' ? v : '';
const STAT_KEYS = ['attack', 'tracked', 'damage', 'received', 'headDamage', 'headTracked', 'streak', 'longest', 'duration'] as const;
/** Matches saved before combat stats existed have none; never invent zeros for them. */
function stats(v: unknown): CombatStats | null {
  const s = object(v);
  return s && STAT_KEYS.every(k => typeof s[k] === 'number' && Number.isFinite(s[k])) ? Object.fromEntries(STAT_KEYS.map(k => [k, s[k]])) as CombatStats : null;
}
function player(v: unknown): CareerPlayer | null {
  const p = object(v); if (!p) return null;
  const id = text(p.id), outcome = ['win', 'loss', 'cancelled'].includes(p.outcome as string) ? p.outcome as CareerPlayer['outcome'] : 'cancelled';
  // Each player's saved rounds hold only their own stats; `winner` is a player ID.
  const rounds = (Array.isArray(p.rounds) ? p.rounds : []).flatMap(v => { const r = object(v); return r ? [{ round: number(r.round), result: r.winner === id ? 'won' as const : typeof r.winner === 'string' ? 'lost' as const : 'draw' as const, reason: text(r.reason), duration: number(r.duration), stats: stats((Array.isArray(r.players) ? r.players : []).map(object).find(v => v?.id === id)?.stats) }] : []; });
  return { name: text(p.name) || 'Unknown', me: p.me === true, bot: p.bot === true, outcome, roundsWon: number(p.rounds_won), damage: number(p.damage_milli) / 1000, received: number(p.received_milli) / 1000, xp: number(p.xp), combat: stats(p.combat), rounds };
}
function rank(v: unknown): CareerRank | null {
  const r = object(v);
  return r ? { before: number(r.before), after: number(r.after), delta: number(r.delta), multiplier: number(r.multiplier) || 1, decay: typeof r.decay === 'number' ? r.decay : 1, flagged: r.flagged === true } : null;
}
/** Normalizes `match_history` rows; anything malformed is dropped rather than shown wrong. */
export function parseHistory(value: unknown): CareerMatch[] {
  return (Array.isArray(value) ? value : []).flatMap(v => {
    const m = object(v), players = Array.isArray(m?.players) ? m.players.map(player) : [];
    const me = players.find(p => p?.me), them = players.find(p => p && !p.me);
    if (!m || !me || !them || !['public', 'private', 'ai', 'ranked'].includes(m.kind as string) || !isMode(m.mode) || !['completed', 'forfeit', 'cancelled'].includes(m.status as string)) return [];
    return [{ id: text(m.id), kind: m.kind as CareerMatch['kind'], mode: m.mode, status: m.status as CareerMatch['status'], reason: text(m.reason), startedAt: text(m.started_at), completedAt: text(m.completed_at), me, them, rank: rank(m.rank) }];
  });
}
export const percent = (s: CombatStats | null) => { const a = s ? accuracy(s) : null; return a === null ? '—' : `${a.toFixed(1)}%`; };
/** Share of damage dealt to the head. */
export const headShare = (p: CareerPlayer) => p.combat && p.combat.damage > 0 ? `${Math.round(100 * p.combat.headDamage / p.combat.damage)}%` : '—';
export const outcomeLabel = (m: CareerMatch) => m.status === 'cancelled' ? 'CANCELLED' : m.me.outcome === 'win' ? 'VICTORY' : 'DEFEAT';
export const outcomeClass = (m: CareerMatch) => m.status === 'cancelled' ? 'void' : m.me.outcome === 'win' ? 'win' : 'loss';
export function duration(m: CareerMatch) {
  const seconds = Math.max(0, Math.round((Date.parse(m.completedAt) - Date.parse(m.startedAt)) / 1000));
  return Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—';
}
