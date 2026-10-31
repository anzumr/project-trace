import { useEffect, useState, useRef } from 'react';
import './combat.css';
import { CONFIG } from '@trace/shared';
import { accuracy, emptyCombat, type CombatStats } from '@trace/shared/combat';
import { PRACTICE } from '@trace/shared/practice';
import type { Snapshot } from '@trace/shared/protocol';
import type { Hud, PracticeSummary } from '../game/Engine';
import type { Settings } from './settings';
import { Arrow } from './icons';
export const percent=(s:CombatStats)=>{const n=accuracy(s);return n===null?'—':`${n.toFixed(1)}%`;};
/** Four short diagonal ticks around an open centre, so the marker never covers the target. */
export const MARKER='M2.5 2.5L8.5 8.5M21.5 2.5L15.5 8.5M2.5 21.5L8.5 15.5M21.5 21.5L15.5 15.5';
const ORB_WAVE=PRACTICE.circleAfterShrinks*2+1;
const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
function Health({hp,max,label,sub,self=false}:{hp:number;max:number;label:string;sub?:string;self?:boolean}){
  const value=Math.max(0,Math.min(100,100*hp/Math.max(1,max)));
  return <div className={`combat-health hud-panel${self?` self ${value<=25?'critical':value<=50?'low':''}`:''}`}>
    <div className="health-head"><span><strong>{label}</strong>{sub&&<em>{sub}</em>}</span><span className="hp">{Math.ceil(hp)}<small> / {max}</small></span></div>
    <div className="health-track" role="progressbar" aria-label={label} aria-valuenow={hp} aria-valuemin={0} aria-valuemax={max}><i className="health-trail" style={{width:`${value}%`}}/><i className="health-fill" style={{width:`${value}%`}}/></div>
  </div>;
}
function centerMessage(room:Snapshot,locked:boolean):{big?:string;text?:string;sub?:string}|null{
  if(room.paused)return null;
  if(room.phase==='countdown')return {big:String(Math.ceil(room.remaining)),sub:`ROUND ${room.round} · GET READY`};
  if(room.phase==='live' && room.remaining>CONFIG.roundSeconds-1)return {big:'GO'};
  if(room.phase==='suddenDeath' && room.remaining>CONFIG.suddenDeathSeconds-1.5)return {text:'SUDDEN DEATH',sub:'FIRST CONFIRMED HIT WINS'};
  if(locked && (room.phase==='lobby' || room.phase==='finished'))return {text:'WAITING',sub:'YOUR MOUSE IS CAPTURED · WAITING FOR OPPONENT TO READY'};
  return null;
}
export function CombatHud({hud,room,ownId,settings}:{hud:Hud;room:Snapshot|null;ownId?:string;settings:Settings}){
  const opponent=room?.players.find(p=>p.id!==ownId),me=room?.players.find(p=>p.id===ownId),stats=(room && !['live','suddenDeath'].includes(room.phase)?me?.roundStats:hud.combat)??emptyCombat();
  const [wave,setWave]=useState<Hud['lastWave']>(null);
  const [floating,setFloating]=useState({value:0,id:0});
  const previousDamage=useRef(stats.damage);
  useEffect(()=>{if(!hud.lastWave)return;setWave(hud.lastWave);const timer=setTimeout(()=>setWave(null),2300);return()=>clearTimeout(timer);},[hud.lastWave]);
  useEffect(()=>{const delta=stats.damage-previousDamage.current;previousDamage.current=stats.damage;if(delta>0)setFloating(f=>({value:delta,id:f.id+1}));},[stats.damage]);
  const message=room && centerMessage(room,hud.locked);
  const pips=(wins:number)=><span className="pips">{Array.from({length:CONFIG.winsRequired},(_,i)=><i key={i} className={i<wins?'won':''}/>)}</span>;
  return <div className="combat-hud">
    <div className="hud-meta"><span>FPS {Math.round(hud.fps)}</span><span>{room?`PING ${Math.round(hud.ping)} MS`:'OFFLINE PRACTICE'}</span></div>
    <section className="hud-top" aria-label={room?'Opponent and round':'Practice target'}>
      {room?<Health key={room.roundSerial} hp={opponent?.hp??CONFIG.hp} max={opponent?.maxHp??100} label={opponent?.name??'Waiting for opponent'} sub={opponent?(opponent.bot?'BOT':opponent.registered?'ACCOUNT':'GUEST'):undefined}/>
        :<Health key={hud.wave} hp={hud.hp} max={100} label="PRACTICE BOT" sub={`WAVE ${hud.wave}`}/>}
      {room?<div className="hud-clock hud-panel">{pips(me?.wins??0)}<span className="clock" role="timer"><strong>{room.paused?'PAUSED':room.phase==='countdown'?clock(CONFIG.roundSeconds):room.phase==='suddenDeath'?'SUDDEN DEATH':clock(Math.ceil(room.remaining))}</strong><small>ROUND {room.round || 1} · {me?.wins??0} – {opponent?.wins??0}</small></span>{pips(opponent?.wins??0)}</div>
        :<div className="hud-chips"><span className="hud-panel">{hud.speed.toFixed(2)}× SPEED</span><span className="hud-panel">{hud.circle?'MICRO-ORB':`${hud.size.toFixed(2)}× SIZE`}</span><span className="hud-panel">{hud.wave>=ORB_WAVE?'MAX DIFFICULTY':hud.wave%2?'NEXT: FASTER':'NEXT: SMALLER'}</span></div>}
    </section>
    <section className="hud-stats hud-panel" aria-label="Statistics"><span>ACCURACY</span><b>{percent(stats)}</b><span>{room?'ROUND DAMAGE':'WAVE DAMAGE'}</span><b>{stats.damage.toFixed(1)}</b><span>STREAK</span><b>{stats.streak.toFixed(1)}s</b></section>
    {!room && wave && <section className="wave-toast hud-panel" role="status"><strong>WAVE {wave.wave} CLEARED</strong><span>{percent(wave.stats)} accuracy · {wave.stats.duration.toFixed(2)} s</span><span>{wave.stats.tracked.toFixed(2)} s tracking · {wave.stats.headDamage.toFixed(1)} head damage</span></section>}
    <div className="hud-bottom">{room?<Health key={room.roundSerial} hp={me?.hp??hud.ownHp} max={me?.maxHp??100} label="YOUR HEALTH" self/>
      :<section className="wave-progress hud-panel" aria-label="Practice progression"><div><span>WAVE {hud.wave}</span><span>{hud.wave>=ORB_WAVE?'MICRO-ORB · ENDLESS':`MICRO-ORB AT WAVE ${ORB_WAVE}`}</span></div><div className="wave-track">{Array.from({length:ORB_WAVE},(_,i)=><i key={i} className={i<hud.wave-1?'done':i===hud.wave-1?'now':''}/>)}</div></section>}</div>
    {message && <div className="center-message" role="status">{message.big?<strong>{message.big}</strong>:<strong className="text">{message.text}</strong>}{message.sub&&<span>{message.sub}</span>}</div>}
    <span className="hud-hint">{room?'ESC · MENU — MATCH KEEPS RUNNING':'ESC · PAUSE OR END SESSION'}</span>
    {settings.hitMarkers && <svg className={`hit-confirm ${hud.hit?'lit':''} ${hud.headshot?'head':''}`} viewBox="0 0 24 24" style={{color:hud.headshot?'#ffc46b':settings.hitColor,opacity:hud.hit?settings.hitOpacity:0}} aria-label={hud.hit?hud.headshot?'Confirmed headshot':'Confirmed hit':'No confirmed hit'}>{['outline','tick'].map(layer=><g key={layer} className={layer}><path d={MARKER}/>{hud.headshot&&<path d="M12 .8L13.6 2.4L12 4L10.4 2.4Z"/>}</g>)}</svg>}
    {settings.damageNumbers && hud.hit && <span key={floating.id} className="damage-float">+{floating.value.toFixed(1)}</span>}
  </div>;
}
const metrics:[string,(s:CombatStats)=>string][]=[['Tracking accuracy',percent],['Damage dealt',s=>s.damage.toFixed(1)],['Damage received',s=>s.received.toFixed(1)],['Attack time',s=>`${s.attack.toFixed(2)}s`],['Successful tracking',s=>`${s.tracked.toFixed(2)}s`],['Headshot damage',s=>s.headDamage.toFixed(1)],['Head tracking',s=>`${s.headTracked.toFixed(2)}s`],['Longest streak',s=>`${s.longest.toFixed(2)}s`]];
export function RoundResults({room,ownId,close}:{room:Snapshot;ownId?:string;close:()=>void}){
  const [totals,setTotals]=useState(false);
  const r=room.lastRound;if(!r)return null;
  const players=[...r.players].sort((a,b)=>Number(b.id===ownId)-Number(a.id===ownId));
  const shown=players.map(p=>({...p,stats:totals?room.players.find(v=>v.id===p.id)?.matchStats??p.stats:p.stats}));
  const finished=room.phase==='finished',winner=finished?room.winner:r.winner;
  const outcome=finished && room.resultStatus==='cancelled'?'MATCH CANCELLED':winner?winner===ownId?'VICTORY':'DEFEAT':'DRAW';
  const [mine,theirs]=players;
  return <div className="results-overlay"><section className="results" aria-label="Round comparison">
    <p className="eyebrow">{finished?'FINAL MATCH SUMMARY':`ROUND ${r.round} COMPLETE`}</p>
    <h1 className={outcome==='VICTORY'?'win':''}>{outcome}</h1>
    <p>{r.reason} · {r.duration.toFixed(1)} s</p>
    <div className="score-row"><span><small>YOU</small><b>{mine?.name}</b></span><strong>{mine?.wins??0} <i>–</i> {theirs?.wins??0}</strong><span><small>OPPONENT</small><b>{theirs?.name}</b></span></div>
    <div className="segmented" role="group" aria-label="Statistics range"><button aria-pressed={!totals} onClick={()=>setTotals(false)}>THIS ROUND</button><button aria-pressed={totals} onClick={()=>setTotals(true)}>MATCH TOTALS</button></div>
    <table><thead><tr><th scope="col">{totals?'MATCH TOTALS':`ROUND ${r.round}`}</th>{shown.map(p=><th scope="col" key={p.id}>{(totals?finished && room.winner===p.id:r.winner===p.id)&&<span className="tag">WIN</span>}{p.id===ownId?'You':p.name}</th>)}</tr></thead>
      <tbody>{metrics.map(([label,format])=><tr key={label}><th scope="row">{label}</th>{shown.map(p=><td key={p.id} className={p.id===ownId?'mine':''}>{format(p.stats)}</td>)}</tr>)}<tr><th scope="row">Remaining health</th>{players.map(p=><td key={p.id} className={p.id===ownId?'mine':''}>{p.hp.toFixed(1)}</td>)}</tr></tbody></table>
    {finished?<div className="final"><p>{room.winner?`${room.players.find(p=>p.id===room.winner)?.name} wins the match`:'Match ended'} · {room.resultState==='saved'?'Saved':room.resultState==='unavailable'?'Saving unavailable':'Saving / retrying…'}</p><button className="btn-primary" onClick={close}><strong>RETURN TO MATCH MENU</strong><Arrow size={24}/></button></div>
      :<div className="next-row"><span>NEXT ROUND IN {Math.ceil(room.remaining)}</span><span className="bar" role="progressbar" aria-label="Time until next round" aria-valuemin={0} aria-valuemax={CONFIG.roundSummarySeconds} aria-valuenow={CONFIG.roundSummarySeconds-room.remaining}><i style={{width:`${100*(1-room.remaining/CONFIG.roundSummarySeconds)}%`}}/></span><small>ESC releases the mouse</small></div>}
  </section></div>;
}
export function PracticeResults({summary,close,again}:{summary:PracticeSummary;close:()=>void;again:()=>void}){
  return <div className="results-overlay"><section className="results" aria-label="Practice session summary">
    <p className="eyebrow">OFFLINE PRACTICE · SESSION COMPLETE</p><h1 className="long">PRACTICE COMPLETE</h1>
    <p>{summary.waves} {summary.waves===1?'wave':'waves'} cleared · {summary.duration.toFixed(1)} s active · practice does not affect PvP records</p>
    <table><thead><tr><th scope="col">SESSION</th><th scope="col">You</th></tr></thead><tbody>
      {metrics.filter(([label])=>label!=='Damage received').map(([label,format])=><tr key={label}><th scope="row">{label}</th><td className="mine">{format(summary.stats)}</td></tr>)}
      <tr><th scope="row">Average target elimination</th><td className="mine">{summary.average===null?'—':summary.average.toFixed(2)+'s'}</td></tr>
      <tr><th scope="row">Best / worst wave accuracy</th><td className="mine">{summary.best===null?'—':`${summary.best.toFixed(1)}% / ${summary.worst!.toFixed(1)}%`}</td></tr>
    </tbody></table>
    <div className="actions"><button className="btn-primary" onClick={again}><strong>PLAY AGAIN</strong><Arrow size={24}/></button><button className="btn-ghost" onClick={close}>Back to menu</button></div>
  </section></div>;
}
