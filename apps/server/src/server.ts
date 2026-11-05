import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Server } from 'socket.io';
import { CONFIG } from '@trace/shared';
import type { ClientEvents, ServerEvents, RoomReply } from '@trace/shared/protocol';
import { Room } from './game/Room';
import { serveHttp } from './net/http';
import { TokenBucket } from './net/RateLimit';
import { resolve } from 'node:path';
import { ResultOutbox, providerResultSink, type ResultSink } from './ResultOutbox';
import { Matchmaking, type QueuePeer } from './Matchmaking';
import { verifyIdentity, accountOf, providerAccountDeleter, type VerifyIdentity, type Identity, type AccountOf, type DeleteAccount } from './auth';
import { clientNetwork, providerRankLookup, type RankLookup } from './ranks';
import type { MatchKind } from './game/Results';

export function createGameServer(options: { serveClient?: boolean; verifyIdentity?: VerifyIdentity; resultSink?: ResultSink; outboxDirectory?: string; queueClock?: () => number; rankLookup?: RankLookup | null; accountOf?: AccountOf; deleteAccount?: DeleteAccount | null } = {}) {
  const http = createServer((req, res) => { void serveHttp(req,res,!!options.serveClient).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();}); });
  const allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001').split(',').map(s => s.trim());
  const io = new Server<ClientEvents, ServerEvents>(http, { maxHttpBufferSize: 4096, cors: { origin: allowed }, allowRequest: (req, done) => done(null, !req.headers.origin || allowed.includes(req.headers.origin)) });
  const rooms = new Map<string, Room>();
  const outbox = new ResultOutbox(options.outboxDirectory ?? resolve('.trace-data/outbox'), options.resultSink ?? providerResultSink());
  const makeRoom = (kind: MatchKind = 'private') => {
    let code: string; do { code = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join(''); } while (rooms.has(code));
    return new Room(code, { kind, onResult: (result, room) => outbox.enqueue(result, state => { if(room.matchId===result.id)room.resultState = state; }) });
  };
  const matchmaking = new Matchmaking(rooms, makeRoom, () => outbox.available, options.queueClock);
  // Deleted (or deleting) accounts still hold unexpired tokens; treating them as busy keeps them out of every room and queue.
  const removed = new Set<string>();
  const occupied = (uid: string) => removed.has(uid) || [...rooms.values()].some(r => [...r.players.values()].some(p => p.accountId === uid && p.state.connected !== false));
  const verify = options.verifyIdentity ?? verifyIdentity, ownerOf = options.accountOf ?? accountOf;
  const deleteAccount = options.deleteAccount === null ? undefined : options.deleteAccount ?? providerAccountDeleter();
  const rankLookup = options.rankLookup === null ? undefined : options.rankLookup ?? providerRankLookup();
  const authAttempts = new Map<string, { bucket: TokenBucket; used: number }>();
  let verifying = 0;
  /** Per-address limit on Auth lookups, shared by sign-in and account deletion. Returns the refusal, if any. */
  const throttled = (address: string) => {
    const now = performance.now();
    for (const [ip, entry] of authAttempts) if (now - entry.used > 60000) authAttempts.delete(ip);
    if (verifying >= 32 || (authAttempts.size >= 4096 && !authAttempts.has(address))) return 'Account service busy. Try again shortly.';
    const entry = authAttempts.get(address) ?? { bucket: new TokenBucket(0.5, 10, now), used: now };
    entry.used = now; authAttempts.set(address, entry);
    return entry.bucket.take(now) ? '' : 'Account requests are too frequent. Try again shortly.';
  };
  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth.token;
    if (token === undefined || token === null) { next(); return; }
    if (typeof token !== 'string' || !token || token.length > 8192) { next(new Error('Invalid account session.')); return; }
    const refusal = io.engine.clientsCount > 256 ? 'Account service busy. Try again shortly.' : throttled(socket.handshake.address);
    if (refusal) { next(new Error(refusal)); return; }
    verifying++;
    try { const identity = await verify(token); if (identity.expiresAt <= Date.now() || removed.has(identity.userId)) throw new Error('Expired'); socket.data.identity = identity; next(); }
    catch { next(new Error('Account verification failed. Sign in, claim your username, and check server configuration.')); }
    finally { verifying--; }
  });
  io.on('connection', socket => {
    if(io.engine.clientsCount>256){socket.disconnect(true);return;}
    const packets=new TokenBucket(160,240,performance.now()), controls=new TokenBucket(8,16,performance.now());
    socket.use(([event],next)=>{const now=performance.now();if(!packets.take(now)){socket.disconnect(true);return;}if(event!=='input' && !controls.take(now)){next(new Error('Too many requests'));return;}next();});
    let room: Room | undefined;
    let playerId = socket.id;
    let peer: QueuePeer | undefined;
    let identity = socket.data.identity as Identity | undefined;
    let expiration: ReturnType<typeof setTimeout> | undefined;
    const scheduleExpiry = () => {
      clearTimeout(expiration);
      if (identity) expiration = setTimeout(() => { socket.emit('notice', 'Account session expired. Sign in again.'); socket.disconnect(true); }, Math.max(0, Math.min(2147483647, identity.expiresAt - Date.now())));
    };
    scheduleExpiry();
    let refreshing = false;
    const refreshRate = new TokenBucket(1 / 30, 2, performance.now());
    socket.on('authenticate', async (token, reply) => {
      if (typeof reply !== 'function') return;
      if (!identity || refreshing || typeof token !== 'string' || token.length > 8192 || !refreshRate.take(performance.now())) { reply(false); return; }
      refreshing = true;
      try {
        const next = await verify(token);
        if (!socket.connected || next.userId !== identity.userId || next.expiresAt <= Date.now()) throw new Error('Identity changed');
        identity = next; socket.data.identity = next; scheduleExpiry(); reply(true);
      } catch { reply(false); socket.disconnect(true); }
      finally { refreshing = false; }
    });
    socket.on('disconnect', () => clearTimeout(expiration));
    const deleteRate = new TokenBucket(1 / 30, 2, performance.now());
    socket.on('deleteAccount', async (token, reply) => {
      if (typeof reply !== 'function') return;
      if (!deleteAccount) { reply({ ok: false, error: 'Account deletion is unavailable on this server.' }); return; }
      if (typeof token !== 'string' || !token || token.length > 8192) { reply({ ok: false, error: 'Sign in again, then retry.' }); return; }
      const refusal = deleteRate.take(performance.now()) ? throttled(socket.handshake.address) : 'Please wait a moment before trying again.';
      if (refusal) { reply({ ok: false, error: refusal }); return; }
      let userId: string;
      verifying++;
      try { userId = await ownerOf(token); } catch { reply({ ok: false, error: 'Your session could not be verified. Sign in again, then retry.' }); return; } finally { verifying--; }
      if (occupied(userId) || matchmaking.hasActivity(userId) || outbox.holds(userId)) { reply({ ok: false, error: 'Leave your match or queue first. If a match just ended, wait a moment for its result to save.' }); return; }
      removed.add(userId);
      try { await deleteAccount(userId); } catch { removed.delete(userId); reply({ ok: false, error: 'Your account could not be deleted. Try again shortly.' }); return; }
      reply({ ok: true });
      for (const other of io.sockets.sockets.values()) if ((other.data.identity as Identity | undefined)?.userId === userId) { other.emit('notice', 'This account was deleted.'); other.disconnect(true); }
    });
    let lastAction = -Infinity;
    const leave = () => { if (peer) matchmaking.leave(peer); if (!room) return; const old = room; socket.leave(old.code); if (old.kind === 'private') old.remove(playerId); if (!old.players.size) rooms.delete(old.code); else io.to(old.code).emit('snapshot', old.snapshot()); room = undefined; playerId = socket.id; };
    const limited = (reply: (result: RoomReply) => void) => { const now = performance.now(); if (now - lastAction < 500) { reply({ ok: false, error: 'Please wait a moment before trying again.' }); return true; } lastAction = now; return false; };
    socket.on('create', reply => {
      if (typeof reply !== 'function' || limited(reply)) return;
      if (room) { reply({ ok: false, error: 'Leave your current room first.' }); return; }
      if (identity && (matchmaking.hasActivity(identity.userId) || occupied(identity.userId))) { reply({ ok: false, error: 'This account is already in a queue or room.' }); return; }
      if (rooms.size >= 100) { reply({ ok: false, error: 'Server is at capacity.' }); return; }
      room = makeRoom(); room.add(socket.id, identity); rooms.set(room.code, room); socket.join(room.code);
      reply({ ok: true, snapshot: room.snapshot() });
    });
    socket.on('join', (code, reply) => {
      if (typeof reply !== 'function' || limited(reply)) return;
      if (room) { reply({ ok: false, error: 'Leave your current room first.' }); return; }
      if (typeof code !== 'string' || !/^[A-Z2-9]{5}$/.test(code)) { reply({ ok: false, error: 'Enter a valid five-character room code.' }); return; }
      if (identity && (matchmaking.hasActivity(identity.userId) || occupied(identity.userId))) { reply({ ok: false, error: 'This account is already in a queue or room.' }); return; }
      const found = rooms.get(code);
      if (!found || found.kind !== 'private') { reply({ ok: false, error: 'Room not found.' }); return; }
      if (!found.add(socket.id, identity)) { reply({ ok: false, error: 'Room is full, already in progress, or this account is already in it.' }); return; }
      room = found; socket.join(code); reply({ ok: true, snapshot: room.snapshot() }); io.to(code).emit('snapshot', room.snapshot());
    });
    socket.on('ready', revision => { if (!room || typeof revision !== 'number') return; if(rooms.get(room.code)!==room){socket.emit('notice','Room expired. Leave this room and find another match.');return;} room.ready(playerId, revision); io.to(room.code).emit('snapshot', room.snapshot()); });
    socket.on('selectMode', mode => { if (!room) return; if (!room.selectMode(playerId, mode)) socket.emit('notice', 'Only the host can change mode before a match.'); else io.to(room.code).emit('snapshot', room.snapshot()); });
    socket.on('setName', name => { if (!room) return; room.setName(playerId, name); io.to(room.code).emit('snapshot', room.snapshot()); });
    socket.on('input', input => !room?.paused && room?.accept(playerId, input, performance.now()));
    socket.on('leave', leave); socket.on('disconnect', () => { if (peer) matchmaking.disconnect(peer); if (room?.kind === 'private') leave(); });
    socket.on('pingCheck', reply => { if (typeof reply === 'function') reply(); });
    socket.on('queueJoin', (mode, reply) => {
      if (typeof reply !== 'function') return;
      if (!peer) { reply({ ok: false, error: 'Sign in and claim a username for public play.' }); return; }
      if (room || occupied(peer.identity.userId)) { reply({ ok: false, error: 'Leave your current room first.' }); return; }
      reply(matchmaking.join(peer, mode));
    });
    const network = clientNetwork(socket.handshake.headers), rankedRate = new TokenBucket(1 / 5, 3, performance.now());
    socket.on('rankedJoin', async reply => {
      if (typeof reply !== 'function') return;
      if (!peer) { reply({ ok: false, error: 'Sign in and claim a username to play ranked.' }); return; }
      if (room || occupied(peer.identity.userId)) { reply({ ok: false, error: 'Leave your current room first.' }); return; }
      if (!rankLookup) { reply({ ok: false, error: 'Ranked is unavailable on this server.' }); return; }
      if (!rankedRate.take(performance.now())) { reply({ ok: false, error: 'Please wait a moment before trying again.' }); return; }
      let profile: Awaited<ReturnType<RankLookup>>;
      try { profile = await rankLookup(peer.identity.userId); } catch { reply({ ok: false, error: 'Could not load your rank. Try again shortly.' }); return; }
      if (!socket.connected || room) { reply({ ok: false, error: 'Connection changed. Try again.' }); return; }
      reply(matchmaking.joinRanked(peer, { ...profile, ip: network }));
    });
    socket.on('queueCancel', reply => { if (typeof reply === 'function') reply(peer ? matchmaking.cancel(peer) : { ok: true }); });
    socket.on('queueBot', reply => { if (typeof reply === 'function') reply(peer ? matchmaking.bot(peer) : { ok: false, error: 'Sign in first.' }); });
    if (identity) {
      peer = { id: socket.id, identity, queue: state => socket.emit('queue', state), attach: (assigned, seat) => {
        room = assigned; playerId = seat; socket.join(assigned.code); socket.emit('seat', seat); socket.emit('snapshot', assigned.snapshot());
      } };
      if (!matchmaking.connect(peer)) { socket.emit('notice', 'This account is already searching or playing on another connection.'); socket.disconnect(true); }
    }

  });
  const queueTimer = setInterval(() => matchmaking.tick(), 1000);
  let previous = performance.now(), accumulator = 0, broadcast = 0;
  let skippedTicks=0,tickCost=0,tickCount=0,lastMetrics=previous,tickMs=0;
  const timer = setInterval(() => {
    const now = performance.now(),elapsed=(now-previous)/1000; skippedTicks+=Math.floor(Math.max(0,elapsed-0.1)/CONFIG.tick);accumulator += Math.min(elapsed, 0.1); previous = now;
    while (accumulator >= CONFIG.tick) {const start=performance.now();rooms.forEach(room => room.step(now));tickCost+=performance.now()-start;tickCount++; accumulator -= CONFIG.tick; broadcast++;
      if (broadcast % 3 === 0) rooms.forEach(room => { const snapshot = room.snapshot();snapshot.serverMetrics={skippedTicks,tickMs}; io.to(room.code).volatile.emit('snapshot', snapshot); if (process.env.LOG_HP === '1' && snapshot.tick % 60 < 3 && snapshot.phase === 'live') console.log(JSON.stringify({ event: 'confirmed_hp', room: room.code, players: snapshot.players.map(p => ({ id: p.id, hp: p.hp })) })); });
    }
    if(now-lastMetrics>=1000){tickMs=tickCount?tickCost/tickCount:0;tickCost=0;tickCount=0;lastMetrics=now;}
  }, 4);
  return { http, io, rooms, matchmaking, outbox, close: async () => { clearInterval(timer); clearInterval(queueTimer); rooms.forEach(room => room.cancel('Server shut down. Match cancelled without rewards.')); await new Promise<void>(resolve => io.close(() => resolve())); await outbox.close(); } };
}
