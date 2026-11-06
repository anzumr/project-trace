import * as THREE from 'three';
import { ARCHER, TORSO, type ArcherPose, type Skeleton } from '@trace/shared/bow';
import { CYL, SPH, createArrow, createBow, placeBow, segment } from './BowModel';

/** Every archer has a red body and a white head. */
export const ARCHER_BODY = 0xd8343f, ARCHER_HEAD = 0xf2f2f2;
const torsoGeometry = new THREE.LatheGeometry(TORSO.map(([r, y]) => new THREE.Vector2(r, y)), 32);
const v = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
type Limb = { upper: THREE.Mesh; lower: THREE.Mesh; joint: THREE.Mesh; end: THREE.Mesh };
/** A stick-figure archer drawn from the shared skeleton, so what you see is exactly what arrows hit. */
export class ArcherModel {
  readonly group = new THREE.Group();
  private inner = new THREE.Group();
  private body: THREE.MeshStandardMaterial;
  private head: THREE.MeshStandardMaterial;
  private torso: THREE.Mesh;
  private skull: THREE.Mesh;
  private neck: THREE.Mesh;
  private arms: Limb[];
  private legs: Limb[];
  private bow;
  private arrow = createArrow();
  private materials: THREE.Material[];
  constructor() {
    this.body = new THREE.MeshStandardMaterial({ color: ARCHER_BODY, roughness: 0.55, transparent: true });
    this.head = new THREE.MeshStandardMaterial({ color: ARCHER_HEAD, roughness: 0.5, transparent: true });
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material = this.body) => { const x = new THREE.Mesh(g, m); this.inner.add(x); return x; };
    this.torso = mesh(torsoGeometry); this.skull = mesh(SPH, this.head); this.neck = mesh(CYL);
    const limb = (): Limb => ({ upper: mesh(CYL), lower: mesh(CYL), joint: mesh(SPH), end: mesh(SPH) });
    this.arms = [limb(), limb()]; this.legs = [limb(), limb()];
    this.bow = createBow(this.inner); this.inner.add(this.arrow);
    this.materials = [this.body, this.head, ...this.bow.materials];
    this.arrow.traverse(o => { if (o instanceof THREE.Mesh) { o.material = o.material.clone(); (o.material as THREE.Material).transparent = true; this.materials.push(o.material); } });
    this.group.add(this.inner);
  }
  /** `dead` is seconds since this archer died: it falls back, then fades before the respawn. */
  update(k: Skeleton, pose: ArcherPose, dead: number | null) {
    const pivot = new THREE.Vector3(pose.x, pose.y, pose.z);
    this.group.position.copy(pivot); this.inner.position.copy(pivot).negate();
    const fall = dead === null ? 0 : Math.min(1, dead / 0.5) ** 2, right = new THREE.Vector3(Math.cos(pose.yaw), 0, -Math.sin(pose.yaw));
    this.group.quaternion.setFromAxisAngle(right, 1.5 * fall); this.group.position.y += 0.12 * fall;
    const opacity = dead === null ? 1 : Math.max(0, Math.min(1, 1 - (dead - 1.5) / 0.4));
    this.materials.forEach(m => { m.opacity = opacity; }); this.group.visible = opacity > 0.01;
    this.torso.position.copy(v(k.pelvis)); this.torso.rotation.set(0, pose.yaw, 0); this.torso.scale.set(1, k.squash, ARCHER.depth);
    this.skull.position.copy(v(k.head)); this.skull.scale.setScalar(ARCHER.headRadius);
    segment(this.neck, v(k.pelvis).add(new THREE.Vector3(0, 0.58 * k.squash, 0)), v(k.head), 0.032);
    const place = (limb: Limb, [a, b, c]: [THREE.Vector3, THREE.Vector3, THREE.Vector3], r: number) => {
      segment(limb.upper, a, b, r); segment(limb.lower, b, c, r); limb.joint.position.copy(b); limb.joint.scale.setScalar(r * 1.3); limb.end.position.copy(c); limb.end.scale.setScalar(r * 1.45);
    };
    k.arms.forEach((arm, i) => place(this.arms[i], arm.map(v) as [THREE.Vector3, THREE.Vector3, THREE.Vector3], ARCHER.armRadius));
    k.legs.forEach((leg, i) => place(this.legs[i], leg.map(v) as [THREE.Vector3, THREE.Vector3, THREE.Vector3], ARCHER.legRadius));
    const grip = v(k.arms[0][2]), raised = pose.raise > 0.5, nock = raised ? v(k.arms[1][2]) : null;
    const { mid } = placeBow(this.bow, grip, v(k.aim), v(k.bowUp), pose.draw, nock, 0.85);
    this.arrow.visible = raised && dead === null;
    if (this.arrow.visible) { const from = nock ?? mid; this.arrow.position.copy(from); this.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), grip.clone().add(new THREE.Vector3(0, 0.03, 0)).sub(from).normalize()); }
  }
}
