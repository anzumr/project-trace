export const STYLES = ['dot', 'cross', 'circle', 'cross-dot', 'minimal'] as const;
export type CrosshairStyle = typeof STYLES[number];
export const ACTIONS = ['forward', 'back', 'left', 'right', 'jump', 'crouch'] as const;
export type Action = typeof ACTIONS[number];
/** Each action maps to one KeyboardEvent.code, with left/right modifiers merged (see normalizeKey). */
export type Keybinds = Record<Action, string>;
export const ACTION_LABELS: Record<Action, string> = { forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', jump: 'Jump', crouch: 'Crouch' };
/** Left and right Shift/Ctrl/Alt bind as one key. */
export const normalizeKey = (code: string) => code.replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/, '$1');
/** Escape releases the mouse; the OS and browser own Windows/Command, the menu key and F1–F12. */
export const reservedKey = (code: string) => /^(Escape|Meta|ContextMenu|PrintScreen|F\d{1,2})$/.test(normalizeKey(code));
const KEY_NAMES: Record<string, string> = { Space: 'SPACE', Shift: 'SHIFT', Control: 'CTRL', Alt: 'ALT', Tab: 'TAB', CapsLock: 'CAPS', Enter: 'ENTER', Backspace: 'BACKSPACE', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/' };
export const keyLabel = (code: string) => KEY_NAMES[code] ?? code.replace(/^(Key|Digit)/, '').replace(/^Numpad/, 'NUM ').toUpperCase();
/** Bind `action` to `code`; an action already using that key takes the old key instead. */
export function rebind(keys: Keybinds, action: Action, code: string): Keybinds {
  const key = normalizeKey(code), next = { ...keys }, clash = ACTIONS.find(other => other !== action && keys[other] === key);
  if (clash) next[clash] = keys[action];
  next[action] = key;
  return next;
}
/** Physical key codes for keyboard lock: merged modifiers expand back to both sides. */
export const lockCodes = (keys: Keybinds) => ACTIONS.flatMap(action => /^(Shift|Control|Alt)$/.test(keys[action]) ? [`${keys[action]}Left`, `${keys[action]}Right`] : [keys[action]]);
export const SCALES = ['krazer', 'cs2', 'valorant', 'overwatch', 'rivals', 'cod', 'fortnite'] as const;
export type SensScale = typeof SCALES[number];
/** `yaw` is the degrees turned per mouse count at sensitivity 1 (Fortnite: per 1%). Converting by it keeps the same mouse distance per 360° turn at any DPI. */
export const SCALE_INFO: Record<SensScale, { label: string; yaw: number; step: number; hint?: string }> = {
  krazer: { label: 'krazer.io', yaw: 180 / Math.PI, step: 0.0001, hint: 'Radians per mouse count' },
  cs2: { label: 'Counter-Strike 2', yaw: 0.022, step: 0.01 },
  valorant: { label: 'Valorant', yaw: 0.07, step: 0.001 },
  overwatch: { label: 'Overwatch 2', yaw: 0.0066, step: 0.01 },
  rivals: { label: 'Marvel Rivals', yaw: 0.0175, step: 0.01 },
  cod: { label: 'Call of Duty', yaw: 0.0066, step: 0.01, hint: 'MW, Warzone, Black Ops 6 hipfire' },
  fortnite: { label: 'Fortnite', yaw: 0.005555, step: 0.1, hint: 'Mouse sensitivity X, in %' },
};
/** krazer.io sensitivity is radians of turn per mouse count. */
export const SENS = { min: 0.0001, max: 0.006 };
export const toScale = (scale: SensScale, sensitivity: number) => sensitivity * 180 / Math.PI / SCALE_INFO[scale].yaw;
export const fromScale = (scale: SensScale, value: number) => Math.max(SENS.min, Math.min(SENS.max, value * SCALE_INFO[scale].yaw * Math.PI / 180));
export type Settings = { keys: Keybinds; hitMarkers: boolean; hitOpacity: number; hitColor: string; damageNumbers: boolean; masterVolume: number; sfxVolume: number; muteAll: boolean; hitSound: boolean; headshotSound: boolean; killSound: boolean; spawnSound: boolean; hitRate: number; sensitivity: number; sensScale: SensScale; invert: boolean; color: string; style: CrosshairStyle; opacity: number; size: number; thickness: number; gap: number; outline: boolean; outlineWidth: number; frameCap: number; renderScale: number; graphics: 'competitive' | 'balanced' | 'quality'; diagnostics: boolean };
export const defaults: Settings = { keys: { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', crouch: 'Shift' }, hitMarkers:true, hitOpacity:1, hitColor:'#ffffff', damageNumbers:false, masterVolume:0.7, sfxVolume:0.8, muteAll:false, hitSound:true, headshotSound:true, killSound:true, spawnSound:true, hitRate:8, sensitivity: 0.002, sensScale: 'krazer', invert: false, color: '#c6fff1', style: 'cross', opacity: 1, size: 18, thickness: 2, gap: 6, outline: true, outlineWidth: 1, frameCap: 0, renderScale: 1, graphics: 'balanced', diagnostics: false };
const bounded = (v: unknown, fallback: number, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
function parseKeys(value: unknown): Keybinds {
  const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {}, keys = { ...defaults.keys };
  for (const action of ACTIONS) { const code = saved[action]; if (typeof code === 'string' && /^[A-Za-z0-9]{1,24}$/.test(code) && !reservedKey(code)) keys[action] = normalizeKey(code); }
  // A corrupt save with two actions on one key falls back to the defaults.
  return new Set(Object.values(keys)).size === ACTIONS.length ? keys : { ...defaults.keys };
}
export function parseSettings(value: unknown): Settings {
  const s = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { keys: parseKeys(s.keys), hitMarkers:s.hitMarkers !== false, hitOpacity:bounded(s.hitOpacity,1,0,1), hitColor:typeof s.hitColor==='string' && /^#[0-9a-f]{6}$/i.test(s.hitColor)?s.hitColor:defaults.hitColor,
    damageNumbers:s.damageNumbers===true, masterVolume:bounded(s.masterVolume,0.7,0,1), sfxVolume:bounded(s.sfxVolume,0.8,0,1), muteAll:s.muteAll===true, hitSound:s.hitSound!==false, headshotSound:s.headshotSound!==false, killSound:s.killSound!==false, spawnSound:s.spawnSound!==false, hitRate:bounded(s.hitRate,8,1,12), frameCap: [0,60,120,144,240].includes(s.frameCap as number) ? s.frameCap as number : 0, renderScale: bounded(s.renderScale,1,0.5,1.5), graphics: ['competitive','balanced','quality'].includes(s.graphics as string) ? s.graphics as Settings['graphics'] : 'balanced', diagnostics: s.diagnostics === true, sensitivity: bounded(s.sensitivity, defaults.sensitivity, SENS.min, SENS.max), sensScale: SCALES.includes(s.sensScale as SensScale) ? s.sensScale as SensScale : 'krazer', invert: s.invert === true,
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
