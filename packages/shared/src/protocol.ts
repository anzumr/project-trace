import type { CombatStats, RoundCombat } from './combat';
import type { ModeId } from './modes';
import type { Body, Input } from './index';

export type PlayerInput = Input & { seq: number; pitch: number; firing: boolean; active: boolean };
export type PlayerState = { roundStats?: CombatStats; matchStats?: CombatStats; kills?: number; maxHp?: number; bot?: boolean; connected?: boolean; registered?: boolean; id: string; name: string; wins: number; body: Body; yaw: number; pitch: number; hp: number; ready: boolean; ack: number; hit: boolean; headshot: boolean; damage: number; trackingSeconds: number; firingSeconds: number };
export type QueueState = { state: 'idle' | 'searching' | 'reconnecting'; elapsedMs: number; botEligible: boolean; mode?: ModeId; serverTime: number };
export type ActionReply = { ok: boolean; error?: string };
export type Snapshot = { lastRound?: RoundCombat; resultStatus?: 'completed' | 'forfeit' | 'cancelled'; kind?: 'private' | 'public' | 'ai'; matchId?: string; paused?: boolean; resultState?: 'pending' | 'saved' | 'unavailable' | 'retrying'; serverMetrics?: { skippedTicks: number; tickMs: number }; code: string; hostId: string; mode: ModeId; modeRevision: number; phase: 'lobby' | 'countdown' | 'live' | 'suddenDeath' | 'roundEnd' | 'finished'; players: PlayerState[]; winner: string | null; roundWinner: string | null; round: number; roundSerial: number; remaining: number; reason: string; tick: number; time: number; match: number };
export type RoomReply = { ok: boolean; error?: string; snapshot?: Snapshot };
export interface ClientEvents {
  queueJoin: (mode: ModeId, reply: (result: ActionReply) => void) => void;
  queueCancel: (reply: (result: ActionReply) => void) => void;
  queueBot: (reply: (result: ActionReply) => void) => void;
  authenticate: (token: string, reply: (ok: boolean) => void) => void;
  create: (reply: (result: RoomReply) => void) => void;
  join: (code: string, reply: (result: RoomReply) => void) => void;
  ready: (modeRevision: number) => void;
  selectMode: (mode: ModeId) => void;
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
    && ['jump', 'firing', 'active'].every(k => typeof v[k] === 'boolean');
}
