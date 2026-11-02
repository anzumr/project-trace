import { useState } from 'react';
import type { Snapshot } from '@trace/shared/protocol';
import type { Network } from '../net/Network';
import type { Friend, Invite, Social } from '../auth/useSocial';
import { Back } from './icons';

export function SocialScreen({social,signedIn,network,room,blocked,back,openAccount,joined}:{social:Social;signedIn:boolean;network?:Network;room:Snapshot|null;blocked:boolean;back:()=>void;openAccount:()=>void;joined:()=>void}){
  const [name,setName]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const run=async(fn:()=>Promise<void>,success:string)=>{setBusy(true);setError('');setMessage('');try{await fn();setMessage(success);}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}};
  const canInvite=!blocked && (!room || (room.kind==='private' && room.phase==='lobby' && room.players.length===1 && room.hostId===network?.id));
  const invite=async(friend:Friend)=>{
    if(!network)throw new Error('Game connection unavailable.');
    const lobby=network.snapshot??await network.room();
    if(!lobby)throw new Error('Could not create a room. Please try again.');
    if(lobby.kind!=='private' || lobby.phase!=='lobby' || lobby.players.length!==1)throw new Error('Your room is no longer available for an invitation.');
    await social.action('invite',friend.user_id,undefined,lobby.code);
  };
  const join=async(invite:Invite)=>{
    if(Date.parse(invite.expires_at)<=Date.now())throw new Error('This invitation has expired. Ask your friend for a new one.');
    if(!network || network.snapshot)throw new Error('Leave your current room before joining an invitation.');
    if(!await network.room(invite.room_code))throw new Error('Could not join. The room may have closed, filled up or started.');
    joined();
    await social.action('dismiss',invite.user_id);
  };
  const friends=social.friends.filter(f=>f.accepted),requests=social.friends.filter(f=>!f.accepted),invites=social.invites.filter(i=>Date.parse(i.expires_at)>Date.now());
  return <section className="wrap social"><button className="back-link" onClick={back}><Back size={16}/>BACK</button><div className="page-head"><h1 className="display">Friends</h1><p>Add players by username, then invite them to a private duel.</p></div>
    {!signedIn?<div className="social-card"><p>Sign in and claim a username to add friends and receive invitations.</p><button className="btn-primary" onClick={openAccount}>SIGN IN / ACCOUNT</button></div>:<>
      <form className="social-add" onSubmit={e=>{e.preventDefault();void run(async()=>{await social.action('request',undefined,name.trim());setName('');},'Friend request sent.');}}><label htmlFor="friend-name">Add by exact username</label><div><input id="friend-name" className="text-input" value={name} onChange={e=>setName(e.target.value)} minLength={3} maxLength={16} pattern="[A-Za-z0-9_]{3,16}" required placeholder="Player username" autoComplete="off"/><button className="btn-primary" disabled={busy}>SEND REQUEST</button></div></form>
      <div className="social-toolbar"><span>Requests and invitations refresh every 15 seconds.</span><button className="link-button" disabled={social.loading} onClick={social.refresh}>Refresh friends</button>{room && <button className="link-button" onClick={back}>Return to room {room.code}</button>}</div>
      {(error||social.error)&&<p className="error" role="alert">{error||social.error}</p>}{message&&<p role="status">{message}</p>}
      <div className="social-grid"><div className="social-card"><h2>Duel invitations <small>{invites.length}</small></h2>{invites.length===0?<p>No invitations yet.</p>:invites.map(i=><div className="social-row" key={i.user_id}><div><strong>{i.username}</strong><small>Private duel · expires {new Date(i.expires_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small></div><div className="social-actions"><button disabled={busy||blocked||!!room} onClick={()=>void run(()=>join(i),'Joined duel.')}>Join duel</button><button disabled={busy} onClick={()=>void run(()=>social.action('dismiss',i.user_id),'Invitation dismissed.')}>Dismiss</button></div></div>)}{(room||blocked)&&<p className="note">Leave your room, queue or practice session before joining an invitation.</p>}
        <h2>Requests <small>{requests.length}</small></h2>{requests.length===0?<p>No pending requests.</p>:requests.map(f=><div className="social-row" key={f.user_id}><div><strong>{f.username}</strong><small>{f.incoming?'Wants to be your friend':'Request sent'}</small></div><div className="social-actions">{f.incoming&&<button disabled={busy} onClick={()=>void run(()=>social.action('accept',f.user_id),'Friend added.')}>Accept</button>}<button disabled={busy} onClick={()=>void run(()=>social.action('remove',f.user_id),'Request removed.')}>{f.incoming?'Decline':'Cancel'}</button></div></div>)}</div>
        <div className="social-card"><h2>Your friends <small>{friends.length}</small></h2>{friends.length===0?<p>Add a player above to start your friends list.</p>:friends.map(f=><div className="social-row" key={f.user_id}><strong>{f.username}</strong><div className="social-actions"><button disabled={busy||!canInvite} onClick={()=>void run(()=>invite(f),`Invitation sent to ${f.username}. Return to your room to wait for them.`)}>Invite to duel</button><button disabled={busy} onClick={()=>void run(()=>social.action('remove',f.user_id),'Friend removed.')}>Remove</button></div></div>)}<p className="note">Inviting creates a private room, or uses your empty lobby. Invitations last 10 minutes. Private duels have their own leaderboard.</p>{!canInvite&&<p className="note">Finish or leave your current activity before inviting a friend.</p>}</div></div>
    </>}
  </section>;
}
