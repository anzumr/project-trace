import * as THREE from 'three';
import { ARENA, SPAWN_COVERS, STAIRS, PLATFORMS, type Box } from '@trace/shared';

/** Render the same dimensions used for authoritative collision and shot occlusion. */
export function createArena(scene:THREE.Scene,detail:THREE.Group){
  const materials=new Map<string,THREE.MeshStandardMaterial>();
  const material=(color:string)=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:0.85,metalness:0.15}));return materials.get(color)!;};
  const mesh=(geometry:THREE.BufferGeometry,color:string,x=0,y=0,z=0,parent:THREE.Object3D=scene)=>{const m=new THREE.Mesh(geometry,material(color));m.position.set(x,y,z);parent.add(m);return m;};
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,color:string,parent:THREE.Object3D=scene)=>mesh(new THREE.BoxGeometry(w,h,d),color,x,y,z,parent);
  const solid=(b:Box,color:string)=>box(b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z,(b.min.x+b.max.x)/2,(b.min.y+b.max.y)/2,(b.min.z+b.max.z)/2,color);
  const ring=(inner:number,outer:number,y:number,color:string,parent:THREE.Object3D=detail)=>{const m=mesh(new THREE.RingGeometry(inner,outer,128),color,0,y,0,parent);m.rotation.x=-Math.PI/2;return m;};
  mesh(new THREE.CylinderGeometry(ARENA.radius,ARENA.radius,0.3,128), '#393e45',0,-0.15);
  ring(2.5,2.6,0.006,'#b0a68f');ring(3.2,3.26,0.006,'#20262e');ring(6.5,6.6,0.006,'#9c9484');ring(9.8,9.9,0.006,'#9d3d46');ring(13.3,13.4,0.006,'#b0a68f');
  const r=ARENA.radius,h=ARENA.wallHeight;
  mesh(new THREE.LatheGeometry([new THREE.Vector2(r,0),new THREE.Vector2(r+0.4,0),new THREE.Vector2(r+0.4,h),new THREE.Vector2(r,h),new THREE.Vector2(r,0)],128),'#484f59');
  ring(r-0.04,r+0.4,h+0.002,'#8b929b',scene);
  const panelGeometry=new THREE.BoxGeometry(0.08,h-0.3,0.05),lightGeometry=new THREE.BoxGeometry(1.2,0.12,0.02);
  const lights=new THREE.MeshBasicMaterial({color:'#ffe0a4'});
  for(let i=0;i<40;i++){
    const a=i*Math.PI*2/40,x=Math.sin(a),z=Math.cos(a);
    const seam=mesh(panelGeometry,'#242b34',x*(r-0.025),h/2,z*(r-0.025),detail);seam.rotation.y=a;
    if(i%2===0){const light=new THREE.Mesh(lightGeometry,lights);light.position.set(x*(r-0.025),3.8,z*(r-0.025));light.rotation.y=a;detail.add(light);}
    if(i%5===0){const strip=box(0.15,1.1,0.02,x*(r-0.025),0.7,z*(r-0.025),'#b6434c',detail);strip.rotation.y=a;}
  }
  mesh(new THREE.CylinderGeometry(ARENA.pillarRadius,ARENA.pillarRadius,ARENA.pillarHeight,96),'#626b76',0,ARENA.pillarHeight/2);
  ring(1.74,1.97,ARENA.pillarHeight+0.002,'#a7a99f');
  for(let i=0;i<12;i++){const a=i*Math.PI/6;const seam=box(0.04,ARENA.pillarHeight-0.3,0.02,Math.sin(a)*2,ARENA.pillarHeight/2,Math.cos(a)*2,i%3===0?'#a34049':'#343c46',detail);seam.rotation.y=a;}
  for(const b of SPAWN_COVERS){solid(b,'#5b646e');const z=(b.min.z+b.max.z)/2;box(ARENA.coverWidth,0.04,0.6,0,ARENA.coverHeight-0.02,z,'#b5b6ac',detail);for(const x of [-2.7,2.7])box(0.13,2.7,0.605,x,1.5,z,'#a34049',detail);}
  for(const b of [...STAIRS,...PLATFORMS]){
    const sign=b.min.x<0?-1:1,inner=sign<0?b.max.x:b.min.x,shape=new THREE.Shape();
    shape.moveTo(inner,-b.min.z);
    const segments=Math.ceil((b.max.z-b.min.z)/0.1);
    for(let i=0;i<=segments;i++){const z=b.min.z+(b.max.z-b.min.z)*i/segments,edge=Math.sqrt(r*r-z*z);shape.lineTo(sign<0?Math.max(b.min.x,-edge):Math.min(b.max.x,edge),-z);}
    shape.lineTo(inner,-b.max.z);shape.closePath();
    const step=mesh(new THREE.ExtrudeGeometry(shape,{depth:b.max.y,bevelEnabled:false,steps:1}),'#555e69');step.rotation.x=-Math.PI/2;
  }
  const treadStripe=(b:Box,color:string)=>box(0.07,0.015,b.max.z-b.min.z-0.04,b.min.x<0?b.max.x-0.035:b.min.x+0.035,b.max.y+0.008,0,color,detail);
  for(const b of STAIRS)treadStripe(b,'#b6b6a6');
  for(const b of PLATFORMS)treadStripe(b,'#b6434c');
  for(const side of [-1,1]){
    const marker=mesh(new THREE.RingGeometry(0.55,0.6,48),'#b6434c',0,0.008,side*ARENA.spawnZ,detail);marker.rotation.x=-Math.PI/2;
    box(0.07,0.01,0.6,0,0.008,side*(ARENA.spawnZ-0.9),'#b0a68f',detail);
  }
}
