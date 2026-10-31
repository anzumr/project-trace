import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { MatchResult } from './game/Results';
import { ResultOutbox } from './ResultOutbox';

export const accountA='11111111-1111-4111-8111-111111111111',accountB='22222222-2222-4222-8222-222222222222';
export function resultFixture(kind:MatchResult['kind']='public'):MatchResult {
  return {id:randomUUID(),kind,mode:'standard',status:'completed',startedAt:'2026-10-28T01:00:00Z',completedAt:'2026-10-28T01:02:00Z',reason:'Knockout',players:[accountA,accountB].map((id,i)=>({playerId:randomUUID(),userId:kind==='ai'&&i===1?null:id,name:i===0?'PlayerA':kind==='ai'?'Extra Hard AI [BOT]':'PlayerB',bot:kind==='ai'&&i===1,outcome:i===0?'win':'loss',roundsWon:i===0?2:0,damageMilli:i===0?200000:40000,receivedMilli:i===0?40000:200000,trackingMs:10000,opportunityMs:30000,playMs:60000}))};
}
test('trusted result transaction isolates AI/PvP, retries idempotently, and denies browser writes and other-user reads',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;insert into auth.users values('${accountA}',now()),('${accountB}',now());`);
    for(const name of ['202610270001_accounts.sql','202610280001_match_results.sql','202610310001_combat_stats.sql'])await db.exec(await readFile(new URL('../../../supabase/migrations/'+name,import.meta.url),'utf8'));
    await db.exec(`insert into public.profiles(user_id,username_display) values('${accountA}','PlayerA'),('${accountB}','PlayerB')`);
    const record=async(result:MatchResult)=>{await db.exec('set role service_role');try{await db.query('select public.record_match_combat($1::jsonb)',[JSON.stringify(result)]);}finally{await db.exec('reset role');}};
    const human=resultFixture(),ai=resultFixture('ai');
    human.players.forEach(p=>{p.combat={attack:20,tracked:10,damage:p.damageMilli/1000,received:p.receivedMilli/1000,headDamage:20,headTracked:1,longest:3,streak:0,duration:60};p.rounds=[];});
    await record(human);await record(human);await record(ai);
    assert.deepEqual((await db.query('select total_xp from public.player_progress where user_id=$1',[accountA])).rows,[{total_xp:125}]);
    assert.deepEqual((await db.query('select kind,wins from public.player_stats where user_id=$1 order by kind',[accountA])).rows,[{kind:'ai',wins:1},{kind:'public',wins:1}]);
    assert.deepEqual((await db.query('select attack_ms,tracking_ms,head_damage_milli,longest_ms from public.player_combat_stats where user_id=$1',[accountA])).rows,[{attack_ms:20000,tracking_ms:10000,head_damage_milli:20000,longest_ms:3000}]);
    assert.equal((await db.query('select * from public.match_combat')).rows.length,2);
    const invalid=resultFixture();invalid.players[0].combat={...human.players[0].combat!,attack:1};
    await assert.rejects(record(invalid),/check constraint/);
    assert.equal((await db.query('select * from public.match_results where id=$1',[invalid.id])).rows.length,0);
    await assert.rejects(record({...human,reason:'tampered retry'}),/Conflicting/);
    const fake=resultFixture();fake.players[1].bot=true;fake.players[1].userId=null;await assert.rejects(record(fake),/two accounts/);
    const cancelled=resultFixture();cancelled.status='cancelled';cancelled.players.forEach(p=>p.outcome='cancelled');await record(cancelled);
    const abandoned=resultFixture('ai');abandoned.status='forfeit';await record(abandoned);
    assert.deepEqual((await db.query('select total_xp from public.player_progress where user_id=$1',[accountA])).rows,[{total_xp:125}]);
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${accountB}',false)`);
    assert.equal((await db.query('select * from public.match_results where id=$1',[ai.id])).rows.length,0);
    assert.equal((await db.query('select * from public.player_stats where user_id=$1',[accountA])).rows.length,0);
    await assert.rejects(db.query('select public.record_match_combat($1::jsonb)',[JSON.stringify(resultFixture())]),/permission denied/);
    for(const table of ['player_progress','player_stats','match_results','match_participants','match_combat','player_combat_stats'])await assert.rejects(db.query(`delete from public.${table}`),/permission denied/);
    assert.equal((await db.query('select * from public.match_combat where user_id=$1',[accountA])).rows.length,0);
    await assert.rejects(db.query('select public.record_match($1::jsonb)',[JSON.stringify(human)]),/permission denied/);
    await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.match_results'),/permission denied/);
  }finally{await db.close();}
});

test('durable outbox retains a failed result and replays it after process restart',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'trace-outbox-'));let first:ResultOutbox|undefined,second:ResultOutbox|undefined;
  try{
    first=new ResultOutbox(directory,async()=>{throw new Error('offline');});await first.ready;
    const result=resultFixture();first.enqueue(result,()=>{});await first.close();
    assert.equal(JSON.parse(await readFile(join(directory,result.id+'.json'),'utf8')).id,result.id);
    const saved:string[]=[];second=new ResultOutbox(directory,async r=>{saved.push(r.id);});await second.ready;await second.flush();await second.flush();assert.deepEqual(saved,[result.id]);
  }finally{await first?.close();await second?.close();await rm(directory,{recursive:true,force:true});}
});
