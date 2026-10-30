import { useState } from 'react';
import { MODES, type ModeId } from '@trace/shared';
import type { QueueState } from '@trace/shared/protocol';
import type { Network } from '../net/Network';

export function QuickPlay({queue,network,enabled}:{queue:QueueState;network?:Network;enabled:boolean}) {
  const [mode,setMode]=useState<ModeId>('standard'),[busy,setBusy]=useState(false),[keepSearching,setKeepSearching]=useState(false);
  const action=async(task:()=>Promise<void>)=>{setBusy(true);try{await task();}finally{setBusy(false);}};
  const seconds=Math.floor(queue.elapsedMs/1000),waiting=queue.state!=='idle';
  return <section className="quick-play"><div className="eyebrow">PUBLIC CASUAL · HUMAN 1V1</div>
    <h2>{waiting?'Finding your opponent':'Find your next duel'}</h2>
    {waiting?<><div className="queue-clock" role="timer" aria-label="Server queue time">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</div><p role="status" className="note">{queue.state==='reconnecting'?'Connection lost · search timer paused':'Searching on this server'} · {queue.mode && MODES[queue.mode].label}</p>
      {queue.botEligible && !keepSearching && <div className="bot-offer"><strong>Extra Hard AI is available</strong><p className="note">You have searched for five minutes. This opponent is a BOT. AI results stay separate from human PvP; completed AI matches award reduced XP.</p><button className="primary" disabled={busy} onClick={()=>void action(()=>network!.challengeBot())}>Challenge Extra Hard AI [BOT]</button><button className="reset" onClick={()=>setKeepSearching(true)}>Continue searching for a human</button></div>}
      {queue.botEligible && keepSearching && <button className="reset" onClick={()=>setKeepSearching(false)}>Show optional AI challenge</button>}
      <button className="reset" disabled={busy} onClick={()=>void action(()=>network!.cancelQueue())}>Cancel matchmaking</button>
    </>:<><label className="queue-mode">Character mode<select value={mode} onChange={e=>setMode(e.target.value as ModeId)}>{Object.entries(MODES).map(([id,p])=><option key={id} value={id}>{p.label}</option>)}</select></label><p className="note">Matched players use the same mode. After five minutes you may choose an AI match or keep waiting for a human.</p><button className="primary" disabled={!enabled || !network || busy} onClick={()=>{setKeepSearching(false);void action(()=>network!.findMatch(mode));}}>Quick Play / Find Match ↗</button>{!enabled&&<p className="note">Sign in and finish your username to enter public play.</p>}</>}
  </section>;
}
