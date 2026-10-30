import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CONFIG, MODES, type ModeId } from '@trace/shared';
import type { Snapshot } from '@trace/shared/protocol';
import { createBotModel } from '../game/BotModel';

function ModePreview({ mode }: { mode: ModeId }) {
  const host=useRef<HTMLDivElement>(null);
  const currentMode=useRef(mode);currentMode.current=mode;
  useEffect(() => {
    const root=host.current!;
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));root.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,0.1,20);
    camera.position.set(3,2.4,4.5);camera.lookAt(0,1.1,0);
    scene.add(new THREE.HemisphereLight(0xffffff,0x253340,3));
    const { group: mesh } = createBotModel();scene.add(mesh);
    const grid=new THREE.GridHelper(4,8,0x6ab59e,0x2a4646);scene.add(grid);
    let frame=0;const render=()=>{const profile=MODES[currentMode.current];mesh.scale.setScalar(profile.scale);mesh.position.y=CONFIG.targetHeight*profile.scale/2;mesh.rotation.y+=0.005;renderer.render(scene,camera);frame=requestAnimationFrame(render);};
    const resize=new ResizeObserver(()=>{renderer.setSize(root.clientWidth,root.clientHeight);camera.aspect=root.clientWidth/root.clientHeight;camera.updateProjectionMatrix();});resize.observe(root);render();
    return()=>{cancelAnimationFrame(frame);resize.disconnect();mesh.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();(object.material as THREE.Material).dispose();}});grid.geometry.dispose();(grid.material as THREE.Material).dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  },[]);
  return <div className="mode-preview" ref={host} role="img" aria-label={`Rotating 3D preview of ${MODES[mode].label}`}/>;
}
export function ModePicker({ room, ownId, choose }: { room: Snapshot; ownId?: string; choose: (mode: ModeId) => void }) {
  const p=MODES[room.mode],host=room.hostId===ownId,editable=room.kind==='private' && ['lobby','finished'].includes(room.phase);
  return <section className="mode-picker"><label>Shared mode<select aria-label="Shared mode" value={room.mode} disabled={!host || !editable} onChange={e=>choose(e.target.value as ModeId)}>{Object.entries(MODES).map(([id,p])=><option key={id} value={id}>{p.label} · {p.difficulty}</option>)}</select></label><ModePreview mode={room.mode}/><div className="mode-stats"><span>Target <b>{p.scale.toFixed(2)}×</b></span><span>Speed <b>{p.speed.toFixed(2)}×</b></span><span>Jump impulse <b>{p.jump.toFixed(2)}×</b></span></div><p className="note">{host ? 'Changing mode clears both ready states.' : 'Host selects. Ready approves the displayed mode.'} Both players use this profile. Body: 20 HP/s. Gray head: 36 HP/s (1.8×).</p></section>;
}
