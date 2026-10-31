import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AudioEvents} from './audio-events';
import {parseSettings} from './settings';
test('audio prioritizes kills/headshots, rate limits sustained hits and deduplicates spawn/kill counters',()=>{
  const audio=new AudioEvents(),s={key:'a',spawn:1,kills:0,damage:0,headDamage:0};
  assert.deepEqual(audio.observe(s,0,8),['spawn']);
  s.damage++;assert.deepEqual(audio.observe(s,1,8),['hit']);
  s.damage++;assert.deepEqual(audio.observe(s,50,8),[]);
  s.damage++;s.headDamage++;assert.deepEqual(audio.observe(s,126,8),['headshot']);
  s.kills++;s.damage++;s.headDamage++;assert.deepEqual(audio.observe(s,130,8),['kill']);
  assert.deepEqual(audio.observe(s,150,8),[]);
  s.spawn++;assert.deepEqual(audio.observe(s,800,8),['spawn']);
  assert.deepEqual(audio.observe(s,900,8),[]);
  assert.deepEqual(audio.observe({...s,key:'b',kills:5},1000,8),['spawn']);
  assert.deepEqual(new AudioEvents().observe({...s,allowInitialSpawn:false},1000,8),[],'unlocking audio or reloading during a live round must not invent a spawn');
});
test('sound and HUD preferences persist and malformed values are bounded',()=>{
  const settings=parseSettings({masterVolume:.3,sfxVolume:.4,muteAll:true,hitMarkers:false,hitColor:'#123456',hitRate:6,damageNumbers:true});
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(settings))),settings);
  const bad=parseSettings({masterVolume:-1,sfxVolume:Infinity,hitRate:999,hitColor:'url(x)',hitOpacity:2});
  assert.equal(bad.masterVolume,0);assert.equal(bad.sfxVolume,.8);assert.equal(bad.hitRate,12);assert.equal(bad.hitOpacity,1);assert.equal(bad.hitColor,'#ffffff');
});
