export const STYLES = ['dot', 'cross', 'circle', 'cross-dot', 'minimal'] as const;
export type CrosshairStyle = typeof STYLES[number];
export type Settings = { hitMarkers: boolean; hitOpacity: number; hitColor: string; damageNumbers: boolean; masterVolume: number; sfxVolume: number; muteAll: boolean; hitSound: boolean; headshotSound: boolean; killSound: boolean; spawnSound: boolean; hitRate: number; sensitivity: number; invert: boolean; color: string; style: CrosshairStyle; opacity: number; size: number; thickness: number; gap: number; outline: boolean; outlineWidth: number; frameCap: number; renderScale: number; graphics: 'competitive' | 'balanced' | 'quality'; diagnostics: boolean };
export const defaults: Settings = { hitMarkers:true, hitOpacity:1, hitColor:'#ffffff', damageNumbers:false, masterVolume:0.7, sfxVolume:0.8, muteAll:false, hitSound:true, headshotSound:true, killSound:true, spawnSound:true, hitRate:8, sensitivity: 0.002, invert: false, color: '#c6fff1', style: 'cross', opacity: 1, size: 18, thickness: 2, gap: 6, outline: true, outlineWidth: 1, frameCap: 0, renderScale: 1, graphics: 'balanced', diagnostics: false };
const bounded = (v: unknown, fallback: number, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
export function parseSettings(value: unknown): Settings {
  const s = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { hitMarkers:s.hitMarkers !== false, hitOpacity:bounded(s.hitOpacity,1,0,1), hitColor:typeof s.hitColor==='string' && /^#[0-9a-f]{6}$/i.test(s.hitColor)?s.hitColor:defaults.hitColor,
    damageNumbers:s.damageNumbers===true, masterVolume:bounded(s.masterVolume,0.7,0,1), sfxVolume:bounded(s.sfxVolume,0.8,0,1), muteAll:s.muteAll===true, hitSound:s.hitSound!==false, headshotSound:s.headshotSound!==false, killSound:s.killSound!==false, spawnSound:s.spawnSound!==false, hitRate:bounded(s.hitRate,8,1,12), frameCap: [0,60,120,144,240].includes(s.frameCap as number) ? s.frameCap as number : 0, renderScale: bounded(s.renderScale,1,0.5,1.5), graphics: ['competitive','balanced','quality'].includes(s.graphics as string) ? s.graphics as Settings['graphics'] : 'balanced', diagnostics: s.diagnostics === true, sensitivity: bounded(s.sensitivity, defaults.sensitivity, 0.0003, 0.006), invert: s.invert === true,
    color: typeof s.color === 'string' && /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : defaults.color,
    style: STYLES.includes(s.style as CrosshairStyle) ? s.style as CrosshairStyle : defaults.style,
    opacity: bounded(s.opacity, defaults.opacity, 0.1, 1), size: bounded(s.size, defaults.size, 4, 60), thickness: bounded(s.thickness, defaults.thickness, 1, 8), gap: bounded(s.gap, defaults.gap, 0, 24),
    outline: typeof s.outline === 'boolean' ? s.outline : defaults.outline, outlineWidth: bounded(s.outlineWidth, defaults.outlineWidth, 0.5, 4) };
}
export function loadSettings(): Settings { try { return parseSettings(JSON.parse(localStorage.getItem('trace.settings') || '{}')); } catch { return { ...defaults }; } }
export const PRESETS: Record<string, Partial<Settings>> = {
  Precision: { style: 'cross', size: 18, thickness: 2, gap: 6, color: '#c6fff1', opacity: 1, outline: true, outlineWidth: 1 },
  Dot: { style: 'dot', size: 12, thickness: 2, gap: 0, color: '#ffffff', opacity: 1, outline: true, outlineWidth: 1 },
  Contrast: { style: 'cross-dot', size: 24, thickness: 3, gap: 8, color: '#ffff00', opacity: 1, outline: true, outlineWidth: 2 },
};
