import { CONFIG, COVER, MODES, rayBox, type ModeId, type Vec3 } from '@trace/shared';
import { neutralInput, type PlayerInput, type PlayerState } from '@trace/shared/protocol';

const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, n: number) => Math.max(-n, Math.min(n, v));
export function visiblePoint(self: PlayerState, target: PlayerState, mode: ModeId): Vec3 | null {
  const scale = MODES[mode].scale;
  const origin = { x: self.body.x, y: self.body.y + CONFIG.eyeHeight * scale, z: self.body.z };
  // Sight is a forward cone. Cover must block observations, not merely damage.
  for (const height of [1.55, 0.9]) {
    const point = { x: target.body.x, y: target.body.y + height * scale, z: target.body.z };
    const dx = point.x - origin.x, dy = point.y - origin.y, dz = point.z - origin.z, distance = Math.hypot(dx, dy, dz);
    if (distance < 0.01 || distance > 60) continue;
    const direction = { x: dx / distance, y: dy / distance, z: dz / distance };
    const dot = -Math.sin(self.yaw) * Math.cos(self.pitch) * direction.x + Math.sin(self.pitch) * direction.y - Math.cos(self.yaw) * Math.cos(self.pitch) * direction.z;
    const wall = rayBox(origin, direction, COVER);
    if (dot >= Math.cos(85 * Math.PI / 360) && (wall === null || wall > distance)) return point;
  }
  return null;
}

type Observation = { at: number; point: Vec3; velocity: Vec3 };
export class ExtraHardAI {
  private observations: Observation[] = [];
  private prior: Observation | undefined;
  private acquiredAt = Infinity;
  private lastSeen = -Infinity;
  private strafe = 1;
  private nextDecision = 0;
  private nextJump = 0;
  private patrol = 0;
  constructor(private random: () => number = Math.random) {}
  reset() { this.observations = []; this.prior = undefined; this.acquiredAt = Infinity; this.lastSeen = -Infinity; this.nextDecision = 0; }
  input(self: PlayerState, target: PlayerState, mode: ModeId, now: number, seq: number): PlayerInput {
    const dt = CONFIG.tick, point = visiblePoint(self, target, mode);
    if (point) {
      if (now - this.lastSeen > 220) this.acquiredAt = now + 150 + this.random() * 70;
      const previous = this.prior, elapsed = previous ? (now - previous.at) / 1000 : 0;
      const velocity = previous && elapsed > 0 && elapsed < 0.25 ? { x: clamp((point.x - previous.point.x) / elapsed, 10), y: clamp((point.y - previous.point.y) / elapsed, 10), z: clamp((point.z - previous.point.z) / elapsed, 10) } : { x: 0, y: 0, z: 0 };
      this.prior = { at: now, point, velocity }; this.observations.push(this.prior); this.lastSeen = now;
    }
    // Decisions use observations at least 150 ms old, never live hidden coordinates.
    const delayed = this.observations.filter(o => o.at <= now - 150).at(-1);
    this.observations = this.observations.filter(o => o.at >= now - 450);
    const memory = delayed ?? (this.prior && now - this.prior.at > 150 ? this.prior : undefined);
    let yaw = self.yaw, pitch = self.pitch, forward = 0.3, strafe = 0;
    if (now >= this.nextDecision) { this.strafe = this.random() < 0.5 ? -1 : 1; this.nextDecision = now + 450 + this.random() * 650; }
    if (memory && now - memory.at < 1400) {
      const prediction = Math.min(0.2, (now - memory.at) / 1000);
      const dx = memory.point.x + memory.velocity.x * prediction - self.body.x;
      const dz = memory.point.z + memory.velocity.z * prediction - self.body.z;
      const dy = memory.point.y + memory.velocity.y * prediction - (self.body.y + CONFIG.eyeHeight * MODES[mode].scale);
      const distance = Math.hypot(dx, dz);
      // Small time-varying motor error and 240°/s maximum turn prevent perfect snaps.
      const error = Math.sin(now * 0.0031) * 0.009 + Math.sin(now * 0.0077) * 0.004;
      yaw += clamp(angle(Math.atan2(-dx, -dz) + error - yaw), 4.19 * dt);
      pitch += clamp(Math.atan2(dy, distance) + error * 0.6 - pitch, 3.1 * dt);
      forward = distance > 13 ? 0.8 : distance < 5 ? -0.8 : 0.12;
      strafe = this.strafe;
    } else {
      // Fixed map patrol uses no opponent data when sight has been lost.
      const waypoints = [[-6, -6], [6, -6], [6, 6], [-6, 6]];
      const [x, z] = waypoints[this.patrol];
      if (Math.hypot(x - self.body.x, z - self.body.z) < 1.5) this.patrol = (this.patrol + 1) % waypoints.length;
      yaw += clamp(angle(Math.atan2(-(x - self.body.x), -(z - self.body.z)) - yaw), 3 * dt); pitch *= 0.95; forward = 0.85;
    }
    // Steer away from arena walls and around the center obstacle using map geometry.
    if (Math.abs(self.body.x) > 11 || Math.abs(self.body.z) > 11) {
      const x = -self.body.x, z = -self.body.z, length = Math.hypot(x, z);
      forward = (-x * Math.sin(yaw) - z * Math.cos(yaw)) / length;
      strafe = (x * Math.cos(yaw) - z * Math.sin(yaw)) / length;
    } else if (Math.abs(self.body.x) < 3.1 && self.body.z > -2.5 && self.body.z < 1.5) {
      const x = self.body.x >= 0 ? 1 : -1;
      forward = -x * Math.sin(yaw); strafe = x * Math.cos(yaw);
    }
    const jump = self.body.grounded && now >= this.nextJump && !!memory;
    if (jump) this.nextJump = now + 1100 + this.random() * 1500;
    return { ...neutralInput(seq), active: true, yaw: angle(yaw), pitch: clamp(pitch, Math.PI / 2), forward: clamp(forward, 1), strafe: clamp(strafe, 1), jump,
      firing: now >= this.acquiredAt && now - this.lastSeen <= 180 && !!memory };
  }
}
