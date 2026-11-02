import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ARENA,ARENA_SOLIDS,STAIRS,PLATFORMS,PILLAR,SPAWN_COVERS,CONFIG,MODES,spawn,move,rayBox,arenaRay,overlaps,type ModeId} from './index';

test('circular perimeter contains every mode while running, jumping and sliding diagonally',()=>{
  for(const mode of Object.keys(MODES) as ModeId[])for(const yaw of [0,0.7,1.57,2.8]){
    const b=spawn();b.x=6;b.z=5;
    for(let i=0;i<1200;i++){move(b,{forward:1,strafe:0.4,jump:i%60===0,yaw},CONFIG.tick,ARENA_SOLIDS,mode);assert.ok(Math.hypot(b.x,b.z)<=ARENA.radius-CONFIG.radius*MODES[mode].scale+1e-8);}
  }
});
test('both protected spawns have left and right exits and cannot walk through their cover',()=>{
  for(const side of [-1,1])for(const exit of [-1,1]){
    const b=spawn(side),yaw=side===1?0:Math.PI;
    for(let i=0;i<120;i++)move(b,{forward:1,strafe:0,jump:false,yaw},CONFIG.tick);
    assert.ok(Math.abs(b.z)>ARENA.coverZ+0.3+CONFIG.radius-0.01);
    assert.notEqual(arenaRay({x:0,y:1.6,z:side*ARENA.spawnZ},{x:0,y:0,z:-side}),null);
    for(let i=0;i<75;i++)move(b,{forward:0,strafe:exit,jump:false,yaw},CONFIG.tick);
    for(let i=0;i<90;i++)move(b,{forward:1,strafe:0,jump:false,yaw},CONFIG.tick);
    assert.ok(Math.abs(b.z)<ARENA.coverZ-1);
  }
});
test('both staircases can be walked up and down in every mode without jumping or hovering',()=>{
  for(const mode of Object.keys(MODES) as ModeId[])for(const side of [-1,1]){
    const b=spawn();b.x=side*7;b.z=0;
    let highest=0;
    for(let i=0;i<120 && Math.abs(b.x)<13;i++){move(b,{forward:0,strafe:side,jump:false,yaw:0},CONFIG.tick,ARENA_SOLIDS,mode);highest=Math.max(highest,b.y);assert.ok(b.grounded,'ascending stays grounded');}
    assert.equal(highest,2);assert.equal(b.y,2);
    for(let i=0;i<80;i++)move(b,{forward:0,strafe:-side,jump:false,yaw:0},CONFIG.tick,ARENA_SOLIDS,mode);
    assert.equal(b.y,0);assert.ok(b.grounded);
  }
});
test('platform sides and tall cover cannot be auto-stepped; falling and jumping off platforms work',()=>{
  const b=spawn();Object.assign(b,{x:12.8,z:4});
  for(let i=0;i<70;i++)move(b,{forward:1,strafe:0,jump:false,yaw:0},CONFIG.tick);
  assert.equal(b.y,0);assert.ok(b.z>=PLATFORMS[1].max.z+CONFIG.radius-1e-8);
  Object.assign(b,{x:12.8,y:2,z:0,vx:0,vy:0,vz:0,grounded:true});
  for(let i=0;i<75;i++)move(b,{forward:-1,strafe:0,jump:false,yaw:0},CONFIG.tick);
  assert.equal(b.y,0);assert.ok(b.grounded);
  Object.assign(b,{x:12.8,y:2,z:0,vx:0,vy:0,vz:0,grounded:true});move(b,{forward:0,strafe:0,jump:true,yaw:0},CONFIG.tick);assert.ok(b.y>2 && !b.grounded);
});
test('stairs and landings support players against the circular wall without a gap',()=>{
  for(const mode of Object.keys(MODES) as ModeId[])for(const side of [-1,1]){
    const b=spawn(),radius=CONFIG.radius*MODES[mode].scale;
    for(const solid of PLATFORMS.filter(s=>side*s.min.x>0 || side*s.max.x>0)){
      const z=(solid.min.z+solid.max.z)/2,x=side*Math.sqrt((ARENA.radius-radius-0.01)**2-z*z);
      Object.assign(b,{x,y:solid.max.y,z,vx:0,vy:0,vz:0,grounded:true});
      for(let i=0;i<30;i++)move(b,{forward:0,strafe:0,jump:false,yaw:0},CONFIG.tick,ARENA_SOLIDS,mode);
      assert.ok(b.y>=solid.max.y-1e-8,'wall-side surface has solid support');
    }
    Object.assign(b,{x:side*12.8,y:2,z:0,vx:0,vy:0,vz:0,grounded:true});
    for(let i=0;i<120;i++)move(b,{forward:0,strafe:side,jump:false,yaw:0},CONFIG.tick,ARENA_SOLIDS,mode);
    assert.equal(b.y,2);assert.ok(b.grounded);assert.ok(Math.hypot(b.x,b.z)<=ARENA.radius-radius+1e-8);
  }
});
test('round pillar collision and ray tests agree, including caps, tangents and clear bounding-box corners',()=>{
  assert.equal(rayBox({x:0,y:1,z:5},{x:0,y:0,z:-1},PILLAR),3);
  assert.equal(rayBox({x:0,y:7,z:0},{x:0,y:-1,z:0},PILLAR),7-ARENA.pillarHeight);
  assert.equal(rayBox({x:1.9,y:1,z:1.9},{x:1,y:0,z:0},PILLAR),null);
  assert.equal(rayBox({x:0,y:7,z:0},{x:0,y:0,z:-1},PILLAR),null);
  assert.equal(rayBox({x:0,y:1,z:5},{x:0,y:0,z:1},PILLAR),null);
  assert.equal(rayBox({x:0,y:1,z:0},{x:0,y:1,z:0},PILLAR),0);
  const b=spawn();Object.assign(b,{x:1.9,z:1.9});assert.equal(overlaps(b,CONFIG.radius,PILLAR),false);
  for(let i=0;i<90;i++)move(b,{forward:1,strafe:0,jump:false,yaw:0},CONFIG.tick);
  assert.ok(Math.hypot(b.x,b.z)>=ARENA.pillarRadius+CONFIG.radius-1e-8);
});
test('spawn walls, stairs and platforms occlude shots at their actual heights',()=>{
  for(const solid of [...SPAWN_COVERS,...STAIRS,...PLATFORMS]){
    const x=(solid.min.x+solid.max.x)/2,y=solid.max.y/2;
    assert.notEqual(rayBox({x,y,z:solid.max.z+1},{x:0,y:0,z:-1},solid),null);
    assert.equal(rayBox({x,y:solid.max.y+0.1,z:solid.max.z+1},{x:0,y:0,z:-1},solid),null);
  }
});
