import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { createGameServer } from './server';
import { verifyIdentity } from './auth';
import { authConnectSource } from './net/http';

test('provider adapter validates with Auth before scoped profile lookup and rejects expired/unconfirmed tokens', async () => {
  const savedFetch = globalThis.fetch, savedUrl = process.env.SUPABASE_URL, savedKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = 'https://fixture.supabase.co'; process.env.SUPABASE_PUBLISHABLE_KEY = 'fixture-public-key';
  let confirmed = true, denied = false;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push(url);
    assert.match(new Headers(init?.headers).get('authorization')!, /^Bearer /);
    if (url.includes('/auth/v1/user')) return denied ? new Response(JSON.stringify({ message: 'Invalid token' }), { status: 401 }) : new Response(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', email_confirmed_at: confirmed ? '2026-01-01' : null }), { status: 200, headers: { 'content-type': 'application/json' } });
    assert.match(url, /user_id=eq\.11111111/);
    return new Response(JSON.stringify({ username_display: 'VerifiedName' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const token = (exp: number) => `header.${Buffer.from(JSON.stringify({ exp, sub: 'untrusted-sub' })).toString('base64url')}.signature`;
  try {
    const identity = await verifyIdentity(token(Math.floor(Date.now() / 1000) + 60));
    assert.equal(identity.userId, '11111111-1111-4111-8111-111111111111');
    assert.equal(identity.username, 'VerifiedName'); assert.match(calls[0], /auth\/v1\/user/);
    assert.equal(authConnectSource(), ' https://fixture.supabase.co');
    await assert.rejects(verifyIdentity(token(1)), /expired/);
    calls.length = 0; confirmed = false;
    await assert.rejects(verifyIdentity(token(9999999999)), /confirmed email/); assert.equal(calls.length, 1);
    confirmed = true; denied = true; calls.length = 0;
    await assert.rejects(verifyIdentity(token(9999999999))); assert.equal(calls.length, 1);
    process.env.SUPABASE_URL = 'https://user:password@fixture.supabase.co'; assert.throws(authConnectSource);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = savedKey;
  }
});

test('unconfigured authentication fails closed', async () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_PUBLISHABLE_KEY;
  try { await assert.rejects(verifyIdentity('forged'), /not configured/); }
  finally { if (url !== undefined) process.env.SUPABASE_URL=url; if(key !== undefined)process.env.SUPABASE_PUBLISHABLE_KEY=key; }
});

test('verified socket identity cannot be renamed/spoofed; duplicate account, invalid token, refresh and expiry', { timeout: 15000 }, async () => {
  // Injected verifier tests the socket boundary, not live Supabase validation.
  const server = createGameServer({ verifyIdentity: async token => {
    if (!['accountA', 'refreshA', 'accountB', 'short'].includes(token)) throw new Error('Invalid');
    return { userId: token === 'accountB' ? 'uuid-B' : 'uuid-A', username: token === 'accountB' ? 'PlayerB' : 'PlayerA', expiresAt: Date.now() + (token === 'short' ? 500 : 60000) };
  } });
  const clients: Socket[] = [];
  try {
    await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
    const connect = async (auth: object = {}) => {
      const socket = io(url, { auth, transports: ['websocket'], reconnection: false }); clients.push(socket);
      await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); }); return socket;
    };
    await assert.rejects(connect({ token: 'forged', userId: 'uuid-A' }), /verification failed/);
    const a = await connect({ token: 'accountA', username: 'Imposter' });
    const made = await a.timeout(2000).emitWithAck('create');
    assert.equal(made.snapshot.players[0].name, 'PlayerA');
    assert.equal(made.snapshot.players[0].registered, true);
    assert.equal(JSON.stringify(made).includes('uuid-A'), false);
    a.emit('setName', 'Hacked');
    const duplicate = await connect({ token: 'accountA' });
    assert.equal((await duplicate.timeout(2000).emitWithAck('join', made.snapshot.code)).ok, false);
    const guest = await connect({ userId: 'uuid-A', username: 'PlayerA' });
    const joined = await guest.timeout(2000).emitWithAck('join', made.snapshot.code);
    assert.equal(joined.ok, true); assert.equal(joined.snapshot.players[1].registered, false);
    assert.equal(joined.snapshot.players[0].name, 'PlayerA');
    assert.equal(await a.timeout(2000).emitWithAck('authenticate', 'refreshA'), true);
    const disconnected = new Promise<void>(resolve => a.once('disconnect', () => resolve()));
    assert.equal(await a.timeout(2000).emitWithAck('authenticate', 'accountB'), false);
    await disconnected;
    const short = await connect({ token: 'short' });
    await new Promise<void>(resolve => short.once('disconnect', () => resolve()));
    assert.equal(short.connected, false);
  } finally { clients.forEach(c => c.disconnect()); await server.close(); }
});
