import type { Settings } from '../ui/settings';
import { AudioEvents, type AudioCounters, type Sound } from '../ui/audio-events';
import { CLIPS, clipFiles, clipSet, footstepSamples, type StepEvent } from '../ui/footsteps';
import type { Vec3 } from '@trace/shared';
const files:Record<Sound,string>={hit:'hitsound.ogg',headshot:'headshot.ogg',kill:'killconfirmed.ogg',spawn:'spawn.ogg',draw:'bow-draw.mp3',release:'bow-release.mp3'};
const toggles:Partial<Record<Sound,'hitSound'|'headshotSound'|'killSound'|'spawnSound'>>={hit:'hitSound',headshot:'headshotSound',kill:'killSound',spawn:'spawnSound'};
export class CombatAudio {
  private context:AudioContext|undefined;
  private gain:GainNode|undefined;
  private buffers=new Map<Sound,AudioBuffer>();
  private voices=new Map<'combat'|'spawn'|'bow',AudioBufferSourceNode>();
  private events=new AudioEvents();
  private lastKill=-Infinity;
  private loading:Promise<void>|undefined;
  private disposed=false;
  private steps:Record<'step'|'land',AudioBuffer[]>|undefined;
  /** Recorded footsteps by set; until (or unless) they load, the synthesized `steps` play instead. */
  private clips:Partial<Record<keyof typeof CLIPS,AudioBuffer[]>>={};
  private clipLoad:Promise<void>|undefined;
  constructor(private settings:()=>Settings,private error:(message:string)=>void){}
  async unlock(){
    if(this.disposed)return;
    try {
      if(!this.context){this.context=new AudioContext();this.gain=this.context.createGain();this.gain.connect(this.context.destination);}
      const ctx=this.context,make=(kind:'step'|'land',seed:number)=>{const data=footstepSamples(ctx.sampleRate,kind,seed),b=ctx.createBuffer(1,data.length,ctx.sampleRate);b.copyToChannel(data,0);return b;};
      this.steps??={step:[1,2,3,4,5,6].map(s=>make('step',s)),land:[7,8].map(s=>make('land',s))};
      this.clipLoad??=Promise.all((Object.keys(CLIPS) as (keyof typeof CLIPS)[]).map(async kind=>{
        this.clips[kind]=await Promise.all(clipFiles(kind).map(async file=>{const response=await fetch(file);if(!response.ok)throw new Error('Footstep unavailable');return ctx.decodeAudioData(await response.arrayBuffer());}));
      })).then(()=>{},()=>{this.clips={};});
      await this.context.resume();
      this.loading ??= Promise.all((Object.entries(files) as [Sound,string][]).map(async([kind,file])=>{
        const response=await fetch('/audio/'+file);if(!response.ok)throw new Error('Audio asset unavailable');
        const buffer=await this.context!.decodeAudioData(await response.arrayBuffer());this.buffers.set(kind,buffer);
      })).then(()=>{});
      await this.loading;
    }catch{this.error('Sound could not initialize. Check browser audio permissions and reload to retry.');}
  }
  observe(counters:AudioCounters){
    if(this.buffers.size!==Object.keys(files).length)return;
    const now=performance.now();
    for(const event of this.events.observe(counters,now,this.settings().hitRate))this.play(event,now);
  }
  update(){if(this.gain)this.gain.gain.value=this.settings().muteAll?0:this.settings().masterVolume*this.settings().sfxVolume;}
  private play(kind:Sound,now:number){
    const s=this.settings(), buffer=this.buffers.get(kind),ctx=this.context;
    const toggle=toggles[kind];
    if(!ctx || ctx.state!=='running' || !buffer || s.muteAll || (toggle && !s[toggle]))return;
    this.update();
    // The bow has its own lane, so a release cuts the draw creak but never a hit sound.
    const lane=kind==='spawn'?'spawn':kind==='draw'||kind==='release'?'bow':'combat';
    this.voices.get(lane)?.stop();
    const voice=ctx.createBufferSource();voice.buffer=buffer;voice.connect(this.gain!);
    this.voices.set(lane,voice);voice.onended=()=>{voice.disconnect();if(this.voices.get(lane)===voice)this.voices.delete(lane);};
    if(kind==='kill')this.lastKill=now;
    voice.start(ctx.currentTime+(kind==='spawn'?Math.max(0,180-(now-this.lastKill))/1000:0));
  }
  /** Your own bow: the creak as the draw starts and the twang on release. */
  bow(kind:'draw'|'release'){this.play(kind,performance.now());}
  /** A cancelled or dropped draw goes quiet. */
  stopBow(){this.voices.get('bow')?.stop();}
  /** Hears from the camera, so a step's direction (left, right, ahead, behind) matches what you see. */
  listen(at:Vec3,forward:Vec3,up:Vec3){
    const l=this.context?.listener;if(!l)return;
    if(l.positionX){l.positionX.value=at.x;l.positionY.value=at.y;l.positionZ.value=at.z;l.forwardX.value=forward.x;l.forwardY.value=forward.y;l.forwardZ.value=forward.z;l.upX.value=up.x;l.upY.value=up.y;l.upZ.value=up.z;}
    else{l.setPosition(at.x,at.y,at.z);l.setOrientation(forward.x,forward.y,forward.z,up.x,up.y,up.z);}
  }
  /**
   * A footstep. `at` places an opponent's step in 3D around you (HRTF, so even ahead and behind differ) and it fades with
   * distance: full at 2.5 m, about a quarter at 10 m, a tenth across the arena. `null` is your own: quiet and centred.
   */
  step(event:StepEvent,at:Vec3|null){
    const ctx=this.context,recorded=this.clips[clipSet(event)],pool=recorded?.length?recorded:event.kind==='jump'?undefined:this.steps?.[event.kind],loudness=event.loudness;
    if(!ctx || ctx.state!=='running' || !pool || this.settings().muteAll)return;
    this.update();
    const voice=ctx.createBufferSource(),level=ctx.createGain();voice.buffer=pool[Math.floor(Math.random()*pool.length)];voice.playbackRate.value=0.9+Math.random()*0.2;
    level.gain.value=loudness*(at?1.4:0.35);voice.connect(level);
    let out:AudioNode=level;
    if(at){
      const pan=ctx.createPanner();Object.assign(pan,{panningModel:'HRTF',distanceModel:'inverse',refDistance:2.5,rolloffFactor:1.1,maxDistance:60});
      if(pan.positionX){pan.positionX.value=at.x;pan.positionY.value=at.y;pan.positionZ.value=at.z;}else pan.setPosition(at.x,at.y,at.z);
      level.connect(pan);out=pan;
    }
    out.connect(this.gain!);voice.onended=()=>{voice.disconnect();level.disconnect();out.disconnect();};voice.start();
  }
  dispose(){this.disposed=true;this.voices.forEach(v=>v.stop());void this.context?.close();}
}
