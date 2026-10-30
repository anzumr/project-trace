import { Crosshair } from './Crosshair';
import { defaults, PRESETS, STYLES, type Settings } from './settings';

export function SettingsPanel({ settings: s, change, exportReport }: { settings: Settings; change: (settings: Settings) => void; exportReport: () => void }) {
  const slider = (label: string, key: 'size' | 'opacity' | 'thickness' | 'gap' | 'outlineWidth' | 'sensitivity', min: number, max: number, step: number) => <label>{label}<output>{key === 'sensitivity' ? s[key].toFixed(4) : s[key]}</output><input type="range" min={min} max={max} step={step} value={s[key]} onChange={e => change({ ...s, [key]: +e.target.value })}/></label>;
  return <div className="settings editor">
    <p className="note"><strong>Maximum performance:</strong> Enable hardware / graphics acceleration in your browser settings, then relaunch the browser. In Chrome, open Settings → System → Use graphics acceleration when available.</p>
    <label className="row">Graphics<select value={s.graphics} onChange={e=>change({...s,graphics:e.target.value as Settings['graphics']})}><option value="competitive">Competitive</option><option value="balanced">Balanced</option><option value="quality">Quality</option></select></label>
    <label className="row">Frame cap<select value={s.frameCap} onChange={e=>change({...s,frameCap:+e.target.value})}>{[0,60,120,144,240].map(cap=><option key={cap} value={cap}>{cap || 'Auto'}</option>)}</select></label>
    <label>Render scale <output>{Math.round(s.renderScale*100)}%</output><input type="range" min="0.5" max="1.5" step="0.1" value={s.renderScale} onChange={e=>change({...s,renderScale:+e.target.value})}/></label>
    <label className="row">Performance diagnostics<input type="checkbox" checked={s.diagnostics} onChange={e=>change({...s,diagnostics:e.target.checked})}/></label>
    <button className="reset" onClick={exportReport}>Download performance report</button>
    <p className="note">Frame caps depend on display refresh. Competitive reduces pixel density and decoration; Quality increases pixel density.</p>
    <div className="reticle-demo"><Crosshair settings={s} preview/><small>LIVE PREVIEW · EXACT CENTER</small></div>
    <div className="preset-buttons">{Object.entries(PRESETS).map(([name, values]) => <button key={name} onClick={() => change({ ...s, ...values })}>{name}</button>)}</div>
    <label className="row">Style<select value={s.style} onChange={e => change({ ...s, style: e.target.value as Settings['style'] })}>{STYLES.map(style => <option key={style} value={style}>{({ dot: 'Dot', cross: 'Cross', circle: 'Hollow circle', 'cross-dot': 'Cross + dot', minimal: 'Minimalist' })[style]}</option>)}</select></label>
    <label className="row">Color<input type="color" value={s.color} onChange={e => change({ ...s, color: e.target.value })}/></label>
    <div className="editor-grid">{slider('Opacity', 'opacity', 0.1, 1, 0.05)}{slider('Size', 'size', 4, 60, 1)}{slider('Thickness', 'thickness', 1, 8, 0.5)}{slider('Center gap', 'gap', 0, 24, 1)}</div>
    <label className="row">Outline<input type="checkbox" checked={s.outline} onChange={e => change({ ...s, outline: e.target.checked })}/></label>
    {s.outline && slider('Outline thickness', 'outlineWidth', 0.5, 4, 0.5)}
    {slider('Mouse sensitivity', 'sensitivity', 0.0003, 0.006, 0.0001)}
    <button className="reset" onClick={() => change({ ...s, sensitivity: defaults.sensitivity })}>Reset sensitivity</button>
    <label className="row">Invert Y<input type="checkbox" checked={s.invert} onChange={e => change({ ...s, invert: e.target.checked })}/></label>
    <button className="reset" onClick={() => change({ ...defaults })}>Reset all settings</button>
  </div>;
}
