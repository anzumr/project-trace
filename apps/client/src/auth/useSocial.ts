import { useCallback, useEffect, useState } from 'react';
import { supabase } from './client';

export type Friend = { user_id: string; username: string; accepted: boolean; incoming: boolean };
export type Invite = { user_id: string; username: string; room_code: string; expires_at: string };
type SocialState = { friends: Friend[]; invites: Invite[] };
const empty: SocialState = { friends: [], invites: [] };
export const socialError = (error: { code?: string; message: string }) => ['PGRST202','42883'].includes(error.code ?? '') ? 'Social features are not available yet. Please try again later.' : error.message;

export function useSocial(userId?: string) {
  const [state,setState]=useState<{owner?:string;data:SocialState}>({data:empty}),[error,setError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(r=>r+1),[]);
  useEffect(()=>{
    setError('');
    if(!userId || !supabase){setState({data:empty});setLoading(false);return;}
    let alive=true,running=false;
    const fetch=async()=>{
      if(running)return;running=true;setLoading(true);
      try{
        const result=await supabase!.rpc('social_state');
        if(!alive)return;
        if(result.error)setError(socialError(result.error));
        else{setState({owner:userId,data:result.data as SocialState});setError('');}
      }catch{if(alive)setError('Could not load friends. Check your connection.');}
      finally{running=false;if(alive)setLoading(false);}
    };
    void fetch();const timer=setInterval(()=>{if(!document.hidden)void fetch();},15000);
    return()=>{alive=false;clearInterval(timer);};
  },[userId,revision]);
  const action=async(action:string,target?:string,username?:string,code?:string)=>{
    if(!supabase || !userId)throw new Error('Sign in and claim a username first.');
    const result=await supabase.rpc('social_action',{p_action:action,p_target:target??null,p_username:username??null,p_code:code??null});
    if(result.error)throw new Error(socialError(result.error));
    refresh();
  };
  const data=state.owner===userId?state.data:empty;
  return {...data,error,loading,refresh,action,count:data.friends.filter(f=>!f.accepted&&f.incoming).length+data.invites.filter(i=>Date.parse(i.expires_at)>Date.now()).length};
}
export type Social = ReturnType<typeof useSocial>;
