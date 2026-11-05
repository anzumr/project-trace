// Ramps simulated players in guest private rooms and reports when the server stops keeping up.
// Usage: node --import tsx scripts/load-test.ts [--url https://krazer.io] [--step 10] [--max 200] [--hold 20]
// Without --url it starts its own server in a separate process with result saving disabled.
// Bots aim upward so rounds never end in a kill: matches keep running and only save a result when the bots leave.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents, Snapshot, PlayerInput, RoomReply } from '../packages/shared/src/protocol';

const arg = (name: string, fallback: string) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : fallback; };

type Bot = { socket: Socket<ServerEvents, ClientEvents>; snapshot?: Snapshot; seq: number; gaps: number[]; last: number; rtts: number[]; ticks: [number, number][]; timer?: ReturnType<typeof setInterval>; drive: { forward: number; strafe: number; yaw: number; until: number } };
const pct = (values: number[], p: number) => { if (!values.length) return NaN; const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function run() {
  const step = Number(arg('step', '10')), max = Number(arg('max', '200')), hold = Number(arg('hold', '20')) * 1000;
  let url = arg('url', ''), server: ChildProcess | undefined, cpu: number[] = [];
  if (!url) {
    const port = 3901; url = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['--import', 'tsx', 'scripts/load-test.ts', '--serve', '--port', String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise<void>((resolve, reject) => { server!.stdout!.on('data', d => { if (String(d).includes('ready')) resolve(); }); server!.once('exit', () => reject(new Error('Load server exited'))); });
    server.stdout!.on('data', d => { for (const line of String(d).split(/\r?\n/)) if (line.startsWith('{"cpu"')) cpu.push(JSON.parse(line).cpu); });
  } else {
    // Wake a sleeping free-tier instance before measuring.
    for (let i = 0; i < 30; i++) { try { if ((await fetch(url + '/health')).ok) break; } catch { /* still waking */ } await sleep(3000); }
  }
  console.log(`Target ${url} · +${step} players every ${hold / 1000}s up to ${max}`);
  const bots: Bot[] = [];
  let lag: number[] = [], expected = performance.now() + 50;
  const lagTimer = setInterval(() => { const now = performance.now(); lag.push(Math.max(0, now - expected)); expected = now + 50; }, 50);
  const connect = async () => {
    const socket: Bot['socket'] = io(url, { transports: ['websocket'], reconnection: false, forceNew: true });
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    const bot: Bot = { socket, seq: 0, gaps: [], last: 0, rtts: [], ticks: [], drive: { forward: 0, strafe: 0, yaw: Math.random() * 6, until: 0 } };
    socket.on('snapshot', s => { const now = performance.now(); if (bot.last) bot.gaps.push(now - bot.last); bot.last = now; bot.snapshot = s; bot.ticks.push([now, s.tick]); });
    return bot;
  };
  const drive = (bot: Bot) => {
    const s = bot.snapshot; if (!s || (s.phase !== 'live' && s.phase !== 'suddenDeath') || !bot.socket.connected) return;
    const now = performance.now(), d = bot.drive;
    if (now > d.until) { d.forward = [-1, 0, 1][Math.floor(Math.random() * 3)]; d.strafe = [-1, 0, 1][Math.floor(Math.random() * 3)]; d.until = now + 300 + Math.random() * 900; }
    d.yaw = (d.yaw + 0.02) % (Math.PI * 2);
    // Pitch 1.4 rad looks at the sky: firing exercises the hit tests without ever ending a round.
    const input: PlayerInput = { seq: ++bot.seq, forward: d.forward, strafe: d.strafe, yaw: d.yaw, pitch: 1.4, jump: Math.random() < 0.01, crouch: Math.random() < 0.2, firing: true, active: true, view: Math.max(0, s.tick - 6) };
    bot.socket.emit('input', input);
  };
  const addMatch = async (index: number) => {
    const [a, b] = [await connect(), await connect()];
    bots.push(a, b);
    const made = await new Promise<RoomReply>(r => a.socket.emit('create', r));
    if (!made.ok || !made.snapshot) throw new Error(made.error ?? 'create failed');
    const joined = await new Promise<RoomReply>(r => b.socket.emit('join', made.snapshot!.code, r));
    if (!joined.ok) throw new Error(joined.error ?? 'join failed');
    a.socket.emit('setName', `loadtest-${index}a`); b.socket.emit('setName', `loadtest-${index}b`);
    await sleep(600); a.socket.emit('ready', 0); b.socket.emit('ready', 0);
    for (const bot of [a, b]) bot.timer = setInterval(() => drive(bot), 1000 / 60);
  };
  const pings = setInterval(() => { for (const bot of bots) { if (!bot.socket.connected) continue; const sent = performance.now(); bot.socket.timeout(5000).emit('pingCheck', (err: Error | null) => { if (!err) bot.rtts.push(performance.now() - sent); }); } }, 2000);
  const rows: string[] = [];
  let baseline: number | undefined, healthy = 0, stop = '', skippedBefore = 0;
  console.log(`players  rooms  tick/s  tickMs  skipped  snap-gap p95/max  ping p50/p95  client-lag p95  ${server ? 'server CPU  ' : ''}status`);
  try {
    for (let target = step; target <= max && !stop; target += step) {
      try { while (bots.length < target) await addMatch(bots.length / 2); }
      catch (error) { stop = `could not add more players: ${error instanceof Error ? error.message : error}`; if (bots.length === 0) break; }
      await sleep(5000); // let countdowns finish before measuring
      for (const bot of bots) { bot.gaps = []; bot.rtts = []; bot.ticks = []; } lag = []; cpu = [];
      await sleep(hold);
      const live = bots.filter(b => b.socket.connected && b.ticks.length > 1);
      const rates = live.filter((_, i) => i % 2 === 0).map(b => (b.ticks.at(-1)![1] - b.ticks[0][1]) / ((b.ticks.at(-1)![0] - b.ticks[0][0]) / 1000));
      const gaps = live.flatMap(b => b.gaps), rtts = live.flatMap(b => b.rtts), metrics = live.find(b => b.snapshot?.serverMetrics)?.snapshot?.serverMetrics;
      const skipped = (metrics?.skippedTicks ?? 0) - skippedBefore; skippedBefore = metrics?.skippedTicks ?? 0;
      const tickRate = pct(rates, 10), p95 = pct(rtts, 95);
      baseline ??= p95;
      const problems = [tickRate < 58 && 'server tick rate below 58/s', skipped > hold / 1000 * 60 * 0.01 && 'over 1% of ticks skipped', pct(gaps, 95) > 100 && 'snapshots late', p95 > baseline + 50 && 'ping up 50+ ms', live.length < bots.length && 'players dropped'].filter(Boolean);
      const clientBusy = pct(lag, 95) > 30;
      const row = `${String(bots.length).padStart(7)}  ${String(bots.length / 2).padStart(5)}  ${tickRate.toFixed(1).padStart(6)}  ${(metrics?.tickMs ?? NaN).toFixed(2).padStart(6)}  ${String(skipped).padStart(7)}  ${pct(gaps, 95).toFixed(0).padStart(8)} / ${Math.max(0, ...gaps).toFixed(0).padEnd(5)}  ${pct(rtts, 50).toFixed(0).padStart(5)} / ${p95.toFixed(0).padEnd(5)}  ${pct(lag, 95).toFixed(0).padStart(13)}  ${server ? `${(cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length)).toFixed(1).padStart(9)}%  ` : ''}${problems.length ? 'DEGRADED: ' + problems.join(', ') : 'ok'}${clientBusy ? ' (load generator busy: numbers unreliable)' : ''}`;
      console.log(row); rows.push(row);
      if (problems.length) { stop = `degraded at ${bots.length} players`; } else healthy = bots.length;
    }
  } finally {
    clearInterval(pings); clearInterval(lagTimer);
    for (const bot of bots) { clearInterval(bot.timer); bot.socket.disconnect(); }
    await sleep(500); server?.kill('SIGTERM');
  }
  console.log(`\nLast healthy level: ${healthy} players (${healthy / 2} matches).${stop ? ' Stopped: ' + stop + '.' : ' Reached the requested maximum.'}`);
  process.exit(0);
}

if (process.argv.includes('--serve')) {
  const { createGameServer } = await import('../apps/server/src/server');
  const dir = await mkdtemp(join(tmpdir(), 'load-outbox-'));
  const game = createGameServer({ resultSink: async () => {}, outboxDirectory: dir, rankLookup: null });
  game.http.listen(Number(arg('port', '3901')), '127.0.0.1', () => console.log('ready'));
  // Whole-process CPU (simulation, serialization and sockets) as a percentage of one core.
  let usage = process.cpuUsage(), at = performance.now();
  setInterval(() => { const used = process.cpuUsage(usage), now = performance.now(); console.log(JSON.stringify({ cpu: (used.user + used.system) / 10 / (now - at) })); usage = process.cpuUsage(); at = now; }, 1000);
  process.on('SIGTERM', () => void game.close().then(() => rm(dir, { recursive: true, force: true })).then(() => process.exit(0)));
} else await run();
