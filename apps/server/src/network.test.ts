import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { createGameServer } from './server';
import { neutralInput, type Snapshot, type PlayerInput, type ClientEvents, type ServerEvents, type RoomReply } from '@trace/shared/protocol';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, timeout = 3000) { const start = Date.now(); while (!check()) { if (Date.now() - start > timeout) throw new Error('Timed out waiting for server state'); await sleep(20); } }
type Client = Socket<ServerEvents, ClientEvents>;
test('real sockets require both clients to approve the host-selected mode revision', { timeout: 15000 }, async () => {
  const server=createGameServer(), clients: Client[]=[];
  try {
    await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));
    const url=`http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
    for(let i=0;i<2;i++){const socket:Client=io(url,{transports:['websocket'],reconnection:false});clients.push(socket);await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});}
    const [a,b]=clients;let sa:Snapshot|undefined,sb:Snapshot|undefined,notice='';
    a.on('snapshot',s=>{sa=s;});b.on('snapshot',s=>{sb=s;});b.on('notice',s=>{notice=s;});
    const made=await new Promise<RoomReply>(resolve=>a.emit('create',resolve));
    await new Promise<RoomReply>(resolve=>b.emit('join',made.snapshot!.code,resolve));
    b.emit('selectMode','heavy');await until(()=>!!notice);assert.match(notice,/host/);
    b.emit('ready',0);a.emit('selectMode','heavy');await until(()=>sa?.mode==='heavy' && sb?.mode==='heavy');
    assert.equal(sb!.players.find(p=>p.id===b.id)!.ready,false);
    a.emit('ready',1);b.emit('ready',0);await sleep(150);assert.equal(sa!.phase,'lobby');
    b.emit('ready',1);await until(()=>sa?.phase==='countdown' && sb?.phase==='countdown');
    a.emit('selectMode','extreme');await until(()=>sa?.phase==='live',5000);assert.equal(sa!.mode,'heavy');assert.equal(sb!.mode,'heavy');
    a.emit('input',{...neutralInput(1),active:true,jump:true});await until(()=>sa!.players.find(p=>p.id===a.id)!.body.y>0);
  } finally {clients.forEach(c=>c.disconnect());await server.close();}
});
test('real sockets: full three-round match, names, countdown, movement, damage, rematch and disconnect', { timeout: 70000 }, async () => {
  const server = createGameServer(); const clients: Client[] = []; const intervals: ReturnType<typeof setInterval>[] = [];
  try {
    await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
    for(let i=0;i<4;i++){ const client: Client = io(url, { transports:['websocket'], reconnection:false }); clients.push(client); await new Promise<void>((resolve,reject)=>{client.once('connect',resolve);client.once('connect_error',reject);}); }
    const [a,b,c,d] = clients;
    let sa: Snapshot | undefined, sb: Snapshot | undefined;
    a.on('snapshot', s => { sa=s; }); b.on('snapshot', s => { sb=s; });
    const made = await new Promise<RoomReply>(resolve => a.emit('create',resolve)); assert.equal(made.ok,true); const code=made.snapshot!.code;
    const joined = await new Promise<RoomReply>(resolve => b.emit('join',code,resolve)); assert.equal(joined.ok,true);
    const full = await new Promise<RoomReply>(resolve => c.emit('join',code,resolve)); assert.equal(full.ok,false); assert.match(full.error!,/full/);
    const invalid = await new Promise<RoomReply>(resolve => d.emit('join','bad',resolve)); assert.equal(invalid.ok,false);
    a.emit('setName','Runner A'); b.emit('setName','Runner B');
    a.emit('ready',0); b.emit('ready',0); await until(()=>sa?.phase==='countdown' && sb?.phase==='countdown');
    assert.equal(sa!.players[0].name,'Runner A');assert.equal(sb!.players[1].name,'Runner B');
    await until(()=>sa?.phase==='live' && sb?.phase==='live',5000);
    let ai: Partial<PlayerInput> = {active:true}, bi: Partial<PlayerInput> = {active:true,yaw:-Math.PI}; let seqA=0,seqB=0;
    intervals.push(setInterval(()=>{a.emit('input',{...neutralInput(++seqA),...ai});b.emit('input',{...neutralInput(++seqB),...bi});},17));
    const me = () => sa!.players.find(p=>p.id===a.id)!;
    const enemy = () => sa!.players.find(p=>p.id===b.id)!;
    const aim = () => { const from=me().body,to=enemy().body; ai.yaw=Math.atan2(-(to.x-from.x),-(to.z-from.z)); ai.pitch=0; };
    aim(); ai.firing=true; await sleep(500); assert.equal(enemy().hp,100,'central barrier must block shots');
    ai.firing=false; bi.strafe=-1; await until(()=>enemy().body.x>5,3000); bi.strafe=0; await sleep(400);
    assert.equal(me().body.x,5,'moving B must not move A'); assert.ok(enemy().body.x>5);
    bi.jump=true; await until(()=>enemy().body.y>0.2); bi.jump=false; await until(()=>enemy().body.grounded && enemy().body.y===0);
    aim(); await sleep(350); assert.equal(enemy().hp,100,'aim alone must not damage');
    ai.yaw=Math.PI/2; ai.firing=true; await sleep(350); assert.equal(enemy().hp,100,'empty ray must miss');
    aim(); await until(()=>enemy().hp<95); ai.firing=false; await sleep(300); const released=enemy().hp; await sleep(300); assert.equal(enemy().hp,released,'release stops damage');
    ai.firing=true; await until(()=>sa?.phase==='roundEnd' && sb?.phase==='roundEnd',7000);
    assert.equal(sa!.roundWinner,a.id); assert.equal(sb!.roundWinner,a.id); assert.equal(enemy().hp,0); assert.ok(me().damage>=99.99); assert.equal(me().wins,1);
    for(const round of [2,3]) {
      ai={active:true};bi={active:true,yaw:-Math.PI};
      await until(()=>sa?.phase==='live' && sb?.phase==='live' && sa.round===round,8000);
      assert.equal(me().hp,100);assert.equal(enemy().hp,100);
      bi.strafe=-1;await until(()=>enemy().body.x>5,3000);bi.strafe=0;await sleep(400);
      if(round===2){const from=enemy().body,to=me().body;bi.yaw=Math.atan2(-(to.x-from.x),-(to.z-from.z));bi.firing=true;}
      else {aim();ai.firing=true;}
      await until(()=>sa?.phase===(round===3?'finished':'roundEnd') && sb?.phase===sa.phase,7000);
      assert.equal(sa!.roundWinner,round===2?b.id:a.id);assert.equal(sb!.roundWinner,sa!.roundWinner);
    }
    assert.equal(sa!.winner,a.id);assert.equal(sb!.winner,a.id);assert.equal(me().wins,2);assert.equal(enemy().wins,1);
    ai={active:true};bi={active:true,yaw:-Math.PI};a.emit('ready',0);b.emit('ready',0);
    await until(()=>sa?.phase==='countdown' && sa.match===2);assert.equal(me().wins,0);assert.equal(enemy().wins,0);assert.equal(me().damage,0);
    await until(()=>sa?.phase==='live' && sa.match===2,5000); assert.equal(enemy().hp,100);
    b.disconnect(); await until(()=>sa?.phase==='finished'); assert.equal(sa!.winner,a.id); assert.equal(sa!.players.length,1); assert.match(sa!.reason,/disconnected/);
  } finally { intervals.forEach(clearInterval); clients.forEach(c=>c.disconnect()); await server.close(); }
});
