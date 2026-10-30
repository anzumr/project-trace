import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import {writeFile} from 'node:fs/promises';
import {Room} from '../apps/server/src/game/Room';
import {neutralInput} from '@trace/shared/protocol';
const results=[];
for(const kind of ['public','ai'] as const)for(const count of [1,10,100]){
  const rooms=Array.from({length:count},(_,i)=>{const room=new Room(String(i),{kind});room.add('human');if(kind==='ai')room.addBot();else room.add('other');room.ready('human');if(kind==='public')room.ready('other');return room;});
  const samples:number[]=[];
  for(let tick=0;tick<900;tick++){
    const now=tick*1000/60,start=performance.now();
    for(const room of rooms){for(const [id,p] of room.players){p.state.hp=100;if(!p.state.bot)room.accept(id,{...neutralInput(tick),active:true,firing:true,yaw:id==='human'?0:Math.PI},now);}room.step(now);if(tick%3===0)JSON.stringify(room.snapshot());}
    if(tick>=300)samples.push(performance.now()-start);
  }
  samples.sort((a,b)=>a-b);results.push({kind,rooms:count,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p95Ms:samples[Math.floor(samples.length*.95)],p99Ms:samples[Math.floor(samples.length*.99)]});
}
const report={at:new Date().toISOString(),node:process.version,cpu:cpus()[0]?.model,scope:'Synthetic room simulation plus 20 Hz snapshot serialization. HP replenished to sustain load. Excludes network, database, browser render and real scheduling; not an FPS or production capacity claim.',results};
await writeFile('docs/addon-01-performance.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
