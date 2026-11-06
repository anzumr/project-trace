import { useState } from 'react';
import { CONFIG, MODES, type ModeId } from '@trace/shared';
import type { Network } from '../net/Network';
import { DIFFICULTIES, type Difficulty } from '@trace/shared/protocol';
import { BOW } from '@trace/shared/bow';
import type { PlayerRank } from '../auth/useProgress';
import { ModePreview } from './ModePicker';
import { RankedPanel } from './Ranked';
import { Arrow, Back, Duel, Target, Users } from './icons';

const modeList = Object.entries(MODES) as [ModeId, (typeof MODES)[ModeId]][];
const max = { scale: Math.max(...modeList.map(([, m]) => m.scale)), speed: Math.max(...modeList.map(([, m]) => m.speed)), jump: Math.max(...modeList.map(([, m]) => m.jump)) };
const Stat = ({ label, value, top }: { label: string; value: number; top: number }) => <span className="stat-line">{label}<span className="bar"><i style={{ width: `${100 * value / top}%` }}/></span><b>{value}×</b></span>;

export function PlayScreen({ network, quickPlay, signedIn, username, rank, xp, roomBlocked, busy, playerName, setPlayerName, code, setCode, createRoom, joinRoom, bowPractice, practice, practiceStarted, wave, back, openAccount }: {
  network?: Network; quickPlay: boolean; signedIn: boolean; username?: string; rank: PlayerRank | null; xp: number; roomBlocked: boolean; busy: boolean;
  playerName: string; setPlayerName: (name: string) => void; code: string; setCode: (code: string) => void;
  createRoom: () => void; joinRoom: () => void; bowPractice: (difficulty: Difficulty) => void; practice: () => void; practiceStarted: boolean; wave: number; back: () => void; openAccount: () => void;
}) {
  const [mode, setMode] = useState<ModeId>('standard'), [searching, setSearching] = useState(false);
  const find = async () => { setSearching(true); try { await network!.findMatch(mode); } finally { setSearching(false); } };
  const ranked = async () => { setSearching(true); try { await network!.findRanked(); } finally { setSearching(false); } };
  return <div className="wrap">
    <button className="back-link" onClick={back}><Back size={16}/>MAIN MENU</button>
    <div className="page-head"><h1 className="display">Play</h1><p>Choose how to play. In Quick Play, both players use the character mode you queue for.</p></div>

    <RankedPanel rank={rank} xp={xp} eligible={quickPlay} signedIn={signedIn} busy={!network || searching || busy} find={() => void ranked()} openAccount={openAccount}/>

    <div className="mode-cards">
      <section className="mode-card featured" aria-label="Quick Play">
        <div className="top"><Duel size={30} color="var(--accent)"/><span className="tag">RECOMMENDED</span></div>
        <h3>QUICK PLAY</h3>
        <p>Public 1v1 against a real player. Best of {CONFIG.winsRequired * 2 - 1}, {CONFIG.roundSeconds}-second rounds.</p>
        <span className="meta">{quickPlay ? 'PICK A CHARACTER MODE BELOW · EARNS XP' : 'SIGN-IN REQUIRED · EARNS XP'}</span>
      </section>

      <section className="mode-card" aria-label="Private room">
        <div className="top"><Users size={30} color="var(--text-2)"/></div>
        <h3>PRIVATE ROOM</h3>
        <p>Create a room and share its code, or join a friend's. {signedIn ? (username ? `Playing as ${username}.` : 'Claim your username first.') : 'Guests welcome.'}</p>
        {!signedIn && <label><span className="sr-only">Your name</span><input className="text-input" maxLength={20} value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Your name (optional)"/></label>}
        <form className="room-form" onSubmit={e => { e.preventDefault(); joinRoom(); }}>
          <button type="button" className="btn-dark" disabled={roomBlocked} onClick={createRoom}>Create room</button>
          <input className="text-input code" aria-label="Room code" placeholder="ROOM CODE" value={code} maxLength={5} onChange={e => setCode(e.target.value.toUpperCase())}/>
          <button className="btn-light" disabled={roomBlocked || code.length !== 5}>Join</button>
        </form>
      </section>

      <button className="mode-card" onClick={practice}>
        <span className="top"><Target size={30} color="var(--text-2)"/></span>
        <h3>PRACTICE</h3>
        <p>Endless offline waves. Targets get faster, then smaller, until they become a micro-orb.</p>
        <span className="meta">{practiceStarted ? `RESUME · WAVE ${wave}` : 'NO ACCOUNT NEEDED · NOT RECORDED'}</span>
      </button>

      <section className="mode-card wide" aria-label="Bow practice">
        <div className="top"><Target size={30} color="var(--text-2)"/></div>
        <div><h3>BOW PRACTICE</h3><p>Bow 1v1 against an archer bot, first to {BOW.kills} kills. Easy misses a lot; Hard leads its shots and air-jumps out of your aim. Not recorded.</p></div>
        <div className="difficulty-row" role="group" aria-label="Bot difficulty">{DIFFICULTIES.map(d => <button key={d} type="button" className="btn-dark" disabled={roomBlocked} onClick={() => bowPractice(d)}>{d[0].toUpperCase() + d.slice(1)}</button>)}</div>
      </section>
    </div>

    <div className="section-head"><h2 className="eyebrow">QUICK PLAY · CHARACTER MODE</h2><span>Size, speed and jump change together. Both players always share the same mode.</span></div>
    <div className="queue-layout">
      <div className="char-grid" role="group" aria-label="Character mode">{modeList.map(([id, m]) => <button key={id} className="char-card" aria-pressed={mode === id} onClick={() => setMode(id)}>
        <span className="size">{m.scale}×<small>SIZE</small></span>
        <h3>{m.label.toUpperCase()}</h3>
        <span className="tag">{m.difficulty.toUpperCase()}</span>
        <Stat label="SIZE" value={m.scale} top={max.scale}/><Stat label="SPEED" value={m.speed} top={max.speed}/><Stat label="JUMP" value={m.jump} top={max.jump}/>
      </button>)}</div>
      <section className="card queue-summary" aria-label="Queue summary">
        <h2 className="card-title">READY TO QUEUE</h2>
        <ModePreview mode={mode}/>
        <dl className="summary-rows"><dt>MODE</dt><dd>Quick Play</dd><dt>CHARACTER</dt><dd>{MODES[mode].label}</dd><dt>FORMAT</dt><dd>Best of {CONFIG.winsRequired * 2 - 1} · {CONFIG.roundSeconds} s rounds</dd></dl>
        {quickPlay
          ? <button className="btn-primary" disabled={!network || searching || busy} onClick={() => void find()}><strong>FIND MATCH</strong><Arrow size={24}/></button>
          : <button className="btn-light" onClick={openAccount}>{signedIn ? 'Claim your username to play' : 'Sign in to play Quick Play'}</button>}
        <p className="note">If no human is found within five minutes, you can opt into an Extra Hard AI match.</p>
      </section>
    </div>
  </div>;
}
