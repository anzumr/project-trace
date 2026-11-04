import { useMemo } from 'react';
import { rankName, rankOf, TIERS } from '@trace/shared/ranked';

type Look = { hi: string; mid: string; lo: string; glow: string; wings: number; trim?: string };
const LOOKS: Look[] = [
  { hi: '#ffd0a1', mid: '#b8743d', lo: '#3f1e0b', glow: '#e08a45', wings: 0 },
  { hi: '#ffffff', mid: '#a9b5c3', lo: '#323b46', glow: '#c9d6e4', wings: 2 },
  { hi: '#fff3bd', mid: '#e2a72a', lo: '#5e3604', glow: '#ffc94a', wings: 3 },
  { hi: '#e0feff', mid: '#3fc0cb', lo: '#0b3a45', glow: '#5fe3ec', wings: 3 },
  { hi: '#cfffe6', mid: '#1db96f', lo: '#05331f', glow: '#2ff09a', wings: 4 },
  { hi: '#eef5ff', mid: '#6a9fff', lo: '#13235c', glow: '#8fb8ff', wings: 4 },
  { hi: '#f4e4ff', mid: '#a35af0', lo: '#260a4d', glow: '#c27dff', wings: 5 },
  { hi: '#ffe0e2', mid: '#ee2a39', lo: '#3d0409', glow: '#ff4a57', wings: 6, trim: '#ffd36b' },
];
export const tierColor = (tier: number) => LOOKS[tier].glow;
const poly = (pts: number[][]) => 'M' + pts.map(p => p.join(' ')).join('L') + 'Z';
const SHIELD = 'M-34 -34L-12 -40L0 -48L12 -40L34 -34V2C34 24 18 38 0 48C-18 38 -34 24 -34 2Z';
const SHAPES = [
  poly([0, 1, 2, 3, 4, 5].map(k => { const a = (k * 60 - 90) * Math.PI / 180; return [+(40 * Math.cos(a)).toFixed(1), +(40 * Math.sin(a)).toFixed(1)]; })),
  'M-33 -36H33V0C33 22 18 36 0 46C-18 36 -33 22 -33 0Z', SHIELD,
  poly([[0, -50], [30, -32], [38, 0], [24, 32], [0, 52], [-24, 32], [-38, 0], [-30, -32]]),
  poly([[-20, -44], [20, -44], [38, -26], [38, 26], [20, 44], [-20, 44], [-38, 26], [-38, -26]]),
  poly([[0, -52], [42, -10], [0, 50], [-42, -10]]), SHIELD, SHIELD,
];
const FACETS: Record<number, number[][]> = { 3: [[0, -50, 0, -38], [38, 0, 29, 0], [-38, 0, -29, 0], [0, 52, 0, 40]], 4: [[-20, -44, -15, -33], [20, -44, 15, -33], [38, -26, 29, -20], [38, 26, 29, 20], [20, 44, 15, 33], [-20, 44, -15, 33], [-38, 26, -29, 20], [-38, -26, -29, -20]], 5: [[-42, -10, 42, -10], [0, -52, -16, -10], [0, -52, 16, -10], [-16, -10, 0, 50], [16, -10, 0, 50]] };
let serial = 0;
/** SVG markup for one division; built from constants only, so it is safe to inject. */
export function emblemSvg(tier: number, division: number) {
  const T = LOOKS[tier], id = 'rk' + (serial++), body = SHAPES[tier], edge = T.trim ?? T.hi;
  let back = '';
  if (tier >= 5) { const n = tier === 7 ? 16 : 12; back += `<g opacity="${tier === 7 ? 0.9 : 0.6}">`; for (let k = 0; k < n; k++) back += `<path d="M-3 -30L0 -${k % 2 ? 54 : 62}L3 -30Z" fill="${T.glow}" transform="rotate(${k * 360 / n})"/>`; back += '</g>'; }
  if (T.wings) {
    let feathers = '';
    for (let i = 0; i < T.wings; i++) {
      const span = T.wings > 1 ? i / (T.wings - 1) : 0, a = -48 + span * 70, L = 50 - i * (16 / Math.max(1, T.wings - 1)) - (tier < 3 ? 4 : 0);
      feathers += `<g transform="translate(${20 + i * 1.5} ${-16 + span * 24}) rotate(${a.toFixed(1)})"><path d="M0 0Q${L * 0.4} -13 ${L} 0Q${L * 0.5} 9 0 0Z" fill="url(#f${id})" stroke="${T.lo}" stroke-width="1.2"/><path d="M2 0H${(L * 0.85).toFixed(1)}" stroke="${T.hi}" stroke-opacity=".55"/></g>`;
    }
    back += `<g>${feathers}</g><g transform="scale(-1 1)">${feathers}</g>`;
  }
  const facets = (FACETS[tier] ?? []).map(([x1, y1, x2, y2]) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${T.hi}" stroke-opacity=".45" stroke-width="1.1"/>`).join('');
  const crown = tier >= 6 ? `<path d="M-24 -40L-28 -62L-13 -50L0 -68L13 -50L28 -62L24 -40Z" fill="url(#c${id})" stroke="${T.lo}" stroke-width="1.5"/><circle cy="-58" r="3.2" fill="${T.hi}"/><circle cx="-26" cy="-60" r="2" fill="${T.hi}"/><circle cx="26" cy="-60" r="2" fill="${T.hi}"/>` : '';
  const top = tier === 5 ? 60 : 58, gem = tier >= 2 && tier < 6 ? `<path d="M0 -${top}L6 -${top - 9}L0 -${top - 18}L-6 -${top - 9}Z" fill="${T.glow}" stroke="${T.hi}"/>` : '';
  const ticks = [0, 90, 180, 270].map(a => `<path d="M0 -21V-15" transform="rotate(${a})" stroke="${T.hi}" stroke-width="3" stroke-linecap="round"/>`).join('');
  return `<svg viewBox="-66 -74 132 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>
<linearGradient id="m${id}" x1="0" y1="-52" x2="0" y2="52" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${T.hi}"/><stop offset=".42" stop-color="${T.mid}"/><stop offset="1" stop-color="${T.lo}"/></linearGradient>
<linearGradient id="i${id}" x1="0" y1="-44" x2="0" y2="44" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${T.lo}"/><stop offset=".55" stop-color="${T.mid}" stop-opacity=".85"/><stop offset="1" stop-color="${T.hi}" stop-opacity=".7"/></linearGradient>
<linearGradient id="f${id}" x1="0" y1="-8" x2="0" y2="6" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${T.hi}"/><stop offset=".5" stop-color="${T.mid}"/><stop offset="1" stop-color="${T.lo}"/></linearGradient>
<linearGradient id="c${id}" x1="0" y1="-68" x2="0" y2="-40" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${T.trim ? '#fff6cf' : T.hi}"/><stop offset="1" stop-color="${T.trim ?? T.mid}"/></linearGradient>
<radialGradient id="g${id}"><stop offset="0" stop-color="${T.glow}" stop-opacity="${(0.18 + tier * 0.07).toFixed(2)}"/><stop offset="1" stop-color="${T.glow}" stop-opacity="0"/></radialGradient></defs>
<circle r="66" fill="url(#g${id})"/>${back}
<path d="${body}" fill="url(#m${id})" stroke="${T.trim ?? T.lo}" stroke-width="${T.trim ? 3 : 2}" stroke-linejoin="round"/>
<path d="${body}" transform="scale(.78)" fill="url(#i${id})" stroke="${T.hi}" stroke-opacity=".55" stroke-width="1.5" stroke-linejoin="round"/>
${facets}${crown}${gem}<circle r="15" fill="${T.lo}" fill-opacity=".55" stroke="${T.hi}" stroke-width="3"/>${ticks}<circle r="3.4" fill="${edge}"/>
<path d="M-17 52H17L22 61L17 70H-17L-22 61Z" fill="${T.lo}" stroke="${T.trim ?? T.mid}" stroke-width="1.5"/>
<text y="65.5" text-anchor="middle" font-family="'Saira Variable','Arial Narrow',sans-serif" font-weight="800" font-style="italic" font-size="14" fill="${edge}">${division}</text></svg>`;
}

/** Rank emblem for a total RP value. */
export function RankEmblem({ points, size = 64, className = '' }: { points: number; size?: number; className?: string }) {
  const r = rankOf(points), html = useMemo(() => emblemSvg(r.tier, r.division), [r.tier, r.division]);
  return <span className={`rank-emblem ${className}`} role="img" aria-label={rankName(r)} style={{ width: size, height: size * 150 / 132 }} dangerouslySetInnerHTML={{ __html: html }}/>;
}
export const tierName = (tier: number) => TIERS[tier];
