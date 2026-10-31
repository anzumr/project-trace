import { accuracyOf, ago, kindLabel, type Progress } from './useProgress';

export function ProgressPanel({progress:p}:{progress:Progress}){
  return <section className="card progress-panel" aria-busy={p.loading}><h2 className="card-title">SAVED PROGRESS</h2>{p.loading?<p role="status" className="note">Loading progress…</p>:p.error?<p className="error" role="alert">{p.error}</p>:<>
    <div className="level-row"><strong>LVL {p.level}</strong><span>{p.xp - p.start} / {p.next - p.start} XP</span></div>
    <div className="xp-bar" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={p.next-p.start} aria-valuenow={p.xp-p.start}><i style={{width:`${100*(p.xp-p.start)/Math.max(1,p.next-p.start)}%`}}/></div>
    <p className="note" style={{margin:'10px 0 12px'}}>{p.next-p.xp} XP to level {p.level+1} · {p.xp} XP total. Quick Play, AI and private results are counted separately.</p>
    {(['public','ai','private'] as const).map(kind=>{const c=p.combat.find(c=>c.kind===kind),s=p.stats.find(s=>s.kind===kind),count=Number(s?.wins??0)+Number(s?.losses??0);return <div className="kind-row" key={kind}><strong>{kindLabel(kind).toUpperCase()}</strong><div>{s?.wins??0} wins · {s?.losses??0} losses · {count?`${Math.round(Number(s!.wins)/count*100)}%`:'—'} win rate</div><small>Attack accuracy {accuracyOf(c)} (new matches) · Avg damage {count?(Number(s!.damage_milli)/1000/count).toFixed(1):'—'} · {Math.floor(Number(s?.play_ms??0)/60000)} min played</small></div>;})}
    <h3>RECENT MATCHES</h3>{p.history.length===0?<p className="note">Your completed matches will appear here.</p>:p.history.map((h,i)=><div className="match-row" key={i}><span className={`tag${h.outcome==='win'?'':' muted'}`}>{h.outcome.toUpperCase()}</span><span><strong>{kindLabel(h.match_results.kind)}{h.match_results.kind==='ai'?' [BOT]':''}</strong><small>{h.match_results.mode} · {h.rounds_won} rounds won · +{h.xp} XP</small></span><time dateTime={h.match_results.completed_at}>{ago(h.match_results.completed_at)}</time></div>)}
  </>}<button className="link-button" disabled={p.loading} onClick={p.refresh}>Refresh saved progress</button></section>;
}
