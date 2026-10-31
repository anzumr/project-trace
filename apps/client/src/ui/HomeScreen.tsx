import type { useAccount } from '../auth/useAccount';
import { accuracyOf, ago, kindLabel, type Progress } from '../auth/useProgress';
import { Arrow, Chevron, Mouse } from './icons';

export const Controls = () => <div className="controls-row"><span><kbd>W A S D</kbd>Move</span><span><kbd>SPACE</kbd>Jump</span><span><kbd>HOLD MOUSE 1</kbd>Fire</span><span><kbd>ESC</kbd>Menu</span></div>;

function ProgressCard({ account, progress: p, openAccount }: { account: ReturnType<typeof useAccount>; progress: Progress; openAccount: () => void }) {
  if (!account.profile) return <section className="card" aria-label="Your account"><h2 className="card-title">{account.session ? 'FINISH YOUR ACCOUNT' : 'PLAYING AS GUEST'}</h2>
    <p className="note" style={{ margin: '14px 0 18px', fontSize: 15, color: 'var(--text-2)' }}>{account.session ? 'Claim your username to enter Quick Play and start saving results.' : 'Sign in to play Quick Play, earn XP and keep your match history. Practice and private rooms work without an account.'}</p>
    <button className="btn-light" onClick={openAccount}>{account.session ? 'Claim username' : 'Sign in or register'}</button></section>;
  const s = p.stats.find(s => s.kind === 'public'), count = Number(s?.wins ?? 0) + Number(s?.losses ?? 0);
  return <>
    <section className="card" aria-label="Your progress" aria-busy={p.loading}>
      <div className="card-head"><h2 className="card-title">YOUR PROGRESS</h2><span>Quick Play</span></div>
      {p.error ? <><p className="error" role="alert">{p.error}</p><button className="link-button" onClick={p.refresh}>Retry</button></> : <>
        <div className="level-row"><strong>LVL {p.level}</strong><span>{p.xp - p.start} / {p.next - p.start} XP</span></div>
        <div className="xp-bar" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={p.next - p.start} aria-valuenow={p.xp - p.start}><i style={{ width: `${100 * (p.xp - p.start) / Math.max(1, p.next - p.start)}%` }}/></div>
        <div className="stat-grid"><div><span>MATCHES</span><b>{count}</b></div><div><span>WIN RATE</span><b>{count ? `${Math.round(Number(s!.wins) / count * 100)}%` : '—'}</b></div><div><span>ACCURACY</span><b>{accuracyOf(p.combat.find(c => c.kind === 'public'))}</b></div></div>
      </>}
    </section>
    <section className="card recent" aria-label="Recent matches"><h2 className="card-title">RECENT MATCHES</h2>
      {p.loading ? <p className="note" role="status">Loading…</p> : p.history.length === 0 ? <p className="note">Your completed matches will appear here.</p> : p.history.slice(0, 4).map((h, i) => <div className="match-row" key={i}>
        <span className={`tag${h.outcome === 'win' ? '' : ' muted'}`}>{h.outcome.toUpperCase()}</span>
        <span><strong>{kindLabel(h.match_results.kind)}</strong><small>{h.match_results.mode} · {h.rounds_won} rounds won · +{h.xp} XP</small></span>
        <time dateTime={h.match_results.completed_at}>{ago(h.match_results.completed_at)}</time></div>)}
      <button className="link-button" onClick={openAccount}>All saved matches</button>
    </section>
  </>;
}

export function HomeScreen({ account, progress, practiceStarted, wave, play, practice, privateRoom, settings, openAccount }: {
  account: ReturnType<typeof useAccount>; progress: Progress; practiceStarted: boolean; wave: number;
  play: () => void; practice: () => void; privateRoom: () => void; settings: () => void; openAccount: () => void;
}) {
  return <div className="home wrap">
    <div>
      <h1 style={{ margin: 0, lineHeight: 0 }}><img className="home-logo" src="/brand/krazer-wordmark.webp" alt="krazer.io"/></h1>
      <p className="tagline">TRACK · DUEL · OUTPLAY</p>
      <nav className="main-nav" aria-label="Main menu">
        <button className="btn-primary big" onClick={play}><span><strong>PLAY</strong><small>Quick Play · public 1v1 · best of 3</small></span><Arrow size={28}/></button>
        <button className="nav-item" onClick={practice}><span><strong>Practice</strong><small>{practiceStarted ? `Resume · wave ${wave}` : 'Endless waves · offline'}</small></span><Chevron/></button>
        <button className="nav-item" onClick={privateRoom}><span><strong>Private room</strong><small>Duel a friend with a room code</small></span><Chevron/></button>
        <button className="nav-item" onClick={settings}><span><strong>Settings</strong><small>Crosshair, sensitivity, audio, graphics</small></span><Chevron/></button>
      </nav>
      <Controls/>
      <p className="note" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 0 3%', letterSpacing: 2, fontSize: 12 }}><Mouse size={16}/>DESKTOP + MOUSE REQUIRED</p>
    </div>
    <aside className="progress-aside"><ProgressCard account={account} progress={progress} openAccount={openAccount}/></aside>
  </div>;
}

export function PauseMenu({ wave, kills, resume, restart, end, settings, menu }: { wave: number; kills: number; resume: () => void; restart: () => void; end: () => void; settings: () => void; menu: () => void }) {
  return <section className="pause" aria-label="Practice paused">
    <p className="eyebrow">OFFLINE PRACTICE</p>
    <h1 className="display">PAUSED</h1>
    <p>Wave {wave} · {kills} {kills === 1 ? 'target' : 'targets'} cleared. The target and respawn timer are frozen.</p>
    <button className="btn-primary" onClick={resume}><strong>RESUME</strong><Arrow size={24}/></button>
    <button className="nav-item" onClick={end}><span><strong>End session</strong><small>See accuracy, damage and streak for this session</small></span><Chevron/></button>
    <button className="nav-item" onClick={restart}><span><strong>Restart</strong><small>Back to wave 1 and your spawn position</small></span><Chevron/></button>
    <button className="nav-item" onClick={settings}><span><strong>Settings</strong><small>Crosshair, sensitivity, audio, graphics</small></span><Chevron/></button>
    <button className="btn-ghost" onClick={menu}>Main menu</button>
  </section>;
}
