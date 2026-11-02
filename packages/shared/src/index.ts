import { MODES, type ModeId } from './modes';
import { ARENA, ARENA_SOLIDS, PILLAR, overlaps } from './arena';
export { ARENA, ARENA_SOLIDS, PILLAR, SPAWN_COVERS, STAIRS, PLATFORMS, overlaps } from './arena';
export { MODES, isMode, type ModeId } from './modes';
export const CONFIG = { tick: 1 / 60, hp: 100, dps: 20, roundSeconds: 90, countdownSeconds: 3, roundSummarySeconds: 3, winsRequired: 2, suddenDeathSeconds: 15, arenaHalf: 14, speed: 7, acceleration: 38, airAcceleration: 12, gravity: 23, jumpSpeed: 8, radius: 0.35, height: 1.8, eyeHeight: 1.6, targetWidth: 0.9, targetHeight: 1.8, crouchHeight: 0.6, crouchSpeed: 0.5, crouchRate: 8 } as const;
export type Vec3 = { x: number; y: number; z: number };
export type Box = { min: Vec3; max: Vec3; radius?: number; step?: boolean };
export const COVER = PILLAR;
/** `crouch` eases from 0 (standing) to 1 (fully crouched). */
export type Body = Vec3 & { vx: number; vy: number; vz: number; grounded: boolean; crouch?: number };
export type Input = { forward: number; strafe: number; jump: boolean; yaw: number; crouch?: boolean };
export const spawn = (side = 1): Body => ({ x: 0, y: 0, z: side * ARENA.spawnZ, vx: 0, vy: 0, vz: 0, grounded: true, crouch: 0 });
/** Share of full height for the current crouch: 1 standing, CONFIG.crouchHeight fully crouched. */
export const stance = (body: Pick<Body, 'crouch'>) => 1 - (1 - CONFIG.crouchHeight) * (body.crouch ?? 0);
export const eyeHeight = (body: Pick<Body, 'crouch'>, mode: ModeId = 'standard') => CONFIG.eyeHeight * MODES[mode].scale * stance(body);
const approach = (a: number, b: number, step: number) => a + Math.max(-step, Math.min(step, b - a));
export function move(body: Body, input: Input, dt: number, solids: Box[] = ARENA_SOLIDS, mode: ModeId = 'standard') {
  const profile = MODES[mode], radius = CONFIG.radius * profile.scale, full = CONFIG.height * profile.scale;
  const blockers = (h:number) => solids.filter(b=>overlaps(body,radius,b) && body.y < b.max.y-1e-8 && body.y+h>b.min.y+1e-8);
  const collides = (h: number) => blockers(h).length>0;
  // Crouch eases in and out; standing back up waits for headroom.
  const crouch = approach(body.crouch ?? 0, input.crouch ? 1 : 0, CONFIG.crouchRate * dt);
  if (crouch >= (body.crouch ?? 0) || !collides(full * stance({ crouch }))) body.crouch = crouch;
  const height = full * stance(body), pace = CONFIG.speed * profile.speed * (1 - (1 - CONFIG.crouchSpeed) * (body.crouch ?? 0));
  const length = Math.max(1, Math.hypot(input.forward, input.strafe));
  const f = input.forward / length, s = input.strafe / length;
  const accel = (body.grounded ? CONFIG.acceleration : CONFIG.airAcceleration) * dt;
  body.vx = approach(body.vx, (s * Math.cos(input.yaw) - f * Math.sin(input.yaw)) * pace, accel);
  body.vz = approach(body.vz, (-f * Math.cos(input.yaw) - s * Math.sin(input.yaw)) * pace, accel);
  if (input.jump && body.grounded) { body.vy = CONFIG.jumpSpeed * profile.jump; body.grounded = false; }
  const stepping=body.grounded && !input.jump;
  for (const axis of ['x', 'z'] as const) {
    const old = body[axis];
    body[axis] = Math.max(-CONFIG.arenaHalf + radius, Math.min(CONFIG.arenaHalf - radius, old + body[axis === 'x' ? 'vx' : 'vz'] * dt));
    const blocked=blockers(height),oldHeight=body.y;
    if(blocked.length && stepping && blocked.every(b=>b.step && b.max.y-body.y<=0.3+1e-8))body.y=Math.max(...blocked.map(b=>b.max.y));
    if (collides(height)) { body[axis] = old; body.y=oldHeight; body[axis === 'x' ? 'vx' : 'vz'] = 0; }
  }
  // The boundary is a closed circle at every height, so jumps cannot leave the arena.
  const distance=Math.hypot(body.x,body.z),limit=ARENA.radius-radius;
  if(distance>limit){const nx=body.x/distance,nz=body.z/distance,outward=body.vx*nx+body.vz*nz;body.x=nx*limit;body.z=nz*limit;if(outward>0){body.vx-=outward*nx;body.vz-=outward*nz;}}
  const oldY = body.y;
  body.vy -= CONFIG.gravity * dt;
  body.y += body.vy * dt;
  body.grounded = false;
  for (const b of solids) {
    if (!overlaps(body,radius,b)) continue;
    if (oldY >= b.max.y && body.y <= b.max.y) { body.y = b.max.y; body.vy = 0; body.grounded = true; }
    else if (oldY + height <= b.min.y && body.y + height >= b.min.y) { body.y = b.min.y - height; body.vy = 0; }
  }
  if(stepping && body.vy<=0){const support=Math.max(0,...solids.filter(b=>b.step && overlaps(body,radius,b) && b.max.y<=oldY+1e-8).map(b=>b.max.y));if(oldY-support<=0.3+1e-8 && body.y>=support){body.y=support;body.vy=0;body.grounded=true;}}
  if (body.y <= 0) { body.y = 0; body.vy = 0; body.grounded = true; }
}
export function rayBox(origin: Vec3, direction: Vec3, box: Box): number | null {
  let near = 0, far = Infinity;
  if(box.radius!==undefined){
    const x=origin.x-(box.min.x+box.max.x)/2,z=origin.z-(box.min.z+box.max.z)/2,a=direction.x**2+direction.z**2,b=x*direction.x+z*direction.z,c=x*x+z*z-box.radius**2;
    if(a<1e-12){if(c>0)return null;}else{const disc=b*b-a*c;if(disc<0)return null;near=Math.max(0,(-b-Math.sqrt(disc))/a);far=(-b+Math.sqrt(disc))/a;}
    if(Math.abs(direction.y)<1e-9){if(origin.y<box.min.y || origin.y>box.max.y)return null;}else{const a=(box.min.y-origin.y)/direction.y,b=(box.max.y-origin.y)/direction.y;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}
    return near<=far?near:null;
  }
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(direction[axis]) < 1e-9) { if (origin[axis] < box.min[axis] || origin[axis] > box.max[axis]) return null; continue; }
    const a = (box.min[axis] - origin[axis]) / direction[axis], b = (box.max[axis] - origin[axis]) / direction[axis];
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  return near;
}
export function arenaRay(origin:Vec3,direction:Vec3){let nearest:number|null=null;for(const solid of ARENA_SOLIDS){const hit=rayBox(origin,direction,solid);if(hit!==null && (nearest===null || hit<nearest))nearest=hit;}return nearest;}
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
