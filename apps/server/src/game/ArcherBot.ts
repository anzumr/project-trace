import { CONFIG, arenaRay, eyeHeight, stance, type Vec3 } from '@trace/shared';
import { BOW, arrowDrop, arrowSpeed } from '@trace/shared/bow';
import { neutralInput, type Difficulty, type PlayerInput, type PlayerState } from '@trace/shared/protocol';
import { steer } from './ExtraHardAI';

const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, n: number) => Math.max(-n, Math.min(n, v));
type Range = readonly [number, number];
/**
 * Bow 1v1 practice bot strength. `reaction` s before the first draw after spotting you, `turn` rad/s, `error` rad of aim
 * miss per shot, `lead` share of your movement it leads, `charge` draw it waits for, `pause` s between shots, `head`
 * chance to aim at the head, `drop` how badly it misjudges arrow drop, `dodge` how readily it air-jumps away from your full draws, `move` strafe speed.
 */
export const ARCHER_SKILL: Record<Difficulty, { reaction: number; turn: number; error: number; lead: number; charge: Range; pause: Range; head: number; drop: number; dodge: number; jump: number; move: number; strafe: Range }> = {
  easy: { reaction: 0.8, turn: 2.5, error: 0.08, lead: 0, charge: [0.3, 0.6], pause: [0.9, 1.8], head: 0, drop: 0.6, dodge: 0, jump: 0.1, move: 0.6, strafe: [1.2, 2.4] },
  normal: { reaction: 0.45, turn: 5, error: 0.035, lead: 0.6, charge: [0.6, 1], pause: [0.45, 1], head: 0.15, drop: 0.25, dodge: 0.4, jump: 0.25, move: 0.85, strafe: [0.7, 1.6] },
  hard: { reaction: 0.25, turn: 9, error: 0.008, lead: 1, charge: [0.85, 1], pause: [0.15, 0.45], head: 0.4, drop: 0.05, dodge: 0.9, jump: 0.35, move: 1, strafe: [0.45, 1.2] },
};
/** Sight from the eye to the chest or head; cover blocks it. */
function sees(eye: Vec3, target: PlayerState) {
  const squat = stance(target.body);
  return [1.5, 1].some(h => {
    const d = { x: target.body.x - eye.x, y: target.body.y + h * squat - eye.y, z: target.body.z - eye.z }, length = Math.hypot(d.x, d.y, d.z);
    const wall = arenaRay(eye, { x: d.x / length, y: d.y / length, z: d.z / length });
    return wall === null || wall > length;
  });
}
/** Is `shooter` drawing a strong arrow and looking at `me`? */
function threatened(shooter: PlayerState, me: PlayerState) {
  if (!shooter.bow || shooter.bow.draw < 0.5) return false;
  const eye = { x: shooter.body.x, y: shooter.body.y + eyeHeight(shooter.body), z: shooter.body.z };
  const d = { x: me.body.x - eye.x, y: me.body.y + 1.2 - eye.y, z: me.body.z - eye.z }, length = Math.hypot(d.x, d.y, d.z) || 1;
  const look = { x: -Math.sin(shooter.yaw) * Math.cos(shooter.pitch), y: Math.sin(shooter.pitch), z: -Math.cos(shooter.yaw) * Math.cos(shooter.pitch) };
  return (look.x * d.x + look.y * d.y + look.z * d.z) / length > Math.cos(0.1);
}
/** A practice archer: it hunts you down, draws to its planned charge, leads and arcs its shots, and (from Normal up) dodges with the air jump. */
export class ArcherBot {
  private time = 0;
  private seenAt = -Infinity;
  private lastSeen = -Infinity;
  private strafe = 1;
  private nextStrafe = 0;
  private nextShot = 0;
  private nextJump = 0;
  private goal = 1;
  private head = false;
  private miss = { yaw: 0, pitch: 0, drop: 1 };
  private dodge: { at: number; side: number; stage: number } | null = null;
  constructor(readonly difficulty: Difficulty, private random: () => number = Math.random) { this.plan(); }
  private get skill() { return ARCHER_SKILL[this.difficulty]; }
  private pick([a, b]: Range) { return a + (b - a) * this.random(); }
  /** The next shot: how far to draw, where to aim, and this shot's miss. */
  private plan() { const s = this.skill; this.goal = this.pick(s.charge); this.head = this.random() < s.head; this.miss = { yaw: (this.random() * 2 - 1) * s.error, pitch: (this.random() * 2 - 1) * s.error * 0.7, drop: 1 + (this.random() * 2 - 1) * s.drop }; }
  reset() { this.seenAt = this.lastSeen = -Infinity; this.dodge = null; this.nextShot = this.time + 0.5; this.plan(); }
  input(self: PlayerState, target: PlayerState, seq: number): PlayerInput {
    const s = this.skill, dt = CONFIG.tick, now = (this.time += dt), bow = self.bow;
    const eye = { x: self.body.x, y: self.body.y + eyeHeight(self.body), z: self.body.z }, visible = target.hp > 0 && sees(eye, target);
    if (visible) { if (now - this.lastSeen > 0.4) this.seenAt = now; this.lastSeen = now; }
    // Lead the target over the arrow's flight and lift the aim for the drop.
    let x = target.body.x, z = target.body.z, flight = 0;
    for (let i = 0; i < 2; i++) { flight = Math.hypot(x - eye.x, z - eye.z) / arrowSpeed(this.goal); x = target.body.x + target.body.vx * flight * s.lead; z = target.body.z + target.body.vz * flight * s.lead; }
    const y = target.body.y + (this.head ? 1.62 : 1.15) * stance(target.body), across = Math.hypot(x - eye.x, z - eye.z), wobble = Math.sin(now * 2.3) * s.error * 0.3;
    const wantYaw = Math.atan2(-(x - eye.x), -(z - eye.z)) + this.miss.yaw + wobble, wantPitch = Math.atan2(y - eye.y + arrowDrop(this.goal, flight).drop * this.miss.drop, across) + this.miss.pitch;
    const yaw = self.yaw + clamp(angle(wantYaw - self.yaw), s.turn * dt), pitch = self.pitch + clamp(wantPitch - self.pitch, s.turn * dt);
    const onTarget = Math.abs(angle(wantYaw - yaw)) < 0.015 && Math.abs(wantPitch - pitch) < 0.015, ready = visible && now - this.seenAt >= s.reaction;
    // Hold a started draw until it is full enough and on target; releasing (one tick off) shoots.
    let firing = false;
    if (bow && bow.draw > 0) { firing = !(ready && bow.draw >= this.goal - 1e-9 && onTarget); if (!firing) { this.nextShot = now + BOW.reload + this.pick(s.pause); this.plan(); } }
    else if (bow) firing = ready && now >= this.nextShot && bow.reload <= 0;
    if (now >= this.nextStrafe) { this.strafe = this.random() < 0.5 ? -1 : 1; this.nextStrafe = now + this.pick(s.strafe); }
    let forward = visible ? (across > 16 ? 0.8 : across < 7 ? -0.7 : 0) : 0.9, strafe = visible ? this.strafe * s.move : this.strafe * 0.3, jump = false;
    // Seeing your full draw aimed at it, it may hop and then air-jump sideways out of the line.
    if (!this.dodge && self.body.grounded && threatened(target, self) && this.random() < s.dodge * dt * 4) this.dodge = { at: now, side: this.random() < 0.5 ? -1 : 1, stage: 0 };
    if (this.dodge) {
      const since = now - this.dodge.at;
      if (this.dodge.stage === 0) { jump = true; this.dodge.stage = 1; }
      else if (this.dodge.stage === 1 && since >= 0.2) { jump = true; this.dodge.stage = 2; }
      if (this.dodge.stage === 2) { strafe = this.dodge.side; forward = 0; }
      if (since > 0.7) this.dodge = null;
    } else if (visible && self.body.grounded && now >= this.nextJump) { jump = this.random() < s.jump; this.nextJump = now + 1.5 + this.random() * 2; }
    ({ forward, strafe } = steer(self.body, yaw, forward, strafe));
    const pace = this.dodge ? 1 : visible ? s.move : 1;
    return { ...neutralInput(seq), active: true, yaw: angle(yaw), pitch: clamp(pitch, Math.PI / 2 - 0.01), forward: clamp(forward * pace, 1), strafe: clamp(strafe * pace, 1), jump, firing };
  }
}
