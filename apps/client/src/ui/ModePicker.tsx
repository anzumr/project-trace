import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CONFIG, MODES, type ModeId } from '@trace/shared';
import { HEADSHOT_MULTIPLIER } from '@trace/shared/practice';
import type { Snapshot } from '@trace/shared/protocol';
import { createBotModel } from '../game/BotModel';

/** Rotating view of the real in-game player model at the mode's scale. */
export function ModePreview({ mode }: { mode: ModeId }) {
  const host=useRef<HTMLDivElement>(null);
  const currentMode=useRef(mode);currentMode.current=mode;
  useEffect(() => {
    const root=host.current!;
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));root.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,0.1,20);
    camera.position.set(3,2.4,4.5);camera.lookAt(0,1.1,0);
    scene.add(new THREE.HemisphereLight(0xffffff,0x262a31,3));
    const { group: mesh } = createBotModel();scene.add(mesh);
    const grid=new THREE.GridHelper(4,8,0x3a404a,0x22262d);scene.add(grid);
    let frame=0;const render=()=>{const profile=MODES[currentMode.current];mesh.scale.setScalar(profile.scale);mesh.position.y=CONFIG.targetHeight*profile.scale/2;mesh.rotation.y+=0.005;renderer.render(scene,camera);frame=requestAnimationFrame(render);};
    const resize=new ResizeObserver(()=>{renderer.setSize(root.clientWidth,root.clientHeight);camera.aspect=root.clientWidth/root.clientHeight;camera.updateProjectionMatrix();});resize.observe(root);render();
    return()=>{cancelAnimationFrame(frame);resize.disconnect();mesh.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();(object.material as THREE.Material).dispose();}});grid.geometry.dispose();(grid.material as THREE.Material).dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  },[]);
  return <div className="mode-preview" ref={host} role="img" aria-label={`Rotating 3D preview of ${MODES[mode].label}`}/>;
}
export const damageNote = `Body ${CONFIG.dps} HP/s · gray head ${CONFIG.dps * HEADSHOT_MULTIPLIER} HP/s (${HEADSHOT_MULTIPLIER}×).`;
export function ModePicker({ room, ownId, choose }: { room: Snapshot; ownId?: string; choose: (mode: ModeId) => void }) {
  const p=MODES[room.mode],host=room.hostId===ownId,editable=host && room.kind==='private' && ['lobby','finished'].includes(room.phase);
  return <section className="mode-picker" aria-label="Shared mode">
    <div className="mode-options" role="group" aria-label="Shared mode">{(Object.entries(MODES) as [ModeId, typeof p][]).map(([id,m])=><button key={id} className="mode-option" aria-pressed={room.mode===id} disabled={!editable} onClick={()=>choose(id)}><strong>{m.label}</strong><small>{m.difficulty} · {m.scale}× size</small></button>)}</div>
    <div className="mode-side"><ModePreview mode={room.mode}/><div className="mode-stats"><span>SIZE<b>{p.scale.toFixed(2)}×</b></span><span>SPEED<b>{p.speed.toFixed(2)}×</b></span><span>JUMP<b>{p.jump.toFixed(2)}×</b></span></div></div>
    <p className="note">{editable ? 'You host this room. Changing mode clears both ready states.' : room.kind==='private' ? 'The host selects the mode. Ready approves the mode shown.' : 'Both players were matched in this mode.'} Both players always use the same profile. {damageNote}</p>
  </section>;
}
