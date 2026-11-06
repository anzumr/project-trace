import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CONFIG, MODES, type ModeId } from '@trace/shared';
import { HEADSHOT_MULTIPLIER } from '@trace/shared/practice';
import type { Game, Snapshot } from '@trace/shared/protocol';
import { BOW, skeleton } from '@trace/shared/bow';
import { createBotModel } from '../game/BotModel';
import { ArcherModel } from '../game/ArcherModel';

/** Rotating view of the real in-game player model at the mode's scale, or the drawing archer for Bow 1v1. */
export function ModePreview({ mode, bow = false }: { mode: ModeId; bow?: boolean }) {
  const host=useRef<HTMLDivElement>(null);
  const currentMode=useRef(mode);currentMode.current=mode;
  const currentBow=useRef(bow);currentBow.current=bow;
  useEffect(() => {
    const root=host.current!;
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));root.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,0.1,20);
    camera.position.set(3,2.4,4.5);camera.lookAt(0,1.1,0);
    scene.add(new THREE.HemisphereLight(0xffffff,0x262a31,3));
    const { group: mesh } = createBotModel();scene.add(mesh);
    const archer=new ArcherModel();scene.add(archer.group);let yaw=0;
    const grid=new THREE.GridHelper(4,8,0x3a404a,0x22262d);scene.add(grid);
    let frame=0;const render=()=>{const profile=MODES[currentMode.current];mesh.visible=!currentBow.current;archer.group.visible=currentBow.current;mesh.scale.setScalar(profile.scale);mesh.position.y=CONFIG.targetHeight*profile.scale/2;mesh.rotation.y+=0.005;
      if(currentBow.current){yaw+=0.005;const pose={x:0,y:0,z:0,crouch:0,yaw,pitch:0,draw:0.7,raise:1,gait:0,grounded:true,speed:0};archer.update(skeleton(pose),pose,null);}
      renderer.render(scene,camera);frame=requestAnimationFrame(render);};
    const resize=new ResizeObserver(()=>{renderer.setSize(root.clientWidth,root.clientHeight);camera.aspect=root.clientWidth/root.clientHeight;camera.updateProjectionMatrix();});resize.observe(root);render();
    return()=>{cancelAnimationFrame(frame);resize.disconnect();scene.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();(object.material as THREE.Material).dispose();}});grid.geometry.dispose();(grid.material as THREE.Material).dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  },[]);
  return <div className="mode-preview" ref={host} role="img" aria-label={`Rotating 3D preview of ${bow ? 'the Bow 1v1 archer' : MODES[mode].label}`}/>;
}
export const damageNote = `Body ${CONFIG.dps} HP/s · gray head ${CONFIG.dps * HEADSHOT_MULTIPLIER} HP/s (${HEADSHOT_MULTIPLIER}×).`;
export const bowNote = `Torso ${BOW.base}–${BOW.base + BOW.bonus} by charge · head ×${BOW.head} · arms and legs ×${BOW.limb}`;
export function ModePicker({ room, ownId, choose }: { room: Snapshot; ownId?: string; choose: (mode: ModeId | Game) => void }) {
  const p=MODES[room.mode],host=room.hostId===ownId,editable=host && room.kind==='private' && ['lobby','finished'].includes(room.phase),bow=room.game==='bow';
  return <section className="mode-picker" aria-label="Shared mode">
    <div className="mode-options" role="group" aria-label="Shared mode">{(Object.entries(MODES) as [ModeId, typeof p][]).map(([id,m])=><button key={id} className="mode-option" aria-pressed={!bow && room.mode===id} disabled={!editable} onClick={()=>choose(id)}><strong>{m.label}</strong><small>{m.difficulty} · {m.scale}× size</small></button>)}{room.kind==='private' && <button className="mode-option" aria-pressed={bow} disabled={!editable} onClick={()=>choose('bow')}><strong>Bow 1v1</strong><small>Charge arrows · first to {BOW.kills} kills</small></button>}</div>
    <div className="mode-side"><ModePreview mode={room.mode} bow={bow}/>{bow?<div className="mode-stats"><span>FULL DRAW<b>{BOW.draw}s</b></span><span>HEADSHOT<b>×{BOW.head}</b></span><span>KILLS<b>{BOW.kills}</b></span></div>:<div className="mode-stats"><span>SIZE<b>{p.scale.toFixed(2)}×</b></span><span>SPEED<b>{p.speed.toFixed(2)}×</b></span><span>JUMP<b>{p.jump.toFixed(2)}×</b></span></div>}</div>
    <p className="note">{editable ? 'You host this room. Changing mode clears both ready states.' : room.kind==='private' ? 'The host selects the mode. Ready approves the mode shown.' : 'Both players were matched in this mode.'} {bow ? `Hold fire to draw, release to shoot, right-click to cancel. Jump again in the air to dash. ${bowNote}.` : `Both players always use the same profile. ${damageNote}`}</p>
  </section>;
}
