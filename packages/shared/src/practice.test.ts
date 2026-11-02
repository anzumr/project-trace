import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, COVER, rayBox, type Vec3 } from './index';
import { Practice, PRACTICE, BOT_MODEL, practiceProfile, practiceAgility, raySphere, rayPracticeModel, tracePracticeModel } from './practice';

const PLAYER = { x: 0, y: CONFIG.eyeHeight, z: 10 };
const look = (from: Vec3, to: Vec3) => { const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, l = Math.hypot(dx, dy, dz); return { x: dx / l, y: dy / l, z: dz / l }; };
/** Unit vector across the player's line of sight, matching the bot's own sideways convention. */
const across = (p: Practice) => { const m = p.motion, l = Math.hypot(m.x - PLAYER.x, m.z - PLAYER.z); return { x: -(m.z - PLAYER.z) / l, z: (m.x - PLAYER.x) / l }; };

test('upgrades alternate speed then size; small orb endpoint stays playable indefinitely', () => {
  const first = practiceProfile(1), second = practiceProfile(2), third = practiceProfile(3), fourth = practiceProfile(4);
  assert.ok(second.speed > first.speed); assert.equal(second.width, first.width); assert.equal(second.height, first.height);
  assert.equal(third.speed, second.speed); assert.ok(third.width < second.width); assert.ok(third.height < second.height);
  assert.ok(fourth.speed > third.speed); assert.equal(fourth.width, third.width);
  for (const wave of [17, 100, 1000000]) { const p = practiceProfile(wave); assert.equal(p.circle, true); assert.equal(p.width, PRACTICE.minSize); assert.equal(p.height, PRACTICE.minSize); assert.equal(p.speed, PRACTICE.maxSpeed); }
  assert.equal(practiceAgility(1), 0); assert.ok(practiceAgility(9) > 0 && practiceAgility(9) < 1); assert.equal(practiceAgility(17), 1); assert.equal(practiceAgility(500), 1);
});
test('circle collider rejects bounding-box corners and respects ray direction', () => {
  const c = {x:0,y:0,z:0}, d = {x:0,y:0,z:-1};
  assert.ok(Math.abs(raySphere({x:0,y:0,z:2},d,c,0.2)! - 1.8) < 1e-9);
  const corner = {x:0.18,y:0.18,z:2};
  assert.notEqual(rayBox(corner,d,{min:{x:-0.2,y:-0.2,z:-0.2},max:{x:0.2,y:0.2,z:0.2}}),null);
  assert.equal(raySphere(corner,d,c,0.2),null);
  assert.equal(raySphere({x:0,y:0,z:2},{x:0,y:0,z:1},c,0.2),null);
});
test('kills auto-respawn away from the player with full HP, pause freezes progression, and orb waves continue', () => {
  const p = new Practice({ seed: 1, still: true });
  for (let wave=1;wave<=20;wave++) {
    assert.equal(p.wave,wave); assert.equal(p.hp,100);
    for (let i=0;p.hp>0 && i<310;i++) { const at = p.position; p.step(CONFIG.tick,true,true,{...at,z:at.z+0.6},{x:0,y:0,z:-1}); }
    assert.equal(p.hp,0); assert.equal(p.kills,wave);
    p.step(10,false,true,{x:0,y:0,z:0},{x:0,y:0,z:-1});
    assert.equal(p.wave,wave); assert.equal(p.respawn,PRACTICE.respawnSeconds);
    for(let i=0;i<39;i++)p.step(CONFIG.tick,true,true,{x:0,y:0,z:0},{x:0,y:0,z:-1});
    assert.equal(p.wave,wave+1); assert.equal(p.hp,100); assert.equal(p.hit,false);
    assert.ok(Math.hypot(p.position.x,p.position.z)>=PRACTICE.spawnDistance,'respawns away from the player');
  }
  assert.ok(Math.abs(p.damage-2000)<1e-7);
  const reset = new Practice(); assert.equal(reset.wave,1); assert.equal(reset.kills,0); assert.equal(reset.damage,0);
});
test('practice still requires fire and cover blocks both shapes', () => {
  for(const wave of [1,17]) {
    const p=new Practice({still:true});p.wave=wave;p.motion.x=0;p.motion.z=-7;
    p.step(CONFIG.tick,true,true,{x:0,y:0.9,z:10},{x:0,y:0,z:-1});assert.equal(p.hp,100);
    p.step(CONFIG.tick,true,false,{x:0,y:0.9,z:-4},{x:0,y:0,z:-1});assert.equal(p.hp,100);
  }
});
test('random movement stays in the arena, clear of cover and the player, and covers every quadrant', () => {
  const p = new Practice({ seed: 7 }), quadrants = new Set<string>(); let minZ=Infinity,maxZ=-Infinity;
  for (let i=0;i<120*60;i++) {
    p.step(CONFIG.tick,true,false,PLAYER,{x:0,y:0,z:-1});
    const {x,z}=p.position;
    quadrants.add(`${Math.sign(x)},${Math.sign(z)}`);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
    assert.ok(Math.abs(x)+CONFIG.targetWidth/2<CONFIG.arenaHalf && Math.abs(z)+CONFIG.targetWidth/2<CONFIG.arenaHalf,'inside the walls');
    assert.ok(x+0.45<COVER.min.x || x-0.45>COVER.max.x || z+0.45<COVER.min.z || z-0.45>COVER.max.z,'outside the cover');
    assert.ok(Math.hypot(x-PLAYER.x,z-PLAYER.z)>2.5,'does not run through the player');
  }
  for(const quadrant of ['1,1','1,-1','-1,1','-1,-1'])assert.ok(quadrants.has(quadrant));
  assert.ok(minZ < -6 && maxZ > 5,'travels in depth, including behind the player spawn');
  const before=p.position;p.step(CONFIG.tick,false,false,PLAYER,{x:0,y:0,z:-1});assert.deepEqual(p.position,before,'pause freezes the target');
});
test('routes are random per session but repeatable for the same seed', () => {
  const run = (seed: number) => { const p=new Practice({seed}); for(let i=0;i<600;i++)p.step(CONFIG.tick,true,false,PLAYER,{x:0,y:0,z:-1}); return p.position; };
  assert.deepEqual(run(42),run(42));
  assert.notDeepEqual(run(42),run(43));
});
test('later waves move faster and change direction more sharply', () => {
  const measure = (wave: number) => {
    const p=new Practice({seed:3});p.wave=wave;let distance=0,turning=0,heading:number|null=null;
    for(let i=0;i<60*60;i++){
      const before=p.position;p.step(CONFIG.tick,true,false,PLAYER,{x:0,y:0,z:-1});const after=p.position;
      distance+=Math.hypot(after.x-before.x,after.z-before.z);
      if(Math.hypot(p.motion.vx,p.motion.vz)>0.5){const h=Math.atan2(p.motion.vz,p.motion.vx);if(heading!==null)turning+=Math.abs(Math.atan2(Math.sin(h-heading),Math.cos(h-heading)));heading=h;}
    }
    return {speed:distance/60,turn:turning/60};
  };
  const early=measure(1),late=measure(15);
  assert.ok(late.speed>early.speed*1.5,`late ${late.speed} vs early ${early.speed} m/s`);
  assert.ok(late.turn>early.turn,`late ${late.turn} vs early ${early.turn} rad/s`);
});
test('tracking the bot well makes it dodge away from the crosshair; untracked bots never dodge', () => {
  const run = (firing: boolean) => {
    const p=new Practice({seed:11});let dodges=0,away=0;
    for(let i=0;i<90*60;i++){
      // Aim slightly to one side of where the target is heading, still on its body.
      const side=across(p),lead={x:p.motion.x+p.motion.vx*CONFIG.tick-side.x*0.15,y:PRACTICE.centerY,z:p.motion.z+p.motion.vz*CONFIG.tick-side.z*0.15};
      const wasEvading=p.motion.evade>0;
      p.step(CONFIG.tick,true,firing,PLAYER,look(PLAYER,lead));
      if(!wasEvading && p.motion.evade>0){dodges++;const now=across(p);if(p.motion.ex*now.x+p.motion.ez*now.z>0)away++;}
      if(p.hp<=0){p.hp=100;p.respawn=0;}
    }
    return {dodges,away};
  };
  const tracked=run(true),idle=run(false);
  assert.ok(tracked.dodges>=3,`dodged ${tracked.dodges} times`);
  assert.ok(tracked.away/tracked.dodges>=0.7,`${tracked.away}/${tracked.dodges} dodges moved away from the crosshair`);
  assert.equal(idle.dodges,0);
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
    const p=new Practice({still:true});p.wave=wave;
    for(let i=0;i<60;i++) {
      const center=p.position;
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
  const p=new Practice({still:true});p.motion.x=0;p.motion.z=-7;
  p.step(CONFIG.tick,true,true,{x:0,y:PRACTICE.centerY+BOT_MODEL.headY,z:10},{x:0,y:0,z:-1});assert.equal(p.hp,100);assert.equal(p.headshot,false);
  p.hp=0.1;const at=p.position;
  p.step(CONFIG.tick,true,true,{x:at.x,y:at.y+BOT_MODEL.headY,z:at.z+0.6},{x:0,y:0,z:-1});assert.equal(p.hp,0);assert.equal(p.kills,1);
});
