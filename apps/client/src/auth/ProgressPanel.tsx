import { useEffect, useState } from 'react';
import { supabase } from './client';
import { levelProgress } from '@trace/shared';

type Stat = {kind:string;wins:number;losses:number;damage_milli:number;tracking_ms:number;opportunity_ms:number;play_ms:number};
type Combat = {kind:string;attack_ms:number;tracking_ms:number;head_damage_milli:number;longest_ms:number};
type History = {outcome:string;xp:number;rounds_won:number;match_results:{kind:string;mode:string;completed_at:string;status:string}};
export function ProgressPanel({userId}:{userId:string}){
  const [combat,setCombat]=useState<Combat[]>([]);
  const [xp,setXp]=useState(0),[stats,setStats]=useState<Stat[]>([]),[history,setHistory]=useState<History[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  useEffect(()=>{let alive=true;setLoading(true);setError('');void(async()=>{
    const [progress,statistics,matches,combatStats]=await Promise.all([
      supabase!.from('player_progress').select('total_xp').eq('user_id',userId).maybeSingle(),
      supabase!.from('player_stats').select('kind,wins,losses,damage_milli,tracking_ms,opportunity_ms,play_ms').eq('user_id',userId),
      supabase!.from('match_results').select('kind,mode,completed_at,status,match_participants!inner(outcome,xp,rounds_won)').order('completed_at',{ascending:false}).limit(10),
      supabase!.from('player_combat_stats').select('kind,attack_ms,tracking_ms,head_damage_milli,longest_ms').eq('user_id',userId),
    ]);
    if(!alive)return;
    if(progress.error||statistics.error||matches.error)setError('Saved progress could not load. Check your connection and try again.');
    else{setCombat(combatStats.data??[]);setXp(Number(progress.data?.total_xp??0));setStats(statistics.data??[]);setHistory((matches.data??[]).flatMap(m=>m.match_participants.map(p=>({...p,match_results:m}))) as History[]);}
    setLoading(false);
  })();return()=>{alive=false;};},[userId,revision]);
  const {level,start,next}=levelProgress(xp);
  return <section className="progress-panel"><h2>Saved progress</h2>{loading?<p role="status">Loading progress…</p>:error?<p className="error" role="alert">{error}</p>:<>
    <div className="level-line"><strong>Level {level}</strong><span>{xp} XP</span></div><progress max={next-start} value={xp-start}/><p className="note">{next-xp} XP to level {level+1}. Public and AI results are counted separately.</p>
    {(['public','ai','private'] as const).map(kind=>{const c=combat.find(c=>c.kind===kind),s=stats.find(s=>s.kind===kind),count=Number(s?.wins??0)+Number(s?.losses??0);return <div className="stat-card" key={kind}><strong>{kind==='public'?'Human PvP':kind==='ai'?'AI challenges':'Private duels'}</strong><div>{s?.wins??0} wins · {s?.losses??0} losses · {count?`${Math.round(Number(s!.wins)/count*100)}%`:'—'} win rate</div><small>Attack accuracy {Number(c?.attack_ms)>0?`${Math.min(100,Number(c!.tracking_ms)/Number(c!.attack_ms)*100).toFixed(1)}%`:'—'} (new matches) · Avg damage {count?(Number(s!.damage_milli)/1000/count).toFixed(1):'—'} · {Math.floor(Number(s?.play_ms??0)/60000)} min played</small></div>;})}
    <h3>Recent matches</h3>{history.length===0?<p className="note">Your completed matches will appear here.</p>:history.map((h,i)=><div className="history-row" key={i}><strong>{h.match_results.kind==='ai'?'AI [BOT]':h.match_results.kind==='public'?'Human PvP':'Private'} · {h.outcome}</strong><small>{h.match_results.mode} · {h.rounds_won} rounds won · +{h.xp} XP · {new Date(h.match_results.completed_at).toLocaleString()}</small></div>)}
  </>}<button className="reset" disabled={loading} onClick={()=>setRevision(r=>r+1)}>Refresh saved progress</button></section>;
}
