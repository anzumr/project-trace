import type { Snapshot } from '@trace/shared/protocol';
import { CONFIG } from '@trace/shared';

export function matchMessage(room: Snapshot) {
  if (room.paused) return 'Match paused · waiting for reconnection (20-second grace)';
  if (room.phase === 'lobby') return 'Waiting for both players';
  if (room.phase === 'countdown') return `Round ${room.round} starts in ${Math.ceil(room.remaining)}`;
  if (room.phase === 'suddenDeath') return 'Sudden death — first hit wins';
  if (room.phase === 'roundEnd') return room.roundWinner ? `${room.players.find(p => p.id === room.roundWinner)?.name ?? 'Player'} wins the round` : 'Draw — replaying round';
  if (room.phase === 'finished') return room.players.some(p => p.ready) ? 'Waiting for rematch' : 'Match complete';
  return room.remaining > CONFIG.roundSeconds - 1 ? 'GO' : `Round ${room.round} is live`;
}
export function MatchStatus({ room, locked }: { room: Snapshot; locked: boolean }) {
  const seconds = Math.ceil(room.remaining);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return <>
    {room.paused && <div className="network-warning" role="status">{matchMessage(room)}</div>}
    <div className="match-score"><small>FIRST TO {CONFIG.winsRequired} · ROUND {room.round || 1}/{CONFIG.winsRequired * 2 - 1}</small><div>{room.players.map(p => <span key={p.id}><span className="score-name">{p.name}</span><b>{p.wins}</b></span>)}</div><strong>{room.phase === 'live' || room.phase === 'suddenDeath' ? clock : room.phase === 'countdown' ? `STARTS IN ${seconds}` : room.phase === 'roundEnd' ? `NEXT IN ${seconds}` : room.phase.toUpperCase()}</strong></div>
    {locked && (room.phase !== 'live' || room.remaining > CONFIG.roundSeconds - 1) && <div className={`match-message ${room.phase}`}><strong>{room.phase === 'countdown' ? seconds : matchMessage(room)}</strong><span>{room.phase === 'roundEnd' ? room.reason : room.phase === 'countdown' ? `ROUND ${room.round} · GET READY` : room.phase === 'lobby' || room.phase === 'finished' ? 'Your mouse is captured. Waiting for opponent to ready.' : room.phase === 'suddenDeath' ? `${CONFIG.suddenDeathSeconds} seconds · simultaneous hits replay the round` : ''}</span></div>}
  </>;
}
