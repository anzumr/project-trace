import type { Box, Vec3 } from './index';

export const ARENA = { radius:14, wallHeight:6, pillarRadius:2, pillarHeight:4.8, spawnZ:11.4, coverZ:8.6, coverWidth:6, coverHeight:3.2, stairWidth:4.4, stairStart:8.5, stairRun:0.5, stairRise:0.25, stairCount:8 } as const;
export const PILLAR:Box={min:{x:-ARENA.pillarRadius,y:0,z:-ARENA.pillarRadius},max:{x:ARENA.pillarRadius,y:ARENA.pillarHeight,z:ARENA.pillarRadius},radius:ARENA.pillarRadius};
export const SPAWN_COVERS:Box[]=[-1,1].map(sign=>({min:{x:-ARENA.coverWidth/2,y:0,z:sign*ARENA.coverZ-0.3},max:{x:ARENA.coverWidth/2,y:ARENA.coverHeight,z:sign*ARENA.coverZ+0.3}}));
// Extend into the perimeter; the shared circular boundary clips the playable footprint.
const sideSolid=(sign:number,inner:number,outer:number,height:number):Box=>({min:{x:sign<0?-outer:inner,y:0,z:-ARENA.stairWidth/2},max:{x:sign<0?-inner:outer,y:height,z:ARENA.stairWidth/2},step:true});
export const STAIRS:Box[]=[-1,1].flatMap(sign=>Array.from({length:ARENA.stairCount},(_,i)=>sideSolid(sign,ARENA.stairStart+i*ARENA.stairRun,ARENA.stairStart+(i+1)*ARENA.stairRun,(i+1)*ARENA.stairRise)));
export const PLATFORMS:Box[]=[-1,1].map(sign=>sideSolid(sign,ARENA.stairStart+ARENA.stairCount*ARENA.stairRun,ARENA.radius,ARENA.stairCount*ARENA.stairRise));
export const ARENA_SOLIDS:Box[]=[PILLAR,...SPAWN_COVERS,...STAIRS,...PLATFORMS];
/** Cylinders use their actual circular footprint, including a moving body's radius. */
export function overlaps(p:Pick<Vec3,'x'|'z'>,radius:number,b:Box){
  if(b.radius!==undefined)return Math.hypot(p.x-(b.min.x+b.max.x)/2,p.z-(b.min.z+b.max.z)/2)<b.radius+radius-1e-8;
  return p.x+radius>b.min.x+1e-8 && p.x-radius<b.max.x-1e-8 && p.z+radius>b.min.z+1e-8 && p.z-radius<b.max.z-1e-8;
}
