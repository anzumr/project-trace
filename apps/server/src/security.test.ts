import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io } from 'socket.io-client';
import { createGameServer } from './server';
import { TokenBucket } from './net/RateLimit';

test('token buckets reject floods and recover at the configured sustained rate',()=>{
  const bucket=new TokenBucket(8,16,0);for(let i=0;i<16;i++)assert.ok(bucket.take(0));assert.equal(bucket.take(0),false);assert.equal(bucket.take(124),false);assert.ok(bucket.take(125));
});
test('server rejects foreign browser origins and disconnects packet floods without taking down healthy clients', {timeout:10000}, async()=>{
  const server=createGameServer();const sockets:ReturnType<typeof io>[]=[];
  try{
    await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
    const bad=io(url,{transports:['websocket'],reconnection:false,extraHeaders:{Origin:'https://untrusted.invalid'}});sockets.push(bad);
    await new Promise<void>((resolve,reject)=>{bad.once('connect_error',()=>resolve());bad.once('connect',()=>reject(new Error('Foreign origin accepted')));});
    const flood=io(url,{transports:['websocket'],reconnection:false});sockets.push(flood);await new Promise<void>(resolve=>flood.once('connect',resolve));
    const disconnected=new Promise<void>(resolve=>flood.once('disconnect',()=>resolve()));for(let i=0;i<500;i++)flood.emit('input',{malformed:true});await disconnected;
    const health=await fetch(url+'/health');assert.equal(health.status,200);assert.equal((await health.json() as {ok:boolean}).ok,true);
    const healthy=io(url,{transports:['websocket'],reconnection:false});sockets.push(healthy);await new Promise<void>(resolve=>healthy.once('connect',resolve));
    const reply=await healthy.timeout(2000).emitWithAck('create');assert.equal(reply.ok,true);
  }finally{sockets.forEach(s=>s.disconnect());await server.close();}
});
