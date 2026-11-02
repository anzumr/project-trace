import { emptyCombat, measureCombat, accuracy, type CombatStats } from './combat';
import { CONFIG, ARENA_SOLIDS, overlaps, arenaRay, type Vec3 } from './index';

export const PRACTICE = { respawnSeconds: 0.65, speedStep: 1.15, maxSpeed: 3, widthStep: 0.9, heightStep: 0.82, minSize: 0.4, circleAfterShrinks: 8, baseSpeed: 4, bounds: 12, coverClearance: 0.9, playerClearance: 4, spawnDistance: 6, centerY: 0.9 } as const;
export const BOT_MODEL = { width: 0.5, height: 1.8, bodyRadius: 0.25, bodyBottom: -0.65, bodyTop: 0.29, headRadius: 0.16, headY: 0.74 } as const;
export const HEADSHOT_MULTIPLIER = 2;
export type PracticeHit = { distance: number; region: 'body' | 'head' };
/** 0 at wave 1 rising to 1 at the micro-orb wave: drives turn sharpness, juke rate and evasion. */
export const practiceAgility = (wave: number) => Math.min(1, Math.max(0, Math.floor(wave) - 1) / (PRACTICE.circleAfterShrinks * 2));
/** Seeded mulberry32 generator: random in play, repeatable in tests. */
export class PracticeRandom {
  constructor(public state: number) { this.state >>>= 0; }
  next() { this.state = (this.state + 0x6d2b79f5) >>> 0; let t = this.state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
}
/** Bot motion in the ground plane. `tracking` is a smoothed share of recent ticks the player kept on target. */
export type PracticeMotion = { x: number; z: number; vx: number; vz: number; gx: number; gz: number; cruise: number; retarget: number; juke: number; evade: number; ex: number; ez: number; cooldown: number; tracking: number };
/** Inside the arena with room for the target, and clear of the central cover. */
export function practiceAllowed(x: number, z: number) {
  const c = PRACTICE.coverClearance, b = PRACTICE.bounds;
  return Math.hypot(x,z)<=b && !ARENA_SOLIDS.some(s=>overlaps({x,z},c,s));
}
function clearRoute(x:number,z:number,gx:number,gz:number){const steps=Math.ceil(Math.hypot(gx-x,gz-z)/0.4);for(let i=1;i<=steps;i++)if(!practiceAllowed(x+(gx-x)*i/steps,z+(gz-z)*i/steps))return false;return true;}
export function practiceProfile(wave: number) {
  const upgrades = Math.max(0, Math.floor(wave) - 1);
  const shrinks = Math.min(PRACTICE.circleAfterShrinks, Math.floor(upgrades / 2));
  return {
    speed: Math.min(PRACTICE.maxSpeed, PRACTICE.speedStep ** Math.min(20, Math.ceil(upgrades / 2))),
    width: Math.max(PRACTICE.minSize, BOT_MODEL.width * PRACTICE.widthStep ** shrinks),
    height: Math.max(PRACTICE.minSize, CONFIG.targetHeight * PRACTICE.heightStep ** shrinks),
    circle: shrinks >= PRACTICE.circleAfterShrinks,
  };
}
export function rayPracticeModel(origin: Vec3, direction: Vec3, center: Vec3, profile: ReturnType<typeof practiceProfile>): number | null {
  return tracePracticeModel(origin, direction, center, profile)?.distance ?? null;
}
export function tracePracticeModel(origin: Vec3, direction: Vec3, center: Vec3, profile: ReturnType<typeof practiceProfile>): PracticeHit | null {
  if (profile.circle) { const distance = raySphere(origin, direction, center, profile.width / 2); return distance === null ? null : { distance, region: 'body' }; }
  // Transform into the same model space used by the renderer, retaining world ray t.
  const sx = profile.width / BOT_MODEL.width, sy = profile.height / BOT_MODEL.height;
  const o = { x: (origin.x-center.x)/sx, y: (origin.y-center.y)/sy, z: (origin.z-center.z)/sx };
  const d = { x: direction.x/sx, y: direction.y/sy, z: direction.z/sx };
  const head = raySphere(o,d,{x:0,y:BOT_MODEL.headY,z:0},BOT_MODEL.headRadius);
  const hits = [raySphere(o,d,{x:0,y:BOT_MODEL.bodyBottom,z:0},BOT_MODEL.bodyRadius), raySphere(o,d,{x:0,y:BOT_MODEL.bodyTop,z:0},BOT_MODEL.bodyRadius)];
  const a=d.x*d.x+d.z*d.z, b=o.x*d.x+o.z*d.z, c=o.x*o.x+o.z*o.z-BOT_MODEL.bodyRadius**2;
  if(c<=0 && o.y>=BOT_MODEL.bodyBottom && o.y<=BOT_MODEL.bodyTop) hits.push(0);
  const discriminant=b*b-a*c;
  if(a>1e-12 && discriminant>=0) for(const t of [(-b-Math.sqrt(discriminant))/a,(-b+Math.sqrt(discriminant))/a]) {
    const y=o.y+t*d.y;
    if(t>=0 && y>=BOT_MODEL.bodyBottom && y<=BOT_MODEL.bodyTop) hits.push(t);
  }
  const valid=hits.filter((t): t is number => t!==null);
  const body = valid.length ? Math.min(...valid) : null;
  if (head !== null) return { distance: head, region: 'head' };
  return body === null ? null : { distance: body, region: 'body' };
}
export function raySphere(origin: Vec3, direction: Vec3, center: Vec3, radius: number): number | null {
  const x = origin.x - center.x, y = origin.y - center.y, z = origin.z - center.z;
  const a = direction.x ** 2 + direction.y ** 2 + direction.z ** 2;
  if (a < 1e-12) return null;
  const b = x * direction.x + y * direction.y + z * direction.z;
  const c = x*x + y*y + z*z - radius*radius;
  if (c <= 0) return 0;
  const discriminant = b*b - a*c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / a;
  return t >= 0 ? t : null;
}
export class Practice {
  elapsed = 0;
  stats = emptyCombat();
  waveStats = emptyCombat();
  lastWave: { wave:number; stats:CombatStats } | null = null;
  best: number | null = null;
  worst: number | null = null;
  completedDuration = 0;
  spawnSerial = 1;
  wave = 1;
  hp: number = CONFIG.hp;
  respawn = 0;
  kills = 0;
  damage = 0;
  tracked = 0;
  hit = false;
  headshot = false;
  readonly random: PracticeRandom;
  readonly still: boolean;
  motion: PracticeMotion;
  /** `still` freezes movement (tests); omit `seed` for a different route every session. */
  constructor({ seed = Math.floor(Math.random() * 2 ** 32), still = false }: { seed?: number; still?: boolean } = {}) {
    this.random = new PracticeRandom(seed); this.still = still;
    // Start in front of the player spawn, then roam the whole arena.
    let x = (this.random.next() * 2 - 1) * 6, z = -6 - this.random.next() * 5;
    if(!practiceAllowed(x,z)){x=5;z=-6;}
    this.motion = { x, z, vx: 0, vz: 0, gx: x, gz: z, cruise: 0.8, retarget: 0, juke: 1.5, evade: 0, ex: 0, ez: 0, cooldown: 0, tracking: 0 };
  }
  get profile() { return practiceProfile(this.wave); }
  get position(): Vec3 { return { x: this.motion.x, y: PRACTICE.centerY, z: this.motion.z }; }
  /** A random allowed point; `lateral` aims across the player's line of sight, which is harder to track than moving toward or away. */
  private pickGoal(origin: Vec3, lateral: boolean) {
    const m = this.motion, r = () => this.random.next(), los = Math.hypot(m.x - origin.x, m.z - origin.z) || 1;
    const px = -(m.z - origin.z) / los, pz = (m.x - origin.x) / los;
    for (let attempt = 0; attempt < 12; attempt++) {
      let gx: number, gz: number;
      if (lateral) { const side = r() < 0.5 ? -1 : 1, distance = 3 + r() * 5; gx = m.x + px * side * distance + (r() - 0.5) * 2; gz = m.z + pz * side * distance + (r() - 0.5) * 2; }
      else { gx = (r() * 2 - 1) * PRACTICE.bounds; gz = (r() * 2 - 1) * PRACTICE.bounds; }
      if (practiceAllowed(gx, gz) && clearRoute(m.x,m.z,gx,gz) && Math.hypot(gx - origin.x, gz - origin.z) >= PRACTICE.playerClearance) { m.gx = gx; m.gz = gz; return; }
    }
  }
  private respawnAway(origin: Vec3) {
    const m = this.motion;
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = (this.random.next() * 2 - 1) * PRACTICE.bounds, z = (this.random.next() * 2 - 1) * PRACTICE.bounds;
      if (practiceAllowed(x, z) && Math.hypot(x - origin.x, z - origin.z) >= PRACTICE.spawnDistance) { m.x = x; m.z = z; break; }
    }
    Object.assign(m, { vx: 0, vz: 0, gx: m.x, gz: m.z, retarget: 0, evade: 0, cooldown: 0.8, tracking: 0 });
  }
  /** Dash across the line of sight, away from the side the crosshair is on. */
  private startEvade(origin: Vec3, direction: Vec3, agility: number) {
    const m = this.motion, r = () => this.random.next(), los = Math.hypot(m.x - origin.x, m.z - origin.z) || 1;
    const px = -(m.z - origin.z) / los, pz = (m.x - origin.x) / los;
    const t = (m.x - origin.x) * direction.x + (PRACTICE.centerY - origin.y) * direction.y + (m.z - origin.z) * direction.z;
    const side = (m.x - (origin.x + direction.x * t)) * px + (m.z - (origin.z + direction.z * t)) * pz;
    let sign = Math.abs(side) > 0.02 ? Math.sign(side) : r() < 0.5 ? -1 : 1;
    if (!practiceAllowed(m.x + px * sign * 2, m.z + pz * sign * 2)) sign = -sign;
    m.ex = px * sign; m.ez = pz * sign;
    m.evade = 0.3 + r() * 0.25 + agility * 0.15;
    m.cooldown = m.evade + 1.4 - agility * 0.7 + r() * 0.6;
    m.tracking *= 0.4;
  }
  private move(dt: number, origin: Vec3, agility: number) {
    const m = this.motion, r = () => this.random.next(), top = PRACTICE.baseSpeed * this.profile.speed;
    m.retarget -= dt; m.juke -= dt; m.cooldown -= dt;
    let dx: number, dz: number, accel = top * (3 + agility * 6);
    if (m.evade > 0) { m.evade -= dt; const burst = top * (1.3 + agility * 0.4); dx = m.ex * burst; dz = m.ez * burst; accel *= 2; }
    else {
      if (m.retarget <= 0 || Math.hypot(m.gx - m.x, m.gz - m.z) < 1) {
        this.pickGoal(origin, r() < 0.35 + agility * 0.4);
        m.cruise = Math.min(1, 0.6 + r() * 0.35 + agility * 0.25);
        m.retarget = 2 - agility * 0.8 + r() * (1.5 - agility * 0.6);
      }
      // A juke is a brief sidestep; the next retarget picks a fresh destination.
      if (m.juke <= 0) { this.pickGoal(origin, true); m.retarget = 0.35 + r() * 0.4; m.juke = (1.8 - agility * 1.2) * (0.5 + r()); }
      const toGoal = Math.hypot(m.gx - m.x, m.gz - m.z) || 1;
      dx = (m.gx - m.x) / toGoal * top * m.cruise; dz = (m.gz - m.z) / toGoal * top * m.cruise;
    }
    // Back off from the player rather than running through them.
    const ox = m.x - origin.x, oz = m.z - origin.z, near = Math.hypot(ox, oz) || 1;
    if (near < PRACTICE.playerClearance) { const push = top * 2 * (PRACTICE.playerClearance - near) / PRACTICE.playerClearance; dx += ox / near * push; dz += oz / near * push; }
    const ax = dx - m.vx, az = dz - m.vz, change = Math.hypot(ax, az), limit = accel * dt;
    if (change > limit) { m.vx += ax / change * limit; m.vz += az / change * limit; } else { m.vx = dx; m.vz = dz; }
    // Axis sliding keeps random roaming outside all cover and the circular boundary.
    if(practiceAllowed(m.x+m.vx*dt,m.z))m.x+=m.vx*dt;else{m.vx=0;m.retarget=0;m.evade=0;}
    if(practiceAllowed(m.x,m.z+m.vz*dt))m.z+=m.vz*dt;else{m.vz=0;m.retarget=0;m.evade=0;}
  }
  step(dt: number, active: boolean, firing: boolean, origin: Vec3, direction: Vec3) {
    this.hit = false;
    this.headshot = false;
    if (!active) { this.stats.streak = 0; this.waveStats.streak = 0; return; }
    this.elapsed += dt;
    if (this.hp <= 0) {
      this.respawn = Math.max(0, this.respawn - dt);
      if (this.respawn <= 1e-9) { this.wave++; this.hp = CONFIG.hp; this.respawn = 0; this.waveStats = emptyCombat(); this.spawnSerial++; this.respawnAway(origin); }
      return;
    }
    const profile = this.profile, agility = practiceAgility(this.wave), m = this.motion;
    if (!this.still) this.move(dt, origin, agility);
    // Every active, attack-accepting tick contributes; misses remain in the denominator.
    if (!firing) { m.tracking -= m.tracking * Math.min(1, dt / 0.5); measureCombat(this.stats,dt,false,0,false); measureCombat(this.waveStats,dt,false,0,false); return; }
    const center = this.position;
    const result = tracePracticeModel(origin, direction, center, profile);
    const cover = arenaRay(origin, direction);
    this.hit = result !== null && (cover === null || result.distance < cover);
    this.headshot = this.hit && result?.region === 'head';
    let damage = 0;
    if (this.hit) {
      const before = this.hp; this.hp = Math.max(0, this.hp - CONFIG.dps * (this.headshot ? HEADSHOT_MULTIPLIER : 1) * dt); damage = before - this.hp; this.damage += damage; this.tracked += dt;
    }
    // Tracked too well for a while: sometimes dodge, more readily in later waves.
    m.tracking += ((this.hit ? 1 : 0) - m.tracking) * Math.min(1, dt / 0.5);
    if (!this.still && m.evade <= 0 && m.cooldown <= 0 && m.tracking > 0.7 - agility * 0.2 && this.random.next() < (0.6 + agility * 1.8) * dt) this.startEvade(origin, direction, agility);
    measureCombat(this.stats,dt,firing,damage,this.headshot);
    measureCombat(this.waveStats,dt,firing,damage,this.headshot);
    if (this.hp <= 0) {
      this.kills++; this.respawn = PRACTICE.respawnSeconds;
      this.lastWave = { wave:this.wave, stats:{...this.waveStats} };
      this.completedDuration += this.waveStats.duration;
      const value = accuracy(this.waveStats);
      if (value !== null) { this.best = Math.max(this.best ?? value,value); this.worst = Math.min(this.worst ?? value,value); }
      this.stats.streak = 0;
    }
  }
}
