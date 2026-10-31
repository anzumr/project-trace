import { CombatHud, RoundResults, PracticeResults } from './ui/CombatHud';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Engine, type Hud, type PracticeSummary } from './game/Engine';
import './style.css';
import { loadSettings } from './ui/settings';
import { SettingsPanel } from './ui/SettingsPanel';
import { useAccount } from './auth/useAccount';
import { AccountPanel } from './auth/AccountPanel';
import { Diagnostics } from './ui/Diagnostics';
import { Crosshair } from './ui/Crosshair';
import { ModePicker } from './ui/ModePicker';
import { MODES } from '@trace/shared';
import { matchMessage } from './ui/MatchStatus';
import { QuickPlay } from './ui/QuickPlay';
import type { QueueState, Snapshot } from '@trace/shared/protocol';

function App() {
  const account = useAccount();
  const [queue, setQueue] = useState<QueueState>({ state: 'idle', elapsedMs: 0, botEligible: false, serverTime: 0 });
  const queuing = queue.state !== 'idle';
  const host = useRef<HTMLDivElement>(null), engine = useRef<Engine | null>(null);
  const [settings, setSettings] = useState(loadSettings), [tab, setTab] = useState<'play' | 'online' | 'settings' | 'account'>('online');
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
  useEffect(() => { if (account.recovery) setTab('account'); }, [account.recovery]);
  useEffect(() => { if (room && room.kind !== 'private') setTab('online'); }, [room?.code]);
  const enter = () => { setError(''); void engine.current?.engage(); };
  const openRoom = async (join?: string) => { setError(''); setBusy(true); await engine.current?.network.room(join, playerName); setBusy(false); };
  const me = room?.players.find(p => p.id === engine.current?.network.id);
  const opponent = room?.players.find(p => p.id !== me?.id);
  const result = room?.resultStatus === 'cancelled' ? 'Match cancelled.' : room?.winner ? room.winner === me?.id ? 'You win.' : 'Opponent wins.' : 'Draw.';
  const showResults=room?.resultStatus!=='cancelled' && !!room?.lastRound && (room.phase==='roundEnd' || (room.phase==='finished' && dismissedMatch!==room.matchId));
  const combatVisible=hud.locked || (!!room && !['lobby','finished'].includes(room.phase));
  return <><div ref={host} className="arena"/><div className="vignette"/>
    <header className={combatVisible?"playing-header":""}><a className="brand" href="./">T<span>R</span>ACE<i> / FIELD LAB</i></a><div className="badge"><b/> {room ? `ROOM ${room.code} · ${Math.round(hud.ping)} MS` : 'OFFLINE PRACTICE'}</div><div className="display-controls">{!hud.locked && <button onClick={() => setTab('account')}>{account.profile?.username_display || (account.session ? 'Finish account setup' : 'Guest · Sign in')}</button>}{!hud.locked && <button onClick={() => void toggleFullscreen()}>{fullscreen ? 'Exit fullscreen' : 'Fullscreen'} ⛶</button>}<span className="fps" aria-label={`${Math.round(hud.fps)} frames per second`}><strong>{Math.round(hud.fps)}</strong> FPS</span></div></header>
    {combatVisible && <CombatHud hud={hud} room={room} ownId={me?.id} settings={settings}/>}
    {hud.locked && <Crosshair settings={settings}/>}{settings.diagnostics && <Diagnostics hud={hud}/>}
    {room?.paused && <div className="network-warning" role="status">{matchMessage(room)}</div>}
    {room && hud.diagnostics && hud.diagnostics.snapshotAge > 1000 && <div className="network-warning" role="status">Connection stalled - movement and firing paused</div>}
    {room && showResults && <RoundResults room={room} ownId={me?.id} close={()=>setDismissedMatch(room.matchId??'')}/>}
    {practiceSummary && <PracticeResults summary={practiceSummary} close={()=>setPracticeSummary(null)}/>}
    {!hud.locked && !showResults && !practiceSummary && <main><section className="panel"><div className="eyebrow">THE TRACKING LAB / 005</div><h1>{room?.phase === 'finished' ? <>Duel<br/><span>complete.</span></> : <>Stay on<br/><span>target.</span></>}</h1><p>Move. Dodge. Hold Mouse 1.<br/>Every moment on target counts.</p><div className="tabs"><button className={tab === 'online' ? 'selected' : ''} onClick={() => setTab('online')}>1v1 Duel</button><button disabled={!!room} className={tab === 'play' ? 'selected' : ''} onClick={() => setTab('play')}>Practice</button><button className={tab === 'settings' ? 'selected' : ''} onClick={() => setTab('settings')}>Settings</button><button className={tab === 'account' ? 'selected' : ''} onClick={() => setTab('account')}>Account</button></div>
    {tab === 'account' ? <AccountPanel account={account} inRoom={!!room || queuing}/> : tab === 'online' ? room ? <div className="lobby"><div className="room-code"><small>{room.kind === 'ai' ? 'EXTRA HARD AI · BOT MATCH' : room.kind === 'public' ? 'PUBLIC HUMAN MATCH' : 'SHARE THIS ROOM CODE'}</small><strong>{room.code}</strong></div><p className="note">Best of 3 · 90-second rounds</p><ModePicker room={room} ownId={me?.id} choose={mode => engine.current?.network.selectMode(mode)}/><div className="roster">{room.players.map(p => <div key={p.id}><span>{p.name}{p.bot ? ' · BOT' : p.registered ? ' · Account' : ' · Guest'}{p.id === me?.id ? ' (you)' : ''} · {p.wins} wins</span><b>{p.connected === false ? 'RECONNECTING' : p.ready ? 'READY' : 'CONNECTED'}</b></div>)}{room.players.length < 2 && <div>Waiting for opponent…</div>}</div>{room.phase === 'finished' && <><h2>{result}</h2><p className="note">{room.reason}</p><p className="note">{room.resultStatus === "cancelled" ? "No wins or XP awarded." : room.resultState === "saved" ? "Result saved to your account." : room.resultState === "pending" ? "Saving result…" : room.resultState === "retrying" ? "Result save delayed — server will retry." : "Persistent results unavailable on this server."}</p><p className="note">Damage dealt: {me?.damage.toFixed(1)} · Tracking: {me?.trackingSeconds.toFixed(2)} s</p><p className="note">On-target firing time: {me && me.firingSeconds > 0 ? `${(100 * me.trackingSeconds / me.firingSeconds).toFixed(1)}%` : '—'}</p></>}{!['lobby', 'finished'].includes(room.phase) ? <><p className="note">{matchMessage(room)}. Escape releases your mouse; the match keeps running.</p><button className="primary" onClick={enter}>Enter duel ↗</button></> : <button className="primary" disabled={room.paused || room.players.length !== 2 || me?.ready || (room.kind !== 'private' && room.phase === 'finished')} onClick={() => { engine.current?.network.ready(); enter(); }}>{me?.ready ? 'Waiting for opponent to ready…' : room.phase === 'finished' ? room.kind === 'private' ? 'Approve mode & rematch' : 'Match complete — leave to find another' : 'Approve mode & ready'}</button>}<button className="reset" onClick={() => { engine.current?.network.leave(); setError(''); }}>Leave room</button></div> : <><QuickPlay queue={queue} network={engine.current?.network} enabled={!!account.profile && !account.loading}/><div className="brief"><span className="number">02</span><div><strong>Private 1v1 duel</strong><small>Two players · server-confirmed damage</small></div></div><p className="note">{account.session ? account.profile ? `Playing as ${account.profile.username_display}` : "Open Account to finish username setup before joining." : "Guest play · Sign in from Account to claim your identity."}</p><label className="player-name">Your name<input maxLength={20} disabled={!!account.session} value={account.profile?.username_display || playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Player name"/></label><button className="primary" disabled={queuing || busy || !engine.current || account.loading || (!!account.session && !account.profile)} onClick={() => void openRoom()}>Create room ↗</button><form className="join" onSubmit={e => { e.preventDefault(); void openRoom(code); }}><input aria-label="Room code" placeholder="ROOM CODE" value={code} maxLength={5} onChange={e => setCode(e.target.value.toUpperCase())}/><button disabled={queuing || busy || code.length !== 5 || account.loading || (!!account.session && !account.profile)}>Join room</button></form><p className="note">Share your code with another player on the same running server. Ready captures your mouse. Both ready starts a three-second countdown.</p></> : tab === 'play' ? <><div className="brief"><span className="number">01</span><div><strong>Endless progression</strong><small>Faster → smaller → repeat · 100 HP each</small></div></div><p className="note">Each kill spawns the next bot: first faster, then smaller at the same speed. Eventually face a small, fast orb for as long as you want. Hold Mouse 1 to fire.</p><button className="primary" disabled={!!error && !engine.current} onClick={enter}>{hud.damage > 0 ? 'Resume practice' : 'Enter arena'} <span>↗</span></button><button className="reset" onClick={() => { engine.current?.reset(); enter(); }}>Restart progression & position</button><button className="reset" onClick={()=>{const summary=engine.current?.endPractice();if(summary)setPracticeSummary(summary);}}>End practice & view session</button></> : <SettingsPanel settings={settings} change={setSettings} exportReport={() => engine.current?.exportDiagnostics()}/>}
    {error && <p role="alert" className="error">{error}</p>}<div className="controls"><span><kbd>WASD</kbd> Move</span><span><kbd>SPACE</kbd> Jump</span><span><kbd>MOUSE</kbd> Aim</span></div></section><aside><div className="vertical">PRECISION IS A PRACTICE.</div><div className="arena-label"><small>ENVIRONMENT 01</small><h2>The proving ground</h2><p>Symmetric arena / Standard profile</p><div className="status"><b/> LOCAL SIMULATION · 60 HZ</div></div></aside></main>}
    {!hud.locked && !showResults && !practiceSummary && <div className="bottom-note">DESKTOP + MOUSE REQUIRED <span>FIRST PERSON · CONTINUOUS TRACKING</span></div>}
  </>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
