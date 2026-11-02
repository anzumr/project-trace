import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('social permissions, reciprocal requests, invitation lifecycle and scoped leaderboard calculations',async()=>{
  const db=new PGlite(),a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333';
  const as=async(id:string)=>{await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);};
  const action=(name:string,target:string|null=null,username:string|null=null,code:string|null=null)=>db.query('select public.social_action($1,$2,$3,$4)',[name,username,target,code]);
  const state=async()=>((await db.query<{value:{friends:{user_id:string;accepted:boolean;incoming:boolean}[];invites:{room_code:string}[]}}>('select public.social_state() value')).rows[0].value);
  const board=async(scope='global',kind='public',sort='wins',min=1,offset=0)=>(await db.query<{username:string;wins:number;win_rate:string;loss_rate:string;accuracy:string;rank:number}>('select * from public.leaderboard($1,$2,$3,$4,$5)',[scope,kind,sort,min,offset])).rows;
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
    for(const name of ['202610270001_accounts.sql','202610280001_match_results.sql','202610310001_combat_stats.sql','202611010001_permanent_usernames.sql','202611020001_social_leaderboards.sql'])await db.exec(await readFile(new URL('../../../supabase/migrations/'+name,import.meta.url),'utf8'));
    await db.exec(`insert into auth.users values('${a}',now()),('${b}',now()),('${c}',now());insert into public.profiles(user_id,username_display) values('${a}','Alpha'),('${b}','Beta'),('${c}','Gamma');
      insert into public.player_stats(user_id,kind,wins,losses,damage_milli) values('${a}','public',3,1,120000),('${b}','public',1,0,30000),('${c}','public',9,1,300000),('${a}','ai',100,0,500000),('${a}','private',2,2,90000);
      insert into public.player_combat_stats(user_id,kind,attack_ms,tracking_ms,head_tracking_ms,head_damage_milli,longest_ms) values('${a}','public',10000,5000,0,0,2000),('${b}','public',0,0,0,0,0),('${c}','public',10000,9000,0,0,3000);`);
    await db.exec('set role anon');await assert.rejects(state,/permission denied/);await assert.rejects(()=>board(),/permission denied/);await assert.rejects(()=>action('request',null,'Alpha'),/permission denied/);
    await as('');await assert.rejects(state,/Sign in/);await assert.rejects(()=>board(),/Sign in/);
    await as(a);await assert.rejects(()=>action('request',null,'Alpha'),/another player/);await assert.rejects(()=>action('request',null,'Missing'),/not found/);
    await action('request',null,' bETA ');assert.deepEqual((await state()).friends,[{user_id:b,username:'Beta',accepted:false,incoming:false}]);
    await assert.rejects(()=>action('accept',b),/Incoming request/);await assert.rejects(()=>action('invite',b,null,'ABCDE'),/accepted friends/);
    await as(c);assert.equal((await state()).friends.length,0);await assert.rejects(()=>action('accept',a),/Incoming request/);
    await as(b);await assert.rejects(()=>action('request',null,'Alpha'),/pending request/);await action('accept',a);
    assert.equal((await state()).friends[0].accepted,true);
    await as(a);await action('invite',b,null,'ABCDE');await assert.rejects(()=>action('invite',b,null,'ABCDE'),/30 seconds/);
    await as(c);assert.equal((await state()).invites.length,0);await action('dismiss',a);
    await as(b);assert.equal((await state()).invites[0].room_code,'ABCDE');await action('dismiss',a);assert.equal((await state()).invites.length,0);
    await as(a);await assert.rejects(()=>action('invite',b,null,'BAD'),/private room/);await action('invite',b,null,'ABCDE');
    await db.exec('reset role');await db.exec("update public.duel_invites set expires_at=now()-interval '1 second'");await as(b);assert.equal((await state()).invites.length,0);
    await as(a);
    assert.deepEqual((await board()).map(r=>r.username),['Gamma','Alpha','Beta']);
    const friends=await board('friends');assert.deepEqual(friends.map(r=>r.username),['Alpha','Beta']);assert.equal(Number(friends[0].win_rate),75);assert.equal(Number(friends[0].loss_rate),25);assert.equal(Number(friends[0].accuracy),50);assert.equal(friends[1].accuracy,null);
    assert.deepEqual((await board('global','public','win_rate')).map(r=>r.username),['Beta','Gamma','Alpha']);
    assert.deepEqual((await board('global','public','accuracy')).map(r=>r.username),['Gamma','Alpha','Beta']);
    assert.deepEqual((await board('friends','public','wins',2)).map(r=>r.username),['Alpha']);
    assert.equal(Number((await board('global','ai'))[0].wins),100);assert.equal(Number((await board('global','private'))[0].win_rate),50);
    assert.equal(Number((await board('global','public','wins',1,1))[0].rank),2);
    await assert.rejects(()=>board('invalid'),/Invalid leaderboard/);
    for(const table of ['friendships','duel_invites','player_stats'])await assert.rejects(()=>db.query(`delete from public.${table}`),/permission denied/);
    assert.equal((await db.query('select * from public.profiles')).rows.length,1);
    assert.equal((await db.query('select * from public.player_stats')).rows.length,3);
    await action('remove',b);assert.deepEqual((await board('friends')).map(r=>r.username),['Alpha']);await assert.rejects(()=>action('invite',b,null,'ABCDE'),/accepted friends/);
    await as(b);assert.equal((await state()).friends.length,0);assert.equal((await state()).invites.length,0);
    await action('request',null,'Alpha');await action('remove',a);assert.equal((await state()).friends.length,0);
  }finally{await db.close();}
});
