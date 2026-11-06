import type { CombatStats, RoundCombat } from './combat';
import type { ModeId } from './modes';
import type { Body, Input } from './index';

/** `view` is the server tick at which the client drew the opponent, used to rewind the shot target. `cancel` drops a Bow 1v1 draw without shooting. */
export type PlayerInput = Input & { seq: number; pitch: number; firing: boolean; active: boolean; view?: number; cancel?: boolean };
/** Bow 1v1 per-player state: `draw` is the charge (0–1), `raise` eases the bow up, `reload` counts down seconds. */
export type BowState = { draw: number; raise: number; reload: number; shots: number; hits: number; heads: number };
/**
 * An arrow released at tick `born` from (x, y, z) with velocity (vx, vy, vz) and `charge`: clients replay its exact flight with `arrowAt`.
 * `stuck` is where it stopped in the arena and its direction; `on` is the player it hit, with `local` offset and direction in that player's frame.
 */
export type ArrowState = { id: number; owner: string; born: number; charge: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; stuck?: [number, number, number, number, number, number]; on?: string; local?: [number, number, number, number, number, number] };
export type Game = 'bow';
/** Bow 1v1 practice bot strength. */
export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
export const isDifficulty = (value: unknown): value is Difficulty => typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
export type PlayerState = { roundStats?: CombatStats; matchStats?: CombatStats; kills?: number; maxHp?: number; bot?: boolean; connected?: boolean; registered?: boolean; id: string; name: string; wins: number; body: Body; yaw: number; pitch: number; hp: number; ready: boolean; ack: number; hit: boolean; headshot: boolean; damage: number; trackingSeconds: number; firingSeconds: number; gait?: number; bow?: BowState };
/** Ranked entries report `range`, the RP gap currently accepted (null once any opponent is allowed). */
export type QueueState = { state: 'idle' | 'searching' | 'reconnecting'; elapsedMs: number; botEligible: boolean; mode?: ModeId; ranked?: boolean; range?: number | null; serverTime: number };
export type ActionReply = { ok: boolean; error?: string };
export type Snapshot = { lastRound?: RoundCombat; resultStatus?: 'completed' | 'forfeit' | 'cancelled'; kind?: 'private' | 'public' | 'ai' | 'ranked'; matchId?: string; paused?: boolean; resultState?: 'pending' | 'saved' | 'unavailable' | 'retrying'; serverMetrics?: { skippedTicks: number; tickMs: number }; code: string; hostId: string; mode: ModeId; modeRevision: number; phase: 'lobby' | 'countdown' | 'live' | 'suddenDeath' | 'roundEnd' | 'finished'; players: PlayerState[]; winner: string | null; roundWinner: string | null; round: number; roundSerial: number; remaining: number; reason: string; tick: number; time: number; match: number; game?: Game; arrows?: ArrowState[]; practice?: Difficulty };
export type RoomReply = { ok: boolean; error?: string; snapshot?: Snapshot };
export interface ClientEvents {
  queueJoin: (mode: ModeId, reply: (result: ActionReply) => void) => void;
  rankedJoin: (reply: (result: ActionReply) => void) => void;
  queueCancel: (reply: (result: ActionReply) => void) => void;
  queueBot: (reply: (result: ActionReply) => void) => void;
  authenticate: (token: string, reply: (ok: boolean) => void) => void;
  /** Permanently deletes the token's account. Refused while that account is queued, playing or has a result still saving. */
  deleteAccount: (token: string, reply: (result: ActionReply) => void) => void;
  create: (reply: (result: RoomReply) => void) => void;
  /** A private Bow 1v1 room against an archer bot. */
  practiceBow: (difficulty: Difficulty, reply: (result: RoomReply) => void) => void;
  join: (code: string, reply: (result: RoomReply) => void) => void;
  ready: (modeRevision: number) => void;
  selectMode: (mode: ModeId | Game) => void;
  setName: (name: string) => void;
  leave: () => void;
  input: (input: PlayerInput) => void;
  pingCheck: (reply: () => void) => void;
}
export interface ServerEvents { queue: (state: QueueState) => void; seat: (id: string) => void; snapshot: (snapshot: Snapshot) => void; notice: (message: string) => void }
export const neutralInput = (seq = 0): PlayerInput => ({ seq, forward: 0, strafe: 0, yaw: 0, pitch: 0, jump: false, firing: false, active: false });

export function validateInput(value: unknown): value is PlayerInput {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.seq === 'number' && Number.isSafeInteger(v.seq) && v.seq >= 0
    && ['forward', 'strafe'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]) && Math.abs(v[k] as number) <= 1)
    && typeof v.yaw === 'number' && Number.isFinite(v.yaw) && Math.abs(v.yaw) <= Math.PI * 2
    && typeof v.pitch === 'number' && Number.isFinite(v.pitch) && Math.abs(v.pitch) <= Math.PI / 2
    && ['jump', 'firing', 'active'].every(k => typeof v[k] === 'boolean')
    && (v.view === undefined || (typeof v.view === 'number' && Number.isFinite(v.view) && v.view >= 0))
    && (v.crouch === undefined || typeof v.crouch === 'boolean')
    && (v.cancel === undefined || typeof v.cancel === 'boolean');
}
