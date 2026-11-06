import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './game/Room';
import { neutralInput, type PlayerInput } from '@trace/shared/protocol';
import { AIR, CONFIG, MODES, type ModeId } from '@trace/shared';
import { BOW, arrowDrop } from '@trace/shared/bow';
import { BOT_MODEL } from '@trace/shared/practice';

function advance(room: Room, seconds: number) { for (let i=0;i<Math.round(seconds/CONFIG.tick);i++) room.step(room.tick * CONFIG.tick * 1000); }
function live() { const room = new Room('ABCDE'); room.add('a'); room.add('b'); room.ready('a'); room.ready('b'); advance(room,CONFIG.countdownSeconds); return room; }

test('public rematches require two connected approvals and reset match identity and stats',()=>{
  const results:string[]=[],room=new Room('ABCDE',{kind:'public',onResult:r=>results.push(r.id)});
  room.add('a',{userId:'a',username:'Alpha'});room.add('b',{userId:'b',username:'Beta'});
  room.ready('a');room.ready('b');advance(room,CONFIG.countdownSeconds);
  for(let round=0;round<2;round++){room.players.get('b')!.state.hp=1;advance(room,CONFIG.roundSeconds);if(round===0)advance(room,CONFIG.roundSummarySeconds+CONFIG.countdownSeconds);}
  assert.equal(room.phase,'finished');assert.equal(results.length,1);const previous=room.matchId;
  room.ready('a',room.modeRevision+1);assert.equal(room.players.get('a')!.state.ready,false);
  room.ready('a');assert.equal(room.phase,'finished');room.setConnected('b',false);room.ready('b');assert.equal(room.phase,'finished');
  room.setConnected('b',true);room.ready('b');assert.equal(room.phase,'countdown');assert.notEqual(room.matchId,previous);assert.equal(room.match,2);
  assert.equal(room.resultStatus,undefined);assert.equal(room.lastRound,undefined);assert.equal(room.resultState,'unavailable');
  for(const p of room.players.values()){assert.equal(p.state.wins,0);assert.equal(p.state.hp,100);assert.equal(p.state.damage,0);assert.equal(p.state.matchStats!.attack,0);}
  advance(room,CONFIG.countdownSeconds);room.forfeit('b');assert.equal(results.length,2);assert.notEqual(results[0],results[1]);
  room.setConnected('b',false);room.ready('a');assert.equal(room.players.get('a')!.state.ready,false);
});
test('two players only, both ready, immutable client authority', () => {
  const room = new Room('ABCDE'); assert.ok(room.add('a')); assert.ok(room.add('b')); assert.equal(room.add('c'), false);
  room.ready('a'); assert.equal(room.phase, 'lobby'); room.ready('b'); assert.equal(room.phase, 'countdown'); advance(room,CONFIG.countdownSeconds); assert.equal(room.phase,'live');
  room.accept('a', { ...neutralInput(1), active: true, hp: 999, body: { x: 1000 }, hit: true }, 1000); room.step(1000);
  assert.equal(room.players.get('a')!.state.hp, 100); assert.equal(room.players.get('a')!.state.body.x, 0);
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
  room.step(1000); assert.ok(p.state.body.x <= CONFIG.speed * CONFIG.tick);
  room.step(1300); assert.equal(p.input.active, false); assert.equal(p.input.firing, false);
});
test('simultaneous KO is a draw, replay resets HP, disconnect resolves winner', () => {
  const room = live(), a = room.players.get('a')!, b = room.players.get('b')!;
  a.state.body.x = b.state.body.x = 5; a.state.body.z=9; b.state.body.z=-9; a.state.hp = b.state.hp = 0.2;
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
  advance(room,3-CONFIG.tick);assert.equal(room.phase,'countdown');assert.equal(room.players.get('a')!.state.body.x,0);
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
    const a=room.players.get('a')!,b=room.players.get('b')!;a.state.body.x=b.state.body.x=5;a.state.body.z=9;b.state.body.z=-9;
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
    a.state.body.x=b.state.body.x=5;a.state.body.z=9;b.state.body.z=-9;(winner==='a'?b:a).state.hp=0.2;
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
    const a=room.players.get('a')!,b=room.players.get('b')!;a.state.body.x=b.state.body.x=5;a.state.body.z=9;b.state.body.z=-9;
    for(let i=1;i<=60;i++) { const now=room.tick*CONFIG.tick*1000;room.accept('a',{...neutralInput(i),active:true,firing:true,pitch:Math.atan2(-0.7*MODES[id].scale,18)},now);room.step(now); }
    assert.ok(Math.abs(b.state.hp-80)<1e-8,`${id}: server ray must use mode eye height and target size`);
    assert.equal(a.state.hp,100);
  }
});

test('multiplayer capsule and gray head use exact regions with 2x head damage in every mode', () => {
  for(const id of Object.keys(MODES) as ModeId[]) {
    const room=new Room('ABCDE');room.add('a');room.add('b');room.selectMode('a',id);room.ready('a');room.ready('b');advance(room,3);
    const a=room.players.get('a')!,b=room.players.get('b')!;a.state.body.x=b.state.body.x=5;a.state.body.z=9;b.state.body.z=-9;
    for(let i=1;i<=60;i++){const now=room.tick*CONFIG.tick*1000;room.accept('a',{...neutralInput(i),active:true,firing:true},now);room.step(now);}
    assert.ok(Math.abs(b.state.hp-60)<1e-8);assert.equal(a.state.headshot,true);
    // Aim through the visible gap at local y=0.56 above the model center.
    const now=room.tick*CONFIG.tick*1000;
    room.accept('a',{...neutralInput(61),active:true,firing:true,pitch:Math.atan2((1.46-1.6)*MODES[id].scale,18)},now);
    room.step(now);assert.ok(Math.abs(b.state.hp-60)<1e-8);assert.equal(a.state.hit,false);assert.equal(a.state.headshot,false);
  }
});
test('shots rewind a strafing target to the tick the shooter saw, within the rewind limit', () => {
  const room = live(), a = room.players.get('a')!, b = room.players.get('b')!;
  a.state.body.x = b.state.body.x = 5; a.state.body.z=9; b.state.body.z=-9;
  const seen: { tick: number; x: number; y: number; z: number }[] = [];
  let now = 1000;
  for (let seq = 1; seq <= 40; seq++) { room.accept("b", { ...neutralInput(seq), active: true, strafe: seq <= 20 ? -1 : 1 }, now); room.step(now += 17); seen.push({ tick: room.tick, ...b.state.body }); }
  const aim = (target: { x: number; y: number; z: number }) => { const dx = target.x - a.state.body.x, dy = target.y + 0.8 - a.state.body.y - CONFIG.eyeHeight, dz = target.z - a.state.body.z; return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }; };
  const old = seen[seen.length - 7];
  room.accept('b', { ...neutralInput(41), active: true, strafe: 1 }, now);
  room.accept('a', { ...neutralInput(1), active: true, firing: true, ...aim(old) }, now); room.step(now += 17);
  assert.equal(b.state.hp, 100, 'without a view tick the lagged aim misses the current position');
  room.accept('b', { ...neutralInput(42), active: true, strafe: 1 }, now);
  room.accept('a', { ...neutralInput(2), active: true, firing: true, view: old.tick, ...aim(old) }, now); room.step(now += 17);
  assert.ok(b.state.hp < 100, 'aim at the rendered position registers');
  const hp = b.state.hp;
  room.accept('b', { ...neutralInput(43), active: true, strafe: 1 }, now);
  room.accept('a', { ...neutralInput(3), active: true, firing: true, view: seen[0].tick, ...aim(seen[0]) }, now); room.step(now += 17);
  assert.equal(b.state.hp, hp, 'rewind beyond the limit is clamped');
  assert.equal(room.accept('a', { ...neutralInput(4), active: true, view: NaN }, now), false);
});
test('crouching shrinks the server hitbox and lowers the shooter eye line', () => {
  const room = live(), a = room.players.get('a')!, b = room.players.get('b')!;
  a.state.body.x = b.state.body.x = 5; a.state.body.z=9; b.state.body.z=-9;
  let now = 1000, seq = 0;
  for (let i = 0; i < 30; i++) { room.accept('b', { ...neutralInput(++seq), active: true, crouch: true }, now); room.step(now += 17); }
  assert.equal(b.state.body.crouch, 1);
  const aim = (y: number) => { const dx = b.state.body.x - a.state.body.x, dy = y - (a.state.body.y + CONFIG.eyeHeight), dz = b.state.body.z - a.state.body.z; return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }; };
  const standingHead = b.state.body.y + BOT_MODEL.height / 2 + BOT_MODEL.headY;
  room.accept('b', { ...neutralInput(++seq), active: true, crouch: true }, now);
  room.accept('a', { ...neutralInput(1), active: true, firing: true, ...aim(standingHead) }, now); room.step(now += 17);
  assert.equal(b.state.hp, 100, 'a shot at standing head height passes over a crouched target');
  const crouchedHead = b.state.body.y + (BOT_MODEL.height / 2 + BOT_MODEL.headY) * CONFIG.crouchHeight;
  room.accept('b', { ...neutralInput(++seq), active: true, crouch: true }, now);
  room.accept('a', { ...neutralInput(2), active: true, firing: true, ...aim(crouchedHead) }, now); room.step(now += 17);
  assert.ok(b.state.hp < 100); assert.equal(a.state.headshot, true, 'the lowered head is still a headshot');
  for (let i = 0; i < 30; i++) { room.accept('b', { ...neutralInput(++seq), active: true, crouch: true }, now); room.accept('a', { ...neutralInput(3 + i), active: true, crouch: true }, now); room.step(now += 17); }
  assert.equal(a.state.body.crouch, 1); assert.equal(b.state.body.crouch, 1);
  const hp = b.state.hp;
  room.accept('b', { ...neutralInput(++seq), active: true, crouch: true }, now);
  room.accept('a', { ...neutralInput(40), active: true, crouch: true, firing: true, yaw: 0, pitch: 0 }, now); room.step(now += 17);
  assert.ok(b.state.hp < hp, 'a crouched shooter fires from the lowered eye line');
});
test('ranked is first to 3 with a 25-second stats break and no rematch', () => {
  const results: unknown[] = [], room = new Room('RANKD', { kind: 'ranked', onResult: r => results.push(r) });
  room.add('a', { userId: 'ua', username: 'A' }); room.add('b', { userId: 'ub', username: 'B' }); room.ready('a'); room.ready('b'); advance(room, CONFIG.countdownSeconds);
  for (const [index, winner] of ['a', 'b', 'a', 'b', 'a'].entries()) {
    const a = room.players.get('a')!, b = room.players.get('b')!;
    a.state.body.x = b.state.body.x = 5; a.state.body.z = 9; b.state.body.z = -9; (winner === 'a' ? b : a).state.hp = 0.2;
    const now = room.tick * CONFIG.tick * 1000;
    room.accept(winner, { ...neutralInput(index + 1), active: true, firing: true, yaw: winner === 'a' ? 0 : -Math.PI }, now); room.step(now);
    if (index < 4) { assert.equal(room.phase, 'roundEnd'); advance(room, 24.9); assert.equal(room.phase, 'roundEnd', 'stats stay up for 25 s'); advance(room, 0.2 + CONFIG.countdownSeconds); assert.equal(room.round, index + 2); }
  }
  assert.equal(room.phase, 'finished'); assert.equal(room.players.get('a')!.state.wins, 3); assert.equal(room.players.get('b')!.state.wins, 2);
  assert.equal(results.length, 1); assert.equal((results[0] as { kind: string }).kind, 'ranked');
  room.ready('a'); room.ready('b'); assert.equal(room.phase, 'finished', 'no ranked rematch');
});

/** Bow 1v1 room in play, archers 12 m apart on the open side of the pillar: `a` faces −z, `b` faces +z. */
function bowLive(onResult?: (r: unknown) => void) {
  const room = new Room('BOWAA', { onResult }); room.add('a'); room.add('b');
  assert.equal(room.selectMode('b', 'bow'), false, 'only the host picks');
  assert.ok(room.selectMode('a', 'bow')); assert.equal(room.game, 'bow'); assert.equal(room.mode, 'standard');
  room.ready('a'); room.ready('b'); advance(room, CONFIG.countdownSeconds); assert.equal(room.phase, 'live');
  const seqs: Record<string, number> = { a: 0, b: 0 };
  const place = () => { const a = room.players.get('a')!.state, b = room.players.get('b')!.state; Object.assign(a.body, { x: 5, z: 6 }); Object.assign(b.body, { x: 5, z: -6 }); a.yaw = 0; b.yaw = Math.PI; };
  /** One tick with `a` sending `input` (b stands still), returning the snapshot after it. */
  const tick = (input: Partial<PlayerInput> = {}) => { const now = room.tick * CONFIG.tick * 1000; room.accept('a', { ...neutralInput(++seqs.a), active: true, yaw: 0, ...input }, now); room.accept('b', { ...neutralInput(++seqs.b), active: true, yaw: Math.PI }, now); room.step(now); return room.snapshot(); };
  /** Hold the draw for `ticks`, then release at `pitch`. */
  const shoot = (ticks: number, pitch: number, extra: Partial<PlayerInput> = {}) => { for (let i = 0; i < ticks; i++) tick({ firing: true, pitch, ...extra }); return tick({ firing: false, pitch, ...extra }); };
  place();
  return { room, a: room.players.get('a')!.state, b: room.players.get('b')!.state, tick, shoot, place };
}
const fullDrawPitch = (y: number, front: number) => { const t = (12 - front) / BOW.maxSpeed; return Math.atan2(y - 1.6 + arrowDrop(1, t).drop, 12 - front); };

test('bow: a full draw to the torso does 75; release fires, the shot counts, and the arrow sticks in the target', () => {
  const { a, b, tick, shoot } = bowLive();
  let snap = shoot(45, fullDrawPitch(1.15, 0.16));
  assert.equal(a.bow!.shots, 1); assert.equal(snap.arrows!.length, 1); assert.equal(snap.arrows![0].owner, 'a');
  for (let i = 0; i < 20; i++) snap = tick();
  assert.equal(b.hp, 25); assert.equal(a.bow!.hits, 1); assert.equal(a.bow!.heads, 0); assert.equal(a.damage, 75);
  assert.equal(b.roundStats!.received, 75); assert.equal(a.matchStats!.damage, 75);
  const arrow = snap.arrows![0]; assert.equal(arrow.on, 'b'); assert.equal(arrow.stuck, undefined); assert.ok(arrow.local && Math.abs(arrow.local[2] - 0.16) < 0.06, 'stuck in the front of the torso');
  assert.equal(snap.game, 'bow');
});
test('bow: a headshot kills, the killer scores, and both respawn 2 s later on swapped sides without a countdown', () => {
  const { room, a, b, shoot, tick } = bowLive();
  shoot(45, fullDrawPitch(1.62, 0.15)); for (let i = 0; i < 20 && room.phase === 'live'; i++) tick();
  assert.equal(b.hp, 0); assert.equal(a.bow!.heads, 1); assert.equal(a.kills, 1); assert.equal(a.wins, 1);
  assert.equal(room.phase, 'roundEnd'); assert.match(room.reason, /eliminated/);
  advance(room, 1.9); assert.equal(room.phase, 'roundEnd');
  advance(room, 0.2); assert.equal(room.phase, 'live', 'straight back into play');
  assert.equal(a.hp, 100); assert.equal(b.hp, 100); assert.ok(a.body.z < 0 && b.body.z > 0, 'sides swap after a kill');
  assert.equal(room.snapshot().arrows!.length, 0, 'arrows clear on respawn');
});
test('bow: draw needs the reload, a tap shoots weak, cancel and focus loss drop the draw, and the draw slows you', () => {
  const { a, tick, shoot } = bowLive();
  shoot(1, 0); assert.equal(a.bow!.shots, 1, 'a one-tick tap still shoots');
  assert.ok(a.bow!.reload > 0);
  shoot(10, 0); assert.equal(a.bow!.shots, 1, 'holding during the reload draws nothing, so releasing shoots nothing');
  for (let i = 0; i < 20; i++) tick();
  shoot(10, 0); assert.equal(a.bow!.shots, 2);
  for (let i = 0; i < 25; i++) tick();
  for (let i = 0; i < 30; i++) tick({ firing: true });
  assert.ok(a.bow!.draw > 0.5); tick({ firing: false, cancel: true }); assert.equal(a.bow!.shots, 2); assert.equal(a.bow!.draw, 0);
  for (let i = 0; i < 30; i++) tick({ firing: true });
  tick({ active: false, firing: false }); assert.equal(a.bow!.shots, 2, 'losing focus never fires');
  for (let i = 0; i < 40; i++) tick({ firing: true, forward: 1 });
  assert.ok(Math.abs(Math.hypot(a.body.vx, a.body.vz) - CONFIG.speed * AIR.drawPace) < 1e-6);
});
test('bow: arrows are tested against where the shooter saw the target, not where it is now', () => {
  for (const [lagged, expected] of [[true, 25], [false, 100]] as const) {
    const { room, b, shoot, tick } = bowLive();
    for (let i = 0; i < 20; i++) tick();
    const view = lagged ? room.tick - 12 : undefined;
    shoot(45, fullDrawPitch(1.15, 0.16), { view });
    b.body.x = 8; // dodged after the shooter's view, which the shooter could not see yet
    for (let i = 0; i < 20; i++) { const now = room.tick * CONFIG.tick * 1000; room.accept('b', { ...neutralInput(1000 + room.tick), active: true, yaw: Math.PI }, now); room.step(now); }
    assert.equal(b.hp, expected);
  }
});
test('bow: first to 5 kills wins; the result is not saved yet; validation keeps cancel boolean', () => {
  const results: unknown[] = [], { room, a, b } = bowLive(r => results.push(r));
  assert.equal(room.rules.wins, 5);
  for (let kill = 1; kill <= 5; kill++) {
    b.hp = 0; room.step(room.tick * CONFIG.tick * 1000);
    if (kill < 5) { assert.equal(room.phase, 'roundEnd'); advance(room, 2.1); assert.equal(room.phase, 'live'); }
  }
  assert.equal(room.phase, 'finished'); assert.equal(room.winner, 'a'); assert.equal(a.wins, 5); assert.equal(results.length, 0);
  assert.equal(room.accept('a', { ...neutralInput(999), active: true, cancel: 'yes' }, 1), false);
  assert.ok(room.selectMode('a', 'agile')); assert.equal(room.game, undefined); assert.equal(room.mode, 'agile');
  assert.equal(new Room('PUBLC', { kind: 'public' }).selectMode('a', 'bow'), false);
});
