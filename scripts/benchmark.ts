import { performance } from 'node:perf_hooks';
import { cpus, platform, release } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { Room } from '../apps/server/src/game/Room';
import { CONFIG } from '../packages/shared/src/index';
import { neutralInput } from '../packages/shared/src/protocol';

const results=[];
for(const count of [1,10,100]) {
  const rooms=Array.from({length:count},(_,i)=>{const r=new Room(`bench${i}`);r.add('a');r.add('b');r.ready('a');r.ready('b');for(let j=0;j<180;j++)r.step(j*1000/60);return r;});
  const samples:number[]=[];
  for(let i=1;i<=720;i++){
    const now=i*1000/60,start=performance.now();
    for(const r of rooms){for(const [id,p]of r.players){p.state.hp=100;p.state.body.x=5;r.accept(id,{...neutralInput(i),active:true,firing:true,yaw:id==='a'?0:-Math.PI},now);}r.step(now);if(i%3===0)JSON.stringify(r.snapshot());}
    if(i>120)samples.push(performance.now()-start);
  }
  samples.sort((a,b)=>a-b);results.push({rooms:count,players:count*2,measuredTicks:samples.length,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p95Ms:samples[Math.ceil(samples.length*.95)-1],p99Ms:samples[Math.ceil(samples.length*.99)-1],tickBudgetMs:CONFIG.tick*1000});
}
const report={at:new Date().toISOString(),environment:{node:process.version,os:platform()+' '+release(),cpu:cpus()[0]?.model,logicalCpus:cpus().length},scope:'Synthetic in-process server simulation, validated inputs and 20Hz snapshot serialization. HP is replenished to maintain continuous hit testing. Excludes network transport, rendering and real-time scheduling. Not a browser FPS or capacity guarantee.',results};
await writeFile('docs/performance-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
