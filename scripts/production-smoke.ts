import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io } from 'socket.io-client';
import { createGameServer } from '../apps/server/src/server';
const server=createGameServer({serveClient:true});const sockets:ReturnType<typeof io>[]=[];
try{
  await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
  const page=await fetch(base);assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy')!,/object-src 'none'/);const html=await page.text();
  const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(m=>m[1]);assert.ok(assets.length>0);
  for(const path of assets){const asset=await fetch(base+path,{headers:{'Accept-Encoding':'gzip'}});assert.equal(asset.status,200);assert.equal(asset.headers.get('content-encoding'),'gzip');assert.match(asset.headers.get('cache-control')!,/immutable/);assert.ok((await asset.text()).length>0);}
  for(const name of ['hitsound','headshot','killconfirmed','spawn']){
    const sound=await fetch(base+'/audio/'+name+'.ogg');assert.equal(sound.status,200);assert.equal(sound.headers.get('content-type'),'audio/ogg');
    assert.equal(Buffer.from(await sound.arrayBuffer()).subarray(0,4).toString(),'OggS');
  }
  for(const [path,type] of [['/brand/krazer-wordmark.webp','image/webp'],['/brand/krazer-icon.png','image/png'],['/favicon.svg','image/svg+xml']]){const image=await fetch(base+path);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),type);}
  for(const path of ['/package.json','/../package.json','/%2e%2e%2fpackage.json','/.env','/assets/not-found.js'])assert.equal((await fetch(base+path)).status,404);
  assert.equal((await fetch(base,{method:'POST'})).status,405);
  for(let i=0;i<2;i++){const socket=io(base,{transports:['websocket'],reconnection:false,extraHeaders:{Origin:'http://localhost:3001'}});sockets.push(socket);await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});}
  const created=await sockets[0].timeout(2000).emitWithAck('create');const joined=await sockets[1].timeout(2000).emitWithAck('join',created.snapshot.code);assert.equal(joined.ok,true);assert.equal(joined.snapshot.players.length,2);
  console.log('PASS: production HTML, brand images, four OGG assets, compressed assets, CSP, traversal/method guards and two WebSocket clients.');
}finally{sockets.forEach(s=>s.disconnect());await server.close();}
