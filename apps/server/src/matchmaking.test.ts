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
