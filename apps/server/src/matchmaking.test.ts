import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matchmaking, BOT_WAIT_MS, RECONNECT_MS, type QueuePeer } from './Matchmaking';
import { Room } from './game/Room';
import type { QueueState } from '@trace/shared/protocol';

function setup(){
  let now=0,index=0;const rooms=new Map<string,Room>();
  const queue=new Matchmaking(rooms,kind=>new Room(String(++index),{kind}),()=>true,()=>now);
  const peer=(id:string)=>{const states:QueueState[]=[],matches:Room[]=[];const p:QueuePeer={id,identity:{userId:id,username:id,expiresAt:Infinity},queue:s=>states.push(s),attach:r=>matches.push(r)};queue.connect(p);return{p,states,matches};};
  return{queue,rooms,peer,advance:(ms:number)=>{now+=ms;queue.tick();}};
}

test('rematches reset the completed-room expiry timer and retain both seats',()=>{
  const {queue,peer,advance,rooms}=setup(),a=peer('A'),b=peer('B');queue.join(a.p,'standard');queue.join(b.p,'standard');
  const room=a.matches[0],ids=[...room.players.keys()];room.ready(ids[0]);room.ready(ids[1]);room.cancel('Test finish');advance(1);advance(299000);
  room.ready(ids[0]);room.ready(ids[1]);assert.equal(room.phase,'countdown');advance(1000);room.cancel('Second finish');advance(1);advance(1000);
  assert.equal(rooms.size,1);assert.equal(queue.hasActivity('A'),true);assert.equal(queue.hasActivity('B'),true);
  advance(300000);assert.equal(rooms.size,0);
});
test('compatible humans pair once, duplicate entry is idempotent, mode mismatch stays queued and cancel wins its race',()=>{
  const {queue,rooms,peer}=setup(),a=peer('A'),b=peer('B'),c=peer('C');
  assert.ok(queue.join(a.p,'standard').ok);assert.ok(queue.join(a.p,'standard').ok);queue.join(b.p,'heavy');assert.equal(rooms.size,0);
  queue.join(c.p,'standard');assert.equal(rooms.size,1);assert.equal(a.matches.length,1);assert.equal(c.matches.length,1);assert.equal(queue.bot(a.p).ok,false);assert.equal(queue.join(a.p,'standard').ok,false);
  queue.cancel(b.p);const d=peer('D');queue.join(d.p,'heavy');assert.equal(rooms.size,1);assert.equal(b.states.at(-1)?.state,'idle');
});
test('AI is opt-in at exactly 300 seconds, continuing search retains eligibility, acceptance consumes queue atomically',()=>{
  const {queue,rooms,peer,advance}=setup(),a=peer('A');queue.join(a.p,'standard');advance(BOT_WAIT_MS-1);
  assert.equal(queue.bot(a.p).ok,false);assert.equal(a.states.at(-1)?.botEligible,false);advance(1);assert.equal(a.states.at(-1)?.botEligible,true);assert.equal(rooms.size,0);
  advance(5000);assert.equal(rooms.size,0);assert.equal(queue.bot(a.p).ok,true);assert.equal(queue.bot(a.p).ok,false);assert.equal(rooms.size,1);
  const room=a.matches[0];assert.equal(room.kind,'ai');assert.equal([...room.players.values()].filter(p=>p.state.bot).length,1);
  const b=peer('B');queue.join(b.p,'standard');assert.equal(b.matches.length,0);
});
test('disconnected queue entries cannot match, elapsed time freezes, reconnect restores and expired reservations clear',()=>{
  const {queue,peer,advance,rooms}=setup(),a=peer('A');queue.join(a.p,'standard');advance(100000);queue.disconnect(a.p);advance(10000);
  const b=peer('B');queue.join(b.p,'standard');assert.equal(rooms.size,0);
  const returned={...a.p,id:'A-new'};assert.ok(queue.connect(returned));advance(1);assert.equal(rooms.size,1);
  queue.disconnect(returned);const room=a.matches[0];assert.equal(room.paused,true);
  const impostor={...returned,id:'A-double'};assert.ok(queue.connect(impostor));assert.equal(room.paused,false);assert.equal(queue.connect({...impostor,id:'A-third'}),false);
  queue.disconnect(impostor);advance(RECONNECT_MS);assert.equal(room.phase,'finished');assert.equal(queue.hasActivity('A'),false);
});
test('a human pairing wins over a late bot acceptance and simultaneous expired disconnects cancel without a winner',()=>{
  const {queue,peer,advance,rooms}=setup(),a=peer('A'),b=peer('B');queue.join(a.p,'standard');advance(BOT_WAIT_MS);
  queue.join(b.p,'standard');assert.equal(queue.bot(a.p).ok,false);assert.equal(rooms.size,1);
  const room=a.matches[0];for(const id of room.players.keys())room.ready(id);
  for(let i=0;i<185;i++)room.step(i*1000/60);
  queue.disconnect(a.p);queue.disconnect(b.p);advance(RECONNECT_MS);
  assert.equal(room.resultStatus,'cancelled');assert.equal(room.winner,null);assert.equal(rooms.size,0);
});
test('ranked needs level 5, pairs the closest rank within a widening range, never the same network or an AI',()=>{
  const {queue,rooms,peer,advance}=setup(),a=peer('A'),b=peer('B'),c=peer('C'),d=peer('D'),e=peer('E');
  assert.match(queue.joinRanked(a.p,{points:500,level:4,ip:null}).error!,/level 5/);
  assert.ok(queue.joinRanked(a.p,{points:500,level:5,ip:'1.1.1.1'}).ok);assert.equal(a.states.at(-1)?.ranked,true);assert.equal(a.states.at(-1)?.range,300);
  assert.equal(queue.join(a.p,'standard').ok,false,'one queue at a time');assert.equal(queue.bot(a.p).ok,false);
  queue.joinRanked(b.p,{points:2000,level:9,ip:'2.2.2.2'});assert.equal(rooms.size,0,'1500 RP apart is outside both ranges');
  queue.joinRanked(c.p,{points:640,level:9,ip:'1.1.1.1'});assert.equal(rooms.size,0,'same network never pairs');
  advance(30_000);assert.equal(a.states.at(-1)?.range,600);assert.equal(rooms.size,0);
  queue.joinRanked(d.p,{points:700,level:9,ip:'3.3.3.3'});assert.equal(rooms.size,1,'A and D are 200 apart');
  assert.equal(a.matches[0]?.kind,'ranked');assert.equal(a.matches[0],d.matches[0]);assert.equal(a.matches[0].mode,'standard');
  queue.join(e.p,'standard');advance(59_000);assert.equal(e.matches.length,0,'Quick Play never pairs with ranked');
  assert.equal(c.states.at(-1)?.range,1050);assert.equal(rooms.size,1,'B and C are 1360 apart');
  advance(1_000);assert.equal(rooms.size,2,'after 90 s any rank is allowed');assert.equal(b.matches[0],c.matches[0]);
});
