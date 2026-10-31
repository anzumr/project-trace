import { emptyCombat, measureCombat, type RoundCombat } from '@trace/shared/combat';
import { CONFIG, COVER, spawn, move, rayBox, MODES, isMode, type ModeId, type Vec3 } from '@trace/shared';
import { BOT_MODEL, HEADSHOT_MULTIPLIER, tracePracticeModel } from '@trace/shared/practice';
import { neutralInput, validateInput, type PlayerInput, type PlayerState, type Snapshot } from '@trace/shared/protocol';
import { randomUUID } from 'node:crypto';
import { ExtraHardAI, visiblePoint } from './ExtraHardAI';
import type { MatchKind, MatchResult } from './Results';

/** Shots may rewind the target up to this far to match what the shooter saw (interpolation delay plus latency). */
export const MAX_REWIND_TICKS = Math.round(0.3 / CONFIG.tick);
type Participant = { opportunity: number; received: number; play: number; accountId?: string; state: PlayerState; queue: PlayerInput[]; input: PlayerInput; lastInput: number; lastSeq: number; packets: number; rateStart: number };
export class Room {
  lastRound: RoundCombat | undefined;
  private rounds: RoundCombat[] = [];
  private history: { tick: number; bodies: Map<string, Vec3> }[] = [];
  readonly kind: MatchKind;
  matchId = randomUUID();
  resultState: Snapshot['resultState'] = 'unavailable';
  resultStatus: Snapshot['resultStatus'];
  private startedAt = new Date().toISOString();
  private finalized = false;
  private liveTicks = 0;
  private ai: { id: string; brain: ExtraHardAI } | undefined;
  get paused() { return this.kind !== 'private' && this.phase !== 'finished' && [...this.players.values()].some(p => p.state.connected === false); }
  readonly players = new Map<string, Participant>();
  phase: Snapshot['phase'] = 'lobby';
  winner: string | null = null;
  reason = '';
  tick = 0;
  match = 0;
  mode: ModeId = 'standard';
  modeRevision = 0;
  get hostId() { return this.players.keys().next().value ?? ''; }
  selectMode(id: string, value: unknown) {
    if (this.kind !== 'private') return false;
    if (id !== this.hostId || !isMode(value) || !['lobby', 'finished'].includes(this.phase)) return false;
    if (value !== this.mode) { this.mode = value; this.modeRevision++; this.clearInputs(); }
    return true;
  }
  round = 0;
  roundSerial = 0;
  roundWinner: string | null = null;
  private remainingTicks = 0;
  constructor(readonly code: string, private options: { kind?: MatchKind; onResult?: (result: MatchResult, room: Room) => void } = {}) { this.kind = options.kind ?? 'private'; }
  addBot() {
    const id = randomUUID(); if (!this.add(id)) return;
    const p = this.players.get(id)!; p.state.name = 'Extra Hard AI [BOT]'; p.state.bot = true;
    this.ai = { id, brain: new ExtraHardAI() };
  }
  setConnected(id: string, connected: boolean) {
    const p = this.players.get(id); if (!p) return;
    p.state.connected = connected;
    this.players.forEach(player => { player.queue = []; player.input = neutralInput(); player.state.hit = false; player.state.headshot = false; if(player.state.roundStats)player.state.roundStats.streak=0; if(player.state.matchStats)player.state.matchStats.streak=0; player.lastInput = 0; });
    if (connected) { p.lastSeq = -1; p.state.ack = 0; }
  }
  forfeit(id: string, reason = 'Opponent left or reconnect grace expired.') {
    if (this.phase === 'finished') return;
    this.winner = [...this.players.keys()].find(key => key !== id) ?? null;
    if(this.kind!=='private' && this.liveTicks===0)this.winner=null;
    if(this.phase==='live' || this.phase==='suddenDeath')this.captureRound(this.winner,reason);
    this.phase = 'finished'; this.reason = reason; this.remainingTicks = 0; this.clearInputs();
    this.finishResult(this.liveTicks > 0 ? 'forfeit' : 'cancelled');
  }
  cancel(reason: string) {
    if(this.phase==='finished')return;
    this.phase='finished';this.winner=null;this.reason=reason;this.remainingTicks=0;this.clearInputs();this.finishResult('cancelled');
  }
  private finishResult(status: MatchResult['status']) {
    this.resultStatus = status;
    if (this.finalized || this.match === 0) return;
    this.finalized = true;
    const result: MatchResult = { id: this.matchId, kind: this.kind, mode: this.mode, status, startedAt: this.startedAt, completedAt: new Date().toISOString(), reason: this.reason,
      players: [...this.players.values()].map(p => ({ combat: p.state.matchStats, rounds: this.rounds.map(r => ({...r, players:r.players.filter(v=>v.id===p.state.id)})), playerId: p.state.id, userId: p.accountId ?? null, name: p.state.name, bot: !!p.state.bot,
        outcome: status === 'cancelled' ? 'cancelled' : p.state.id === this.winner ? 'win' : 'loss', roundsWon: p.state.wins,
        damageMilli: Math.round(p.state.damage * 1000), receivedMilli: Math.round(p.received * 1000), trackingMs: Math.round(p.state.trackingSeconds * 1000), opportunityMs: Math.round(p.opportunity * 1000), playMs: Math.round(p.play * 1000) })) };
    this.options.onResult?.(result, this);
  }
  add(id: string, identity?: { userId: string; username: string }) {
    if (this.players.size >= 2 || this.phase !== 'lobby') return false;
    if (identity && [...this.players.values()].some(p => p.accountId === identity.userId)) return false;
    const body = spawn(); const guest = this.players.size === 1;
    body.x = guest ? -5 : 5; body.z = guest ? -9 : 9;
    const yaw = guest ? -Math.PI : 0;
    this.players.set(id, { opportunity: 0, received: 0, play: 0, state: { roundStats: emptyCombat(), matchStats: emptyCombat(), kills: 0, maxHp: CONFIG.hp, connected: true, id, name: guest ? 'Player 2' : 'Player 1', wins: 0, body, yaw, pitch: 0, hp: CONFIG.hp, ready: false, ack: 0, hit: false, headshot: false, damage: 0, trackingSeconds: 0, firingSeconds: 0 }, queue: [], input: neutralInput(), lastInput: 0, lastSeq: -1, packets: 0, rateStart: 0 });
    const player = this.players.get(id)!;
    player.accountId = identity?.userId;
    player.state.registered = !!identity;
    if (identity) player.state.name = identity.username;
    return true;
  }
  ready(id: string, revision = this.modeRevision) {
    if (this.paused || (this.kind !== 'private' && this.phase === 'finished')) return;
    if (revision !== this.modeRevision) return;
    const p = this.players.get(id); if (!p || !['lobby', 'finished'].includes(this.phase) || this.players.size !== 2) return;
    p.state.ready = true;
    if (this.ai) this.players.get(this.ai.id)!.state.ready = true;
    if ([...this.players.values()].every(p => p.state.ready)) {
      this.winner = null; this.match++;
      this.matchId = randomUUID(); this.startedAt = new Date().toISOString(); this.finalized = false; this.liveTicks = 0; this.resultState = 'unavailable';
      this.resultStatus = undefined; this.rounds = []; this.lastRound = undefined;
      this.players.forEach(p => { p.opportunity = 0; p.received = 0; p.play = 0; });
      this.players.forEach(p => Object.assign(p.state, { wins: 0, damage: 0, trackingSeconds: 0, firingSeconds: 0, matchStats: emptyCombat(), kills: 0 }));
      this.startRound();
    }
  }
  setName(id: string, value: unknown) {
    const p = this.players.get(id);
    if (!p || p.accountId || typeof value !== 'string' || value.length > 100 || !['lobby', 'finished'].includes(this.phase)) return;
    const name = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 20);
    if (name) p.state.name = name;
  }
  private clearInputs() {
    this.players.forEach(p => { p.queue = []; p.input = neutralInput(p.lastSeq); p.state.ack = Math.max(0, p.lastSeq); p.lastInput = 0; p.state.hit = false; p.state.headshot = false; p.state.ready = false; });
  }
  private startRound() {
    this.ai?.brain.reset();
    this.phase = 'countdown'; this.remainingTicks = Math.round(CONFIG.countdownSeconds / CONFIG.tick); this.history = [];
    this.round = 1 + [...this.players.values()].reduce((total, p) => total + p.state.wins, 0);
    this.roundSerial++; this.roundWinner = null; this.reason = '';
    this.clearInputs();
    [...this.players.values()].forEach((p, i) => {
      p.state.body = { ...spawn(), x: i ? -5 : 5, z: i ? -9 : 9 };
      Object.assign(p.state, { roundStats: emptyCombat(), hp: CONFIG.hp, yaw: i ? -Math.PI : 0, pitch: 0 });
    });
  }
  /** Target position at the client's rendered tick, interpolated and clamped to this round's recent history. */
  private rewind(id: string, view: number | undefined): Vec3 {
    const latest = this.history[this.history.length - 1].bodies.get(id)!;
    if (view === undefined) return latest;
    const at = Math.max(this.history[0].tick, Math.min(this.tick, view));
    const after = this.history.findIndex(h => h.tick >= at);
    const b = this.history[after], a = this.history[Math.max(0, after - 1)];
    const from = a.bodies.get(id)!, to = b.bodies.get(id)!, t = b.tick === a.tick ? 1 : (at - a.tick) / (b.tick - a.tick);
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t };
  }
  private captureRound(winner:string|null,reason:string) {
    this.lastRound = { serial:this.roundSerial, round:this.round, winner, reason, duration:[...this.players.values()][0].state.roundStats!.duration,
      players:[...this.players.values()].map(p=>({id:p.state.id,name:p.state.name,hp:p.state.hp,wins:p.state.wins,stats:{...p.state.roundStats!}})) };
    this.rounds.push(this.lastRound);
    if(this.rounds.length>128)this.rounds.shift();
  }
  private endRound(winner: string | null, reason: string) {
    this.roundWinner = winner; this.reason = reason;
    if (winner) this.players.get(winner)!.state.wins++;
    this.captureRound(winner,reason);
    this.players.forEach(p=>{p.state.matchStats!.streak=0;});
    this.clearInputs();
    if (winner && this.players.get(winner)!.state.wins >= CONFIG.winsRequired) {
      this.phase = 'finished'; this.winner = winner; this.remainingTicks = 0;
      this.finishResult('completed');
    } else { this.phase = 'roundEnd'; this.remainingTicks = Math.round(CONFIG.roundSummarySeconds / CONFIG.tick); }
  }
  accept(id: string, raw: unknown, now: number) {
    const p = this.players.get(id); if (!p || !validateInput(raw) || raw.seq <= p.lastSeq) return false;
    if (now - p.rateStart >= 1000) { p.rateStart = now; p.packets = 0; }
    if (++p.packets > 100) return false;
    p.lastSeq = raw.seq; p.lastInput = now;
    // Select fields explicitly: client position, HP and hit assertions never enter state.
    const input: PlayerInput = { seq: raw.seq, forward: raw.forward, strafe: raw.strafe, yaw: raw.yaw, pitch: raw.pitch, jump: raw.jump, firing: raw.firing, active: raw.active, view: raw.view };
    if (!input.firing) { p.input.firing = false; p.queue.forEach(queued => { queued.firing = false; }); }
    if (!input.active) { p.queue = []; p.input = { ...input, forward: 0, strafe: 0, firing: false, jump: false }; p.state.ack = input.seq; p.state.hit = false; p.state.headshot = false; return true; }
    if (this.phase !== 'live' && this.phase !== 'suddenDeath') return false;
    if (p.queue.length >= 12) p.queue.shift();
    p.queue.push(input);
    return true;
  }
  step(now: number) {
    if (this.paused) return;
    this.tick++;
    if (this.phase === 'countdown') {
      if (--this.remainingTicks <= 0) { this.phase = 'live'; this.remainingTicks = Math.round(CONFIG.roundSeconds / CONFIG.tick); this.clearInputs(); }
      return;
    }
    if (this.phase === 'roundEnd') { if (--this.remainingTicks <= 0) this.startRound(); return; }
    if (this.phase !== 'live' && this.phase !== 'suddenDeath') return;
    const players = [...this.players.values()];
    if (players.length !== 2) return;
    this.liveTicks++;
    if (this.ai) {
      const bot = this.players.get(this.ai.id)!, opponent = players.find(p => p !== bot)!;
      this.accept(this.ai.id, this.ai.brain.input(bot.state, opponent.state, this.mode, now, bot.lastSeq + 1), now);
    }
    for (const p of players) {
      const next = p.queue.shift();
      if (next) { p.input = next; p.state.ack = next.seq; }
      else p.input = { ...p.input, jump: false };
      if (now - p.lastInput > 250) { p.input = neutralInput(p.state.ack); p.queue = []; }
      const input = p.input;
      move(p.state.body, input.active ? input : { forward: 0, strafe: 0, yaw: p.state.yaw, jump: false }, CONFIG.tick, [COVER], this.mode);
      if (input.active) { p.state.yaw = input.yaw; p.state.pitch = input.pitch; }
      p.state.hit = false; p.state.headshot = false;
      if (input.active && input.firing) p.state.firingSeconds += CONFIG.tick;
    }
    this.history.push({ tick: this.tick, bodies: new Map(players.map(p => [p.state.id, { x: p.state.body.x, y: p.state.body.y, z: p.state.body.z }])) });
    if (this.history.length > MAX_REWIND_TICKS + 1) this.history.shift();
    // Evaluate both rays against the same tick before applying simultaneous damage.
    const hits = players.map((p, index) => {
      const target = players[1 - index].state;
      const { yaw, pitch, body } = p.state;
      if (!p.input.active || !p.input.firing || p.state.hp <= 0 || target.hp <= 0) return null;
      const seen = this.rewind(target.id, p.input.view);
      const scale = MODES[this.mode].scale;
      const origin = { x: body.x, y: body.y + CONFIG.eyeHeight * scale, z: body.z };
      const direction = { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
      const result = tracePracticeModel(origin, direction,
        { x: seen.x, y: seen.y + BOT_MODEL.height * scale / 2, z: seen.z },
        { width: BOT_MODEL.width * scale, height: BOT_MODEL.height * scale, circle: false, speed: MODES[this.mode].speed });
      const cover = rayBox(origin, direction, COVER);
      return result && (cover === null || result.distance < cover) ? result : null;
    });
    const damageThisTick = [0,0];
    hits.forEach((hit, i) => { if (!hit) return; const a = players[i].state, b = players[1-i].state; a.hit = true; a.headshot = hit.region === 'head'; const hp = Math.max(0, b.hp - CONFIG.dps * CONFIG.tick * (a.headshot ? HEADSHOT_MULTIPLIER : 1)); damageThisTick[i] = b.hp - hp; if(b.hp > 0 && hp === 0)a.kills = (a.kills ?? 0) + 1; a.damage += b.hp - hp; a.trackingSeconds += CONFIG.tick; b.hp = hp; });
    players.forEach((p,i)=>{
      for(const stats of [p.state.roundStats!,p.state.matchStats!]) measureCombat(stats,CONFIG.tick,p.input.active && p.input.firing,damageThisTick[i],hits[i]?.region==='head',damageThisTick[1-i]);
    });
    players.forEach((p, i) => { p.play += CONFIG.tick; if (hits[i] || visiblePoint(p.state, players[1-i].state, this.mode)) p.opportunity += CONFIG.tick; });
    // Received damage is reconstructed from the opponent's confirmed cumulative damage.
    players.forEach((p, i) => { p.received = players[1-i].state.damage; });
    const dead = players.filter(p => p.state.hp <= 0);
    if (this.phase === 'suddenDeath' && hits.some(Boolean)) {
      this.endRound(hits.every(Boolean) ? null : players[hits[0] ? 0 : 1].state.id, hits.every(Boolean) ? 'Simultaneous sudden-death hits — replaying round.' : 'Sudden-death hit'); return;
    }
    if (dead.length) { this.endRound(dead.length === 2 ? null : players.find(p => p.state.hp > 0)!.state.id, dead.length === 2 ? 'Simultaneous KO — replaying round.' : 'Knockout'); return; }
    if (--this.remainingTicks <= 0) {
      if (this.phase === 'suddenDeath') { this.endRound(null, 'No sudden-death hit — replaying round.'); return; }
      if (players[0].state.hp === players[1].state.hp) { this.phase = 'suddenDeath'; this.remainingTicks = Math.round(CONFIG.suddenDeathSeconds / CONFIG.tick); this.reason = 'Tied health — first confirmed hit wins.'; }
      else this.endRound(players[0].state.hp > players[1].state.hp ? players[0].state.id : players[1].state.id, 'Time expired — higher health wins');
    }
  }
  remove(id: string) {
    if (this.phase !== 'lobby' && this.phase !== 'finished') this.forfeit(id);
    this.players.delete(id);
    if (this.phase !== 'lobby') { if (this.phase !== 'finished') this.winner = [...this.players.keys()][0] ?? null; this.phase = 'finished'; this.remainingTicks = 0; this.reason = 'Opponent disconnected or left. Return to menu to create another room.'; }
    this.players.forEach(p => { p.state.ready = false; p.state.hit = false; p.state.headshot = false; p.queue = []; p.input = neutralInput(); });
  }
  snapshot(): Snapshot { return { lastRound:this.lastRound, resultStatus: this.resultStatus, kind: this.kind, matchId: this.matchId, paused: this.paused, resultState: this.resultState, code: this.code, hostId: this.hostId, mode: this.mode, modeRevision: this.modeRevision, phase: this.phase, players: [...this.players.values()].map(p => structuredClone(p.state)), winner: this.winner, roundWinner: this.roundWinner, round: this.round, roundSerial: this.roundSerial, remaining: this.remainingTicks * CONFIG.tick, reason: this.reason, tick: this.tick, time: Date.now(), match: this.match }; }
}
