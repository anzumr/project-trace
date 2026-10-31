export type Sound = 'hit'|'headshot'|'kill'|'spawn';
export type AudioCounters = { key:string; allowInitialSpawn?:boolean; spawn:number; kills:number; damage:number; headDamage:number };
/** Cumulative counters survive packet coalescing; first observation never replays old kills. */
export class AudioEvents {
  private previous: AudioCounters | undefined;
  private lastHit = -Infinity;
  observe(next: AudioCounters, now:number, rate:number): Sound[] {
    const old=this.previous; this.previous={...next};
    if(!old || old.key!==next.key) { this.lastHit=-Infinity; return next.spawn>0 && next.allowInitialSpawn!==false?['spawn']:[]; }
    const events:Sound[]=[];
    if(next.kills>old.kills) { events.push('kill'); this.lastHit=now; }
    else if(next.damage>old.damage && now-this.lastHit>=1000/rate) { events.push(next.headDamage>old.headDamage?'headshot':'hit'); this.lastHit=now; }
    if(next.spawn>old.spawn)events.push('spawn');
    return events;
  }
}
