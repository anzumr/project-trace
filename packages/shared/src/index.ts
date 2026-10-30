import { MODES, type ModeId } from './modes';
export { MODES, isMode, type ModeId } from './modes';
export const CONFIG = { tick: 1 / 60, hp: 100, dps: 20, roundSeconds: 90, countdownSeconds: 3, roundSummarySeconds: 3, winsRequired: 2, suddenDeathSeconds: 15, arenaHalf: 14, speed: 7, acceleration: 38, airAcceleration: 12, gravity: 23, jumpSpeed: 8, radius: 0.35, height: 1.8, eyeHeight: 1.6, targetWidth: 0.9, targetHeight: 1.8 } as const;
export type Vec3 = { x: number; y: number; z: number };
export type Box = { min: Vec3; max: Vec3 };
export const COVER: Box = { min: { x: -1.8, y: 0, z: -1 }, max: { x: 1.8, y: 2.6, z: 0 } };
export type Body = Vec3 & { vx: number; vy: number; vz: number; grounded: boolean };
export type Input = { forward: number; strafe: number; jump: boolean; yaw: number };
export const spawn = (): Body => ({ x: 0, y: 0, z: 10, vx: 0, vy: 0, vz: 0, grounded: true });
const approach = (a: number, b: number, step: number) => a + Math.max(-step, Math.min(step, b - a));
export function move(body: Body, input: Input, dt: number, solids: Box[] = [COVER], mode: ModeId = 'standard') {
  const profile = MODES[mode], radius = CONFIG.radius * profile.scale, height = CONFIG.height * profile.scale;
  const length = Math.max(1, Math.hypot(input.forward, input.strafe));
  const f = input.forward / length, s = input.strafe / length;
  const accel = (body.grounded ? CONFIG.acceleration : CONFIG.airAcceleration) * dt;
  body.vx = approach(body.vx, (s * Math.cos(input.yaw) - f * Math.sin(input.yaw)) * CONFIG.speed * profile.speed, accel);
  body.vz = approach(body.vz, (-f * Math.cos(input.yaw) - s * Math.sin(input.yaw)) * CONFIG.speed * profile.speed, accel);
  if (input.jump && body.grounded) { body.vy = CONFIG.jumpSpeed * profile.jump; body.grounded = false; }
  const collides = () => solids.some(b => body.x + radius > b.min.x && body.x - radius < b.max.x && body.z + radius > b.min.z && body.z - radius < b.max.z && body.y < b.max.y && body.y + height > b.min.y);
  for (const axis of ['x', 'z'] as const) {
    const old = body[axis];
    body[axis] = Math.max(-CONFIG.arenaHalf + radius, Math.min(CONFIG.arenaHalf - radius, old + body[axis === 'x' ? 'vx' : 'vz'] * dt));
    if (collides()) { body[axis] = old; body[axis === 'x' ? 'vx' : 'vz'] = 0; }
  }
  const oldY = body.y;
  body.vy -= CONFIG.gravity * dt;
  body.y += body.vy * dt;
  body.grounded = false;
  for (const b of solids) {
    if (body.x + radius <= b.min.x || body.x - radius >= b.max.x || body.z + radius <= b.min.z || body.z - radius >= b.max.z) continue;
    if (oldY >= b.max.y && body.y <= b.max.y) { body.y = b.max.y; body.vy = 0; body.grounded = true; }
    else if (oldY + height <= b.min.y && body.y + height >= b.min.y) { body.y = b.min.y - height; body.vy = 0; }
  }
  if (body.y <= 0) { body.y = 0; body.vy = 0; body.grounded = true; }
}
export function rayBox(origin: Vec3, direction: Vec3, box: Box): number | null {
  let near = 0, far = Infinity;
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(direction[axis]) < 1e-9) { if (origin[axis] < box.min[axis] || origin[axis] > box.max[axis]) return null; continue; }
    const a = (box.min[axis] - origin[axis]) / direction[axis], b = (box.max[axis] - origin[axis]) / direction[axis];
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  return near;
}
export function tracking(origin: Vec3, direction: Vec3, target: Box, solids: Box[]): boolean {
  const hit = rayBox(origin, direction, target);
  return hit !== null && !solids.some(b => { const wall = rayBox(origin, direction, b); return wall !== null && wall <= hit; });
}
export const damage = (hp: number, dt: number) => Math.max(0, hp - CONFIG.dps * dt);
// Level L begins at 100 * (L - 1)^2 XP. Derived from trusted total XP, never awarded by clients.
export function levelProgress(totalXp: number) {
  const xp = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  return { level, xp, start: 100 * (level - 1) ** 2, next: 100 * level ** 2 };
}
export function targetBox(x: number, z: number, mode: ModeId = 'standard'): Box { const scale = MODES[mode].scale; return { min: { x: x - CONFIG.targetWidth * scale / 2, y: 0, z: z - CONFIG.targetWidth * scale / 2 }, max: { x: x + CONFIG.targetWidth * scale / 2, y: CONFIG.targetHeight * scale, z: z + CONFIG.targetWidth * scale / 2 } }; }
