import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '@trace/shared';
import { STEPS, StepTracker, clipSet, footstepSamples, type Feet, type StepEvent } from './footsteps';

/** Moves along x at `speed` for `seconds`, sampling every tick, and collects the events. */
function walk(tracker: StepTracker, speed: number, seconds: number, over: Partial<Feet> = {}, from = 0) {
  const events: StepEvent[] = [];
  for (let i = 0; i <= seconds / CONFIG.tick; i++) { const e = tracker.update({ x: from + speed * i * CONFIG.tick, y: 0, z: 0, grounded: true, ...over }, CONFIG.tick); if (e) events.push(e); }
  return events;
}

test('a run makes a step every stride; standing still makes none; the first step comes half a stride in', () => {
  const run = walk(new StepTracker(), CONFIG.speed, 2);
  assert.equal(run.length, Math.floor((CONFIG.speed * 2 - STEPS.stride / 2) / STEPS.stride) + 1);
  assert.ok(run.every(e => e.kind === 'step' && Math.abs(e.loudness - 1) < 1e-9), 'full speed is full loudness');
  assert.deepEqual(walk(new StepTracker(), 0, 2), []);
  assert.deepEqual(walk(new StepTracker(), 0.8, 2), [], 'shuffling below the minimum speed is silent');
  const first = new StepTracker(); let at = -1;
  for (let i = 0; i < 60 && at < 0; i++) if (first.update({ x: CONFIG.speed * i * CONFIG.tick, y: 0, z: 0, grounded: true }, CONFIG.tick)) at = CONFIG.speed * i * CONFIG.tick;
  assert.ok(Math.abs(at - STEPS.stride / 2) < CONFIG.speed * CONFIG.tick + 1e-9);
});
test('movement that updates on ticks, with still frames between, still makes steady steps', () => {
  const tracker = new StepTracker(); let x = 0, steps = 0;
  // 120 fps rendering of a 60 Hz position: every other frame has not moved.
  for (let frame = 0; frame < 240; frame++) { if (frame % 2) x += 4 * CONFIG.tick; if (tracker.update({ x, y: 0, z: 0, grounded: true }, CONFIG.tick / 2)) steps++; }
  assert.equal(steps, Math.floor((x - STEPS.stride / 2) / STEPS.stride) + 1);
});
test('crouching and walking are quieter; a respawn teleport is not a step', () => {
  const crouched = walk(new StepTracker(), CONFIG.speed * CONFIG.crouchSpeed, 3, { crouch: 1 }), slow = walk(new StepTracker(), 3, 3);
  assert.ok(crouched.length > 0 && crouched.every(e => e.loudness < 0.3));
  assert.ok(slow.every(e => e.loudness < 0.8 && e.loudness > 0.55));
  const tracker = new StepTracker(); tracker.update({ x: 0, y: 0, z: 0, grounded: true }, CONFIG.tick);
  assert.equal(tracker.update({ x: 20, y: 0, z: 0, grounded: true }, CONFIG.tick), null);
});
test('a jump takes off, is silent in the air, then lands with a thud; a tiny hop does not thud', () => {
  const tracker = new StepTracker(), events: (StepEvent | null)[] = [];
  for (let i = 0; i < 40; i++) events.push(tracker.update({ x: 5, y: i === 0 || i === 39 ? 0 : Math.min(i, 39 - i) * 0.1, z: 0, grounded: i === 0 || i === 39 }, CONFIG.tick));
  assert.deepEqual(events.filter(Boolean).map(e => e!.kind), ['jump', 'land']);
  const hop = new StepTracker(); hop.update({ x: 0, y: 0, z: 0, grounded: true }, CONFIG.tick);
  for (let i = 0; i < 5; i++) hop.update({ x: 0, y: 0.2, z: 0, grounded: false }, CONFIG.tick);
  assert.equal(hop.update({ x: 0, y: 0, z: 0, grounded: true }, CONFIG.tick), null);
});
test('walking off a ledge is not a take-off; a Bow air jump is; running and walking pick different recordings', () => {
  const ledge = new StepTracker(); ledge.update({ x: 0, y: 2, z: 0, grounded: true }, CONFIG.tick);
  assert.equal(ledge.update({ x: 0.1, y: 1.9, z: 0, grounded: false }, CONFIG.tick), null);
  const air = new StepTracker(); air.update({ x: 0, y: 1, z: 0, grounded: false, airReady: true }, CONFIG.tick);
  assert.equal(air.update({ x: 0, y: 1.1, z: 0, grounded: false, airReady: true }, CONFIG.tick), null);
  assert.equal(air.update({ x: 0.1, y: 1.2, z: 0, grounded: false, airReady: false }, CONFIG.tick)?.kind, 'jump');
  assert.equal(air.update({ x: 0.2, y: 1.3, z: 0, grounded: false, airReady: false }, CONFIG.tick), null, 'once');
  assert.equal(clipSet({ kind: 'step', loudness: 1, speed: CONFIG.speed }), 'run');
  assert.equal(clipSet({ kind: 'step', loudness: 1, speed: CONFIG.speed * CONFIG.crouchSpeed }), 'walk');
  assert.equal(clipSet({ kind: 'land', loudness: 1, speed: 7 }), 'land'); assert.equal(clipSet({ kind: 'jump', loudness: 1, speed: 7 }), 'jump');
});
test('synthesized steps are short, normalized, varied by seed and repeatable', () => {
  const a = footstepSamples(48000, 'step', 1), b = footstepSamples(48000, 'step', 2), land = footstepSamples(48000, 'land', 1);
  assert.equal(a.length, Math.round(48000 * 0.12)); assert.equal(land.length, Math.round(48000 * 0.22));
  assert.ok(Math.abs(Math.max(...a.map(Math.abs)) - 0.8) < 1e-6);
  assert.notDeepEqual(a, b); assert.deepEqual(a, footstepSamples(48000, 'step', 1));
  assert.ok(Math.abs(a[a.length - 1]) < 0.01, 'decays to silence');
});
