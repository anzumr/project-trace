import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { CONFIG } from '@trace/shared';
import { PracticeRandom } from '@trace/shared/practice';
import { neutralInput, type Difficulty } from '@trace/shared/protocol';
import { Room } from './game/Room';
import { createGameServer } from './server';

/** A started practice room: the human `h` stands still (optionally drawing at the bot); `open` puts both 12 m apart on the clear side of the pillar. */
function practice(difficulty: Difficulty, open = true, seed = 7) {
  const rng = new PracticeRandom(seed), room = new Room('PRACT'); room.add('h'); assert.ok(room.addArcher(difficulty, () => rng.next()));
  const bot = [...room.players.values()].find(p => p.state.bot)!.state, human = room.players.get('h')!.state;
  room.ready('h'); for (let i = 0; i < CONFIG.countdownSeconds / CONFIG.tick; i++) room.step(room.tick * CONFIG.tick * 1000);
  if (open) { Object.assign(human.body, { x: 5, z: 6 }); Object.assign(bot.body, { x: 5, z: -6 }); human.yaw = 0; bot.yaw = Math.PI; }
  let seq = 0;
  const run = (seconds: number, each: () => void = () => {}, draw = false) => {
    for (let i = 0; i < seconds / CONFIG.tick; i++) {
      const now = room.tick * CONFIG.tick * 1000, yaw = Math.atan2(-(bot.body.x - human.body.x), -(bot.body.z - human.body.z));
      room.accept('h', { ...neutralInput(++seq), active: true, yaw, firing: draw }, now); room.step(now); each();
    }
  };
  return { room, bot, human, run };
}

test('practice room: the bot readies itself, the mode is locked to Bow 1v1, and the room is full', () => {
  const { room, bot } = practice('normal');
  assert.equal(room.phase, 'live'); assert.equal(room.game, 'bow'); assert.equal(room.practice, 'normal'); assert.equal(bot.name, 'Normal archer [BOT]');
  assert.equal(room.selectMode('h', 'agile'), false); assert.equal(room.add('x'), false);
  assert.equal(room.snapshot().practice, 'normal');
});
test('a Hard archer finds a standing target in the open and kills it', () => {
  const { room, bot, run } = practice('hard');
  for (let i = 0; i < 10 && room.phase === 'live'; i++) run(1);
  assert.equal(room.phase, 'roundEnd'); assert.equal(bot.wins, 1); assert.ok(bot.bow!.hits >= 1);
});
test('accuracy rises with difficulty against a standing target', () => {
  const rate: Record<string, number> = {};
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    const { bot, human, run } = practice(difficulty);
    run(40, () => { human.hp = 100; });
    assert.ok(bot.bow!.shots >= 8, `${difficulty} shoots (${bot.bow!.shots})`);
    rate[difficulty] = bot.bow!.hits / bot.bow!.shots;
  }
  assert.ok(rate.easy < rate.normal && rate.normal < rate.hard, JSON.stringify(rate));
  assert.ok(rate.easy < 0.6 && rate.hard > 0.7, JSON.stringify(rate));
});
test('from the spawns the bot works its way out of cover and starts shooting', () => {
  const { bot, human, run } = practice('hard', false);
  run(20, () => { human.hp = 100; });
  assert.ok(bot.bow!.shots >= 1);
});
test('Hard dodges a full draw aimed at it with the air jump; Easy never does', () => {
  for (const [difficulty, dodges] of [['hard', true], ['easy', false]] as const) {
    const { bot, run } = practice(difficulty, true, 3);
    let airJumped = false;
    run(6, () => { if (bot.body.airReady === false) airJumped = true; }, true);
    assert.equal(airJumped, dodges, difficulty);
  }
});
test('practiceBow over the socket: validated, a full private room, deleted when the player leaves', { timeout: 15000 }, async () => {
  const server = createGameServer({ resultSink: async () => {}, rankLookup: null, deleteAccount: null }), clients: Socket[] = [];
  try {
    await new Promise<void>(r => server.http.listen(0, '127.0.0.1', r));
    const connect = async () => { const s = io(`http://127.0.0.1:${(server.http.address() as AddressInfo).port}`, { transports: ['websocket'], reconnection: false }); clients.push(s); await new Promise<void>((r, j) => { s.once('connect', r); s.once('connect_error', j); }); return s; };
    const a = await connect();
    assert.equal((await a.timeout(2000).emitWithAck('practiceBow', 'impossible' as Difficulty)).ok, false);
    await new Promise(r => setTimeout(r, 550));
    const made = await a.timeout(2000).emitWithAck('practiceBow', 'hard');
    assert.equal(made.ok, true); assert.equal(made.snapshot!.players.length, 2); assert.equal(made.snapshot!.practice, 'hard'); assert.equal(made.snapshot!.game, 'bow');
    const b = await connect();
    assert.equal((await b.timeout(2000).emitWithAck('join', made.snapshot!.code)).ok, false);
    assert.equal(server.rooms.size, 1);
    a.emit('leave'); await a.timeout(2000).emitWithAck('pingCheck');
    assert.equal(server.rooms.size, 0, 'a room with only the bot left is removed');
  } finally { clients.forEach(c => c.disconnect()); await server.close(); }
});
