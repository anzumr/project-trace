import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, COVER, rayBox } from './index';
import { Practice, PRACTICE, BOT_MODEL, practiceProfile, practicePosition, raySphere, rayPracticeModel, tracePracticeModel } from './practice';

test('upgrades alternate speed then size; small orb endpoint stays playable indefinitely', () => {
  const first = practiceProfile(1), second = practiceProfile(2), third = practiceProfile(3), fourth = practiceProfile(4);
  assert.ok(second.speed > first.speed); assert.equal(second.width, first.width); assert.equal(second.height, first.height);
  assert.equal(third.speed, second.speed); assert.ok(third.width < second.width); assert.ok(third.height < second.height);
  assert.ok(fourth.speed > third.speed); assert.equal(fourth.width, third.width);
  for (const wave of [17, 100, 1000000]) { const p = practiceProfile(wave); assert.equal(p.circle, true); assert.equal(p.width, PRACTICE.minSize); assert.equal(p.height, PRACTICE.minSize); assert.equal(p.speed, PRACTICE.maxSpeed); }
});
test('circle collider rejects bounding-box corners and respects ray direction', () => {
  const c = {x:0,y:0,z:0}, d = {x:0,y:0,z:-1};
  assert.ok(Math.abs(raySphere({x:0,y:0,z:2},d,c,0.2)! - 1.8) < 1e-9);
  const corner = {x:0.18,y:0.18,z:2};
  assert.notEqual(rayBox(corner,d,{min:{x:-0.2,y:-0.2,z:-0.2},max:{x:0.2,y:0.2,z:0.2}}),null);
  assert.equal(raySphere(corner,d,c,0.2),null);
  assert.equal(raySphere({x:0,y:0,z:2},{x:0,y:0,z:1},c,0.2),null);
});
test('kills auto-respawn with full HP, pause freezes progression, and orb waves continue', () => {
  const p = new Practice();
  for (let wave=1;wave<=20;wave++) {
    assert.equal(p.wave,wave); assert.equal(p.hp,100);
    for (let i=0;p.hp>0 && i<310;i++) {
      const phase = p.phase + PRACTICE.baseFrequency * p.profile.speed * CONFIG.tick;
      const position = practicePosition(phase);
      const origin = {...position,z:position.z+0.6};
      p.step(CONFIG.tick,true,true,origin,{x:0,y:0,z:-1});
    }
    assert.equal(p.hp,0); assert.equal(p.kills,wave);
    p.step(10,false,true,{x:0,y:0,z:0},{x:0,y:0,z:-1});
    assert.equal(p.wave,wave); assert.equal(p.respawn,PRACTICE.respawnSeconds);
    for(let i=0;i<39;i++)p.step(CONFIG.tick,true,true,{x:0,y:0,z:0},{x:0,y:0,z:-1});
    assert.equal(p.wave,wave+1); assert.equal(p.hp,100); assert.equal(p.hit,false);
  }
  assert.ok(Math.abs(p.damage-2000)<1e-7);
  const reset = new Practice(); assert.equal(reset.wave,1); assert.equal(reset.kills,0); assert.equal(reset.damage,0);
});
test('practice still requires fire and cover blocks both shapes', () => {
  for(const wave of [1,17]) {
    const p=new Practice();p.wave=wave;
    p.phase=Math.PI-PRACTICE.baseFrequency*p.profile.speed*CONFIG.tick;
    p.step(CONFIG.tick,true,true,{x:0,y:0.9,z:10},{x:0,y:0,z:-1});assert.equal(p.hp,100);
    p.step(CONFIG.tick,true,false,{x:p.position.x,y:0.9,z:-4},{x:0,y:0,z:-1});assert.equal(p.hp,100);
  }
});

test('360 route moves in both axes, reaches every quadrant and stays out of walls and cover', () => {
  const quadrants = new Set<string>(); let minZ=Infinity,maxZ=-Infinity;
  for(let i=0;i<2000;i++) {
    const p=practicePosition(i/2000*Math.PI*2);
    quadrants.add(`${Math.sign(p.x)},${Math.sign(p.z)}`);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);
    assert.ok(Math.abs(p.x)+CONFIG.targetWidth/2<CONFIG.arenaHalf);
    assert.ok(Math.abs(p.z)+CONFIG.targetWidth/2<CONFIG.arenaHalf);
    assert.ok(p.x+0.45<COVER.min.x || p.x-0.45>COVER.max.x || p.z+0.45<COVER.min.z || p.z-0.45>COVER.max.z);
  }
  for(const quadrant of ['1,1','1,-1','-1,1','-1,-1'])assert.ok(quadrants.has(quadrant));
  assert.ok(minZ < -6 && maxZ > 10,'target should travel in depth, including behind the initial player spawn');
  const p=new Practice(),before=p.position;p.step(CONFIG.tick,false,false,before,{x:0,y:0,z:-1});assert.deepEqual(p.position,before);
});

test('reference bot hits capsule and head, misses rounded corners and the head gap at each scale', () => {
  for (const wave of [1,3,9,15]) {
    const profile=practiceProfile(wave), sx=profile.width/BOT_MODEL.width, sy=profile.height/BOT_MODEL.height;
    const hit=(x:number,y:number) => rayPracticeModel({x:x*sx,y:y*sy,z:2},{x:0,y:0,z:-1},{x:0,y:0,z:0},profile);
    assert.notEqual(hit(0,0),null,'torso');
    assert.notEqual(hit(0,BOT_MODEL.headY),null,'head');
    assert.equal(hit(0,0.56),null,'visible gap must not damage');
    assert.equal(hit(0.23,-0.88),null,'empty capsule corner must not damage');
    assert.equal(hit(0.2,BOT_MODEL.headY),null,'outside the head silhouette');
  }
});

test('head tracking deals 40 HP/s, body and final orb deal 20 HP/s across scales', () => {
  for (const wave of [1,9,15,17]) for (const head of [false,true]) {
    const p=new Practice();p.wave=wave;
    for(let i=0;i<60;i++) {
      const center=practicePosition(p.phase+PRACTICE.baseFrequency*p.profile.speed*CONFIG.tick);
      const offset=head && !p.profile.circle ? BOT_MODEL.headY*p.profile.height/BOT_MODEL.height : 0;
      p.step(CONFIG.tick,true,true,{x:center.x,y:center.y+offset,z:center.z+0.6},{x:0,y:0,z:-1});
    }
    const isHead=head && wave<17;
    assert.ok(Math.abs(p.hp-(isHead?60:80))<1e-8);
    assert.equal(p.headshot,isHead);
    p.step(CONFIG.tick,true,false,p.position,{x:0,y:0,z:-1});assert.equal(p.headshot,false);
  }
});
test('head takes priority when a ray intersects both regions; cover blocks head damage; lethal headshot clamps HP', () => {
  const profile=practiceProfile(1),center={x:0,y:0,z:0};
  assert.equal(tracePracticeModel({x:0,y:-2,z:0},{x:0,y:1,z:0},center,profile)?.region,'head');
  assert.equal(tracePracticeModel({x:0,y:2,z:0},{x:0,y:-1,z:0},center,profile)?.region,'head');
  const p=new Practice();p.phase=Math.PI-PRACTICE.baseFrequency*CONFIG.tick;
  p.step(CONFIG.tick,true,true,{x:0,y:PRACTICE.centerY+BOT_MODEL.headY,z:10},{x:0,y:0,z:-1});assert.equal(p.hp,100);assert.equal(p.headshot,false);
  p.hp=0.1;const next=practicePosition(p.phase+PRACTICE.baseFrequency*CONFIG.tick);
  p.step(CONFIG.tick,true,true,{x:next.x,y:next.y+BOT_MODEL.headY,z:next.z+0.6},{x:0,y:0,z:-1});assert.equal(p.hp,0);assert.equal(p.kills,1);
});
