import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG, MODES, type ModeId} from '@trace/shared';
import {validateInput} from '@trace/shared/protocol';
import {Room} from './game/Room';
import {ExtraHardAI,visiblePoint} from './game/ExtraHardAI';
import type {MatchResult} from './game/Results';

test('AI observations cannot see through cover or behind it; hidden opponent movement does not steer the bot',()=>{
  const room=new Room('AI');room.add('bot');room.add('human');
  const bot=room.players.get('bot')!.state,human=room.players.get('human')!.state;
  Object.assign(bot.body,{x:0,z:5});bot.yaw=0;Object.assign(human.body,{x:0,z:-5});
  assert.equal(visiblePoint(bot,human,'standard'),null);
  const a=new ExtraHardAI(()=>0.4),b=new ExtraHardAI(()=>0.4);
  const first=a.input(bot,human,'standard',1000,1);
  Object.assign(human.body,{x:0,z:10});assert.equal(visiblePoint(bot,human,'standard'),null);
  assert.deepEqual(first,b.input(bot,human,'standard',1000,1));
});
test('AI reaction delay and capped turn speed submit legal ordinary inputs',()=>{
  const room=new Room('AI');room.add('bot');room.add('human');
  const bot=room.players.get('bot')!.state,human=room.players.get('human')!.state;
  Object.assign(bot.body,{x:5,z:9});bot.yaw=0;Object.assign(human.body,{x:7,z:-9});
  const ai=new ExtraHardAI(()=>0.5);
  for(let i=0;i<60;i++){
    const input=ai.input(bot,human,'standard',i*1000/60,i);assert.ok(validateInput(input));
    assert.ok(Math.abs(Math.atan2(Math.sin(input.yaw-bot.yaw),Math.cos(input.yaw-bot.yaw)))<=4.19*CONFIG.tick+1e-8);
    if(i*1000/60<150)assert.equal(input.firing,false);
    bot.yaw=input.yaw;bot.pitch=input.pitch;
  }
});
test('Extra Hard AI plays and finishes genuine authoritative matches in every character mode',()=>{
  for(const mode of Object.keys(MODES) as ModeId[]){
    const results:MatchResult[]=[];const room=new Room('AI',{kind:'ai',onResult:r=>results.push(r)});room.mode=mode;room.add('human',{userId:'11111111-1111-4111-8111-111111111111',username:'Human'});room.addBot();room.ready('human');
    let jumped=false,moved=false;const bot=[...room.players.values()].find(p=>p.state.bot)!;
    for(let i=0;i<60*300&&room.phase!=='finished';i++){room.step(i*1000/60);jumped ||= bot.state.body.y>0;moved ||= Math.abs(bot.state.body.x+5)>1;}
    assert.equal(room.phase,'finished',mode);assert.ok(jumped,mode+' jumps');assert.ok(moved,mode+' moves');assert.equal(results.length,1);assert.equal(results[0].kind,'ai');
    assert.ok(bot.state.damage>=199.99,mode+' confirms lethal damage');assert.ok(bot.state.body.x<=CONFIG.arenaHalf&&bot.state.body.x>=-CONFIG.arenaHalf);
    for(const p of results[0].players)assert.ok(p.trackingMs<=p.opportunityMs);
  }
});
