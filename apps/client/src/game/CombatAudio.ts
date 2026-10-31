import type { Settings } from '../ui/settings';
import { AudioEvents, type AudioCounters, type Sound } from '../ui/audio-events';
const files:Record<Sound,string>={hit:'hitsound.ogg',headshot:'headshot.ogg',kill:'killconfirmed.ogg',spawn:'spawn.ogg'};
export class CombatAudio {
  private context:AudioContext|undefined;
  private gain:GainNode|undefined;
  private buffers=new Map<Sound,AudioBuffer>();
  private voices=new Map<'combat'|'spawn',AudioBufferSourceNode>();
  private events=new AudioEvents();
  private lastKill=-Infinity;
  private loading:Promise<void>|undefined;
  private disposed=false;
  constructor(private settings:()=>Settings,private error:(message:string)=>void){}
  async unlock(){
    if(this.disposed)return;
    try {
      if(!this.context){this.context=new AudioContext();this.gain=this.context.createGain();this.gain.connect(this.context.destination);}
      await this.context.resume();
      this.loading ??= Promise.all((Object.entries(files) as [Sound,string][]).map(async([kind,file])=>{
        const response=await fetch('/audio/'+file);if(!response.ok)throw new Error('Audio asset unavailable');
        const buffer=await this.context!.decodeAudioData(await response.arrayBuffer());this.buffers.set(kind,buffer);
      })).then(()=>{});
      await this.loading;
    }catch{this.error('Sound could not initialize. Check browser audio permissions and reload to retry.');}
  }
  observe(counters:AudioCounters){
    if(this.buffers.size!==4)return;
    const now=performance.now();
    for(const event of this.events.observe(counters,now,this.settings().hitRate))this.play(event,now);
  }
  update(){if(this.gain)this.gain.gain.value=this.settings().muteAll?0:this.settings().masterVolume*this.settings().sfxVolume;}
  private play(kind:Sound,now:number){
    const s=this.settings(), buffer=this.buffers.get(kind),ctx=this.context;
    if(!ctx || ctx.state!=='running' || !buffer || s.muteAll || !s[({hit:'hitSound',headshot:'headshotSound',kill:'killSound',spawn:'spawnSound'} as const)[kind]])return;
    this.update();
    const lane=kind==='spawn'?'spawn':'combat';
    this.voices.get(lane)?.stop();
    const voice=ctx.createBufferSource();voice.buffer=buffer;voice.connect(this.gain!);
    this.voices.set(lane,voice);voice.onended=()=>{voice.disconnect();if(this.voices.get(lane)===voice)this.voices.delete(lane);};
    if(kind==='kill')this.lastKill=now;
    voice.start(ctx.currentTime+(kind==='spawn'?Math.max(0,180-(now-this.lastKill))/1000:0));
  }
  dispose(){this.disposed=true;this.voices.forEach(v=>v.stop());void this.context?.close();}
}
