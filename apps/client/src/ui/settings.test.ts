import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, parseSettings, PRESETS, rebind, keyLabel, lockCodes, normalizeKey, reservedKey } from './settings';
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
test('keybinds default to WASD, Space and Shift crouch; corrupt, reserved or duplicate saves fall back', () => {
  assert.deepEqual(defaults.keys,{forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',jump:'Space',crouch:'Shift'});
  assert.deepEqual(parseSettings({}).keys,defaults.keys);
  assert.deepEqual(parseSettings({keys:{crouch:'ControlLeft',jump:'KeyF'}}).keys,{...defaults.keys,crouch:'Control',jump:'KeyF'});
  assert.deepEqual(parseSettings({keys:{crouch:'Escape',jump:'F5',forward:'<script>'}}).keys,defaults.keys);
  assert.deepEqual(parseSettings({keys:{forward:'KeyS'}}).keys,defaults.keys,'two actions on one key reset to defaults');
  const custom=parseSettings({...defaults,keys:{forward:'ArrowUp',back:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',jump:'KeyE',crouch:'KeyC'}});
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(custom))),custom);
});
test('rebinding swaps clashing keys, merges left/right modifiers and labels keys readably', () => {
  assert.deepEqual(rebind(defaults.keys,'crouch','KeyC'),{...defaults.keys,crouch:'KeyC'});
  assert.deepEqual(rebind(defaults.keys,'forward','KeyS'),{...defaults.keys,forward:'KeyS',back:'KeyW'},'the displaced action takes the old key');
  assert.equal(rebind(defaults.keys,'crouch','ControlRight').crouch,'Control');
  assert.equal(normalizeKey('ShiftRight'),'Shift');assert.equal(reservedKey('Escape'),true);assert.equal(reservedKey('MetaLeft'),true);assert.equal(reservedKey('KeyQ'),false);
  assert.deepEqual(['KeyW','Space','Shift','Control','Digit4','ArrowUp','Numpad1'].map(keyLabel),['W','SPACE','SHIFT','CTRL','4','↑','NUM 1']);
  assert.deepEqual(lockCodes(defaults.keys),['KeyW','KeyS','KeyA','KeyD','Space','ShiftLeft','ShiftRight']);
});
