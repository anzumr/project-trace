import type { ModeId } from '@trace/shared';

export type MatchKind = 'private' | 'public' | 'ai';
export type MatchResult = {
  id: string; kind: MatchKind; mode: ModeId; status: 'completed' | 'forfeit' | 'cancelled';
  startedAt: string; completedAt: string; reason: string;
  players: { playerId: string; userId: string | null; name: string; bot: boolean; outcome: 'win' | 'loss' | 'cancelled'; roundsWon: number; damageMilli: number; receivedMilli: number; trackingMs: number; opportunityMs: number; playMs: number }[];
};
