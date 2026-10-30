import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameGate, FrameMetrics } from '../game/Performance';
import { parseSettings } from './settings';
test('render caps respect browser cadence without changing simulation step counts', () => {
  for(const refresh of [60,120,144,240])for(const cap of [0,60,120,144,240]){
    const gate=new FrameGate();let frames=0,ticks=0,accumulator=0;
    for(let i=0;i<refresh*10;i++){accumulator+=1/refresh;while(accumulator>=1/60-1e-10){ticks++;accumulator-=1/60;}if(gate.due(i*1000/refresh,cap))frames++;}
    assert.equal(ticks,600);assert.ok(Math.abs(frames/10-Math.min(refresh,cap||refresh))<=1,`${refresh}Hz / cap ${cap}: ${frames}`);
  }
});
test('frame statistics include slow frames, calculate percentiles and keep bounded storage', () => {
  const m=new FrameMetrics();for(let i=1;i<=100;i++)m.record(i,2);
  assert.deepEqual(m.stats(),{averageMs:50.5,p95Ms:95,p99Ms:99,cpuMs:2,samples:100});
  for(let i=0;i<1300;i++)m.record(5,1);assert.equal(m.stats().samples,1200);assert.equal(m.stats().averageMs,5);
  m.reset();assert.equal(m.stats().samples,0);
  const settings=parseSettings({frameCap:999,renderScale:999,graphics:'unsafe'});assert.equal(settings.frameCap,0);assert.equal(settings.renderScale,1.5);assert.equal(settings.graphics,'balanced');
});
