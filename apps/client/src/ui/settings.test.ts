import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, parseSettings, PRESETS } from './settings';
test('settings migrate legacy saves without losing sensitivity/color and reject corrupt fields', () => {
  const migrated=parseSettings({sensitivity:0.003,invert:true,color:'#abcdef'});
  assert.equal(migrated.sensitivity,0.003);assert.equal(migrated.color,'#abcdef');assert.equal(migrated.invert,true);assert.equal(migrated.style,'cross');
  assert.deepEqual(parseSettings(null),defaults);
  const corrupt=parseSettings({sensitivity:NaN,size:Infinity,style:'unknown',color:'url(script)',gap:-100,thickness:900});
  assert.equal(corrupt.sensitivity,defaults.sensitivity);assert.equal(corrupt.size,defaults.size);assert.equal(corrupt.style,'cross');assert.equal(corrupt.color,defaults.color);assert.equal(corrupt.gap,0);assert.equal(corrupt.thickness,8);
});
test('custom reticles and presets survive JSON persistence round trips', () => {
  for(const style of ['dot','cross','circle','cross-dot','minimal']) {
    const settings=parseSettings({...defaults,style,size:33,gap:13,opacity:0.5,thickness:3.5,outlineWidth:2.5});
    assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(settings))),settings);
  }
  for(const preset of Object.values(PRESETS))assert.deepEqual(parseSettings({...defaults,...preset}),{...defaults,...preset});
});
