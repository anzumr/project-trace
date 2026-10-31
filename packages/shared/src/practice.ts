import { emptyCombat, measureCombat, accuracy, type CombatStats } from './combat';
import { CONFIG, COVER, rayBox, type Vec3 } from './index';

export const PRACTICE = { respawnSeconds: 0.65, speedStep: 1.15, maxSpeed: 3, widthStep: 0.9, heightStep: 0.82, minSize: 0.4, circleAfterShrinks: 8, baseFrequency: 0.45, orbitRadius: 9, radialVariation: 2, centerY: 0.9 } as const;
export const BOT_MODEL = { width: 0.5, height: 1.8, bodyRadius: 0.25, bodyBottom: -0.65, bodyTop: 0.29, headRadius: 0.16, headY: 0.74 } as const;
export const HEADSHOT_MULTIPLIER = 2;
export type PracticeHit = { distance: number; region: 'body' | 'head' };
/** A smooth lobed circuit covers all directions, staying clear of cover and walls. */
export function practicePosition(phase: number): Vec3 {
  const radius = PRACTICE.orbitRadius + PRACTICE.radialVariation * Math.cos(3 * phase);
  return { x: Math.sin(phase) * radius, y: PRACTICE.centerY, z: Math.cos(phase) * radius };
}
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
  phase = 2.4;
  respawn = 0;
  kills = 0;
  damage = 0;
  tracked = 0;
  hit = false;
  headshot = false;
  get profile() { return practiceProfile(this.wave); }
  get position(): Vec3 { return practicePosition(this.phase); }
  step(dt: number, active: boolean, firing: boolean, origin: Vec3, direction: Vec3) {
    this.hit = false;
    this.headshot = false;
    if (!active) { this.stats.streak = 0; this.waveStats.streak = 0; return; }
    this.elapsed += dt;
    if (this.hp <= 0) {
      this.respawn = Math.max(0, this.respawn - dt);
      if (this.respawn <= 1e-9) { this.wave++; this.hp = CONFIG.hp; this.respawn = 0; this.waveStats = emptyCombat(); this.spawnSerial++; }
      return;
    }
    const profile = this.profile;
    this.phase = (this.phase + PRACTICE.baseFrequency * profile.speed * dt) % (Math.PI * 2);
    // Every active, attack-accepting tick contributes; misses remain in the denominator.
    if (!firing) { measureCombat(this.stats,dt,false,0,false); measureCombat(this.waveStats,dt,false,0,false); return; }
    const center = this.position;
    const result = tracePracticeModel(origin, direction, center, profile);
    const cover = rayBox(origin, direction, COVER);
    this.hit = result !== null && (cover === null || result.distance < cover);
    this.headshot = this.hit && result?.region === 'head';
    let damage = 0;
    if (this.hit) {
      const before = this.hp; this.hp = Math.max(0, this.hp - CONFIG.dps * (this.headshot ? HEADSHOT_MULTIPLIER : 1) * dt); damage = before - this.hp; this.damage += damage; this.tracked += dt;

    }
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
