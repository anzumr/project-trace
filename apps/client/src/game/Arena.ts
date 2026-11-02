import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARENA, SPAWN_COVERS, STAIRS, PLATFORMS, type Box } from '@trace/shared';

type Paint = (c: CanvasRenderingContext2D, w: number, h: number) => void;
const RED = '#a8434b', LINE = '#9b9483', SEAM = '#2a3037';
/** Deterministic speckle so the generated surfaces look the same every load. */
let seed = 7;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const speckle = (c: CanvasRenderingContext2D, w: number, h: number, count: number, alpha: number) => {
  for (let i = 0; i < count; i++) { const v = random() < 0.5 ? 0 : 255; c.fillStyle = `rgba(${v},${v},${v},${alpha * random()})`; c.fillRect(random() * w, random() * h, 1 + random() * 2, 1 + random() * 2); }
};
const texture = (w: number, h: number, paint: Paint, repeat = 1) => {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; paint(canvas.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; t.repeat.x = repeat; return t;
};
/** An inset panel: dark groove with a lighter lip, in canvas pixels. */
const panel = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  c.lineWidth = 9; c.strokeStyle = SEAM; c.strokeRect(x, y, w, h); c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.2)'; c.strokeRect(x + 4, y + 4, w - 8, h - 8);
  for (const [bx, by] of [[x + 12, y + 12], [x + w - 12, y + 12], [x + 12, y + h - 12], [x + w - 12, y + h - 12]]) { c.fillStyle = SEAM; c.beginPath(); c.arc(bx, by, 5, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.arc(bx - 1, by - 1, 2, 0, Math.PI * 2); c.fill(); }
};

/** Render the same dimensions used for authoritative collision and shot occlusion; everything added here is visual only. */
export function createArena(scene: THREE.Scene, detail: THREE.Group) {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: string) => { if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.15 })); return materials.get(color)!; };
  const mesh = (geometry: THREE.BufferGeometry, look: string | THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, parent: THREE.Object3D = scene) => { const m = new THREE.Mesh(geometry, typeof look === 'string' ? material(look) : look); m.position.set(x, y, z); parent.add(m); return m; };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, look: string | THREE.Material | THREE.Material[], parent: THREE.Object3D = scene) => mesh(new THREE.BoxGeometry(w, h, d), look, x, y, z, parent);
  type Spec = [w: number, h: number, d: number, x: number, y: number, z: number];
  /** Many small trims of one colour merged into a single draw call. */
  const boxes = (look: string, specs: Spec[], parent: THREE.Object3D = detail) => mesh(mergeGeometries(specs.map(([w, hh, d, x, y, z]) => new THREE.BoxGeometry(w, hh, d).translate(x, y, z))), look, 0, 0, 0, parent);
  /** One draw call per repeated wall fixture: [angle, radius, y] placements facing the centre. */
  const around = (geometry: THREE.BufferGeometry, look: string | THREE.Material, places: [number, number, number][], parent: THREE.Object3D = detail) => {
    const m = new THREE.InstancedMesh(geometry, typeof look === 'string' ? material(look) : look, places.length), o = new THREE.Object3D();
    places.forEach(([a, radius, y], i) => { o.position.set(Math.sin(a) * radius, y, Math.cos(a) * radius); o.rotation.set(0, a, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    parent.add(m); return m;
  };
  const r = ARENA.radius, h = ARENA.wallHeight, glow = new THREE.MeshBasicMaterial({ color: '#ffe6b5' });

  // Floor: one generated texture carries slabs, rings, routes and spawn markings.
  const floor = texture(2048, 2048, (c, w) => {
    const s = w / (2 * r), cx = w / 2, at = (m: number) => m * s, point = (radius: number, a: number) => [cx + Math.cos(a) * at(radius), cx + Math.sin(a) * at(radius)] as const;
    const circle = (radius: number, width: number, color: string, dash: number[] = []) => { c.setLineDash(dash.map(at)); c.lineWidth = at(width); c.strokeStyle = color; c.beginPath(); c.arc(cx, cx, at(radius), 0, Math.PI * 2); c.stroke(); c.setLineDash([]); };
    const band = (inner: number, outer: number, color: string) => { c.fillStyle = color; c.beginPath(); c.arc(cx, cx, at(outer), 0, Math.PI * 2); c.arc(cx, cx, at(inner), 0, Math.PI * 2, true); c.fill(); };
    const line = (from: readonly [number, number], to: readonly [number, number], width: number, color: string) => { c.lineWidth = at(width); c.strokeStyle = color; c.beginPath(); c.moveTo(...from); c.lineTo(...to); c.stroke(); };
    c.fillStyle = '#474e57'; c.fillRect(0, 0, w, w); speckle(c, w, w, 120000, 0.07);
    band(13.25, r, '#383e46'); band(2, 3.3, '#30363e'); band(4.9, 5.5, '#3e444c');
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; line(point(3.3, a), point(13.25, a), 0.04, '#353b43'); }
    for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; line(point(13.25, a), point(r, a), 0.04, SEAM); }
    circle(2.6, 0.05, '#6e6a60'); circle(3.3, 0.06, LINE); circle(3.55, 0.07, RED); circle(6.55, 0.07, LINE); circle(13.25, 0.08, LINE);
    // Flanking route ring: red arcs broken at the spawns and stairs, with arrowheads pointing round the map.
    for (let q = 0; q < 4; q++) {
      const start = q * Math.PI / 2 + 0.2, end = (q + 1) * Math.PI / 2 - 0.2;
      c.lineWidth = at(0.12); c.strokeStyle = RED; c.beginPath(); c.arc(cx, cx, at(9.85), start, end); c.stroke();
      for (const [a, dir] of [[start, -1], [end, 1]] as const) {
        const [px, py] = point(9.85, a), tx = -Math.sin(a) * dir, ty = Math.cos(a) * dir, nx = Math.cos(a), ny = Math.sin(a);
        c.fillStyle = RED; c.beginPath(); c.moveTo(px + tx * at(0.4), py + ty * at(0.4)); c.lineTo(px + nx * at(0.2), py + ny * at(0.2)); c.lineTo(px - nx * at(0.2), py - ny * at(0.2)); c.fill();
      }
    }
    for (let i = 0; i < 12; i++) { const a = (i + 0.5) * Math.PI / 6, [px, py] = point(13.62, a); c.save(); c.translate(px, py); c.rotate(a + Math.PI / 2); c.fillStyle = RED; c.fillRect(-at(0.5), -at(0.13), at(1), at(0.26)); c.restore(); }
    for (const side of [-1, 1]) {
      c.setLineDash([at(0.5), at(0.35)]); line([cx, cx + side * at(3.4)], [cx, cx + side * at(8)], 0.06, LINE); c.setLineDash([]);
      const z = cx + side * at(ARENA.spawnZ);
      c.lineWidth = at(0.06); c.strokeStyle = RED; c.beginPath(); c.arc(cx, z, at(0.58), 0, Math.PI * 2); c.stroke();
      // The triangle points toward the centre, as seen from the spawn.
      const tip = z - side * at(1.75), back = z - side * at(1.0);
      c.fillStyle = RED; c.beginPath(); c.moveTo(cx, tip); c.lineTo(cx - at(0.45), back); c.lineTo(cx + at(0.45), back); c.fill();
      c.save(); c.translate(cx, z + side * at(1.25)); if (side < 0) c.rotate(Math.PI); c.fillStyle = LINE; c.font = `bold ${Math.round(at(0.75))}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(side > 0 ? 'A' : 'B', 0, 0); c.restore();
    }
  });
  // The slab sits 1 cm below the painted floor so the two never depth-fight at range.
  mesh(new THREE.CylinderGeometry(r, r, 0.3, 128), '#30353c', 0, -0.16);
  mesh(new THREE.CircleGeometry(r, 128), new THREE.MeshStandardMaterial({ map: floor, roughness: 0.9, metalness: 0.05 }), 0, 0).rotation.x = -Math.PI / 2;

  // Perimeter: textured inner face (two panel variants per tile), outer shell, chunky coping.
  const wall = texture(1024, 1024, (c, w, H) => {
    const sx = w / 2 / (2 * Math.PI * r / 24), sy = H / h, y = (m: number) => H - m * sy;
    c.fillStyle = '#58616c'; c.fillRect(0, 0, w, H); speckle(c, w, H, 30000, 0.06);
    for (const [ox, variant] of [[0, 0], [w / 2, 1]] as const) {
      c.fillStyle = '#2d333a'; c.fillRect(ox, y(0.35), w / 2, 0.35 * sy);
      c.fillStyle = '#3a4149'; c.fillRect(ox, 0, w / 2, 0.35 * sy);
      c.fillStyle = SEAM; c.fillRect(ox, y(3.02), w / 2, 5);
      panel(c, ox + 0.3 * sx, y(2.9), w / 2 - 0.6 * sx, 2.4 * sy); panel(c, ox + 0.3 * sx, y(5.5), w / 2 - 0.6 * sx, 2.35 * sy);
      if (variant === 0) { c.fillStyle = RED; c.fillRect(ox + 0.42 * sx, y(2.3), 0.14 * sx, 1.75 * sy); }
      else { c.fillStyle = '#30363e'; c.fillRect(ox + w / 4 - 0.6 * sx, y(2.2), 1.2 * sx, 0.5 * sy); c.fillStyle = '#4f5761'; for (let i = 0; i < 6; i++) c.fillRect(ox + w / 4 - 0.55 * sx, y(2.15) + i * 0.08 * sy, 1.1 * sx, 0.03 * sy); }
    }
  }, 12);
  mesh(new THREE.CylinderGeometry(r - 0.001, r - 0.001, h, 192, 1, true), new THREE.MeshStandardMaterial({ map: wall, roughness: 0.8, metalness: 0.15, side: THREE.BackSide }), 0, h / 2);
  mesh(new THREE.LatheGeometry([new THREE.Vector2(r, 0), new THREE.Vector2(r + 0.4, 0), new THREE.Vector2(r + 0.4, h), new THREE.Vector2(r, h)], 128), '#3e454e');
  mesh(new THREE.LatheGeometry([new THREE.Vector2(r - 0.16, h - 0.04), new THREE.Vector2(r - 0.16, h + 0.22), new THREE.Vector2(r + 0.52, h + 0.22), new THREE.Vector2(r + 0.52, h - 0.04), new THREE.Vector2(r - 0.16, h - 0.04)], 128), '#6a727c');
  const segment = Math.PI / 12, doors = [0, Math.PI];
  const pilasters = Array.from({ length: 24 }, (_, i) => i * segment).filter(a => !doors.some(d => Math.abs(Math.sin((a - d) / 2)) < 0.01));
  around(new THREE.BoxGeometry(0.5, h, 0.14), '#5d6570', pilasters.map(a => [a, r - 0.07, h / 2]));
  around(new THREE.BoxGeometry(0.2, h - 0.9, 0.02), '#3a414b', pilasters.map(a => [a, r - 0.15, h / 2 + 0.1]));
  around(new THREE.BoxGeometry(0.62, 0.35, 0.2), '#2f353d', pilasters.map(a => [a, r - 0.1, 0.175]));
  around(new THREE.BoxGeometry(0.62, 0.18, 0.8), '#747c86', pilasters.map(a => [a, r + 0.12, h + 0.31]), scene);
  const lights = Array.from({ length: 24 }, (_, i) => (i + 0.5) * segment), low = lights.filter((_, i) => i % 2 === 1);
  around(new THREE.BoxGeometry(1.75, 0.44, 0.07), '#2a3038', [...lights.map(a => [a, r - 0.04, 4.25] as [number, number, number]), ...low.map(a => [a, r - 0.04, 0.95] as [number, number, number])]);
  around(new THREE.BoxGeometry(1.5, 0.24, 0.02), glow, [...lights.map(a => [a, r - 0.08, 4.25] as [number, number, number]), ...low.map(a => [a, r - 0.08, 0.95] as [number, number, number])]);
  // Doors behind each spawn: recessed panel, red side lamps and a light above.
  around(new THREE.BoxGeometry(2.5, 3.3, 0.05), '#5f6771', doors.map(a => [a, r - 0.02, 1.65]));
  around(new THREE.BoxGeometry(2.0, 2.9, 0.06), '#262b32', doors.map(a => [a, r - 0.05, 1.45]));
  around(new THREE.BoxGeometry(0.14, 2.7, 0.05), RED, doors.flatMap(a => [-1, 1].map(side => [a + side * 1.12 / r, r - 0.07, 1.45] as [number, number, number])));
  around(new THREE.BoxGeometry(1.8, 0.16, 0.03), glow, doors.map(a => [a, r - 0.06, 3.55]));

  // Centre pillar: banded panels, red strips facing each spawn, plinth and cap.
  const pillarSkin = texture(2048, 1024, (c, w, H) => {
    const sx = w / (2 * Math.PI * ARENA.pillarRadius), sy = H / ARENA.pillarHeight, y = (m: number) => H - m * sy;
    c.fillStyle = '#67707a'; c.fillRect(0, 0, w, H); speckle(c, w, H, 40000, 0.06);
    c.fillStyle = '#3b424b'; c.fillRect(0, y(0.4), w, 0.4 * sy); c.fillStyle = '#454c55'; c.fillRect(0, 0, w, 0.35 * sy);
    for (const at of [1.6, 3.2]) { c.fillStyle = SEAM; c.fillRect(0, y(at), w, 5); }
    for (let i = 0; i < 12; i++) { c.fillStyle = SEAM; c.fillRect(i * w / 12, y(4.45), 5, 4.05 * sy); }
    for (const u of [0, 0.5, 1]) {
      c.fillStyle = '#30363e'; c.fillRect(u * w - 0.35 * sx, y(4.1), 0.7 * sx, 3.5 * sy);
      c.fillStyle = RED; c.fillRect(u * w - 0.11 * sx, y(3.9), 0.22 * sx, 3.1 * sy);
    }
  });
  mesh(new THREE.CylinderGeometry(ARENA.pillarRadius, ARENA.pillarRadius, ARENA.pillarHeight, 96), new THREE.MeshStandardMaterial({ map: pillarSkin, roughness: 0.75, metalness: 0.2 }), 0, ARENA.pillarHeight / 2);
  mesh(new THREE.CylinderGeometry(2.12, 2.18, 0.14, 96), '#4e555e', 0, 0.07, 0, detail);
  mesh(new THREE.CylinderGeometry(2.07, 2.07, 0.14, 96), '#6d757f', 0, ARENA.pillarHeight - 0.07, 0, detail);
  const cap = texture(512, 512, (c, w) => {
    c.fillStyle = '#626a74'; c.fillRect(0, 0, w, w); speckle(c, w, w, 8000, 0.06);
    for (const [radius, color, width] of [[0.95, '#4a515a', 14], [0.7, '#a7a99f', 6], [0.42, '#4a515a', 10], [0.15, RED, 6]] as const) { c.lineWidth = width; c.strokeStyle = color; c.beginPath(); c.arc(w / 2, w / 2, radius * w / 2, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = '#4a515a'; c.fillRect(w / 2 - 3, w * 0.1, 6, w * 0.8); c.fillRect(w * 0.1, w / 2 - 3, w * 0.8, 6);
  });
  mesh(new THREE.CircleGeometry(ARENA.pillarRadius, 96), new THREE.MeshStandardMaterial({ map: cap, roughness: 0.8 }), 0, ARENA.pillarHeight + 0.012).rotation.x = -Math.PI / 2;

  // Spawn covers: paneled faces with red end strips, end posts and coping.
  const coverFace = texture(1024, 512, (c, w, H) => {
    const sx = w / ARENA.coverWidth, sy = H / ARENA.coverHeight, y = (m: number) => H - m * sy;
    c.fillStyle = '#626b75'; c.fillRect(0, 0, w, H); speckle(c, w, H, 15000, 0.06);
    c.fillStyle = '#30363e'; c.fillRect(0, y(0.3), w, 0.3 * sy); c.fillStyle = '#40474f'; c.fillRect(0, 0, w, 0.25 * sy);
    for (const x of [0.75, 2.25, 3.75]) panel(c, x * sx, y(2.85), 1.5 * sx - 8, 2.4 * sy);
    for (const x of [0.55, 5.33]) { c.fillStyle = RED; c.fillRect(x * sx, y(2.6), 0.12 * sx, 2.2 * sy); }
  });
  const coverSide = material('#626b75'), faces = new THREE.MeshStandardMaterial({ map: coverFace, roughness: 0.8, metalness: 0.15 }), posts: Spec[] = [], caps: Spec[] = [];
  for (const b of SPAWN_COVERS) {
    const z = (b.min.z + b.max.z) / 2, d = b.max.z - b.min.z;
    box(ARENA.coverWidth, ARENA.coverHeight, d, 0, ARENA.coverHeight / 2, z, [coverSide, coverSide, coverSide, coverSide, faces, faces]);
    for (const x of [-1, 1].map(side => side * (ARENA.coverWidth / 2 - 0.19))) { posts.push([0.38, ARENA.coverHeight + 0.16, d + 0.08, x, (ARENA.coverHeight + 0.16) / 2, z]); caps.push([0.46, 0.08, d + 0.14, x, ARENA.coverHeight + 0.2, z]); }
    caps.push([ARENA.coverWidth - 0.76, 0.1, d + 0.06, 0, ARENA.coverHeight + 0.03, z]);
  }
  boxes('#666e78', posts); boxes('#7b838d', caps);

  // Stairs and landings, clipped to the circular wall like their collision boxes.
  for (const b of [...STAIRS, ...PLATFORMS]) {
    const sign = b.min.x < 0 ? -1 : 1, inner = sign < 0 ? b.max.x : b.min.x, shape = new THREE.Shape();
    shape.moveTo(inner, -b.min.z);
    const segments = Math.ceil((b.max.z - b.min.z) / 0.1);
    for (let i = 0; i <= segments; i++) { const z = b.min.z + (b.max.z - b.min.z) * i / segments, edge = Math.sqrt(r * r - z * z); shape.lineTo(sign < 0 ? Math.max(b.min.x, -edge) : Math.min(b.max.x, edge), -z); }
    shape.lineTo(inner, -b.max.z); shape.closePath();
    const step = mesh(new THREE.ExtrudeGeometry(shape, { depth: b.max.y, bevelEnabled: false, steps: 1 }), '#555e69'); step.rotation.x = -Math.PI / 2;
  }
  const edgeX = (b: Box, inset: number) => b.min.x < 0 ? b.max.x - inset : b.min.x + inset, width = ARENA.stairWidth;
  const treads: Spec[] = [], risers: Spec[] = [], curbs: Spec[] = [], red: Spec[] = [], plates: Spec[] = [];
  for (const b of STAIRS) {
    treads.push([0.07, 0.015, width - 0.04, edgeX(b, 0.035), b.max.y + 0.008, 0]);
    risers.push([0.02, 0.2, width - 0.3, b.min.x < 0 ? b.max.x + 0.011 : b.min.x - 0.011, b.max.y - 0.12, 0]);
    for (const z of [-1, 1]) curbs.push([b.max.x - b.min.x, 0.12, 0.1, (b.min.x + b.max.x) / 2, b.max.y + 0.06, z * (width / 2 - 0.05)]);
  }
  for (const b of PLATFORMS) {
    const near = edgeX(b, 0), far = Math.sign(near) * Math.sqrt(r * r - (width / 2) ** 2), length = Math.abs(far - near), mid = (near + far) / 2;
    red.push([0.07, 0.015, width - 0.04, edgeX(b, 0.035), b.max.y + 0.008, 0]);
    plates.push([length - 0.5, 0.02, width - 0.6, mid + Math.sign(near) * 0.05, b.max.y + 0.01, 0]);
    for (const z of [-1, 1]) { curbs.push([length, 0.12, 0.1, mid, b.max.y + 0.06, z * (width / 2 - 0.05)]); red.push([length, 0.03, 0.02, mid, b.max.y + 0.135, z * (width / 2 - 0.05)]); }
  }
  boxes('#b6b6a6', treads); boxes('#3a414a', [...risers, ...curbs]); boxes(RED, red); boxes('#4a525c', plates);
}
