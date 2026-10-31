/** All durations are seconds of accepted simulation time, never rendered frames. */
export type CombatStats = { attack: number; tracked: number; damage: number; received: number; headDamage: number; headTracked: number; streak: number; longest: number; duration: number };
export const emptyCombat = (): CombatStats => ({ attack:0, tracked:0, damage:0, received:0, headDamage:0, headTracked:0, streak:0, longest:0, duration:0 });
export const accuracy = (s: Pick<CombatStats,'attack'|'tracked'>): number | null => s.attack > 0 ? Math.max(0,Math.min(100,100*s.tracked/s.attack)) : null;
export function measureCombat(s: CombatStats, dt: number, firing: boolean, damage: number, head: boolean, received = 0) {
  s.duration += dt; s.received += received;
  if (firing) s.attack += dt;
  if (firing && damage > 0) {
    s.tracked += dt; s.damage += damage; s.streak += dt; s.longest = Math.max(s.longest,s.streak);
    if (head) { s.headDamage += damage; s.headTracked += dt; }
  } else s.streak = 0;
}
export type RoundCombat = { serial:number; round:number; winner:string|null; reason:string; duration:number; players:{id:string;name:string;hp:number;wins:number;stats:CombatStats}[] };
