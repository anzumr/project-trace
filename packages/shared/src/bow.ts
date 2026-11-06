import { CONFIG, ARENA, ARENA_SOLIDS, AIR, rayBox, stance, type Body, type Vec3 } from './index';

/**
 * Bow 1v1 rules. Damage scales with charge: 25 at a tap, 75 at full draw, ×2 head, ×0.6 arms and legs.
 * Flight: a tap leaves at 16 m/s under 20 m/s² and lobs like a grenade; a full draw leaves at 60 m/s, flies flat for its
 * first `flat` seconds (about 9 m), then gravity (18 m/s²) bites in over `ramp` seconds and curves it down (0.4 m by 25 m).
 * `margin` is the arrow's hit radius: fatter than the drawn shaft, so an arrow that visibly grazes a body part counts,
 * and the neck between head and torso is covered. `rewind` is how far back (s) a shot is tested against what the shooter saw.
 */
export const BOW = { draw: 0.75, reload: 0.35, minSpeed: 16, maxSpeed: 60, lob: 20, fall: 18, flat: 0.15, ramp: 0.1, base: 25, bonus: 50, head: 2, limb: 0.6, kills: 5, respawn: 2, life: 3, stuck: 3, maxArrows: 24, margin: 0.06, rewind: 0.4, ...AIR } as const;
export type Part = 'head' | 'torso' | 'limb';
const unit = (n: number) => Math.max(0, Math.min(1, n));
export const arrowSpeed = (charge: number) => BOW.minSpeed + (BOW.maxSpeed - BOW.minSpeed) * unit(charge);
export const arrowGravity = (charge: number) => BOW.lob + (BOW.fall - BOW.lob) * unit(charge);
/** How far below its straight line an arrow has fallen after `t` seconds, and how fast it is falling. */
export function arrowDrop(charge: number, t: number) {
  const c = unit(charge), g = arrowGravity(c), m = BOW.ramp * c, u = t - BOW.flat * c * c;
  if (u <= 0) return { drop: 0, fall: 0 };
  if (m < 1e-9) return { drop: g * u * u / 2, fall: g * u };
  if (u < m) return { drop: g * u ** 3 / (6 * m), fall: g * u * u / (2 * m) };
  const s = u - m;
  return { drop: g * (m * m / 6 + m * s / 2 + s * s / 2), fall: g * (m / 2 + s) };
}
export const arrowDamage = (charge: number, part: Part) => Math.round((BOW.base + BOW.bonus * unit(charge)) * (part === 'head' ? BOW.head : part === 'limb' ? BOW.limb : 1));

/** Everything that shapes an archer's body. `raise` eases 0→1 while the bow is held up; `gait` is the running phase. */
export type ArcherPose = Vec3 & { crouch: number; yaw: number; pitch: number; draw: number; raise: number; gait: number; grounded: boolean; speed: number };
/** The pose a player's synced state describes: shared so the server's hit test and the client's model agree. */
export const poseOf = (p: { body: Body; yaw: number; pitch: number; gait?: number; bow?: { draw: number; raise: number } }): ArcherPose =>
  ({ x: p.body.x, y: p.body.y, z: p.body.z, crouch: p.body.crouch ?? 0, yaw: p.yaw, pitch: p.pitch, draw: p.bow?.draw ?? 0, raise: p.bow?.raise ?? 0, gait: p.gait ?? 0, grounded: p.body.grounded, speed: Math.hypot(p.body.vx, p.body.vz) });
/** Running phase advance per metre travelled, matching a 7 m/s run to the leg cycle. */
export const GAIT_RATE = 1.36;
export type Seg = { a: Vec3; b: Vec3; r: number };
export type Skeleton = { pelvis: Vec3; squash: number; yaw: number; head: Vec3; arms: [Vec3, Vec3, Vec3][]; legs: [Vec3, Vec3, Vec3][]; segs: Seg[]; aim: Vec3; bowUp: Vec3 };
/** Torso outline as [radius, height above the pelvis]; the cross-section is an ellipse 0.68 as deep as it is wide. */
export const TORSO: readonly (readonly [number, number])[] = [[0, 0], [0.07, 0.02], [0.13, 0.12], [0.2, 0.3], [0.25, 0.46], [0.24, 0.55], [0.13, 0.61], [0, 0.62]];
export const ARCHER = { pelvis: 0.82, head: 1.62, headRadius: 0.15, depth: 0.68, shoulder: [0.17, 1.36], hip: 0.1, arm: [0.28, 0.27], leg: [0.42, 0.42], armRadius: 0.035, legRadius: 0.042 } as const;
export function torsoRadius(y: number) {
  for (let i = 1; i < TORSO.length; i++) { const [a, b] = TORSO[i - 1], [c, d] = TORSO[i]; if (y <= d) return a + (c - a) * (y - b) / Math.max(1e-6, d - b); }
  return 0;
}
type L = [number, number, number];
const lerp = (a: L, b: L, t: number): L => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (t: number) => { t = unit(t); return t * t * (3 - 2 * t); };
/** Two-bone reach in model space (x left, y up, z forward): returns the joint and the end point. */
function reach(s: L, t: L, l1: number, l2: number, pole: L): [L, L] {
  const d: L = [t[0] - s[0], t[1] - s[1], t[2] - s[2]], len = Math.hypot(...d) || 1e-6, n: L = [d[0] / len, d[1] / len, d[2] / len], at = Math.max(1e-3, Math.min(len, l1 + l2 - 1e-3));
  const x = (l1 * l1 - l2 * l2 + at * at) / (2 * at), h = Math.sqrt(Math.max(0, l1 * l1 - x * x)), dot = pole[0] * n[0] + pole[1] * n[1] + pole[2] * n[2];
  let p: L = [pole[0] - n[0] * dot, pole[1] - n[1] * dot, pole[2] - n[2] * dot]; const pl = Math.hypot(...p); p = pl < 1e-6 ? [0, 0, 1] : [p[0] / pl, p[1] / pl, p[2] / pl];
  return [[s[0] + n[0] * x + p[0] * h, s[1] + n[1] * x + p[1] * h, s[2] + n[2] * x + p[2] * h], [s[0] + n[0] * at, s[1] + n[1] * at, s[2] + n[2] * at]];
}
/** The archer as drawn and as hit: the client renders exactly these joints, and arrows test against them. */
export function skeleton(s: ArcherPose): Skeleton {
  const squash = stance(s), run = s.grounded ? unit(s.speed / CONFIG.speed) : 0, sn = Math.sin(s.gait), cs = Math.cos(s.gait), up = smooth(s.raise);
  const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
  const world = ([x, y, z]: L): Vec3 => ({ x: s.x - rx * x + fx * z, y: s.y + y * squash, z: s.z - rz * x + fz * z });
  const dir = (v: L): Vec3 => ({ x: -rx * v[0] + fx * v[2], y: v[1], z: -rz * v[0] + fz * v[2] });
  const pelvis = ARCHER.pelvis - run * (0.06 - 0.05 * Math.abs(cs));
  const aim: L = [0, Math.sin(s.pitch), Math.cos(s.pitch)];
  const [sx, sy] = ARCHER.shoulder, bowHand: L = [0.11, sy + 0.53 * aim[1], 0.53 * aim[2]], rest: L = [bowHand[0], bowHand[1] - 0.16 * aim[1], bowHand[2] - 0.16 * aim[2]];
  const hands: [L, L] = [
    lerp([0.27, 0.9 + 0.1 * run - 0.04 * sn * run, 0.12 - 0.15 * sn * run], bowHand, up),
    lerp([-0.25, 0.86 + (0.16 + 0.06 * sn) * run, 0.03 + (0.03 + 0.3 * sn) * run], lerp(rest, [-0.03, 1.5, 0.1], smooth(s.draw)), up),
  ];
  const feet: [L, L] = s.grounded
    ? [lerp([0.15, 0.04, 0.03], [0.12, 0.04 + 0.22 * Math.max(0, cs), 0.06 + 0.34 * sn], run), lerp([-0.15, 0.04, -0.03], [-0.12, 0.04 + 0.22 * Math.max(0, -cs), 0.06 - 0.34 * sn], run)]
    : [[0.13, 0.42, 0.16], [-0.13, 0.38, 0.1]];
  const poles: L[] = [lerp([0.8, -0.3, -1], [0.6, -0.4, -0.2], up), lerp([-0.8, -0.3, -1], [-1, -0.1, -0.4], up)];
  const shoulderY = sy - ARCHER.pelvis + pelvis, segs: Seg[] = [];
  const arms = ([1, -1] as const).map((side, i): [Vec3, Vec3, Vec3] => {
    const shoulder: L = [side * sx, shoulderY, 0], [elbow, hand] = reach(shoulder, hands[i], ARCHER.arm[0], ARCHER.arm[1], poles[i]);
    const w = [world(shoulder), world(elbow), world(hand)] as [Vec3, Vec3, Vec3];
    segs.push({ a: w[0], b: w[1], r: ARCHER.armRadius }, { a: w[1], b: w[2], r: ARCHER.armRadius }); return w;
  });
  const legs = ([1, -1] as const).map((side, i): [Vec3, Vec3, Vec3] => {
    const hip: L = [side * ARCHER.hip, pelvis, 0], [knee, foot] = reach(hip, feet[i], ARCHER.leg[0], ARCHER.leg[1], [0, 0.2, 1]);
    const w = [world(hip), world(knee), world(foot)] as [Vec3, Vec3, Vec3];
    segs.push({ a: w[0], b: w[1], r: ARCHER.legRadius }, { a: w[1], b: w[2], r: ARCHER.legRadius }); return w;
  });
  const idleAim: L = [0.15, -0.45, 1], bowAim = lerp(idleAim, aim, up), bowUp = lerp([0, 1, 0.3], [-0.15, 1, 0], up);
  return { pelvis: world([0, pelvis, 0]), squash, yaw: s.yaw, head: world([0, ARCHER.head - ARCHER.pelvis + pelvis, 0]), arms, legs, segs, aim: dir(bowAim), bowUp: dir(bowUp) };
}
const segDistance = (p: Vec3, a: Vec3, b: Vec3) => {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, t = unit(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / Math.max(1e-9, abx * abx + aby * aby + abz * abz));
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
};
/** Which part of the archer, if any, contains the point (padded by the arrow's own radius). The head wins overlaps. */
export function partAt(k: Skeleton, p: Vec3, margin: number = BOW.margin): Part | null {
  if (Math.hypot(p.x - k.head.x, p.y - k.head.y, p.z - k.head.z) < ARCHER.headRadius + margin) return 'head';
  const dx = p.x - k.pelvis.x, dz = p.z - k.pelvis.z, y = (p.y - k.pelvis.y) / k.squash;
  const forward = -Math.sin(k.yaw) * dx - Math.cos(k.yaw) * dz, side = Math.cos(k.yaw) * dx - Math.sin(k.yaw) * dz, r = torsoRadius(y) + margin;
  if (y >= 0 && y <= TORSO[TORSO.length - 1][1] && side * side + (forward / ARCHER.depth) ** 2 < r * r) return 'torso';
  return k.segs.some(s => segDistance(p, s.a, s.b) < s.r + margin) ? 'limb' : null;
}

/** An arrow's launch (origin `o`, velocity `u`, charge) and, after `t` seconds of flight, its position and velocity. */
export type Launch = { ox: number; oy: number; oz: number; ux: number; uy: number; uz: number; charge: number };
export type Flight = Launch & Vec3 & { vx: number; vy: number; vz: number; t: number };
/** Where an arrow is and how it is moving `t` seconds after launch: exact, so the server and every client agree. */
export function arrowAt(a: Launch, t: number) {
  const { drop, fall } = arrowDrop(a.charge, t);
  return { x: a.ox + a.ux * t, y: a.oy + a.uy * t - drop, z: a.oz + a.uz * t, vx: a.ux, vy: a.uy - fall, vz: a.uz };
}
/** First contact along `from + d·t`, t in [0, 1], with the arena: solids, the floor and the circular wall. */
export function arenaHit(from: Vec3, d: Vec3): number | null {
  let best: number | null = null;
  const take = (t: number | null) => { if (t !== null && t >= 0 && t <= 1 && (best === null || t < best)) best = t; };
  for (const solid of ARENA_SOLIDS) take(rayBox(from, d, solid));
  if (d.y < 0) take(-from.y / d.y);
  const a = d.x * d.x + d.z * d.z, b = from.x * d.x + from.z * d.z, c = from.x * from.x + from.z * from.z - ARENA.radius ** 2;
  if (a > 1e-12) { const t = (-b + Math.sqrt(Math.max(0, b * b - a * c))) / a; if (from.y + d.y * t < ARENA.wallHeight) take(t); }
  return best;
}
/** One step of flight along the exact path (as straight pieces). Stops at the first body part `body` reports, or at the arena. */
export function flyArrow(a: Flight, dt: number, body?: (p: Vec3) => Part | null): { part: Part | null; wall: boolean; at: Vec3 } | null {
  const next = arrowAt(a, a.t + dt), d = { x: next.x - a.x, y: next.y - a.y, z: next.z - a.z };
  const wall = arenaHit(a, d), end = wall ?? 1, steps = Math.max(1, Math.ceil(Math.hypot(d.x, d.y, d.z) * end / 0.04));
  const stop = (f: number) => { a.t += dt * f; Object.assign(a, { x: a.x + d.x * f, y: a.y + d.y * f, z: a.z + d.z * f }, { vy: arrowAt(a, a.t).vy }); return { x: a.x, y: a.y, z: a.z }; };
  if (body) for (let i = 1; i <= steps; i++) {
    const f = end * i / steps, part = body({ x: a.x + d.x * f, y: a.y + d.y * f, z: a.z + d.z * f });
    if (part) return { part, wall: false, at: stop(f) };
  }
  if (wall !== null) return { part: null, wall: true, at: stop(wall) };
  a.t += dt; Object.assign(a, next);
  return null;
}
/** Arrows leave from the eye along the aim, at the speed the charge earned. */
export function launch(eye: Vec3, yaw: number, pitch: number, charge: number): Flight {
  const v = arrowSpeed(charge), ux = -Math.sin(yaw) * Math.cos(pitch) * v, uy = Math.sin(pitch) * v, uz = -Math.cos(yaw) * Math.cos(pitch) * v;
  return { ...eye, vx: ux, vy: uy, vz: uz, ox: eye.x, oy: eye.y, oz: eye.z, ux, uy, uz, charge: unit(charge), t: 0 };
}
