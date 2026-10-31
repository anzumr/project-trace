import { useCallback, useEffect, useState } from 'react';
import { supabase } from './client';
import { levelProgress } from '@trace/shared';

export type Stat = {kind:string;wins:number;losses:number;damage_milli:number;tracking_ms:number;opportunity_ms:number;play_ms:number};
export type Combat = {kind:string;attack_ms:number;tracking_ms:number;head_damage_milli:number;longest_ms:number};
export type History = {outcome:string;xp:number;rounds_won:number;match_results:{kind:string;mode:string;completed_at:string;status:string}};

/** Saved account progress, fetched once and shared by the menu, top bar and account screen. */
export function useProgress(userId?: string) {
  const [combat,setCombat]=useState<Combat[]>([]);
  const [xp,setXp]=useState(0),[stats,setStats]=useState<Stat[]>([]),[history,setHistory]=useState<History[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
  useEffect(()=>{
    if(!userId || !supabase){setXp(0);setStats([]);setCombat([]);setHistory([]);setError('');setLoading(false);return;}
    let alive=true;setLoading(true);setError('');void(async()=>{
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
  const refresh=useCallback(()=>setRevision(r=>r+1),[]);
  return {signedIn:!!userId,...levelProgress(xp),stats,combat,history,error,loading,refresh};
}
export type Progress = ReturnType<typeof useProgress>;
export const accuracyOf=(c?:Combat)=>Number(c?.attack_ms)>0?`${Math.min(100,Number(c!.tracking_ms)/Number(c!.attack_ms)*100).toFixed(1)}%`:'—';
export const kindLabel=(kind:string)=>kind==='ai'?'Extra Hard AI':kind==='public'?'Quick Play':'Private duel';
export function ago(iso:string){
  const minutes=Math.max(0,Math.round((Date.now()-new Date(iso).getTime())/60000));
  return minutes<60?`${Math.max(1,minutes)}m ago`:minutes<1440?`${Math.round(minutes/60)}h ago`:minutes<2880?'Yesterday':new Date(iso).toLocaleDateString();
}
