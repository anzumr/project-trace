import type { Settings } from './settings';

export function Crosshair({ settings: s, preview = false }: { settings: Settings; preview?: boolean }) {
  const r = s.size / 2, gap = Math.min(s.gap / 2, Math.max(0, r - s.thickness));
  const cross = `M ${-r} 0 H ${-gap} M ${gap} 0 H ${r} M 0 ${-r} V ${-gap} M 0 ${gap} V ${r}`;
  const minimal = `M ${-r} 0 H ${-r*0.55} M ${r*0.55} 0 H ${r}`;
  const shape = (outline: boolean) => {
    const color = outline ? '#000000' : s.color;
    const width = s.thickness + (outline ? s.outlineWidth * 2 : 0);
    return <g fill="none" stroke={color} strokeWidth={width}>
      {(s.style === 'cross' || s.style === 'cross-dot') && <path d={cross}/>}
      {s.style === 'minimal' && <path d={minimal}/>}
      {s.style === 'circle' && <circle r={r}/>}
      {(s.style === 'dot' || s.style === 'cross-dot' || s.style === 'minimal') && <circle r={s.style === 'dot' ? Math.max(1, s.size / 6) : s.thickness/2} fill={color} strokeWidth={outline ? s.outlineWidth*2 : 0}/>}
    </g>;
  };
  return <svg className={preview ? 'crosshair-preview' : 'crosshair-overlay'} viewBox="-48 -48 96 96" width="96" height="96" aria-hidden="true" style={{ opacity: s.opacity }}>{s.outline && shape(true)}{shape(false)}</svg>;
}
