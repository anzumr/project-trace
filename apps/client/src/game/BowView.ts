import * as THREE from 'three';
import { CONFIG, type Vec3 } from '@trace/shared';
import { BOW, arrowAt, flyArrow, launch, type Flight, type Part } from '@trace/shared/bow';
import type { ArrowState } from '@trace/shared/protocol';
import { CYL, SPH, ARROW_LENGTH, createArrow, createBow, placeBow, segment } from './BowModel';

const ease = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
type Local = { mesh: THREE.Group; flight: Flight; offset: THREE.Vector3; age: number; stuck: number | null };
export type Anchor = { x: number; y: number; z: number; yaw: number };
/**
 * Bow 1v1 first person: the bow held low and nearly flat across the bottom of the screen with the drawing hand off screen,
 * the local cosmetic arrows you shoot, and everyone else's arrows from the server.
 */
export class BowView {
  /** Predicted charge, mirroring the server's draw so the bow and ring respond without waiting for a snapshot. */
  charge = 0;
  private reload = 0;
  private snap = 1;
  private kick = 0;
  private time = 0;
  private view = new THREE.Group();
  private skin: THREE.MeshStandardMaterial;
  private bow;
  private nocked = createArrow();
  private hand: THREE.Mesh; private wrist: THREE.Mesh; private forearm: THREE.Mesh;
  private shelf = new THREE.Vector3();
  private local: Local[] = [];
  private remote = new Map<number, THREE.Group>();
  constructor(private scene: THREE.Scene, private camera: THREE.Camera, color: number) {
    this.skin = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
    this.bow = createBow(this.view); this.view.add(this.nocked);
    [this.hand, this.wrist, this.forearm] = [SPH, SPH, CYL].map(g => { const m = new THREE.Mesh(g, this.skin); this.view.add(m); return m; });
    camera.add(this.view); this.view.visible = false;
  }
  reset() { this.charge = 0; this.reload = 0; this.snap = 1; this.kick = 0; this.local.forEach(a => this.scene.remove(a.mesh)); this.local = []; }
  /** One input tick, in the server's order: reload, then cancel, then draw or release. Returns the charge of a shot released now. */
  step(firing: boolean, cancel: boolean, active: boolean): number | null {
    this.reload = Math.max(0, this.reload - CONFIG.tick);
    if (cancel || !active) { this.charge = 0; return null; }
    if (firing) { if (this.reload <= 0) this.charge = Math.min(1, this.charge + CONFIG.tick / BOW.draw); return null; }
    if (this.charge <= 0) return null;
    const shot = this.charge; this.charge = 0; this.reload = BOW.reload; this.snap = 0; this.kick = 1;
    return shot;
  }
  /** A cosmetic arrow for your own shot: it leaves from the bow and blends onto the true path from the eye within 0.12 s. */
  shoot(eye: Vec3, yaw: number, pitch: number, charge: number) {
    const mesh = createArrow(); this.scene.add(mesh);
    this.local.push({ mesh, flight: launch(eye, yaw, pitch, charge), offset: this.shelf.clone().sub(new THREE.Vector3(eye.x, eye.y, eye.z)), age: 0, stuck: null });
  }
  frame(dt: number, visible: boolean, hit?: (p: Vec3) => Part | null) {
    this.time += dt; this.snap = Math.min(1, this.snap + dt / 0.2); this.kick = Math.max(0, this.kick - dt * 5);
    this.view.visible = visible;
    if (visible) this.pose();
    for (const a of [...this.local]) {
      a.age += dt;
      if (a.stuck === null) {
        const contact = flyArrow(a.flight, dt, hit);
        // The server sticks the real arrow into the opponent; locally the cosmetic one just ends there.
        if (contact?.part) { this.drop(a); continue; }
        if (contact) a.stuck = 0;
      } else a.stuck += dt;
      if (a.age > BOW.life || (a.stuck ?? 0) > BOW.stuck) { this.drop(a); continue; }
      const d = new THREE.Vector3(a.flight.vx, a.flight.vy, a.flight.vz).normalize(), blend = Math.max(0, 1 - a.age / 0.12);
      a.mesh.position.set(a.flight.x, a.flight.y, a.flight.z).addScaledVector(a.offset, blend).addScaledVector(d, -ARROW_LENGTH + (a.stuck === null ? 0 : 0.06));
      a.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    }
  }
  /** Draws server arrows at the tick being rendered. Your own flying arrows are the local ones; arrows in a player follow that player. */
  sync(arrows: ArrowState[] | undefined, own: string, viewTick: number, anchors: Map<string, Anchor>) {
    const seen = new Set<number>();
    for (const a of arrows ?? []) {
      if ((a.owner === own && !a.on) || viewTick < a.born) continue;
      let mesh = this.remote.get(a.id);
      if (!mesh) { mesh = createArrow(); this.scene.add(mesh); this.remote.set(a.id, mesh); }
      seen.add(a.id);
      let tip: THREE.Vector3, dir: THREE.Vector3;
      if (a.on && a.local) {
        const at = anchors.get(a.on); if (!at) { mesh.visible = false; continue; }
        const [lx, ly, lz, dx, dy, dz] = a.local, fx = -Math.sin(at.yaw), fz = -Math.cos(at.yaw), rx = Math.cos(at.yaw), rz = -Math.sin(at.yaw);
        tip = new THREE.Vector3(at.x + rx * lx + fx * lz, at.y + ly, at.z + rz * lx + fz * lz); dir = new THREE.Vector3(rx * dx + fx * dz, dy, rz * dx + fz * dz).normalize();
      } else if (a.stuck) { tip = new THREE.Vector3(a.stuck[0], a.stuck[1], a.stuck[2]); dir = new THREE.Vector3(a.stuck[3], a.stuck[4], a.stuck[5]); }
      else {
        // The server steps an arrow once in the tick it is released, so at tick T it has flown T - born + 1 ticks.
        const at = arrowAt({ ox: a.x, oy: a.y, oz: a.z, ux: a.vx, uy: a.vy, uz: a.vz, charge: a.charge }, (viewTick - a.born + 1) * CONFIG.tick);
        tip = new THREE.Vector3(at.x, at.y, at.z); dir = new THREE.Vector3(at.vx, at.vy, at.vz).normalize();
      }
      mesh.visible = true; mesh.position.copy(tip).addScaledVector(dir, -ARROW_LENGTH + (a.stuck ? 0.06 : 0)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    }
    for (const [id, mesh] of this.remote) if (!seen.has(id)) { this.scene.remove(mesh); this.remote.delete(id); }
  }
  clear() { this.reset(); this.sync([], '', 0, new Map()); this.view.visible = false; }
  private drop(a: Local) { this.scene.remove(a.mesh); this.local.splice(this.local.indexOf(a), 1); }
  /** Camera-space pose: grip low and right of centre, limbs nearly horizontal, string drawn back towards the eye. */
  private pose() {
    const e = ease(this.charge), loaded = this.reload <= 0, vib = Math.sin(this.snap * Math.PI * 4) * (1 - this.snap), t = this.time;
    const grip = new THREE.Vector3(0.06 + Math.sin(t * 1.3) * 0.003, -0.29 + 0.016 * e + 0.014 * this.kick + Math.sin(t * 2.1) * 0.002, -0.47 - 0.02 * e - 0.03 * this.kick);
    const forward = new THREE.Vector3(0, 0, -30).sub(grip).normalize(), along = new THREE.Vector3(1, 0.2 - 0.05 * e + 0.08 * this.kick, 0).normalize();
    const { tA, tB, mid } = placeBow(this.bow, grip, forward, along, e + 0.12 * vib, null, 0.55, 0.0014);
    // The arrow rests on the riser's centre line (its upward face) and slides straight through the middle of the bow;
    // the fist holds the handle just below the rest, towards the lower limb (left on screen).
    const limb = along.clone().addScaledVector(forward, -along.dot(forward)).normalize(), up = new THREE.Vector3().crossVectors(limb, forward).normalize();
    if (up.y < 0) up.negate();
    const shelf = grip.clone().addScaledVector(up, 0.012), rest = shelf.clone().addScaledVector(forward, -0.105);
    const nock = (loaded ? shelf.clone().addScaledVector(forward, -0.105 - 0.5 * e) : mid.clone()).addScaledVector(forward, 0.025 * vib);
    segment(this.bow.strings[0], tA, nock, 0.0014); segment(this.bow.strings[1], tB, nock, 0.0014);
    const slide = Math.max(0, Math.min(1, this.reload / 0.28));
    this.nocked.visible = this.reload < 0.28; this.nocked.scale.setScalar(0.75);
    this.nocked.position.copy(loaded ? nock : rest).add(new THREE.Vector3(0, -0.1 * slide, 0.04 * slide)); this.nocked.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
    this.hand.position.copy(grip).addScaledVector(limb, -0.045); this.hand.scale.set(0.026, 0.03, 0.028);
    this.wrist.position.copy(this.hand.position).add(new THREE.Vector3(-0.022, -0.03, 0.035)); this.wrist.scale.setScalar(0.019);
    segment(this.forearm, this.wrist.position, new THREE.Vector3(-0.24, -0.56, -0.1), 0.019);
    this.bow.accent.emissiveIntensity = 0.25 + 1.6 * e;
    this.camera.updateMatrixWorld(); this.shelf.copy(shelf).applyMatrix4(this.camera.matrixWorld);
  }
}
