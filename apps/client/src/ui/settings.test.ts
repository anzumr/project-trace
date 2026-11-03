import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, parseSettings, PRESETS, rebind, keyLabel, lockCodes, normalizeKey, reservedKey, fromScale, toScale, SCALES, SENS } from './settings';
const near = (actual: number, expected: number, tolerance = 1e-3) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} vs ${expected}`);
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
test('game sensitivities convert by yaw and keep the same mouse distance per 360° turn', () => {
  near(toScale('cs2',fromScale('valorant',0.4)),1.2727);near(toScale('rivals',fromScale('overwatch',3)),1.1314);
  near(toScale('cod',fromScale('overwatch',4.5)),4.5);near(toScale('fortnite',fromScale('cs2',1)),3.9604);near(toScale('valorant',fromScale('fortnite',6.4)),0.5079);
  // Counts per full turn: 360° / (sens × yaw) in the game must equal 2π / sensitivity here.
  for(const [scale,sens,yaw] of [['cs2',1.5,0.022],['valorant',0.35,0.07],['overwatch',5,0.0066],['rivals',2,0.0175],['fortnite',8,0.005555]] as const)
    near(2*Math.PI/fromScale(scale,sens),360/(sens*yaw),1e-6);
  for(const scale of SCALES){const v=toScale(scale,0.0014);near(toScale(scale,fromScale(scale,v)),v,1e-9);}
  near(toScale('krazer',defaults.sensitivity),0.002,1e-12);
  assert.equal(fromScale('cs2',1000),SENS.max);assert.equal(fromScale('valorant',0.0001),SENS.min);
});
test('sensitivity scale persists and corrupt scales fall back to krazer.io units', () => {
  assert.equal(defaults.sensScale,'krazer');
  const saved=parseSettings({...defaults,sensScale:'valorant',sensitivity:fromScale('valorant',0.2)});
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(saved))),saved);near(toScale('valorant',saved.sensitivity),0.2,1e-9);
  assert.equal(parseSettings({sensScale:'quake'}).sensScale,'krazer');assert.equal(parseSettings({sensScale:42}).sensScale,'krazer');
  assert.equal(parseSettings({sensitivity:0.00015}).sensitivity,0.00015,'low-sensitivity players are no longer clamped up');
});
