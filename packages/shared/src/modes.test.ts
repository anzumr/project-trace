import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, isMode, CONFIG, move, spawn, targetBox, type ModeId } from './index';
test('all mode profiles change actual hitbox, top speed, jump impulse and bounds', () => {
  for(const id of Object.keys(MODES) as ModeId[]) {
    const mode=MODES[id], box=targetBox(0,0,id),body=spawn();
    assert.equal(box.max.x-box.min.x,CONFIG.targetWidth*mode.scale);
    assert.equal(box.max.y,CONFIG.targetHeight*mode.scale);
    for(let i=0;i<60;i++)move(body,{forward:0,strafe:1,jump:false,yaw:0},CONFIG.tick,[],id);
    assert.ok(Math.abs(body.vx-CONFIG.speed*mode.speed)<1e-9);
    move(body,{forward:0,strafe:0,jump:true,yaw:0},CONFIG.tick,[],id);
    assert.ok(Math.abs(body.vy-(CONFIG.jumpSpeed*mode.jump-CONFIG.gravity*CONFIG.tick))<1e-9);
    for(let i=0;i<600;i++)move(body,{forward:0,strafe:1,jump:false,yaw:0},CONFIG.tick,[],id);
    assert.ok(body.x<=CONFIG.arenaHalf-CONFIG.radius*mode.scale);assert.equal(body.y,0);
  }
  for(const invalid of ['toString','__proto__','unknown',null,42])assert.equal(isMode(invalid),false);
});
