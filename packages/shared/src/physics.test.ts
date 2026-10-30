import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, COVER, spawn, move, tracking, targetBox, rayBox, damage } from './index';
test('ray hits honest collider, misses off-axis and behind origin', () => {
  assert.equal(rayBox({x:0,y:1,z:5},{x:0,y:0,z:-1},targetBox(0,0)),4.55);
  assert.equal(rayBox({x:2,y:1,z:5},{x:0,y:0,z:-1},targetBox(0,0)),null);
  assert.equal(rayBox({x:0,y:1,z:5},{x:0,y:0,z:1},targetBox(0,0)),null);
});
test('cover blocks damage, clear lane permits it', () => {
  assert.equal(tracking({x:0,y:1.6,z:10},{x:0,y:0,z:-1},targetBox(0,-6),[COVER]),false);
  assert.equal(tracking({x:5,y:1.6,z:10},{x:0,y:0,z:-1},targetBox(5,-6),[COVER]),true);
});
test('damage uses fixed time independent of render cadence; HP clamps', () => {
  for (const fps of [30,60,120]) { let hp = 100, accumulator = 0; for(let frame=0;frame<fps*3;frame++){accumulator += 1/fps; while(accumulator >= CONFIG.tick - 1e-10){hp=damage(hp,CONFIG.tick);accumulator-=CONFIG.tick;}} assert.ok(Math.abs(hp-40)<1e-8); }
  assert.equal(damage(1,1),0);
});
test('movement respects arena and barrier', () => {
  const b = spawn(); for(let i=0;i<600;i++) move(b,{forward:1,strafe:0,jump:false,yaw:0},CONFIG.tick);
  assert.ok(b.z >= COVER.max.z + CONFIG.radius);
  b.x=5; for(let i=0;i<600;i++) move(b,{forward:1,strafe:0,jump:false,yaw:0},CONFIG.tick);
  assert.ok(b.z >= -CONFIG.arenaHalf + CONFIG.radius);
});
test('jump cannot reset velocity in air and lands on ground', () => {
  const b=spawn();move(b,{forward:0,strafe:0,jump:true,yaw:0},CONFIG.tick); const first=b.vy;
  move(b,{forward:0,strafe:0,jump:true,yaw:0},CONFIG.tick);assert.ok(b.vy<first);
  let peak=b.y;for(let i=0;i<180;i++){move(b,{forward:0,strafe:0,jump:false,yaw:0},CONFIG.tick);peak=Math.max(peak,b.y);}
  assert.equal(b.y,0);assert.equal(b.grounded,true);assert.ok(peak>1 && peak<1.5);
});
test('solid ceiling stops ascent', () => {
  const b=spawn();const ceiling={min:{x:-2,y:2.1,z:8},max:{x:2,y:3,z:12}};
  for(let i=0;i<15;i++)move(b,{forward:0,strafe:0,jump:i===0,yaw:0},CONFIG.tick,[ceiling]);
  assert.ok(b.y + CONFIG.height <= 2.1);
});
