import { useState } from 'react';
import { MODES } from '@trace/shared';
import type { QueueState } from '@trace/shared/protocol';
import type { Network } from '../net/Network';
import { Controls } from './HomeScreen';
import type { Keybinds } from './settings';

export function QueueScreen({queue,network,keys}:{queue:QueueState;network?:Network;keys:Keybinds}) {
  const [busy,setBusy]=useState(false),[keepSearching,setKeepSearching]=useState(false);
  const action=async(task:()=>Promise<void>)=>{setBusy(true);try{await task();}finally{setBusy(false);}};
  const seconds=Math.floor(queue.elapsedMs/1000),reconnecting=queue.state==='reconnecting';
  return <section className="versus wrap" aria-label="Matchmaking">
    <p className="eyebrow">{queue.ranked ? 'RANKED · STANDARD' : <>QUICK PLAY{queue.mode && ` · ${MODES[queue.mode].label.toUpperCase()}`}</>}</p>
    <h1 className="display">{reconnecting?'Reconnecting':'Finding your opponent'}</h1>
    <div className="ring" role="timer" aria-label="Server queue time" style={{marginTop:36}}>
      <svg viewBox="0 0 280 280" aria-hidden="true"><circle cx="140" cy="140" r="120" fill="none" stroke="#1a212b" strokeWidth="8"/>{!reconnecting && <circle className="spin" cx="140" cy="140" r="120" fill="none" stroke="var(--accent)" strokeWidth="8" strokeDasharray="160 754"/>}</svg>
      <span><small>{reconnecting?'PAUSED':'SEARCHING'}</small><strong className="clock">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</strong></span>
    </div>
    <p role="status" className="status-line">{reconnecting?'Connection lost · search timer paused':queue.ranked?queue.range==null?'Searching all ranks':`Searching within ${queue.range} RP of your rank`:'Searching for a human opponent on this server'}</p>
    {queue.botEligible && !keepSearching && <div className="bot-offer"><strong>EXTRA HARD AI IS AVAILABLE</strong><p>You have searched for five minutes. This opponent is a BOT. AI results stay separate from human PvP, and completed AI matches award reduced XP.</p><button className="btn-primary" disabled={busy} onClick={()=>void action(()=>network!.challengeBot())}><strong>CHALLENGE EXTRA HARD AI [BOT]</strong></button><button className="link-button" onClick={()=>setKeepSearching(true)}>Continue searching for a human</button></div>}
    {queue.botEligible && keepSearching && <button className="link-button" onClick={()=>setKeepSearching(false)}>Show optional AI challenge</button>}
    {queue.ranked ? <p className="note" style={{marginTop:8}}>The search widens every 15 seconds and opens to every rank after 90 seconds. Ranked never uses AI opponents.</p>
      : !queue.botEligible && <p className="note" style={{marginTop:8}}>After five minutes you can choose an AI match or keep waiting for a human.</p>}
    <div className="room-actions"><button className="btn-ghost" disabled={busy} onClick={()=>void action(()=>network!.cancelQueue())}>Cancel matchmaking</button></div>
    <div style={{marginTop:40}}><Controls keys={keys}/></div>
  </section>;
}
