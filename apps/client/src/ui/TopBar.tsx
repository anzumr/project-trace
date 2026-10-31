import type { Snapshot } from '@trace/shared/protocol';
import type { useAccount } from '../auth/useAccount';
import type { Progress } from '../auth/useProgress';
import { Expand, Shrink, Sliders } from './icons';

export function TopBar({ account, progress, room, queuing, ping, fps, fullscreen, toggleFullscreen, home, openAccount, openSettings }: {
  account: ReturnType<typeof useAccount>; progress: Progress; room: Snapshot | null; queuing: boolean; ping: number; fps: number; fullscreen: boolean;
  toggleFullscreen: () => void; home: () => void; openAccount: () => void; openSettings: () => void;
}) {
  const name = account.profile?.username_display || (account.session ? 'Finish setup' : 'Guest');
  const xpShare = 100 * (progress.xp - progress.start) / Math.max(1, progress.next - progress.start);
  return <header className="topbar">
    <button className="brand" onClick={home} aria-label="krazer.io home"><img src="/brand/krazer-icon.png" alt=""/><span>krazer<b>.io</b></span></button>
    <div className={`status-chip${room ? ' live' : ''}`}><i/>{room ? `ROOM ${room.code} · ${Math.round(ping)} MS` : queuing ? 'SEARCHING FOR MATCH' : 'OFFLINE'}</div>
    <nav aria-label="Account and display">
      <button className="account-chip" onClick={openAccount}>
        <span className="avatar">{account.profile ? name[0] : '?'}</span>
        <span className="who"><strong>{name}</strong><small>{account.profile ? <>LVL {progress.level}<span className="mini-bar"><i style={{ width: `${xpShare}%` }}/></span></> : account.session ? 'Claim your username' : 'Sign in'}</small></span>
      </button>
      <button className="icon-button" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{fullscreen ? <Shrink/> : <Expand/>}</button>
      <button className="icon-button" onClick={openSettings} aria-label="Settings"><Sliders/></button>
      <span className="fps" aria-label={`${Math.round(fps)} frames per second`}><strong>{Math.round(fps)}</strong>FPS</span>
    </nav>
  </header>;
}
