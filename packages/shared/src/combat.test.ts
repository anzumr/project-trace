import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyCombat,measureCombat,accuracy} from './combat';
import {Practice,PRACTICE,practicePosition,BOT_MODEL} from './practice';
import {CONFIG} from './index';
test('time-based accuracy is identical at 60/120/144/240 render FPS; head damage never doubles tracking',()=>{
  for(const fps of [60,120,144,240]){
    const stats=emptyCombat();let pending=0,ticks=0;
    for(let frame=0;frame<fps*20;frame++){
      pending+=1/fps;
      while(pending+1e-10>=CONFIG.tick){pending-=CONFIG.tick;measureCombat(stats,CONFIG.tick,true,ticks<900?40*CONFIG.tick:0,ticks<900);ticks++;}
    }
    assert.equal(ticks,1200);assert.ok(Math.abs(accuracy(stats)!-75)<1e-8);
    assert.ok(Math.abs(stats.headTracked-15)<1e-8);assert.ok(Math.abs(stats.headDamage-600)<1e-8);
    const before=accuracy(stats);measureCombat(stats,2,false,0,false);assert.equal(accuracy(stats),before);assert.equal(stats.streak,0);
  }
  assert.equal(accuracy(emptyCombat()),null);
});
test('practice wave resets, cumulative stats survive, pause and respawn do not accumulate attack',()=>{
  const p=new Practice();
  p.step(1,false,true,{x:0,y:0,z:0},{x:0,y:0,z:-1});assert.equal(p.stats.attack,0);
  p.step(CONFIG.tick,true,true,{x:0,y:20,z:0},{x:0,y:1,z:0});assert.equal(p.stats.tracked,0);assert.equal(p.stats.attack,CONFIG.tick);
  p.hp=.1;const center=practicePosition(p.phase+PRACTICE.baseFrequency*p.profile.speed*CONFIG.tick);
  p.step(CONFIG.tick,true,true,{x:center.x,y:center.y+BOT_MODEL.headY,z:center.z+.6},{x:0,y:0,z:-1});
  assert.equal(p.kills,1);assert.equal(p.lastWave?.stats.headDamage,.1);assert.equal(p.stats.tracked,CONFIG.tick);
  const attack=p.stats.attack;for(let i=0;i<40;i++)p.step(CONFIG.tick,true,true,{x:0,y:20,z:0},{x:0,y:1,z:0});
  assert.equal(p.wave,2);assert.equal(p.waveStats.tracked,0);assert.equal(p.stats.tracked,CONFIG.tick);
  assert.ok(p.stats.attack-attack<CONFIG.tick*2);assert.equal(p.stats.longest,CONFIG.tick);
});
