import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRules, rankedWindow, rankName, rankOf, rankStep, repeatDecay, streakMultiplier, RANKED } from './ranked';
import { CONFIG } from './index';

const at = (tier: number, division: number, rp = 50) => tier * 400 + (4 - division) * 100 + rp;
const fresh = (points: number, streak = 0, shield = 0) => ({ points, streak, shield });

test('32 divisions from Bronze 4 to an uncapped Grand Masters 1', () => {
  assert.deepEqual(rankOf(0), { tier: 0, division: 4, points: 0 }); assert.equal(rankName(rankOf(0)), 'Bronze 4');
  assert.equal(rankName(rankOf(99)), 'Bronze 4'); assert.equal(rankName(rankOf(100)), 'Bronze 3'); assert.equal(rankName(rankOf(399)), 'Bronze 1');
  assert.equal(rankName(rankOf(400)), 'Silver 4'); assert.equal(rankName(rankOf(2000)), 'Diamond 4'); assert.equal(rankName(rankOf(2799)), 'Masters 1');
  assert.deepEqual(rankOf(3100), { tier: 7, division: 1, points: 0 }); assert.deepEqual(rankOf(3645), { tier: 7, division: 1, points: 545 });
  assert.deepEqual(rankOf(-20), rankOf(0));
});
test('even matches are worth 30 and streaks raise the stakes from the 3rd result', () => {
  const even = at(2, 2);
  assert.equal(rankStep(fresh(even), even, true).delta, 30); assert.equal(rankStep(fresh(even), even, false).delta, -30);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(s => rankStep(fresh(even, s), even, true).delta), [30, 30, 39, 44, 48, 53, 53]);
  assert.deepEqual([0, -1, -2, -3].map(s => rankStep(fresh(even, s), even, false).delta), [-30, -30, -39, -44]);
  assert.equal(rankStep(fresh(even, -4), even, true).delta, 30, 'a win ends a loss streak without a bonus');
  assert.equal(rankStep(fresh(even, 4), even, true).streak, 5); assert.equal(rankStep(fresh(even, 4), even, false).streak, -1);
  assert.equal(streakMultiplier(3), 1.3); assert.equal(streakMultiplier(50), 1.75);
});
test('rank gaps pay upsets well and cost little, clamped to 5–55 before streaks', () => {
  const silver = at(1, 2), diamond = at(5, 2);
  assert.equal(rankStep(fresh(silver), diamond, true).delta, 55); assert.equal(rankStep(fresh(silver), diamond, false).delta, -5);
  assert.equal(rankStep(fresh(diamond), silver, true).delta, 5); assert.equal(rankStep(fresh(diamond), silver, false).delta, -55);
  const gold = at(2, 4), plat = at(3, 4);
  assert.equal(rankStep(fresh(gold), plat, true).delta, 46); assert.equal(rankStep(fresh(gold), plat, false).delta, -14);
});
test('Bronze 4 floor, promotion shield and division changes', () => {
  assert.equal(rankStep(fresh(10), 10, false).points, 0, 'never below 0');
  const promoted = rankStep(fresh(at(1, 3, 90)), at(1, 3, 90), true);
  assert.equal(rankOf(promoted.points).division, 2); assert.equal(promoted.shield, RANKED.shieldGames);
  const held = rankStep({ ...promoted, points: at(1, 2, 5) }, at(1, 2), false);
  assert.equal(held.points, at(1, 2, 0), 'shield holds the new division'); assert.equal(held.shield, 2);
  const unshielded = rankStep(fresh(at(1, 2, 5)), at(1, 2, 5), false);
  assert.equal(rankName(rankOf(unshielded.points)), 'Silver 3'); assert.equal(unshielded.points, at(1, 2, 5) - 30);
});
test('repeat opponents decay to nothing and thrown or discounted games never build streaks', () => {
  assert.deepEqual([0, 1, 2, 7].map(repeatDecay), [1, 0.5, 0, 0]);
  const even = at(0, 2);
  assert.equal(rankStep(fresh(even, 2), even, true, 0.5).delta, 20); assert.equal(rankStep(fresh(even, 2), even, true, 0.5).streak, 2);
  assert.equal(rankStep(fresh(even, 2), even, true, 0).delta, 0); assert.equal(rankStep(fresh(even), even, false, 0).delta, 0);
  const thrown = rankStep(fresh(even, 4), even, true, 1, true);
  assert.equal(thrown.delta, 0); assert.equal(thrown.streak, 4);
});
test('ranked rules and queue windows', () => {
  assert.deepEqual(matchRules('ranked'), { wins: 3, summarySeconds: 25 }); assert.deepEqual(matchRules('public'), { wins: CONFIG.winsRequired, summarySeconds: CONFIG.roundSummarySeconds });
  assert.deepEqual([0, 14_999, 15_000, 45_000, 89_999].map(rankedWindow), [300, 300, 450, 750, 1050]); assert.equal(rankedWindow(90_000), Infinity);
});
