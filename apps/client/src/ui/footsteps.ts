import { CONFIG } from '@trace/shared';
import { GAIT_RATE } from '@trace/shared/bow';
import { PracticeRandom } from '@trace/shared/practice';

/**
 * Footsteps. `stride` is one foot's step, matching the archer's leg cycle; slower than `minSpeed` makes no sound,
 * airtime past `airtime` lands with a thud, a jump of more than `teleport` metres between samples is a respawn,
 * crouching steps are `crouched` as loud, and only `settle` seconds without moving count as stopping (positions that
 * update on ticks rather than frames have still frames in between).
 */
export const STEPS = { stride: Math.PI / GAIT_RATE, minSpeed: 1.2, airtime: 0.25, teleport: 3, crouched: 0.35, settle: 0.15 } as const;
export type StepEvent = { kind: 'step' | 'land'; loudness: number };
export type Feet = { x: number; y: number; z: number; grounded: boolean; crouch?: number };

/** Turns a body's movement into footstep and landing events. Feed it every frame or tick with the time since the last sample. */
export class StepTracker {
  private last: Feet | undefined;
  private travelled: number = STEPS.stride / 2;
  private air = 0;
  private still = 0;
  reset() { this.last = undefined; this.travelled = STEPS.stride / 2; this.air = 0; this.still = 0; }
  update(now: Feet, dt: number): StepEvent | null {
    const last = this.last; this.last = { ...now };
    if (!last || dt <= 0) return null;
    const moved = Math.hypot(now.x - last.x, now.z - last.z), quiet = 1 - (1 - STEPS.crouched) * (now.crouch ?? 0);
    if (moved > STEPS.teleport) { this.travelled = STEPS.stride / 2; this.air = 0; return null; }
    if (!now.grounded) { this.air += dt; return null; }
    if (this.air >= STEPS.airtime) { const air = this.air; this.air = 0; this.travelled = STEPS.stride / 2; return { kind: 'land', loudness: Math.min(1, 0.5 + air) * quiet }; }
    this.air = 0;
    const speed = moved / dt;
    // Starting to move again puts the first step half a stride away, as a real first step would be.
    if (speed < STEPS.minSpeed) { if ((this.still += dt) >= STEPS.settle) this.travelled = Math.min(this.travelled, STEPS.stride / 2); return null; }
    this.still = 0; this.travelled += moved;
    if (this.travelled < STEPS.stride) return null;
    this.travelled -= STEPS.stride;
    return { kind: 'step', loudness: (0.55 + 0.45 * Math.min(1, speed / CONFIG.speed)) * quiet };
  }
}

/**
 * A synthesized footstep on the arena's hard floor: a sharp filtered noise tap over a short low thump, normalized to 0.8.
 * `land` is heavier and longer. Each seed gives a slightly different step, so a run never sounds like one looped sample.
 */
export function footstepSamples(rate: number, kind: 'step' | 'land', seed: number): Float32Array<ArrayBuffer> {
  const random = new PracticeRandom(seed), land = kind === 'land', out = new Float32Array(Math.round(rate * (land ? 0.22 : 0.12)));
  const decay = land ? 0.05 : 0.022, thump = land ? 70 : 95 + random.next() * 20, body = land ? 0.9 : 0.35 + random.next() * 0.2;
  const lowpass = 1 - Math.exp(-2 * Math.PI * (land ? 1400 : 2200 + random.next() * 800) / rate), highpass = Math.exp(-2 * Math.PI * 180 / rate);
  let low = 0, previous = 0, high = 0, peak = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / rate, envelope = (1 - Math.exp(-t / 0.0015)) * Math.exp(-t / decay);
    low += lowpass * ((random.next() * 2 - 1) - low);
    high = highpass * (high + low - previous); previous = low;
    out[i] = (high + body * Math.sin(2 * Math.PI * thump * t) * Math.exp(-t / (decay * 1.6))) * envelope;
    peak = Math.max(peak, Math.abs(out[i]));
  }
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] *= 0.8 / peak;
  return out;
}
