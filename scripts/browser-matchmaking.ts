// Two actual Chrome contexts, the real React/Three client and Socket.IO server,
// with fixture authentication and real embedded PostgreSQL persistence.
// Default mode is isolated. --live uses two temporary QA accounts in configured Supabase.
// Their accounts/progress are deleted afterward; QA match audit rows remain.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { mkdtemp, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { PGlite } from '@electric-sql/pglite';
import { createGameServer } from '../apps/server/src/server';
import { BOT_WAIT_MS } from '../apps/server/src/Matchmaking';

const live=process.argv.includes('--live');
if(live)await import('../apps/server/src/env');
const providerUrl=live?process.env.SUPABASE_URL!:'https://trace-browser.test';
const publicKey=live?process.env.SUPABASE_PUBLISHABLE_KEY!:'fixture-public-key';
if(live && (!providerUrl || !publicKey || !process.env.SUPABASE_SECRET_KEY))throw new Error('Live test requires configured root .env keys.');
const liveSessions:Session[]=[],createdUsers:string[]=[];
let admin:SupabaseClient|undefined;
const runId=randomBytes(4).toString('hex');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const names=['BrowserAlpha','BrowserBeta'];
const tokens=ids.map(sub=>`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture`);
const directory=await mkdtemp(join(tmpdir(),'trace-browser-'));
const db=new PGlite();let browser:Browser|undefined,vite:ViteDevServer|undefined,server:ReturnType<typeof createGameServer>|undefined;
let clockOffset=0;
const pages:Page[]=[],errors:string[]=[];
const until=async(check:()=>boolean|Promise<boolean>,timeout=45000)=>{const start=Date.now();while(!await check()){if(Date.now()-start>timeout)throw new Error('Browser acceptance check timed out');await new Promise(r=>setTimeout(r,50));}};
try{
  if(live){
    admin=createClient(providerUrl,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    for(let i=0;i<2;i++){
      const email=`trace-addon-${runId}-${i}@example.invalid`,password=randomBytes(24).toString('base64url');
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_run:runId}});
      if(created.error || !created.data.user)throw new Error('Could not create temporary QA account: '+(created.error?.code??'unknown'));
      ids[i]=created.data.user.id;createdUsers.push(ids[i]);names[i]=`QA_${runId}_${i}`;
      const player=createClient(providerUrl,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
      const signed=await player.auth.signInWithPassword({email,password});if(signed.error || !signed.data.session)throw new Error('QA password sign-in failed.');
      liveSessions.push(signed.data.session);tokens[i]=signed.data.session.access_token;
      const claimed=await player.rpc('claim_username',{p_username:names[i]});if(claimed.error)throw new Error('QA username claim failed: '+claimed.error.code);
    }
    console.log('Live mode: temporary QA accounts authenticated and usernames claimed. Credentials are kept in memory.');
  }else{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
  for(const name of ['202610270001_accounts.sql','202610280001_match_results.sql'])await db.exec(await readFile(resolve('supabase/migrations',name),'utf8'));
  for(let i=0;i<2;i++){await db.query('insert into auth.users values($1,now())',[ids[i]]);await db.query('insert into public.profiles(user_id,username_display) values($1,$2)',[ids[i],names[i]]);}
  }
  process.env.ALLOWED_ORIGINS='http://127.0.0.1:4187';
  server=createGameServer({outboxDirectory:directory,queueClock:()=>performance.now()+clockOffset,
    verifyIdentity:live?undefined:async token=>{const i=tokens.indexOf(token);if(i<0)throw new Error('Invalid test identity');return{userId:ids[i],username:names[i],expiresAt:Date.now()+3600000};},
    resultSink:live?undefined:async result=>{await db.transaction(async tx=>{await tx.exec('set local role service_role');await tx.query('select public.record_match($1::jsonb)',[JSON.stringify(result)]);});},
  });
  await server.outbox.ready;
  await new Promise<void>(r=>server!.http.listen(0,'127.0.0.1',r));
  const backend=`http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
  vite=await createViteServer({configFile:false,root:resolve('apps/client'),envDir:false,
    define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(providerUrl),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify(publicKey)},
    server:{host:'127.0.0.1',port:4187,strictPort:true,proxy:{'/socket.io':{target:backend,ws:true}}},
    plugins:[{name:'test-only-engine-access',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/game/Engine.ts'))return code.replace('this.settings = settings;', 'this.settings = settings; (window as any).__traceEngine = this;');}}],
  });await vite.listen();
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
  for(let i=0;i<2;i++){
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const session=live?liveSessions[i]:{access_token:tokens[i],refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:ids[i],aud:'authenticated',role:'authenticated',email:`player${i}@example.invalid`,email_confirmed_at:'2026-10-28T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-28T00:00:00Z'}};
    await context.addInitScript(({session,key})=>{localStorage.setItem(key,JSON.stringify(session));localStorage.setItem('trace.settings',JSON.stringify({graphics:'competitive',frameCap:60,renderScale:0.5}));},{session,key:`sb-${new URL(providerUrl).hostname.split('.')[0]}-auth-token`});
    if(!live)await context.route('https://trace-browser.test/**',async route=>{
      const path=new URL(route.request().url()).pathname;let data:unknown=[];
      if(path==='/rest/v1/profiles')data=(await db.query('select * from public.profiles where user_id=$1',[ids[i]])).rows;
      else if(path==='/rest/v1/player_progress')data=(await db.query('select * from public.player_progress where user_id=$1',[ids[i]])).rows;
      else if(path==='/rest/v1/player_stats')data=(await db.query('select * from public.player_stats where user_id=$1',[ids[i]])).rows;
      else if(path==='/rest/v1/match_results')data=(await db.query(`select m.kind,m.mode,m.completed_at,m.status,json_build_array(json_build_object('outcome',p.outcome,'xp',p.xp,'rounds_won',p.rounds_won)) as match_participants from public.match_results m join public.match_participants p on m.id=p.match_id where p.user_id=$1 order by m.completed_at desc limit 10`,[ids[i]])).rows;
      else if(path==='/auth/v1/user')data=session.user;
      else throw new Error('Unexpected fixture provider request: '+path);
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    });
    const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4187');
    await page.getByRole('button',{name:names[i],exact:true}).waitFor();
  }
  const [a,b]=pages;
  const matchCount=async()=>{
    if(!live)return (await db.query('select * from public.match_results')).rows.length;
    const {data,error}=await admin!.from('match_participants').select('match_id').in('user_id',ids);
    if(error)throw new Error('Cannot read QA match history.');return new Set(data.map(p=>p.match_id)).size;
  };
  const totalXP=async(id:string)=>{
    if(!live)return (await db.query<{total_xp:number}>('select total_xp from public.player_progress where user_id=$1',[id])).rows[0].total_xp;
    const {data,error}=await admin!.from('player_progress').select('total_xp').eq('user_id',id).single();if(error)throw new Error('Cannot read QA XP.');return Number(data.total_xp);
  };

  await a.getByRole('button',{name:/Quick Play/}).click();await a.getByRole('button',{name:'Cancel matchmaking',exact:true}).waitFor();
  await a.getByRole('button',{name:'Cancel matchmaking',exact:true}).click();await a.getByRole('button',{name:/Quick Play/}).waitFor();assert.equal(server.rooms.size,0);
  await a.getByRole('button',{name:/Quick Play/}).click();await b.getByRole('button',{name:/Quick Play/}).click();
  await a.getByText('PUBLIC HUMAN MATCH',{exact:true}).waitFor();await b.getByText('PUBLIC HUMAN MATCH',{exact:true}).waitFor();assert.equal(server.rooms.size,1);
  const room=[...server.rooms.values()][0], originalIds=[...room.players.keys()];
  // Exercise real transport disconnect and page-reload recovery, not an injected seat update.
  await b.evaluate(()=>{const e=(window as any).__traceEngine;e.network.socket.io.reconnection(false);e.network.socket.io.engine.close();});
  await until(()=>room.paused);await a.getByText(/Match paused · waiting/).first().waitFor();
  await b.reload();await b.getByText('PUBLIC HUMAN MATCH',{exact:true}).waitFor();await until(()=>!room.paused);assert.deepEqual([...room.players.keys()],originalIds);
  console.log('PASS: two Chrome contexts match, cancel, pause and restore the same seats after reload.');
  // Test-only scripted inputs travel through each browser's real Engine prediction/send loop.
  // No server HP/positions/outcomes are edited. B crosses into the clear lane; A tracks it.
  for(let i=0;i<2;i++)await pages[i].evaluate(index=>{
    const e=(window as any).__traceEngine;
    e.input=()=>{const s=e.network.snapshot,me=s?.players.find((p:any)=>p.id===e.network.id),other=s?.players.find((p:any)=>p.id!==e.network.id);let yaw=index? -Math.PI:0,pitch=0,strafe=0;
      if(me&&other){if(index===1)strafe=me.body.x<5.2?-1:0;else{const dx=other.body.x-me.body.x,dz=other.body.z-me.body.z;yaw=Math.atan2(-dx,-dz);pitch=Math.atan2(other.body.y+1.0-(me.body.y+1.6),Math.hypot(dx,dz));}}
      return{seq:++e.seq,forward:0,strafe,jump:false,yaw,pitch,firing:index===0,active:true};};
  },i);
  await a.getByRole('button',{name:'Approve mode & ready',exact:true}).click();await a.evaluate(()=>document.exitPointerLock());
  await b.getByRole('button',{name:'Approve mode & ready',exact:true}).click();await b.evaluate(()=>document.exitPointerLock());
  await until(()=>room.phase==='finished',65000);await until(()=>room.resultState==='saved');
  assert.equal(room.kind,'public');assert.equal(await matchCount(),1);
  assert.equal(await totalXP(ids[0]),100);
  assert.equal(await totalXP(ids[1]),40);
  await server.outbox.flush();assert.equal(await matchCount(),1);
  console.log('PASS: browser-driven human duel completes through authoritative damage; PostgreSQL records one result and 100/40 XP.');
  await a.getByRole('button',{name:'Leave room',exact:true}).click();await b.getByRole('button',{name:'Leave room',exact:true}).click();
  await a.getByRole('button',{name:/Quick Play/}).click();clockOffset+=BOT_WAIT_MS-1000;server.matchmaking.tick();
  assert.equal(await a.getByRole('button',{name:'Challenge Extra Hard AI [BOT]',exact:true}).count(),0);
  clockOffset+=1100;server.matchmaking.tick();await a.getByRole('button',{name:'Challenge Extra Hard AI [BOT]',exact:true}).waitFor();
  await a.getByRole('button',{name:'Continue searching for a human',exact:true}).click();assert.equal(server.rooms.size,0);
  await a.getByRole('button',{name:'Show optional AI challenge',exact:true}).click();await a.getByRole('button',{name:'Challenge Extra Hard AI [BOT]',exact:true}).click();
  await a.getByText('EXTRA HARD AI · BOT MATCH',{exact:true}).waitFor();const aiRoom=[...server.rooms.values()][0];assert.equal(aiRoom.kind,'ai');
  await a.evaluate(()=>{const e=(window as any).__traceEngine;e.input=()=>({seq:++e.seq,forward:0,strafe:0,jump:false,yaw:0,pitch:0,firing:false,active:true});});
  await a.getByRole('button',{name:'Approve mode & ready',exact:true}).click();await a.evaluate(()=>document.exitPointerLock());
  await until(()=>aiRoom.phase==='finished',90000);await until(()=>aiRoom.resultState==='saved');
  const stats=live?(await admin!.from('player_stats').select('kind,wins,losses').eq('user_id',ids[0]).order('kind')).data:(await db.query<{kind:string;wins:number;losses:number}>('select kind,wins,losses from public.player_stats where user_id=$1 order by kind',[ids[0]])).rows;
  assert.deepEqual(stats,[{kind:'ai',wins:0,losses:1},{kind:'public',wins:1,losses:0}]);
  assert.equal(await totalXP(ids[0]),110);
  await a.getByRole('button',{name:'Leave room',exact:true}).click();await a.getByRole('button',{name:'Account',exact:true}).click();await a.getByText('110 XP',{exact:true}).waitFor();
  await mkdir(resolve('test-results'),{recursive:true});await a.screenshot({path:resolve(live?'test-results/addon-profile-live.png':'test-results/addon-profile.png')});
  assert.deepEqual(errors,[]);console.log('PASS: five-minute opt-in AI offer, continued human search, AI gameplay and separate persisted stats/10 XP loss reward. Profile displays saved results.');
  console.log(live?'LIVE PASS: real Supabase password login, verified sockets, result finalization and browser profile reads. Email delivery and two physical devices remain untested.':'LIMIT: authentication is fixture-based; live Supabase/email and two physical devices were not tested.');
}catch(error){await mkdir(resolve('test-results'),{recursive:true});await pages[0]?.screenshot({path:resolve('test-results/addon-failure.png')}).catch(()=>{});throw error;}
finally{
  await browser?.close();await vite?.close();await server?.close();
  if(admin && createdUsers.length){
    const {data}=await admin.from('match_participants').select('match_id').in('user_id',createdUsers);
    console.log('QA audit match IDs:',[...new Set((data??[]).map(p=>p.match_id))].join(', ') || 'none');
    for(const id of createdUsers){const {error}=await admin.auth.admin.deleteUser(id);if(error){console.error('Temporary QA account cleanup failed for ID '+id);process.exitCode=1;}}
    console.log('Temporary QA account cleanup attempted; existing player accounts were not accessed.');
  }
  await db.close();await rm(directory,{recursive:true,force:true});
}
