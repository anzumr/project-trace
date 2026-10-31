import '@fontsource-variable/saira/wdth.css';
import '@fontsource-variable/saira/wdth-italic.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import { CombatHud, RoundResults, PracticeResults } from './ui/CombatHud';
import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Engine, type Hud, type PracticeSummary } from './game/Engine';
import './style.css';
import { loadSettings } from './ui/settings';
import { SettingsPanel } from './ui/SettingsPanel';
import { useAccount } from './auth/useAccount';
import { useProgress } from './auth/useProgress';
import { AccountPanel } from './auth/AccountPanel';
import { Diagnostics } from './ui/Diagnostics';
import { Crosshair } from './ui/Crosshair';
import { matchMessage } from './ui/MatchStatus';
import { QueueScreen } from './ui/QuickPlay';
import { TopBar } from './ui/TopBar';
import { HomeScreen, PauseMenu } from './ui/HomeScreen';
import { PlayScreen } from './ui/PlayScreen';
import { RoomScreen } from './ui/RoomScreen';
import { Back } from './ui/icons';
import type { QueueState, Snapshot } from '@trace/shared/protocol';

type Screen = 'home' | 'play' | 'settings' | 'account';

function App() {
  const account = useAccount();
  const progress = useProgress(account.profile?.user_id);
  const [queue, setQueue] = useState<QueueState>({ state: 'idle', elapsedMs: 0, botEligible: false, serverTime: 0 });
  const queuing = queue.state !== 'idle';
  const host = useRef<HTMLDivElement>(null), engine = useRef<Engine | null>(null);
  const [settings, setSettings] = useState(loadSettings), [screen, setScreen] = useState<Screen>('home'), [practiceActive, setPracticeActive] = useState(false);
  const [room, setRoom] = useState<Snapshot | null>(null), [code, setCode] = useState(''), [busy, setBusy] = useState(false);
  const [hud, setHud] = useState<Hud>({ hp: 100, ownHp: 100, hit: false, headshot: false, locked: false, seconds: 0, damage: 0, fps: 0, ping: 0, wave: 1, kills: 0, speed: 1, size: 1, circle: false });
  const [practiceSummary,setPracticeSummary]=useState<PracticeSummary|null>(null);
  const [dismissedMatch,setDismissedMatch]=useState('');
  const [error, setError] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  useEffect(() => { const changed = () => setFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange', changed); return () => document.removeEventListener('fullscreenchange', changed); }, []);
  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { setError('Fullscreen was unavailable. Try your browser’s fullscreen shortcut (F11).'); }
  };
  useEffect(() => { try { engine.current = new Engine(host.current!, settings, setHud, setError, setRoom, setQueue); } catch { setError('WebGL could not start. Enable hardware acceleration or use a WebGL-capable desktop browser.'); } return () => engine.current?.dispose(); }, []);
  useEffect(() => { if (engine.current) engine.current.settings = settings; try { localStorage.setItem('trace.settings', JSON.stringify(settings)); } catch { /* Private browsing may disable persistence. */ } }, [settings]);
  useEffect(() => { engine.current?.network.setAccount(account.session?.user.id ?? null, account.session?.access_token); }, [account.session?.user.id, account.session?.access_token]);
  useEffect(() => { if (account.recovery) setScreen('account'); }, [account.recovery]);
  useEffect(() => { if (room) setScreen(s => s === 'play' ? 'home' : s); }, [room?.code]);
  useEffect(() => { if (room?.resultState === 'saved') progress.refresh(); }, [room?.resultState, room?.matchId]);
  const enter = () => { setError(''); void engine.current?.engage(); };
  const startPractice = () => { setPracticeSummary(null); setPracticeActive(true); setScreen('home'); enter(); };
  const openRoom = async (join?: string) => { setError(''); setBusy(true); await engine.current?.network.room(join, playerName); setBusy(false); };
  const me = room?.players.find(p => p.id === engine.current?.network.id);
  const opponent = room?.players.find(p => p.id !== me?.id);
  const showResults=room?.resultStatus!=='cancelled' && !!room?.lastRound && (room.phase==='roundEnd' || (room.phase==='finished' && dismissedMatch!==room.matchId));
  const menuOpen = !hud.locked && !showResults && !practiceSummary;
  const overMatch = practiceActive || (!!room && !['lobby','finished'].includes(room.phase));
  const home = () => setScreen('home');
  let view: ReactNode;
  if (screen === 'settings') view = <SettingsPanel settings={settings} change={setSettings} exportReport={() => engine.current?.exportDiagnostics()} back={home} openAccount={() => setScreen('account')}/>;
  else if (screen === 'account') view = <div className="wrap"><button className="back-link" onClick={home}><Back size={16}/>BACK</button><div className="page-head" style={{ marginBottom: 24 }}><h1 className="display">Account</h1><p>One identity across your computers. Settings stay on each browser.</p></div><AccountPanel account={account} inRoom={!!room || queuing} progress={progress}/></div>;
  else if (room) view = <RoomScreen room={room} me={me} opponent={opponent} enter={enter} ready={() => { engine.current?.network.ready(); enter(); }} leave={() => { engine.current?.network.leave(); setError(''); }} choose={mode => engine.current?.network.selectMode(mode)}/>;
  else if (queuing) view = <QueueScreen queue={queue} network={engine.current?.network}/>;
  else if (practiceActive) view = <PauseMenu wave={hud.wave} kills={hud.kills} resume={enter} restart={() => { engine.current?.reset(); enter(); }} end={() => { const summary = engine.current?.endPractice(); if (summary) setPracticeSummary(summary); setPracticeActive(false); }} settings={() => setScreen('settings')} menu={() => setPracticeActive(false)}/>;
  else if (screen === 'play') view = <PlayScreen network={engine.current?.network} quickPlay={!!account.profile && !account.loading} signedIn={!!account.session} username={account.profile?.username_display} busy={busy}
    roomBlocked={queuing || busy || !engine.current || account.loading || (!!account.session && !account.profile)} playerName={playerName} setPlayerName={setPlayerName} code={code} setCode={setCode}
    createRoom={() => void openRoom()} joinRoom={() => void openRoom(code)} practice={startPractice} practiceStarted={hud.damage > 0 || hud.wave > 1} wave={hud.wave} back={home} openAccount={() => setScreen('account')}/>;
  else view = <HomeScreen account={account} progress={progress} practiceStarted={hud.damage > 0 || hud.wave > 1} wave={hud.wave} play={() => setScreen('play')} practice={startPractice} privateRoom={() => setScreen('play')} settings={() => setScreen('settings')} openAccount={() => setScreen('account')}/>;
  return <><div ref={host} className="arena"/>
    {menuOpen ? <div className={`backdrop${overMatch ? ' over-match' : ''}`}>{screen === 'home' && !room && !queuing && !practiceActive && <svg aria-hidden="true" viewBox="0 0 1440 900" preserveAspectRatio="xMinYMin slice"><line x1="0" y1="330" x2="1440" y2="330" stroke="#14303d"/><line x1="460" y1="0" x2="460" y2="900" stroke="#14303d"/><circle cx="460" cy="330" r="236" fill="none" stroke="#e5212e" strokeOpacity="0.18" strokeWidth="1.5"/><circle cx="460" cy="330" r="300" fill="none" stroke="#14303d"/></svg>}</div> : <div className="vignette"/>}
    {(hud.locked || showResults) && <CombatHud hud={hud} room={room} ownId={me?.id} settings={settings}/>}
    {hud.locked && <Crosshair settings={settings}/>}{settings.diagnostics && <Diagnostics hud={hud}/>}
    {room?.paused && <div className="network-warning" role="status">{matchMessage(room)}</div>}
    {room && hud.diagnostics && hud.diagnostics.snapshotAge > 1000 && <div className="network-warning" role="status">Connection stalled - movement and firing paused</div>}
    {room && showResults && <RoundResults room={room} ownId={me?.id} close={()=>setDismissedMatch(room.matchId??'')}/>}
    {practiceSummary && <PracticeResults summary={practiceSummary} close={()=>setPracticeSummary(null)} again={startPractice}/>}
    {menuOpen && <><TopBar account={account} progress={progress} room={room} queuing={queuing} ping={hud.ping} fps={hud.fps} fullscreen={fullscreen} toggleFullscreen={() => void toggleFullscreen()} home={home} openAccount={() => setScreen('account')} openSettings={() => setScreen('settings')}/>
      <main className="screen">{view}</main></>}
    {menuOpen && error && <p role="alert" className="toast-error">{error}</p>}
  </>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
