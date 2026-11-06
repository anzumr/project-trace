import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOW, arrowDamage, arrowDrop, arrowSpeed, skeleton, partAt, flyArrow, launch, arenaHit, type ArcherPose } from './bow';
import { AIR, CONFIG, move, spawn } from './index';

const pose = (over: Partial<ArcherPose> = {}): ArcherPose => ({ x: 0, y: 0, z: 0, crouch: 0, yaw: 0, pitch: 0, draw: 0, raise: 0, gait: 0, grounded: true, speed: 0, ...over });

test('damage and speed scale with charge; head doubles and limbs take 60%', () => {
  assert.deepEqual([arrowDamage(0, 'torso'), arrowDamage(1, 'torso'), arrowDamage(1, 'head'), arrowDamage(1, 'limb'), arrowDamage(0, 'head'), arrowDamage(0, 'limb')], [25, 75, 150, 45, 50, 15]);
  assert.equal(arrowDamage(2, 'torso'), 75); assert.equal(arrowDamage(-1, 'torso'), 25);
  assert.equal(arrowSpeed(0), BOW.minSpeed); assert.equal(arrowSpeed(1), BOW.maxSpeed);
});

test('hits land only on the visible body: head, round torso, arms and legs, never the gaps', () => {
  const k = skeleton(pose());
  assert.equal(partAt(k, { x: 0, y: 1.62, z: 0 }), 'head');
  assert.equal(partAt(k, { x: 0, y: 1.2, z: 0 }), 'torso');
  assert.equal(partAt(k, { x: 0.22, y: 1.28, z: 0 }), 'torso', 'the torso is round, wide at the chest');
  assert.equal(partAt(k, { x: 0, y: 0.84, z: 0.14 }), null, 'narrow at the hips');
  assert.equal(partAt(k, { x: 0, y: 0.4, z: 0 }), null, 'between the legs');
  assert.equal(partAt(k, { x: 0, y: 2.2, z: 0 }), null);
  const knee = k.legs[0][1]; assert.equal(partAt(k, knee), 'limb');
  const hand = k.arms[1][2]; assert.equal(partAt(k, hand), 'limb');
  // Facing −z at yaw 0: the depth is the narrow axis.
  assert.equal(partAt(k, { x: 0, y: 1.3, z: 0.25 }), null); assert.equal(partAt(k, { x: 0.25, y: 1.3, z: 0 }), 'torso');
  const turned = skeleton(pose({ yaw: Math.PI / 2 })); assert.equal(partAt(turned, { x: 0.25, y: 1.3, z: 0 }), null); assert.equal(partAt(turned, { x: 0, y: 1.3, z: 0.25 }), 'torso');
  assert.equal(partAt(k, { x: 0, y: 1.455, z: 0.05 }), 'head', 'the neck gap is covered');
  assert.equal(partAt(k, { x: 0.3, y: 1.62, z: 0 }), null, 'but not a wide miss beside the head');
});

test('crouching lowers the whole body; raising the bow puts the left hand forward along the aim', () => {
  const low = skeleton(pose({ crouch: 1 }));
  assert.equal(partAt(low, { x: 0, y: 1.62, z: 0 }), null); assert.equal(partAt(low, { x: 0, y: 1.62 * (1 - (1 - CONFIG.crouchHeight)), z: 0 }), 'head');
  const aiming = skeleton(pose({ raise: 1, draw: 1 })), hand = aiming.arms[0][2];
  assert.ok(hand.z < -0.45 && Math.abs(hand.y - 1.36) < 0.05, 'bow hand out in front (−z) at shoulder height');
  const up = skeleton(pose({ raise: 1, pitch: 0.6 })); assert.ok(up.arms[0][2].y > hand.y + 0.2);
  assert.ok(aiming.aim.z < -0.9, 'bow points where the player looks');
});

test('a full draw flies dead flat for its first ~10 m and then curves down; a tap lobs like a grenade', () => {
  // Across the open middle of the arena (z = 4 clears the pillar and both stairs): 26 m of flight.
  const eye = { x: -13, y: 1.6, z: 4 }, full = launch(eye, -Math.PI / 2, 0, 1);
  for (let i = 0; i < 9; i++) flyArrow(full, CONFIG.tick);
  assert.ok(Math.abs(full.x - (-13 + 9)) < 1e-9 && full.y === 1.6, 'no drop at all for the first 9 m');
  for (let i = 0; i < 11; i++) flyArrow(full, CONFIG.tick);
  const at20 = 1.6 - full.y; assert.ok(at20 > 0.1 && at20 < 0.25, `barely curving at 20 m (${at20})`);
  for (let i = 0; i < 5; i++) assert.equal(flyArrow(full, CONFIG.tick), null);
  const at25 = 1.6 - full.y; assert.ok(at25 > 0.35 && at25 < 0.5, `clearly curving by 25 m (${at25})`);
  assert.ok(Math.abs(arrowDrop(1, 0.15).drop) < 1e-12 && arrowDrop(1, 0.5).drop - arrowDrop(1, 0.45).drop > arrowDrop(1, 0.35).drop - arrowDrop(1, 0.3).drop, 'bending harder the further it goes');
  const tap = launch({ x: 5, y: 3, z: 6 }, 0, 0, 0); for (let i = 0; i < 30; i++) flyArrow(tap, CONFIG.tick);
  assert.ok(Math.abs(3 - tap.y - 0.5 * BOW.lob * 0.25) < 1e-9 && Math.abs(tap.z - (6 - 8)) < 1e-9, 'a tap has fallen 2.5 m by 8 m out');
  // Launched across open floor (z = 3 clears the pillar and stairs), so it lands rather than meeting the wall.
  const lob = launch({ x: 12, y: 1.6, z: 3 }, Math.PI / 2, Math.PI / 4, 0); let landed = null;
  for (let i = 0; i < 200 && !landed; i++) landed = flyArrow(lob, CONFIG.tick);
  assert.ok(landed?.wall && Math.abs(lob.y) < 1e-9 && 12 - lob.x > 13.5 && 12 - lob.x < 15, `a 45° tap lands about 14 m away (${12 - lob.x})`);
  for (const c of [0, 0.5, 1]) { const a = launch(eye, 0.3, 0.2, c); for (let i = 0; i < 20; i++) flyArrow(a, CONFIG.tick); }
});
test('arrows stop at walls, the floor and the pillar, and report the first body part on the way', () => {
  const eye = { x: 5, y: 1.6, z: 6 };
  const wall = launch({ x: 0, y: 1.6, z: 10 }, 0, 0, 1); let hit = null;
  for (let i = 0; i < 30 && !hit; i++) hit = flyArrow(wall, CONFIG.tick);
  assert.ok(hit?.wall && Math.abs(wall.z - 8.9) < 1e-6, 'stops on the spawn wall face');
  const floor = launch({ x: 5, y: 1.6, z: 0 }, 0, -0.5, 1); hit = null;
  for (let i = 0; i < 30 && !hit; i++) hit = flyArrow(floor, CONFIG.tick);
  assert.ok(hit?.wall && Math.abs(floor.y) < 1e-9);
  assert.equal(arenaHit({ x: 0, y: 1, z: 5 }, { x: 0, y: 0, z: -4 }), 0.75, 'the pillar');
  assert.ok(Math.abs(arenaHit({ x: 0, y: 3, z: 4 }, { x: 20, y: 0, z: 0 })! * 20 - Math.sqrt(196 - 16)) < 1e-9, 'the circular wall');
  assert.equal(arenaHit({ x: 0, y: 7, z: 4 }, { x: 20, y: 0, z: 0 }), null, 'over the wall top');
  const target = skeleton(pose({ x: 5, z: -6 })), shot = launch(eye, 0, Math.atan2(1.2 - 1.6 + arrowDrop(1, 12 / 60).drop, 12), 1); hit = null;
  for (let i = 0; i < 20 && !hit; i++) hit = flyArrow(shot, CONFIG.tick, p => partAt(target, p));
  assert.equal(hit?.part, 'torso'); assert.ok(Math.abs(shot.z - (-6 + 0.157 + 0.68 * BOW.margin)) < 0.05, 'stops at the front of the torso, padded by the arrow radius');
});

test('air jump: one per jump, dashes where you steer, recharges on landing but not within 4 seconds; drawing slows you', () => {
  const b = spawn(); b.z = 5;
  move(b, { forward: 0, strafe: 0, jump: true, yaw: 0 }, CONFIG.tick, [], 'standard', true);
  for (let i = 0; i < 10; i++) move(b, { forward: 0, strafe: 0, jump: false, yaw: 0 }, CONFIG.tick, [], 'standard', true);
  move(b, { forward: 0, strafe: 1, jump: true, yaw: 0 }, CONFIG.tick, [], 'standard', true);
  assert.ok(Math.abs(b.vx - AIR.dash) < 1 && b.vy > AIR.up - 1 && b.airReady === false);
  const vy = b.vy; move(b, { forward: 0, strafe: 1, jump: true, yaw: 0 }, CONFIG.tick, [], 'standard', true); assert.ok(b.vy < vy, 'no second air jump');
  for (let i = 0; i < 120 && !b.grounded; i++) move(b, { forward: 0, strafe: 0, jump: false, yaw: 0 }, CONFIG.tick, [], 'standard', true);
  move(b, { forward: 0, strafe: 0, jump: true, yaw: 0 }, CONFIG.tick, [], 'standard', true);
  for (let i = 0; i < 10; i++) move(b, { forward: 0, strafe: 0, jump: false, yaw: 0 }, CONFIG.tick, [], 'standard', true);
  const before = b.vy; move(b, { forward: 0, strafe: 0, jump: true, yaw: 0 }, CONFIG.tick, [], 'standard', true);
  assert.ok(b.vy < before, 'cooldown blocks the next air jump');
  const plain = spawn(); move(plain, { forward: 0, strafe: 0, jump: true, yaw: 0 }, CONFIG.tick, []); for (let i = 0; i < 10; i++) move(plain, { forward: 0, strafe: 0, jump: false, yaw: 0 }, CONFIG.tick, []);
  const fall = plain.vy; move(plain, { forward: 0, strafe: 0, jump: true, yaw: 0 }, CONFIG.tick, []); assert.ok(plain.vy < fall, 'tracking modes have no air jump');
  const draw = spawn(), free = spawn();
  for (let i = 0; i < 60; i++) { move(draw, { forward: 1, strafe: 0, jump: false, yaw: 0, firing: true }, CONFIG.tick, [], 'standard', true); move(free, { forward: 1, strafe: 0, jump: false, yaw: 0, firing: true }, CONFIG.tick, []); }
  assert.ok(Math.abs(-draw.vz - CONFIG.speed * AIR.drawPace) < 1e-9 && Math.abs(-free.vz - CONFIG.speed) < 1e-9);
});
