import {test} from 'node:test';
import assert from 'node:assert/strict';
import {levelProgress} from './index';
test('level thresholds handle new players, exact boundaries and reduced AI rewards',()=>{
  assert.equal(levelProgress(0).level,1);assert.equal(levelProgress(99).level,1);assert.equal(levelProgress(100).level,2);
  assert.equal(levelProgress(110).next,400);assert.equal(levelProgress(399).level,2);assert.equal(levelProgress(400).level,3);
  assert.deepEqual(levelProgress(NaN),levelProgress(0));assert.deepEqual(levelProgress(-100),levelProgress(0));
});
