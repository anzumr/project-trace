import { useEffect, useState } from 'react';
import { levelProgress } from '@trace/shared';
import { RANKED, divisionIndex, rankName, rankOf } from '@trace/shared/ranked';
import { supabase } from '../auth/client';
import type { PlayerRank } from '../auth/useProgress';
import { RankEmblem } from './RankEmblem';
import { Arrow } from './icons';

const top = (points: number) => divisionIndex(points) === RANKED.divisions - 1;
/** Emblem, division name, RP toward the next division and record. */
export function RankSummary({ rank, size = 88 }: { rank: PlayerRank; size?: number }) {
  const r = rankOf(rank.points), games = rank.wins + rank.losses;
  return <div className="rank-summary"><RankEmblem points={rank.points} size={size}/>
    <div><strong>{rankName(r)}</strong><span className="rank-rp">{r.points}{top(rank.points) ? '' : ' / 100'} RP</span>
      <span className="rank-bar" aria-hidden="true"><i style={{ width: `${top(rank.points) ? 100 : r.points}%` }}/></span>
      <small>{games ? `${rank.wins}W – ${rank.losses}L` : 'No ranked games yet'}{rank.streak >= 2 ? ` · ${rank.streak} win streak` : rank.streak <= -2 ? ` · ${-rank.streak} loss streak` : ''}{rank.shield > 0 ? ` · shield ${rank.shield}` : ''}</small></div>
  </div>;
}

export function RankedPanel({ rank, xp, eligible, signedIn, busy, find, openAccount }: { rank: PlayerRank | null; xp: number; eligible: boolean; signedIn: boolean; busy: boolean; find: () => void; openAccount: () => void }) {
  const level = levelProgress(xp).level, needed = 100 * (RANKED.level - 1) ** 2 - xp;
  return <section className="ranked-panel" aria-label="Ranked">
    <div className="ranked-copy"><p className="eyebrow">COMPETITIVE · STANDARD CHARACTER</p><h2>Ranked</h2>
      <p>First to {RANKED.wins} rounds with a {RANKED.summarySeconds}-second stats break between them. Win rank points to climb from Bronze 4 to Grand Masters. Streaks raise the stakes and upsets pay more.</p></div>
    {eligible && rank && <RankSummary rank={rank}/>}
    <div className="ranked-action">
      {!eligible ? <button className="btn-light" onClick={openAccount}>{signedIn ? 'Claim your username to play ranked' : 'Sign in to play ranked'}</button>
        : level < RANKED.level ? <p className="ranked-lock"><strong>Unlocks at level {RANKED.level}</strong>You're level {level}. Earn {needed} more XP in Quick Play.</p>
        : <button className="btn-primary" disabled={busy} onClick={find}><strong>FIND RANKED MATCH</strong><Arrow size={24}/></button>}
    </div>
  </section>;
}

type Change = { before: number; after: number; delta: number; multiplier: number; decay: number; flagged: boolean; won: boolean; streak: number };
/** This player's rank change for a finished ranked match; RLS returns only their own row. */
export function RankChange({ matchId, saved }: { matchId?: string; saved: boolean }) {
  const [change, setChange] = useState<Change | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    setChange(null); setFailed(false);
    if (!saved || !matchId || !supabase) return;
    let alive = true;
    void supabase.from('rank_history').select('before,after,delta,multiplier,decay,flagged,won,streak').eq('match_id', matchId).maybeSingle()
      .then(({ data, error }) => { if (alive) { if (error || !data) setFailed(true); else setChange(data); } });
    return () => { alive = false; };
  }, [matchId, saved]);
  if (!saved) return <div className="rank-change" role="status"><p>Calculating rank points…</p></div>;
  if (failed || !change) return failed ? <div className="rank-change"><p>Rank points will appear in Career once the result is saved.</p></div> : null;
  const from = rankOf(change.before), to = rankOf(change.after), moved = divisionIndex(change.after) - divisionIndex(change.before);
  const notes = [moved > 0 ? `Promoted to ${rankName(to)}` : moved < 0 ? `Demoted to ${rankName(to)}` : '',
    change.won && change.flagged && change.delta === 0 ? 'No points: your opponent barely played' : '',
    change.decay === 0 ? 'Third match against this opponent today: no points' : change.decay < 1 ? 'Repeat opponent today: half points' : '',
    change.multiplier > 1 && change.decay === 1 && change.delta !== 0 ? `${change.won ? 'Win' : 'Loss'} streak ×${change.multiplier}` : ''].filter(Boolean);
  return <div className={`rank-change ${change.delta > 0 ? 'up' : change.delta < 0 ? 'down' : ''}`} aria-label="Rank points">
    <RankEmblem points={change.after} size={72}/>
    <div><span className="rank-delta">{change.delta > 0 ? '+' : change.delta < 0 ? '−' : '±'}{Math.abs(change.delta)} RP</span>
      <strong>{rankName(from) === rankName(to) ? rankName(to) : `${rankName(from)} → ${rankName(to)}`} · {to.points} RP</strong>
      {notes.map(n => <small key={n}>{n}</small>)}</div>
  </div>;
}
