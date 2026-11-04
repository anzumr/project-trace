import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duration, headShare, outcomeClass, outcomeLabel, parseHistory, percent } from './career';

const stats = (damage: number) => ({ attack: 10, tracked: 4, damage, received: 30, headDamage: damage / 4, headTracked: 1, streak: 0, longest: 2.5, duration: 40 });
const round = (n: number, winner: string | null, id: string, damage: number) => ({ serial: n, round: n, winner, reason: 'Eliminated', duration: 12.5, players: [{ id, name: id, hp: 0, wins: 1, stats: stats(damage) }] });
const raw = (over: Record<string, unknown> = {}) => ({ id: 'm1', kind: 'public', mode: 'agile', status: 'completed', reason: 'Match complete', started_at: '2026-11-01T10:00:00Z', completed_at: '2026-11-01T10:03:05Z',
  players: [{ id: 'pb', me: false, name: 'Beta', bot: false, outcome: 'loss', rounds_won: 1, damage_milli: 150500, received_milli: 240000, xp: 40, combat: stats(150.5), rounds: [round(1, 'pb', 'pb', 100), round(2, 'pa', 'pb', 50.5)] },
    { id: 'pa', me: true, name: 'Alpha', bot: false, outcome: 'win', rounds_won: 2, damage_milli: 240000, received_milli: 150500, xp: 100, combat: stats(240), rounds: [round(1, 'pb', 'pa', 90), round(2, 'pa', 'pa', 150), round(3, null, 'pa', 0)] }], ...over });

test('match history puts the caller on the left and resolves round results per player', () => {
  const [m] = parseHistory([raw()]);
  assert.equal(m.me.name, 'Alpha'); assert.equal(m.them.name, 'Beta');
  assert.equal(m.me.damage, 240); assert.equal(m.them.damage, 150.5); assert.equal(m.me.xp, 100);
  assert.deepEqual(m.me.rounds.map(r => [r.round, r.result, r.stats?.damage]), [[1, 'lost', 90], [2, 'won', 150], [3, 'draw', 0]]);
  assert.deepEqual(m.them.rounds.map(r => r.result), ['won', 'lost']);
  assert.equal(outcomeLabel(m), 'VICTORY'); assert.equal(outcomeClass(m), 'win'); assert.equal(duration(m), '3:05');
  assert.equal(percent(m.me.combat), '40.0%'); assert.equal(headShare(m.me), '25%');
});
test('losses, cancellations and old matches without combat stats display safely', () => {
  const loss = parseHistory([raw({ players: [{ ...raw().players[1], outcome: 'loss' }, { ...raw().players[0], outcome: 'win' }] })])[0];
  assert.equal(outcomeLabel(loss), 'DEFEAT'); assert.equal(outcomeClass(loss), 'loss');
  const cancelled = parseHistory([raw({ status: 'cancelled' })])[0];
  assert.equal(outcomeLabel(cancelled), 'CANCELLED'); assert.equal(outcomeClass(cancelled), 'void');
  const old = parseHistory([raw({ players: raw().players.map(p => ({ ...p, combat: null, rounds: null })) })])[0];
  assert.equal(old.me.combat, null); assert.deepEqual(old.me.rounds, []); assert.equal(percent(old.me.combat), '—'); assert.equal(headShare(old.me), '—');
  const partial = parseHistory([raw({ players: raw().players.map(p => ({ ...p, combat: { damage: 5 } })) })])[0];
  assert.equal(partial.me.combat, null, 'incomplete stats are not shown as zeros');
});
test('malformed rows are dropped instead of rendered wrong', () => {
  assert.deepEqual(parseHistory(null), []); assert.deepEqual(parseHistory({}), []);
  for (const over of [{ kind: 'ladder' }, { mode: 'giant' }, { status: 'won' }, { players: [] }, { players: [raw().players[1]] }, { players: raw().players.map(p => ({ ...p, me: false })) }])
    assert.deepEqual(parseHistory([raw(over)]), [], JSON.stringify(over).slice(0, 40));
  assert.equal(parseHistory([raw(), 'junk', raw({ id: 'm2' })]).length, 2);
});
test('ranked rows carry the caller’s rank change; other kinds have none', () => {
  const [m] = parseHistory([raw({ kind: 'ranked', rank: { before: 640, after: 679, delta: 39, multiplier: 1.3, decay: 1, flagged: false } })]);
  assert.equal(m.kind, 'ranked'); assert.deepEqual(m.rank, { before: 640, after: 679, delta: 39, multiplier: 1.3, decay: 1, flagged: false });
  assert.equal(parseHistory([raw()])[0].rank, null);
  assert.equal(parseHistory([raw({ kind: 'ranked', rank: { before: 0, after: 0, delta: 0, multiplier: 1, decay: 0, flagged: true } })])[0].rank?.decay, 0, 'a zero decay is kept, not defaulted');
});
