import { useState } from 'react';
import { Crosshair } from './Crosshair';
import { MARKER } from './CombatHud';
import { Controls } from './HomeScreen';
import { defaults, PRESETS, STYLES, type Settings } from './settings';

type Section = 'controls' | 'crosshair' | 'audio' | 'graphics';
type NumberKey = 'size' | 'opacity' | 'thickness' | 'gap' | 'outlineWidth' | 'sensitivity' | 'hitOpacity' | 'masterVolume' | 'sfxVolume' | 'hitRate' | 'renderScale';
type FlagKey = 'outline' | 'invert' | 'hitMarkers' | 'damageNumbers' | 'diagnostics' | 'muteAll' | 'hitSound' | 'headshotSound' | 'killSound' | 'spawnSound';
const STYLE_LABELS = { dot: 'Dot', cross: 'Cross', circle: 'Circle', 'cross-dot': 'Cross + dot', minimal: 'Minimal' };
const GLYPHS: Record<Settings['style'], { d: string; ring?: boolean; dot?: number }> = { dot: { d: '', dot: 2.5 }, cross: { d: 'M-10 0H-4M4 0H10M0 -10V-4M0 4V10' }, circle: { d: '', ring: true }, 'cross-dot': { d: 'M-10 0H-4M4 0H10M0 -10V-4M0 4V10', dot: 1.6 }, minimal: { d: 'M-10 0H-5M5 0H10', dot: 1.2 } };
const CROSSHAIR_COLORS = [['#ffffff', 'White'], ['#c6fff1', 'Mint'], ['#00e5ff', 'Cyan'], ['#ffff00', 'Yellow'], ['#ff4a55', 'Red']];
const HIT_COLORS = [['#ffffff', 'White'], ['#a5ffde', 'Mint'], ['#00e5ff', 'Cyan'], ['#ff4a55', 'Red']];
const percent = (v: number) => `${Math.round(v * 100)}%`;

export function SettingsPanel({ settings: s, change, exportReport, back, openAccount }: { settings: Settings; change: (settings: Settings) => void; exportReport: () => void; back: () => void; openAccount: () => void }) {
  const [section, setSection] = useState<Section>('crosshair');
  const slider = (label: string, key: NumberKey, min: number, max: number, step: number, format: (v: number) => string = String) => <label className="setting-row slider">{label}<input type="range" min={min} max={max} step={step} value={s[key]} onChange={e => change({ ...s, [key]: +e.target.value })}/><output>{format(s[key])}</output></label>;
  const toggle = (label: string, key: FlagKey, hint?: string) => <label className="setting-row"><span>{label}{hint && <small>{hint}</small>}</span><input type="checkbox" role="switch" className="switch" checked={s[key]} onChange={e => change({ ...s, [key]: e.target.checked })}/></label>;
  const colors = (label: string, key: 'color' | 'hitColor', list: string[][]) => <div className="setting-row" role="group" aria-label={label}><span>{label}</span><span className="swatches">{list.map(([hex, name]) => <button key={hex} className="swatch" aria-label={name} aria-pressed={s[key].toLowerCase() === hex} style={{ background: hex }} onClick={() => change({ ...s, [key]: hex })}/>)}<input type="color" className="color-input" aria-label={`Custom ${label.toLowerCase()}`} value={s[key]} onChange={e => change({ ...s, [key]: e.target.value })}/></span></div>;
  const nav: [Section, string][] = [['controls', 'Controls'], ['crosshair', 'Crosshair & hit feedback'], ['audio', 'Audio'], ['graphics', 'Graphics']];
  return <div className="settings-layout wrap">
    <nav className="settings-nav" aria-label="Settings sections">
      <h1 className="display">Settings</h1>
      {nav.map(([id, label]) => <button key={id} className="nav-link" aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>{label}</button>)}
      <button className="nav-link" onClick={openAccount}>Account</button>
      <p className="note">Changes save automatically on this browser.</p>
      <button className="btn-light" style={{ margin: '16px 14px 0', alignSelf: 'flex-start' }} onClick={back}>DONE</button>
      <button className="btn-ghost" onClick={() => change({ ...defaults })}>Reset all settings</button>
    </nav>

    {section === 'controls' && <div className="settings-body"><div className="settings-col">
      <h2 className="eyebrow">MOUSE</h2>
      <div className="setting-group">{slider('Sensitivity', 'sensitivity', 0.0003, 0.006, 0.0001, v => v.toFixed(4))}{toggle('Invert Y', 'invert')}<div className="setting-row"><span>Default sensitivity</span><button className="link-button" onClick={() => change({ ...s, sensitivity: defaults.sensitivity })}>Reset sensitivity</button></div></div>
      <h2 className="eyebrow">KEYS</h2><div className="card"><Controls/></div>
      <p className="note">Escape releases the mouse. In online matches the opponent keeps playing, so only pause in practice.</p>
    </div></div>}

    {section === 'crosshair' && <div className="settings-body">
      <div className="settings-col">
        <h2 className="eyebrow">CROSSHAIR</h2>
        <div className="style-grid" role="group" aria-label="Crosshair style">{STYLES.map(style => { const g = GLYPHS[style]; return <button key={style} className="style-option" aria-pressed={s.style === style} onClick={() => change({ ...s, style })}>
          <svg width="28" height="28" viewBox="-12 -12 24 24" aria-hidden="true"><path d={g.d} stroke="currentColor" strokeWidth="2" fill="none"/>{g.ring && <circle r="7" fill="none" stroke="currentColor" strokeWidth="2"/>}{g.dot && <circle r={g.dot} fill="currentColor"/>}</svg>{STYLE_LABELS[style]}</button>; })}</div>
        <div className="preset-row" role="group" aria-label="Presets">{Object.entries(PRESETS).map(([name, values]) => <button key={name} onClick={() => change({ ...s, ...values })}>{name}</button>)}</div>
        <div className="setting-group">{slider('Size', 'size', 4, 60, 1)}{slider('Thickness', 'thickness', 1, 8, 0.5)}{slider('Center gap', 'gap', 0, 24, 1)}{slider('Opacity', 'opacity', 0.1, 1, 0.05, percent)}</div>
        <div className="setting-group">{colors('Color', 'color', CROSSHAIR_COLORS)}{toggle('Dark outline', 'outline')}{s.outline && slider('Outline thickness', 'outlineWidth', 0.5, 4, 0.5)}</div>
      </div>
      <div className="settings-col">
        <h2 className="eyebrow">LIVE PREVIEW</h2>
        <div className="preview-box"><span className="preview-target" aria-hidden="true"><i/><b/></span><Crosshair settings={s} preview/><small>2× ZOOM · EXACT CENTER</small></div>
        <h2 className="eyebrow">HIT FEEDBACK</h2>
        <div className="setting-group">{toggle('Hit markers', 'hitMarkers')}{slider('Marker opacity', 'hitOpacity', 0, 1, 0.05, percent)}{colors('Body hit color', 'hitColor', HIT_COLORS)}{toggle('Floating damage numbers', 'damageNumbers')}</div>
        <div className="marker-tiles" style={{ opacity: s.hitMarkers ? s.hitOpacity : 0.35 }}>
          <span className="marker-tile"><svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true"><path d={MARKER} stroke="#000c" strokeWidth="3.2" fill="none"/><path d={MARKER} stroke={s.hitColor} strokeWidth="1.4" fill="none"/></svg>BODY HIT</span>
          <span className="marker-tile"><svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true"><path d={`${MARKER}M12 .8L13.6 2.4L12 4L10.4 2.4Z`} stroke="#000c" strokeWidth="3.2" fill="none"/><path d={MARKER} stroke="var(--head)" strokeWidth="1.4" fill="none"/><path d="M12 .8L13.6 2.4L12 4L10.4 2.4Z" fill="var(--head)"/></svg>HEADSHOT · 2×</span>
        </div>
        <p className="note">Headshots always use amber with a small diamond, so they read differently from body hits.</p>
      </div>
    </div>}

    {section === 'audio' && <div className="settings-body"><div className="settings-col">
      <h2 className="eyebrow">VOLUME</h2>
      <div className="setting-group">{slider('Master volume', 'masterVolume', 0, 1, 0.05, percent)}{slider('Sound effects', 'sfxVolume', 0, 1, 0.05, percent)}{slider('Max hit sounds / s', 'hitRate', 1, 12, 1)}</div>
      <h2 className="eyebrow">SOUNDS</h2>
      <div className="setting-group">{toggle('Mute all', 'muteAll')}{toggle('Body hit sound', 'hitSound')}{toggle('Headshot sound', 'headshotSound')}{toggle('Kill confirmed sound', 'killSound')}{toggle('Spawn sound', 'spawnSound')}</div>
    </div></div>}

    {section === 'graphics' && <div className="settings-body"><div className="settings-col">
      <h2 className="eyebrow">PERFORMANCE</h2>
      <div className="setting-group">
        <label className="setting-row"><span>Graphics preset<small>Competitive lowers pixel density and decoration; Quality raises it.</small></span><select value={s.graphics} onChange={e => change({ ...s, graphics: e.target.value as Settings['graphics'] })}><option value="competitive">Competitive</option><option value="balanced">Balanced</option><option value="quality">Quality</option></select></label>
        <label className="setting-row"><span>Frame cap<small>Caps depend on your display refresh rate.</small></span><select value={s.frameCap} onChange={e => change({ ...s, frameCap: +e.target.value })}>{[0, 60, 120, 144, 240].map(cap => <option key={cap} value={cap}>{cap || 'Auto'}</option>)}</select></label>
        {slider('Render scale', 'renderScale', 0.5, 1.5, 0.1, percent)}
        {toggle('Performance diagnostics', 'diagnostics', 'Frame timing, ping and server tick overlay.')}
        <div className="setting-row"><span>Performance report</span><button className="link-button" onClick={exportReport}>Download report</button></div>
      </div>
      <p className="note"><strong>Maximum performance:</strong> enable hardware / graphics acceleration in your browser, then relaunch it. In Chrome: Settings → System → Use graphics acceleration when available.</p>
    </div></div>}
  </div>;
}
