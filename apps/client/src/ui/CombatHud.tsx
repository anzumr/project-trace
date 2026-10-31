import { useEffect, useState, useRef } from 'react';
import './combat.css';
import { accuracy, emptyCombat, type CombatStats } from '@trace/shared/combat';
import type { Snapshot } from '@trace/shared/protocol';
import type { Hud, PracticeSummary } from '../game/Engine';
import type { Settings } from './settings';
export const percent=(s:CombatStats)=>{const n=accuracy(s);return n===null?'—':`${n.toFixed(1)}%`;};
function Health({hp,max,label,enemy=false}:{hp:number;max:number;label:string;enemy?:boolean}){
  const value=Math.max(0,Math.min(100,100*hp/Math.max(1,max)));
  return <div className={`combat-health ${enemy?'enemy':'self'} ${value<=25?'critical':value<=50?'low':''}`}>
    <div className="health-heading"><strong>{label}</strong><span>{Math.ceil(hp)} / {max}</span></div>
    <div className="health-track" role="progressbar" aria-label={label} aria-valuenow={hp} aria-valuemin={0} aria-valuemax={max}><i className="health-trail" style={{width:`${value}%`}}/><i className="health-fill" style={{width:`${value}%`}}/></div>
  </div>;
}
export function CombatHud({hud,room,ownId,settings}:{hud:Hud;room:Snapshot|null;ownId?:string;settings:Settings}){
  const opponent=room?.players.find(p=>p.id!==ownId),me=room?.players.find(p=>p.id===ownId),stats=(room && !['live','suddenDeath'].includes(room.phase)?me?.roundStats:hud.combat)??emptyCombat();
  const [wave,setWave]=useState<Hud['lastWave']>(null);
  const [floating,setFloating]=useState({value:0,id:0});
  const previousDamage=useRef(stats.damage);
  useEffect(()=>{if(!hud.lastWave)return;setWave(hud.lastWave);const timer=setTimeout(()=>setWave(null),2300);return()=>clearTimeout(timer);},[hud.lastWave]);
  useEffect(()=>{const delta=stats.damage-previousDamage.current;previousDamage.current=stats.damage;if(delta>0)setFloating(f=>({value:delta,id:f.id+1}));},[stats.damage]);
  return <div className="combat-hud">
    <div className="combat-top"><Health key={room?room.roundSerial:hud.wave} hp={opponent?.hp??hud.hp} max={opponent?.maxHp??100} label={room?opponent?.name??'Waiting for opponent':`PRACTICE BOT · WAVE ${hud.wave}`} enemy/>
      <div className="combat-clock">{room?<><span>ROUND {room.round || 1} · {me?.wins??0} : {opponent?.wins??0}</span><strong>{room.paused?'RECONNECTING':room.phase==='countdown'?`START ${Math.ceil(room.remaining)}`:room.phase==='suddenDeath'?'SUDDEN DEATH':`${Math.floor(Math.ceil(room.remaining)/60)}:${String(Math.ceil(room.remaining)%60).padStart(2,'0')}`}</strong></>:<><span>{hud.circle?'MICRO ORB':'ENDLESS PRACTICE'} · {hud.speed.toFixed(2)}× SPEED</span><strong>{stats.duration.toFixed(1)}s</strong></>}</div>
    </div>
    <div className="combat-bottom"><div className="combat-readings"><span>TRACKING ACCURACY <b>{percent(stats)}</b></span><span>ROUND DAMAGE <b>{stats.damage.toFixed(1)}</b></span></div><Health key={room?.roundSerial??0} hp={me?.hp??hud.ownHp} max={me?.maxHp??100} label="YOUR HEALTH"/><small>ESC · MENU {room?'— MATCH CONTINUES':''}</small></div>
    {settings.hitMarkers && <svg className={`hit-confirm ${hud.hit?'lit':''} ${hud.headshot?'head':''}`} viewBox="0 0 64 64" style={{color:hud.headshot?'#ffc46b':settings.hitColor,opacity:hud.hit?settings.hitOpacity:0}} aria-label={hud.hit?hud.headshot?'Confirmed headshot':'Confirmed hit':'No confirmed hit'}><path d="M9 9L19 19 M45 45L55 55 M9 55L19 45 M45 19L55 9"/>{hud.headshot&&<path d="M32 1L37 6L32 11L27 6Z"/>}</svg>}
    {settings.damageNumbers && hud.hit && <span key={floating.id} className="damage-float">+{floating.value.toFixed(1)}</span>}
    {!room && wave && <div className="wave-summary" role="status"><strong>WAVE {wave.wave} CLEARED</strong><span>{percent(wave.stats)} accuracy · {wave.stats.damage.toFixed(0)} damage</span><span>{wave.stats.tracked.toFixed(2)}s tracking · {wave.stats.headDamage.toFixed(1)} head damage</span></div>}
  </div>;
}
const metrics:[string,(s:CombatStats)=>string][]=[['Tracking accuracy',percent],['Damage dealt',s=>s.damage.toFixed(1)],['Damage received',s=>s.received.toFixed(1)],['Attack time',s=>`${s.attack.toFixed(2)}s`],['Successful tracking',s=>`${s.tracked.toFixed(2)}s`],['Headshot damage',s=>s.headDamage.toFixed(1)],['Head tracking',s=>`${s.headTracked.toFixed(2)}s`],['Longest streak',s=>`${s.longest.toFixed(2)}s`]];
export function RoundResults({room,ownId,close}:{room:Snapshot;ownId?:string;close:()=>void}){
  const [totals,setTotals]=useState(false);
  const r=room.lastRound;if(!r)return null;
  const players=[...r.players].sort((a,b)=>Number(b.id===ownId)-Number(a.id===ownId));
  const shown=players.map(p=>({...p,stats:totals?room.players.find(v=>v.id===p.id)?.matchStats??p.stats:p.stats}));
  return <section className="combat-results" aria-label="Round comparison"><small>{room.phase==='finished'?'FINAL MATCH SUMMARY':'ROUND COMPLETE'} · ROUND {r.round}</small><h2>{r.winner?`${players.find(p=>p.id===r.winner)?.name} wins the round`:'Round drawn'}</h2><p>{r.reason} · {r.duration.toFixed(1)}s · Match score {players.map(p=>p.wins).join(' : ')}</p>
    {room.phase==='finished' && <div className="preset-buttons"><button onClick={()=>setTotals(false)} aria-pressed={!totals}>Last round</button><button onClick={()=>setTotals(true)} aria-pressed={totals}>Match totals</button></div>}
    <table><thead><tr><th>{totals?'Match totals':'Current round'}</th>{players.map(p=><th key={p.id}>{p.name}{p.id===ownId?' (you)':''}<small>{r.winner===null?'DRAW':r.winner===p.id?'VICTORY':'DEFEAT'}</small></th>)}</tr></thead><tbody>{metrics.map(([label,format])=><tr key={label}><th>{label}</th>{shown.map(p=><td key={p.id}>{format(p.stats)}</td>)}</tr>)}<tr><th>Remaining health</th>{players.map(p=><td key={p.id}>{p.hp.toFixed(1)}</td>)}</tr></tbody></table>
    <div className="match-totals"><strong>Match to date</strong>{room.players.map(p=><span key={p.id}>{p.name}: {percent(p.matchStats??emptyCombat())} · {p.damage.toFixed(1)} damage · {p.wins} rounds won</span>)}</div>
    {room.phase==='finished'?<><p>{room.winner?`${room.players.find(p=>p.id===room.winner)?.name} wins the match`:'Match ended'} · {room.resultState==='saved'?'Saved':room.resultState==='unavailable'?'Saving unavailable':'Saving / retrying…'}</p><button className="primary" onClick={close}>Return to match menu</button></>:<p>Next round in {Math.ceil(room.remaining)}s · Escape releases mouse</p>}
  </section>;
}
export function PracticeResults({summary,close}:{summary:PracticeSummary;close:()=>void}){
  return <section className="combat-results" aria-label="Practice session summary"><small>OFFLINE PRACTICE · SESSION COMPLETE</small><h2>{summary.waves} waves cleared</h2><p>{summary.duration.toFixed(1)}s active session · Practice does not affect PvP records</p><table><tbody>{metrics.filter(([label])=>label!=='Damage received').map(([label,format])=><tr key={label}><th>{label}</th><td>{format(summary.stats)}</td></tr>)}<tr><th>Average target elimination</th><td>{summary.average===null?'—':summary.average.toFixed(2)+'s'}</td></tr><tr><th>Best / worst wave accuracy</th><td>{summary.best===null?'—':`${summary.best.toFixed(1)}% / ${summary.worst!.toFixed(1)}%`}</td></tr></tbody></table><button className="primary" onClick={close}>Back to practice</button></section>;
}
