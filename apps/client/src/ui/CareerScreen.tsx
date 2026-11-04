import { useEffect, useState } from 'react';
import { MODES } from '@trace/shared';
import type { CombatStats } from '@trace/shared/combat';
import { supabase } from '../auth/client';
import { accuracyOf, ago, kindLabel, type Progress } from '../auth/useProgress';
import { duration, headShare, outcomeClass, outcomeLabel, parseHistory, percent, type CareerMatch, type CareerPlayer } from './career';
import { Back, Chevron } from './icons';
import { RankSummary } from './Ranked';
import './career.css';

const PAGE = 20;
const FILTERS: [string, string][] = [['', 'All matches'], ['ranked', 'Ranked'], ['public', 'Quick Play'], ['private', 'Private duels'], ['ai', 'Extra Hard AI']];
const historyError = (e: { code?: string; message: string }) => ['PGRST202', '42883'].includes(e.code ?? '') ? 'Match history is not available yet. Please try again later.' : e.message;
const seconds = (pick: (s: CombatStats) => number) => (p: CareerPlayer) => p.combat ? `${pick(p.combat).toFixed(2)}s` : '—';
const STATS: [string, (p: CareerPlayer) => string][] = [['Rounds won', p => String(p.roundsWon)], ['Tracking accuracy', p => percent(p.combat)], ['Damage dealt', p => p.damage.toFixed(1)], ['Damage received', p => p.received.toFixed(1)],
  ['Headshot damage', p => p.combat ? p.combat.headDamage.toFixed(1) : '—'], ['Head tracking', seconds(s => s.headTracked)], ['Attack time', seconds(s => s.attack)], ['Successful tracking', seconds(s => s.tracked)], ['Longest streak', seconds(s => s.longest)]];

const Avatar = ({ p }: { p: CareerPlayer }) => <span className={`career-avatar${p.me ? ' me' : ''}${p.bot ? ' bot' : ''}`} aria-hidden="true">{p.bot ? 'AI' : p.name[0]}</span>;
const Side = ({ p }: { p: CareerPlayer }) => <span className={`career-side${p.me ? '' : ' them'}`}><Avatar p={p}/>
  <span className="career-who"><span className="career-name">{p.me ? 'You' : p.bot ? `${p.name} · Bot` : p.name}</span>
    <span className="career-big"><i>ACC</i>{percent(p.combat)}<i>DMG</i>{Math.round(p.damage)}</span>
    <small>HEADSHOT {headShare(p)} · STREAK {p.combat ? `${p.combat.longest.toFixed(1)}s` : '—'}</small></span></span>;

function Detail({ m }: { m: CareerMatch }) {
  return <div className="career-detail">
    <table><thead><tr><th scope="col">Match stats</th><th scope="col" className="mine">You</th><th scope="col">{m.them.name}</th></tr></thead>
      <tbody>{STATS.map(([label, format]) => <tr key={label}><th scope="row">{label}</th><td className="mine">{format(m.me)}</td><td>{format(m.them)}</td></tr>)}</tbody></table>
    <div className="career-rounds"><h3>Rounds</h3>
      {m.me.rounds.length === 0 ? <p className="note">Round details weren’t saved for this match.</p> : m.me.rounds.map(r => { const theirs = m.them.rounds.find(t => t.round === r.round);
        return <div key={r.round} className={`career-round ${r.result === 'won' ? 'win' : r.result === 'lost' ? 'loss' : 'void'}`}><b>R{r.round}</b><span><strong>{r.result === 'won' ? 'Won' : r.result === 'lost' ? 'Lost' : 'Draw'}</strong><small>{r.reason} · {r.duration.toFixed(1)}s</small></span><span className="career-dmg">{r.stats ? r.stats.damage.toFixed(0) : '—'}<i>–</i>{theirs?.stats ? theirs.stats.damage.toFixed(0) : '—'}<small>DAMAGE</small></span></div>; })}
      <p className="note">{m.reason} · {new Date(m.completedAt).toLocaleString()} · {duration(m)} · +{m.me.xp} XP{m.rank && ` · ${m.rank.delta >= 0 ? '+' : '−'}${Math.abs(m.rank.delta)} RP${m.rank.decay < 1 ? ` (repeat opponent ×${m.rank.decay})` : ''}${m.rank.multiplier > 1 && m.rank.decay === 1 ? ` (streak ×${m.rank.multiplier})` : ''}${m.rank.flagged && m.rank.delta === 0 ? ' (opponent barely played)' : ''}`}</p></div>
  </div>;
}

function Totals({ progress: p, kind }: { progress: Progress; kind: string }) {
  const stats = p.stats.filter(s => !kind || s.kind === kind), combat = p.combat.filter(c => !kind || c.kind === kind);
  const sum = <T,>(list: T[], pick: (v: T) => unknown) => list.reduce((total, v) => total + Number(pick(v) ?? 0), 0);
  const wins = sum(stats, s => s.wins), losses = sum(stats, s => s.losses), count = wins + losses;
  const cells: [string, string][] = [['Matches', String(count)], ['Wins', String(wins)], ['Losses', String(losses)], ['Win rate', count ? `${Math.round(100 * wins / count)}%` : '—'],
    ['Accuracy', accuracyOf({ kind, attack_ms: sum(combat, c => c.attack_ms), tracking_ms: sum(combat, c => c.tracking_ms), head_damage_milli: 0, longest_ms: 0 })], ['Avg damage', count ? (sum(stats, s => s.damage_milli) / 1000 / count).toFixed(0) : '—']];
  return <dl className="career-totals">{cells.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export function CareerScreen({ userId, username, progress: p, back, openAccount, leaderboard }: { userId?: string; username?: string; progress: Progress; back: () => void; openAccount: () => void; leaderboard: () => void }) {
  const [kind, setKind] = useState(''), [matches, setMatches] = useState<CareerMatch[]>([]), [more, setMore] = useState(false), [open, setOpen] = useState(''), [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const page = async (before: string | null) => {
    const result = await supabase!.rpc('match_history', { p_kind: kind || null, p_before: before, p_limit: PAGE });
    if (result.error) throw new Error(historyError(result.error));
    const list = parseHistory(result.data); setMore(Array.isArray(result.data) && result.data.length === PAGE); return list;
  };
  const failed = (e: unknown) => setError(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'Could not load match history. Check your connection and retry.');
  useEffect(() => {
    let alive = true; setMatches([]); setMore(false); setError(''); setOpen('');
    if (!userId || !supabase) return;
    setLoading(true); void page(null).then(list => { if (alive) setMatches(list); }, e => { if (alive) failed(e); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, kind, revision]);
  const loadMore = () => { setLoading(true); void page(matches.at(-1)!.completedAt).then(list => setMatches(m => [...m, ...list]), failed).finally(() => setLoading(false)); };
  const xpShare = 100 * (p.xp - p.start) / Math.max(1, p.next - p.start), shown = matches.filter(m => m.status !== 'cancelled'), wins = shown.filter(m => m.me.outcome === 'win').length;
  return <section className="wrap career" aria-label="Career">
    <div className="career-top"><span className="career-crumb"><button className="back-link" onClick={back}><Back size={16}/>BACK</button><span aria-hidden="true">//</span><b>CAREER</b></span>
      <nav className="career-tabs" aria-label="Career sections"><button aria-current="page">Match history</button><button onClick={leaderboard}>Leaderboards</button></nav></div>
    {!userId ? <div className="social-card"><p>Sign in to keep a record of your matches and compare your stats with each opponent.</p><button className="btn-primary" onClick={openAccount}>SIGN IN / ACCOUNT</button></div> :
    <div className="career-layout">
      <aside className="career-aside">
        <select className="career-filter" aria-label="Matches" value={kind} disabled={loading} onChange={e => setKind(e.target.value)}>{FILTERS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        <div className="career-card">
          <div className="career-me"><span className="career-avatar me" aria-hidden="true">{username?.[0] ?? '?'}</span><span><strong>{username}</strong><small>LEVEL {p.level} · {p.xp - p.start} / {p.next - p.start} XP</small></span></div>
          <div className="xp-bar" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={p.next - p.start} aria-valuenow={p.xp - p.start}><i style={{ width: `${xpShare}%` }}/></div>
          <h2 className="card-title">{FILTERS.find(([id]) => id === kind)![1]} · all time</h2>
          {p.rank && p.rank.wins + p.rank.losses > 0 && <div className="career-rank"><RankSummary rank={p.rank} size={56}/></div>}
          {p.error ? <p className="error">{p.error}</p> : <Totals progress={p} kind={kind}/>}
        </div>
        <button className="btn-ghost" disabled={loading} onClick={() => { setRevision(r => r + 1); p.refresh(); }}>Refresh</button>
        <p className="note">Saved for Quick Play, private duels and Extra Hard AI. Offline practice isn’t recorded.</p>
      </aside>
      <div>
        {shown.length > 0 && <div className="career-record"><p className="eyebrow">LAST {shown.length} {shown.length === 1 ? 'MATCH' : 'MATCHES'}</p><strong><span className="w">{wins}W</span> – <span className="l">{shown.length - wins}L</span></strong>
          <span className="career-ratio" aria-hidden="true"><i style={{ width: `${100 * wins / shown.length}%` }}/></span></div>}
        {error && <p className="error" role="alert">{error}</p>}
        {matches.length === 0 ? loading ? <p role="status">Loading match history…</p> : !error && <div className="social-card"><p>No saved matches yet. Finish a Quick Play match or a private duel while signed in and it will show up here.</p></div> :
        <ol className="career-list">{matches.map(m => { const expanded = open === m.id, mode = MODES[m.mode].label.split(' / ')[0];
          return <li key={m.id} className={`career-match ${outcomeClass(m)}`}>
            <button className="career-row" aria-expanded={expanded} onClick={() => setOpen(expanded ? '' : m.id)}>
              <Side p={m.me}/>
              <span className="career-score"><strong>{outcomeLabel(m)}</strong><span className="career-result"><b className={m.me.outcome === 'win' ? 'w' : ''}>{m.me.roundsWon}</b><i>–</i><b className={m.them.outcome === 'win' ? 'w' : ''}>{m.them.roundsWon}</b></span>
                <small>{kindLabel(m.kind)} · {mode} · <time dateTime={m.completedAt}>{ago(m.completedAt)}</time>{m.status === 'forfeit' && ' · Forfeit'}</small>{m.rank && <span className={`career-rp ${m.rank.delta > 0 ? 'up' : m.rank.delta < 0 ? 'down' : ''}`}>{m.rank.delta > 0 ? '+' : m.rank.delta < 0 ? '−' : '±'}{Math.abs(m.rank.delta)} RP</span>}<Chevron size={16}/></span>
              <Side p={m.them}/>
            </button>
            {expanded && <Detail m={m}/>}
          </li>; })}</ol>}
        {more && <button className="btn-ghost career-more" disabled={loading} onClick={loadMore}>{loading ? 'Loading…' : 'Load older matches'}</button>}
      </div>
    </div>}
  </section>;
}
