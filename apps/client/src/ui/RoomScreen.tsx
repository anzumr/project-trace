import { CONFIG, MODES, type ModeId } from '@trace/shared';
import type { Game, PlayerState, Snapshot } from '@trace/shared/protocol';
import { BOW } from '@trace/shared/bow';
import { ModePicker, damageNote, bowNote } from './ModePicker';
import { matchMessage } from './MatchStatus';
import { matchRules } from '@trace/shared/ranked';
import { Arrow } from './icons';
import { RankChange } from './Ranked';

function PlayerCard({ player, me, inMatch, bow }: { player?: PlayerState; me?: boolean; inMatch: boolean; bow?: boolean }) {
  if (!player) return <section className="player-card waiting" aria-label="Opponent"><span className="avatar">?</span><span className="role">OPPONENT</span><strong>Waiting…</strong><small>Share the room code</small></section>;
  const chip = player.connected === false ? <span className="ready-chip warn">RECONNECTING</span> : inMatch ? null : player.ready ? <span className="ready-chip on">READY</span> : <span className="ready-chip">NOT READY</span>;
  return <section className={`player-card${me ? ' me' : ''}`} aria-label={me ? 'You' : 'Opponent'}>
    <span className="avatar">{player.name[0]}</span><span className="role">{me ? 'YOU' : 'OPPONENT'}</span><strong>{player.name}</strong>
    <small>{player.bot ? 'BOT' : player.registered ? 'Account' : 'Guest'} · {player.wins} {bow ? (player.wins === 1 ? 'kill' : 'kills') : `${player.wins === 1 ? 'round' : 'rounds'} won`}</small>{chip}
  </section>;
}

export function RoomScreen({ room, me, opponent, enter, ready, leave, choose }: { room: Snapshot; me?: PlayerState; opponent?: PlayerState; enter: () => void; ready: () => void; leave: () => void; choose: (mode: ModeId | Game) => void }) {
  const bow = room.game === 'bow';
  const inMatch = !['lobby', 'finished'].includes(room.phase), finished = room.phase === 'finished', seconds = Math.ceil(room.remaining);
  const kind = room.practice ? `BOW PRACTICE · ${room.practice.toUpperCase()} BOT` : room.kind === 'ai' ? 'EXTRA HARD AI · BOT MATCH' : room.kind === 'public' ? 'QUICK PLAY · PUBLIC MATCH' : room.kind === 'ranked' ? 'RANKED MATCH' : 'PRIVATE ROOM', closed = room.kind === 'ai' || room.kind === 'ranked';
  const title = finished ? room.resultStatus === 'cancelled' ? 'Match cancelled' : room.winner ? room.winner === me?.id ? 'Victory' : 'Defeat' : 'Draw'
    : inMatch ? 'Match in progress' : room.practice ? 'Bow practice' : room.kind === 'private' ? room.players.length < 2 ? 'Waiting for opponent' : 'Ready up' : 'Match found';
  const saved = room.practice ? 'Practice is not recorded.' : bow ? 'Bow 1v1 results are not saved yet.' : room.resultStatus === 'cancelled' ? 'No wins or XP awarded.' : room.resultState === 'saved' ? 'Result saved to your account.' : room.resultState === 'pending' ? 'Saving result…' : room.resultState === 'retrying' ? 'Result save delayed — the server will retry.' : 'Persistent results are unavailable on this server.';
  const readyLabel = room.practice ? (finished ? 'PLAY AGAIN' : 'START PRACTICE') : me?.ready ? 'WAITING FOR OPPONENT…' : finished ? closed ? 'MATCH COMPLETE' : 'APPROVE MODE & REMATCH' : room.kind === 'ranked' ? 'READY' : 'APPROVE MODE & READY';
  return <section className="versus wrap" aria-label="Match lobby">
    <p className="eyebrow">{room.practice ? kind : `${kind} · ${bow ? 'BOW 1V1' : MODES[room.mode].label.toUpperCase()}`}</p>
    <h1 className="display" style={finished && room.winner === me?.id ? { color: 'var(--accent)' } : undefined}>{title}</h1>
    {room.kind === 'private' && !room.practice && !inMatch && <div className="room-code"><span className="eyebrow">SHARE THIS ROOM CODE</span><strong>{room.code}</strong></div>}
    <div className="versus-row">
      <PlayerCard player={me} me inMatch={inMatch} bow={bow}/>
      <div className="ring" role={room.phase === 'countdown' ? 'timer' : undefined}>
        <svg viewBox="0 0 280 280" aria-hidden="true"><circle cx="140" cy="140" r="120" fill="none" stroke="#1a212b" strokeWidth="8"/>{room.phase === 'countdown' && <circle cx="140" cy="140" r="120" fill="none" stroke="var(--accent)" strokeWidth="8" strokeDasharray={`${754 * room.remaining / CONFIG.countdownSeconds} 754`} transform="rotate(-90 140 140)"/>}</svg>
        {room.phase === 'countdown' ? <span><small>STARTING IN</small><strong>{seconds}</strong></span>
          : inMatch && bow ? <span><small>FIRST TO {BOW.kills} · KILLS</small><strong className="clock">{me?.wins ?? 0} – {opponent?.wins ?? 0}</strong></span>
          : inMatch ? <span><small>ROUND {room.round || 1} · {me?.wins ?? 0} – {opponent?.wins ?? 0}</small><strong className="clock">{room.phase === 'live' ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : room.phase === 'suddenDeath' ? 'SD' : '—'}</strong></span>
          : <span className="vs">VS</span>}
      </div>
      <PlayerCard player={opponent} inMatch={inMatch} bow={bow}/>
    </div>
    {finished && room.kind === 'ranked' && room.resultStatus !== 'cancelled' && <RankChange matchId={room.matchId} saved={room.resultState === 'saved'}/>}
    {finished ? <div className="result-lines"><span>{room.reason}</span><span>{saved}</span>{bow ? <span>Kills {me?.wins ?? 0} · arrows hit {me?.bow?.hits ?? 0}/{me?.bow?.shots ?? 0} · headshots {me?.bow?.heads ?? 0}</span> : <span>Damage dealt {me?.damage.toFixed(1)} · tracking {me?.trackingSeconds.toFixed(2)} s · on-target firing {me && me.firingSeconds > 0 ? `${(100 * me.trackingSeconds / me.firingSeconds).toFixed(1)}%` : '—'}</span>}</div>
      : inMatch && <p className="status-line" role="status">{matchMessage(room)}. Escape releases your mouse; the match keeps running.</p>}
    {!inMatch && room.practice ? <div className="chips" style={{ marginTop: 24 }}><span className="chip">FIRST TO {BOW.kills} KILLS</span><span className="chip">{room.practice.toUpperCase()} ARCHER BOT</span><span className="chip">NOT RECORDED</span><span className="chip">{bowNote.toUpperCase()}</span></div>
      : !inMatch ? <ModePicker room={room} ownId={me?.id} choose={choose}/>
      : bow ? <div className="chips" style={{ marginTop: 24 }}><span className="chip">FIRST TO {BOW.kills} KILLS</span><span className="chip">NO TIME LIMIT</span><span className="chip">{bowNote.toUpperCase()}</span></div>
      : <div className="chips" style={{ marginTop: 24 }}><span className="chip">BEST OF {matchRules(room.kind).wins * 2 - 1}</span><span className="chip">{CONFIG.roundSeconds}-SECOND ROUNDS</span><span className="chip">{damageNote.toUpperCase()}</span></div>}
    <div className="room-actions">
      {inMatch ? <button className="btn-primary" onClick={enter}><strong>ENTER DUEL</strong><Arrow size={24}/></button>
        : <button className="btn-primary" disabled={room.paused || room.players.length !== 2 || room.players.some(p=>p.connected===false) || me?.ready || (closed && finished)} onClick={ready}><strong>{readyLabel}</strong><Arrow size={24}/></button>}
      <button className="btn-ghost" onClick={leave}>Leave room</button>
    </div>
  </section>;
}
