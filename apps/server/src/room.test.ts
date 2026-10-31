import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './game/Room';
import { neutralInput } from '@trace/shared/protocol';
import { CONFIG, MODES, type ModeId } from '@trace/shared';

function advance(room: Room, seconds: number) { for (let i=0;i<Math.round(seconds/CONFIG.tick);i++) room.step(room.tick * CONFIG.tick * 1000); }
function live() { const room = new Room('ABCDE'); room.add('a'); room.add('b'); room.ready('a'); room.ready('b'); advance(room,CONFIG.countdownSeconds); return room; }
test('two players only, both ready, immutable client authority', () => {
  const room = new Room('ABCDE'); assert.ok(room.add('a')); assert.ok(room.add('b')); assert.equal(room.add('c'), false);
  room.ready('a'); assert.equal(room.phase, 'lobby'); room.ready('b'); assert.equal(room.phase, 'countdown'); advance(room,CONFIG.countdownSeconds); assert.equal(room.phase,'live');
  room.accept('a', { ...neutralInput(1), active: true, hp: 999, body: { x: 1000 }, hit: true }, 1000); room.step(1000);
  assert.equal(room.players.get('a')!.state.hp, 100); assert.equal(room.players.get('a')!.state.body.x, 5);
  assert.equal(room.accept('a', { ...neutralInput(2), forward: 50 }, 1001), false);
  assert.equal(room.accept('a', { ...neutralInput(2), yaw: NaN }, 1001), false);
  assert.equal(room.accept('a', neutralInput(1), 1001), false);
});
test('server ray uses cover and target jump height; release and focus loss stop damage', () => {
  const room = live(), a = room.players.get('a')!, b = room.players.get('b')!;
  a.state.body.x = 0; b.state.body.x = 0;
  room.accept('a', { ...neutralInput(1), active: true, firing: true }, 1000); room.step(1000); assert.equal(b.state.hp,100);
  a.state.body.x = 5; b.state.body.x = 5;
  room.accept('a', { ...neutralInput(2), active: true, firing: true }, 1017); room.step(1017); assert.ok(b.state.hp < 100);
  const hp = b.state.hp;
  room.accept('a', { ...neutralInput(3), active: true, firing: false }, 1034); room.step(1034); assert.equal(b.state.hp, hp);
  room.accept('a', { ...neutralInput(4), active: true, firing: true }, 1051);
  room.accept('a', neutralInput(5), 1052); room.step(1052); assert.equal(b.state.hp, hp);
  b.state.body.y = 3;
  room.accept('a', { ...neutralInput(6), active: true, firing: true }, 1069); room.step(1069); assert.equal(b.state.hp, hp);
});
test('server speed independent of message spam, stale input disabled', () => {
  const room = live(); const p = room.players.get('a')!;
  for (let seq = 1; seq <= 1000; seq++) room.accept('a', { ...neutralInput(seq), active: true, strafe: 1, firing: true }, 1000);
  room.step(1000); assert.ok(p.state.body.x - 5 <= CONFIG.speed * CONFIG.tick);
  room.step(1300); assert.equal(p.input.active, false); assert.equal(p.input.firing, false);
});
test('simultaneous KO is a draw, replay resets HP, disconnect resolves winner', () => {
  const room = live(), a = room.players.get('a')!, b = room.players.get('b')!;
  a.state.body.x = b.state.body.x = 5; a.state.hp = b.state.hp = 0.2;
  room.accept('a', { ...neutralInput(1), active: true, firing: true }, 1000);
  room.accept('b', { ...neutralInput(1), active: true, firing: true, yaw: -Math.PI }, 1000);
  room.step(1000); assert.equal(room.phase, 'roundEnd'); assert.equal(room.roundWinner, null); assert.equal(a.state.hp, 0); assert.equal(b.state.hp, 0);
  advance(room,CONFIG.roundSummarySeconds+CONFIG.countdownSeconds); assert.equal(room.phase, 'live'); assert.equal(a.state.hp, 100); assert.equal(room.match,1); assert.equal(room.round,1); assert.equal(room.roundSerial,2);
  room.remove('b'); assert.equal(room.phase, 'finished'); assert.equal(room.winner, 'a');
});

test('countdown freezes movement and damage, starts at 90 seconds, rejects ready during play', () => {
  const room=new Room('ABCDE');room.add('a');room.add('b');room.ready('a');room.ready('b');
  assert.equal(room.snapshot().remaining,3);
  assert.equal(room.accept('a',{...neutralInput(1),active:true,firing:true,strafe:1},10),false);
  advance(room,3-CONFIG.tick);assert.equal(room.phase,'countdown');assert.equal(room.players.get('a')!.state.body.x,5);
  advance(room,CONFIG.tick);assert.equal(room.phase,'live');assert.equal(room.snapshot().remaining,90);
  room.ready('a');room.ready('b');assert.equal(room.match,1);assert.equal(room.players.get('a')!.state.ready,false);
  assert.equal(room.players.get('b')!.state.hp,100);
});
test('timeout awards higher HP, tied timeout enters sudden death, no hit replays same round', () => {
  const room=live();room.players.get('b')!.state.hp=80;advance(room,90);
  assert.equal(room.phase,'roundEnd');assert.equal(room.roundWinner,'a');assert.equal(room.players.get('a')!.state.wins,1);
  advance(room,6);assert.equal(room.round,2);assert.equal(room.players.get('b')!.state.hp,100);
  advance(room,90);assert.equal(room.phase,'suddenDeath');assert.equal(room.snapshot().remaining,15);
  advance(room,15);assert.equal(room.phase,'roundEnd');assert.equal(room.roundWinner,null);
  advance(room,6);assert.equal(room.round,2);assert.equal(room.players.get('a')!.state.wins,1);
});
test('sudden death resolves first hit and replays simultaneous hits without awarding wins', () => {
  for(const simultaneous of [false,true]) {
    const room=live();advance(room,90);
    const a=room.players.get('a')!,b=room.players.get('b')!;a.state.body.x=b.state.body.x=5;
    const now=room.tick*CONFIG.tick*1000;
    room.accept('a',{...neutralInput(1),active:true,firing:true},now);
    room.accept('b',{...neutralInput(1),active:true,firing:simultaneous,yaw:-Math.PI},now);
    room.step(now);assert.equal(room.phase,'roundEnd');assert.equal(room.roundWinner,simultaneous?null:'a');assert.equal(a.state.wins,simultaneous?0:1);assert.equal(b.state.wins,0);
  }
});
test('three rounds decide 2–1, finished state is stable, rematch resets scores and metrics', () => {
  const room=live();room.setName('a','ignored while live');
  for(const [index,winner] of ['a','b','a'].entries()) {
    const a=room.players.get('a')!,b=room.players.get('b')!;
    a.state.body.x=b.state.body.x=5;(winner==='a'?b:a).state.hp=0.2;
    const now=room.tick*CONFIG.tick*1000;
    room.accept(winner,{...neutralInput(index+1),active:true,firing:true,yaw:winner==='a'?0:-Math.PI},now);room.step(now);
    assert.equal(room.roundWinner,winner);
    if(index<2){assert.equal(room.phase,'roundEnd');advance(room,6);assert.equal(room.round,index+2);}
  }
  assert.equal(room.phase,'finished');assert.equal(room.winner,'a');assert.equal(room.players.get('a')!.state.wins,2);assert.equal(room.players.get('b')!.state.wins,1);
  advance(room,10);assert.equal(room.players.get('a')!.state.wins,2);
  room.setName('a','  Runner\u0000  ');assert.equal(room.players.get('a')!.state.name,'Runner');
  room.ready('a');assert.equal(room.phase,'finished');room.ready('b');assert.equal(room.phase,'countdown');assert.equal(room.match,2);assert.equal(room.round,1);
  for(const p of room.players.values()){assert.equal(p.state.hp,100);assert.equal(p.state.wins,0);assert.equal(p.state.damage,0);assert.equal(p.state.firingSeconds,0);assert.equal(p.queue.length,0);}
});
test('disconnect during countdown, sudden death and summary resolves forfeit', () => {
  for(const phase of ['countdown','suddenDeath','roundEnd'] as const) {
    const room=live();room.phase=phase;room.remove('b');assert.equal(room.phase,'finished');assert.equal(room.winner,'a');
  }
});

test('only host selects modes, changes invalidate ready, stale approval cannot start a match', () => {
  const room=new Room('ABCDE');room.add('a');room.add('b');room.ready('b',0);
  assert.equal(room.selectMode('b','heavy'),false);assert.equal(room.selectMode('a','unknown'),false);
  assert.ok(room.selectMode('a','heavy'));assert.equal(room.modeRevision,1);assert.equal(room.players.get('b')!.state.ready,false);
  room.ready('a',1);room.ready('b',0);assert.equal(room.phase,'lobby');
  room.ready('b',1);assert.equal(room.phase,'countdown');assert.equal(room.selectMode('a','extreme'),false);
  assert.equal(room.snapshot().mode,'heavy');assert.equal(room.snapshot().hostId,'a');
});
test('server applies every shared mode to both players and keeps damage at 20 HP/s', () => {
  for(const id of Object.keys(MODES) as ModeId[]) {
    const room=new Room('ABCDE');room.add('a');room.add('b');room.selectMode('a',id);room.ready('a');room.ready('b');advance(room,3);
    const a=room.players.get('a')!,b=room.players.get('b')!;a.state.body.x=b.state.body.x=5;
    for(let i=1;i<=60;i++) { const now=room.tick*CONFIG.tick*1000;room.accept('a',{...neutralInput(i),active:true,firing:true,pitch:Math.atan2(-0.7*MODES[id].scale,18)},now);room.step(now); }
    assert.ok(Math.abs(b.state.hp-80)<1e-8,`${id}: server ray must use mode eye height and target size`);
    assert.equal(a.state.hp,100);
  }
});

test('multiplayer capsule and gray head use exact regions with 2x head damage in every mode', () => {
  for(const id of Object.keys(MODES) as ModeId[]) {
    const room=new Room('ABCDE');room.add('a');room.add('b');room.selectMode('a',id);room.ready('a');room.ready('b');advance(room,3);
    const a=room.players.get('a')!,b=room.players.get('b')!;a.state.body.x=b.state.body.x=5;
    for(let i=1;i<=60;i++){const now=room.tick*CONFIG.tick*1000;room.accept('a',{...neutralInput(i),active:true,firing:true},now);room.step(now);}
    assert.ok(Math.abs(b.state.hp-60)<1e-8);assert.equal(a.state.headshot,true);
    // Aim through the visible gap at local y=0.56 above the model center.
    const now=room.tick*CONFIG.tick*1000;
    room.accept('a',{...neutralInput(61),active:true,firing:true,pitch:Math.atan2((1.46-1.6)*MODES[id].scale,18)},now);
    room.step(now);assert.ok(Math.abs(b.state.hp-60)<1e-8);assert.equal(a.state.hit,false);assert.equal(a.state.headshot,false);
  }
});
