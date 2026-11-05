import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from './server';
import { accountOf, providerAccountDeleter } from './auth';
import { ResultOutbox } from './ResultOutbox';
import type { MatchResult } from './game/Results';

test('account deletion over the socket: refused while playing, for a bad token or on failure; afterwards the account is locked out', { timeout: 20000 }, async () => {
  const deleted: string[] = [], directory = await mkdtemp(join(tmpdir(), 'trace-delete-'));
  let failNext = false;
  const server = createGameServer({ outboxDirectory: directory, resultSink: async () => {}, rankLookup: null,
    verifyIdentity: async token => { if (token !== 'tokenA') throw new Error('Invalid'); return { userId: 'uuid-A', username: 'PlayerA', expiresAt: Date.now() + 60000 }; },
    accountOf: async token => { if (token === 'tokenA') return 'uuid-A'; if (token === 'nameless') return 'uuid-N'; throw new Error('Invalid'); },
    deleteAccount: async id => { if (failNext) { failNext = false; throw new Error('Auth down'); } deleted.push(id); } });
  const disabled = createGameServer({ outboxDirectory: directory, resultSink: async () => {}, rankLookup: null, deleteAccount: null });
  const clients: Socket[] = [];
  try {
    for (const s of [server, disabled]) await new Promise<void>(resolve => s.http.listen(0, '127.0.0.1', resolve));
    const connect = async (target = server, auth: object = {}) => {
      const socket = io(`http://127.0.0.1:${(target.http.address() as AddressInfo).port}`, { auth, transports: ['websocket'], reconnection: false }); clients.push(socket);
      await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); }); return socket;
    };
    // Each request on a fresh guest socket, as the client does; one socket allows two requests per 30 seconds.
    const remove = async (token: string, target = server) => (await connect(target)).timeout(5000).emitWithAck('deleteAccount', token);
    assert.match((await remove('tokenA', disabled)).error!, /unavailable/);
    const a = await connect(server, { token: 'tokenA' });
    assert.equal((await a.timeout(2000).emitWithAck('create')).ok, true);
    assert.match((await remove('tokenA')).error!, /Leave your match/);
    a.emit('leave'); await a.timeout(2000).emitWithAck('pingCheck');
    assert.match((await remove('forged')).error!, /could not be verified/);
    failNext = true;
    assert.match((await remove('tokenA')).error!, /could not be deleted/);
    const notice = new Promise<string>(resolve => a.once('notice', resolve)), gone = new Promise<void>(resolve => a.once('disconnect', () => resolve()));
    assert.deepEqual(await remove('tokenA'), { ok: true });
    assert.equal(await notice, 'This account was deleted.'); await gone;
    assert.deepEqual(deleted, ['uuid-A']);
    await assert.rejects(connect(server, { token: 'tokenA' }), /verification failed/, 'a still-valid token cannot reconnect');
    assert.deepEqual(await remove('nameless'), { ok: true }, 'an account without a username can be deleted');
    assert.deepEqual(deleted, ['uuid-A', 'uuid-N']);
    const guest = await connect();
    assert.equal((await guest.timeout(2000).emitWithAck('deleteAccount', 'tokenA')).ok, false);
    assert.match((await guest.timeout(2000).emitWithAck('deleteAccount', 'tokenA')).error!, /wait a moment/);
  } finally { clients.forEach(c => c.disconnect()); await server.close(); await disabled.close(); await rm(directory, { recursive: true, force: true }); }
});

test('the outbox reports accounts with an unsaved result', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trace-outbox-')), outbox = new ResultOutbox(directory, async () => { throw new Error('offline'); });
  const player = (userId: string | null, i: number) => ({ playerId: 'p' + i, userId, name: 'P' + i, bot: userId === null, outcome: i ? 'loss' as const : 'win' as const, roundsWon: i ? 0 : 2, damageMilli: 0, receivedMilli: 0, trackingMs: 0, opportunityMs: 0, playMs: 0 });
  const result: MatchResult = { id: 'aaaaaaaa-0000-4000-8000-000000000009', kind: 'ai', mode: 'standard', status: 'completed', startedAt: '2026-11-04T10:00:00Z', completedAt: '2026-11-04T10:02:00Z', reason: 'Knockout', players: [player('uuid-A', 0), player(null, 1)] };
  try {
    await outbox.ready; outbox.enqueue(result, () => {}); await outbox.flush();
    assert.equal(outbox.holds('uuid-A'), true); assert.equal(outbox.holds('uuid-B'), false);
  } finally { await outbox.close(); await rm(directory, { recursive: true, force: true }); }
});

test('provider adapters: the token’s account comes from Auth, deletion uses the Auth admin API with the secret key', async () => {
  const saved = { fetch: globalThis.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY, secret: process.env.SUPABASE_SECRET_KEY };
  const id = '44444444-4444-4444-8444-444444444444', calls: { url: string; method: string; key: string | null }[] = [];
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  process.env.SUPABASE_URL = 'https://fixture.supabase.co'; process.env.SUPABASE_PUBLISHABLE_KEY = 'fixture-public-key'; process.env.SUPABASE_SECRET_KEY = 'fixture-secret-key';
  globalThis.fetch = async (input, init) => {
    const url = String(input), headers = new Headers(init?.headers); calls.push({ url, method: init?.method ?? 'GET', key: headers.get('apikey') });
    if (url.endsWith('/auth/v1/user')) return headers.get('authorization') === 'Bearer good' ? json({ id, email_confirmed_at: null }) : json({ message: 'Invalid token' }, 401);
    if (url.endsWith('/auth/v1/admin/users/' + id)) return json({ id });
    return json({ message: 'unexpected' }, 404);
  };
  try {
    assert.equal(await accountOf('good'), id, 'no confirmed email or username needed');
    assert.equal(calls.length, 1, 'no profile lookup');
    await assert.rejects(accountOf('bad'));
    await providerAccountDeleter()!(id);
    assert.deepEqual(calls.at(-1), { url: `https://fixture.supabase.co/auth/v1/admin/users/${id}`, method: 'DELETE', key: 'fixture-secret-key' });
    delete process.env.SUPABASE_SECRET_KEY; assert.equal(providerAccountDeleter(), undefined);
  } finally {
    globalThis.fetch = saved.fetch;
    for (const [name, value] of [['SUPABASE_URL', saved.url], ['SUPABASE_PUBLISHABLE_KEY', saved.key], ['SUPABASE_SECRET_KEY', saved.secret]] as const) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

const combat = (damage: number) => ({ attack: 10, tracked: 5, damage, received: 50, headDamage: 20, headTracked: 1, streak: 0, longest: 2, duration: 30 });
const player = (playerId: string, userId: string, name: string, outcome: string, roundsWon: number) => ({ playerId, userId, name, bot: false, outcome, roundsWon, damageMilli: 200000, receivedMilli: 50000, trackingMs: 5000, opportunityMs: 8000, playMs: 30000,
  combat: combat(200), rounds: [{ serial: 1, round: 1, winner: 'pa', reason: 'Eliminated', duration: 12, players: [{ id: 'pa', name: 'Alpha', hp: 40, wins: 1, stats: combat(200) }, { id: 'pb', name: 'Beta', hp: 0, wins: 0, stats: combat(100) }] }] });

test('deleting an Auth user removes their data and scrubs their name from opponents’ history and receipts', { timeout: 30000 }, async () => {
  const db = new PGlite(), a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222', c = '33333333-3333-4333-8333-333333333333';
  const match = 'aaaaaaaa-0000-4000-8000-000000000001';
  const as = async (id: string) => { await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`); };
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
    for (const name of ['202610270001_accounts.sql', '202610280001_match_results.sql', '202610310001_combat_stats.sql', '202611010001_permanent_usernames.sql', '202611020001_social_leaderboards.sql', '202611030001_match_history.sql', '202611040001_ranked.sql', '202611040002_account_deletion.sql']) await db.exec(await readFile(new URL('../../../supabase/migrations/' + name, import.meta.url), 'utf8'));
    await db.exec(`insert into auth.users values('${a}',now()),('${b}',now()),('${c}',now());insert into public.profiles(user_id,username_display) values('${a}','Alpha'),('${b}','Beta');insert into public.friendships values('${a}','${b}',true,now());`);
    await db.query('select public.record_match_combat($1)', [JSON.stringify({ id: match, kind: 'ranked', mode: 'standard', status: 'completed', startedAt: '2026-11-01T10:00:00Z', completedAt: '2026-11-01T10:05:00Z', reason: 'Match complete', players: [player('pa', a, 'Alpha', 'win', 3), player('pb', b, 'Beta', 'loss', 1)] })]);
    assert.equal((await db.query('select * from public.player_ranks')).rows.length, 2);

    await db.exec(`delete from auth.users where id='${a}'`);
    for (const table of ['profiles', 'player_progress', 'player_stats', 'player_combat_stats', 'player_ranks', 'rank_history', 'friendships']) {
      const column = table === 'friendships' ? 'sender' : 'user_id';
      assert.equal((await db.query(`select * from public.${table} where ${column}=$1`, [a])).rows.length, 0, table);
    }
    assert.deepEqual((await db.query('select player_id,user_id,name from public.match_participants order by player_id')).rows, [{ player_id: 'pa', user_id: null, name: 'Deleted player' }, { player_id: 'pb', user_id: b, name: 'Beta' }]);
    const rounds = (await db.query<{ rounds: { players: { id: string; name: string }[] }[] }>('select rounds from public.match_combat order by player_id')).rows;
    for (const row of rounds) assert.deepEqual(row.rounds[0].players.map(p => p.name), ['Deleted player', 'Beta']);
    const receipt = JSON.stringify((await db.query('select payload from trace_private.result_receipts')).rows[0]);
    assert.ok(!receipt.includes(a) && !receipt.includes('Alpha'), 'receipt keeps no id or name of the deleted player');
    assert.ok(receipt.includes(b) && receipt.includes('Beta'), 'the opponent’s receipt data is untouched');
    assert.equal((await db.query<{ points: number }>('select points from public.player_ranks where user_id=$1', [b])).rows.length, 1, 'opponent keeps their rank');

    await as(b);
    const history = (await db.query<{ value: { players: { name: string; me: boolean }[] }[] }>('select public.match_history() value')).rows[0].value;
    assert.deepEqual(history[0].players.map(p => [p.name, p.me]), [['Beta', true], ['Deleted player', false]]);
    await as(c); await db.query('select public.claim_username($1)', ['Alpha']);
    await db.exec('reset role');
    assert.equal((await db.query('select username_display from public.profiles where user_id=$1', [c])).rows.length, 1, 'the username is released');
    await db.exec(`delete from auth.users where id='${c}'`);
    assert.equal((await db.query('select * from public.match_participants where name=$1', ['Deleted player'])).rows.length, 1, 'a player with no matches deletes cleanly');
  } finally { await db.close(); }
});
