import * as THREE from 'three';

export const CYL = new THREE.CylinderGeometry(1, 1, 1, 10), SPH = new THREE.SphereGeometry(1, 18, 14);
const up = new THREE.Vector3(0, 1, 0), basis = new THREE.Matrix4();
/** Stretches a unit cylinder from `a` to `b`. */
export function segment(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const d = b.clone().sub(a), l = Math.max(1e-4, d.length());
  m.position.copy(a).add(b).multiplyScalar(0.5); m.scale.set(r, l, r); m.quaternion.setFromUnitVectors(up, d.multiplyScalar(1 / l));
}
/** Arrow along +z: nock at the origin, tip at 0.84 m. */
export function createArrow() {
  const g = new THREE.Group(), shaft = new THREE.Mesh(CYL, new THREE.MeshStandardMaterial({ color: 0xd9d4c7, roughness: 0.6 }));
  shaft.scale.set(0.007, 0.78, 0.007); shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.39; g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 8), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.6, roughness: 0.4 }));
  head.rotation.x = Math.PI / 2; head.position.z = 0.8; g.add(head);
  const fin = new THREE.MeshBasicMaterial({ color: 0xe5212e, side: THREE.DoubleSide });
  for (const y of [0, Math.PI / 2]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.09), fin); f.position.z = 0.07; f.rotation.set(Math.PI / 2, y, 0); g.add(f); }
  return g;
}
export const ARROW_LENGTH = 0.84;

// Recurve profile in the bow's own plane: y along the bow, z towards the target; limbs sweep back to forward-curled tips.
const BL = 0.62, center = (y: number) => { const a = Math.abs(y); if (a <= 0.11) return 0; const u = (a - 0.11) / (BL - 0.11); return -0.26 * u ** 1.5 + (u > 0.82 ? 0.07 * ((u - 0.82) / 0.18) ** 2 : 0); };
const half = (y: number) => { const a = Math.abs(y), e = Math.max(0, Math.min(1, (a - 0.035) / 0.03)); return a <= 0.11 ? 0.023 + 0.009 * e * e * (3 - 2 * e) : 0.007 + 0.025 * (1 - (a - 0.11) / (BL - 0.11)) ** 1.2; };
const TIP = new THREE.Vector3(0, BL, center(BL));
let geometry: THREE.ExtrudeGeometry | undefined;
function bowGeometry() {
  if (geometry) return geometry;
  const shape = new THREE.Shape(), ys = Array.from({ length: 81 }, (_, i) => -BL + 2 * BL * i / 80);
  shape.moveTo(center(ys[0]) + half(ys[0]), ys[0]); ys.forEach(y => shape.lineTo(center(y) + half(y), y)); [...ys].reverse().forEach(y => shape.lineTo(center(y) - half(y), y));
  geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 2 });
  geometry.translate(0, 0, -0.011); geometry.rotateY(-Math.PI / 2); geometry.computeVertexNormals();
  return geometry;
}
export type BowMesh = { group: THREE.Group; bend: THREE.Group; strings: [THREE.Mesh, THREE.Mesh]; accent: THREE.MeshStandardMaterial; materials: THREE.Material[] };
/** Gunmetal recurve with a red grip strip; the strings live in the parent's space so they can reach the drawing hand. */
export function createBow(parent: THREE.Object3D): BowMesh {
  const group = new THREE.Group(), bend = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.45, roughness: 0.38, transparent: true });
  const accent = new THREE.MeshStandardMaterial({ color: 0xe5212e, emissive: 0xe5212e, emissiveIntensity: 0.25, transparent: true });
  const wrap = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.8, transparent: true }), cord = new THREE.MeshBasicMaterial({ color: 0xe8e4da, transparent: true });
  bend.add(new THREE.Mesh(bowGeometry(), body));
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.17, 0.008), accent); strip.position.z = 0.034; bend.add(strip);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.075, 0.052), wrap); grip.position.z = -0.004; bend.add(grip);
  for (const k of [-1, 1]) { const t = new THREE.Mesh(SPH, accent); t.scale.setScalar(0.011); t.position.set(0, k * BL, center(BL)); bend.add(t); }
  group.add(bend); parent.add(group);
  const strings: [THREE.Mesh, THREE.Mesh] = [new THREE.Mesh(CYL, cord), new THREE.Mesh(CYL, cord)]; parent.add(...strings);
  return { group, bend, strings, accent, materials: [body, accent, wrap, cord] };
}
/** Puts the grip at `grip` facing `aim` with `bowUp` along the limbs; `draw` flexes them. Returns the tips and the resting string centre. */
export function placeBow(b: BowMesh, grip: THREE.Vector3, aim: THREE.Vector3, bowUp: THREE.Vector3, draw: number, nock: THREE.Vector3 | null, scale = 1, cord = 0.003) {
  const z = aim.clone().normalize(), y = bowUp.clone().addScaledVector(z, -bowUp.dot(z)).normalize(), x = new THREE.Vector3().crossVectors(y, z);
  b.group.quaternion.setFromRotationMatrix(basis.makeBasis(x, y, z)); b.group.position.copy(grip); b.group.scale.setScalar(scale);
  b.bend.scale.set(1, 1 - 0.05 * draw, 1 + 0.3 * draw); b.group.updateMatrix();
  const tA = TIP.clone().multiply(b.bend.scale).applyMatrix4(b.group.matrix), tB = TIP.clone().setY(-TIP.y).multiply(b.bend.scale).applyMatrix4(b.group.matrix), mid = tA.clone().add(tB).multiplyScalar(0.5);
  segment(b.strings[0], tA, nock ?? mid, cord); segment(b.strings[1], tB, nock ?? mid, cord);
  return { tA, tB, mid };
}
