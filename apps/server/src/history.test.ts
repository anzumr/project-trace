import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

type Entry = { id: string; kind: string; status: string; players: { id: string; me: boolean; name: string; bot: boolean; outcome: string; rounds_won: number; damage_milli: number; combat: { damage: number } | null; rounds: { round: number; winner: string }[] | null }[] };
const combat = (damage: number) => ({ attack: 10, tracked: 5, damage, received: 50, headDamage: 20, headTracked: 1, streak: 0, longest: 2, duration: 30 });
const player = (playerId: string, userId: string | null, name: string, outcome: string, roundsWon: number, damage: number) => ({ playerId, userId, name, bot: userId === null, outcome, roundsWon, damageMilli: damage * 1000, receivedMilli: 50000, trackingMs: 5000, opportunityMs: 8000, playMs: 30000,
  combat: combat(damage), rounds: [{ serial: 1, round: 1, winner: playerId, reason: 'Eliminated', duration: 12, players: [{ id: playerId, name, hp: 40, wins: 1, stats: combat(damage) }] }] });

test('match history returns both sides of the caller’s own matches, newest first, without account IDs', async () => {
  const db = new PGlite(), a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222', c = '33333333-3333-4333-8333-333333333333';
  const ids = ['aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000003'];
  const as = async (id: string) => { await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`); };
  const history = async (kind: string | null = null, before: string | null = null, limit = 20) => (await db.query<{ value: Entry[] }>('select public.match_history($1,$2,$3) value', [kind, before, limit])).rows[0].value;
  const record = (id: string, kind: string, completedAt: string, players: unknown[]) => db.query('select public.record_match_combat($1)', [JSON.stringify({ id, kind, mode: 'standard', status: 'completed', startedAt: '2026-11-01T10:00:00Z', completedAt, reason: 'Match complete', players })]);
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
    for (const name of ['202610270001_accounts.sql', '202610280001_match_results.sql', '202610310001_combat_stats.sql', '202611010001_permanent_usernames.sql', '202611020001_social_leaderboards.sql', '202611030001_match_history.sql']) await db.exec(await readFile(new URL('../../../supabase/migrations/' + name, import.meta.url), 'utf8'));
    await db.exec(`insert into auth.users values('${a}',now()),('${b}',now()),('${c}',now());insert into public.profiles(user_id,username_display) values('${a}','Alpha'),('${b}','Beta'),('${c}','Gamma');`);
    await record(ids[0], 'public', '2026-11-01T10:05:00Z', [player('pb', b, 'Beta', 'loss', 1, 180), player('pa', a, 'Alpha', 'win', 2, 240)]);
    await record(ids[1], 'ai', '2026-11-01T11:05:00Z', [player('pa2', a, 'Alpha', 'loss', 0, 90), player('bot', null, 'Extra Hard AI', 'win', 2, 200)]);
    await record(ids[2], 'public', '2026-11-01T12:05:00Z', [player('pb3', b, 'Beta', 'win', 2, 300), player('pc', c, 'Gamma', 'loss', 0, 100)]);

    await db.exec('set role anon'); await assert.rejects(() => history(), /permission denied/);
    await as(''); await assert.rejects(() => history(), /Sign in/);
    await as(a);
    const all = await history();
    assert.deepEqual(all.map(m => m.id), [ids[1], ids[0]], 'only own matches, newest first');
    const duel = all[1];
    assert.deepEqual(duel.players.map(p => [p.name, p.me, p.outcome, p.rounds_won]), [['Alpha', true, 'win', 2], ['Beta', false, 'loss', 1]], 'caller first, opponent second');
    assert.equal(duel.players[1].combat?.damage, 180); assert.equal(duel.players[1].damage_milli, 180000); assert.equal(duel.players[1].rounds?.[0].winner, 'pb');
    assert.equal(all[0].players[1].bot, true);
    assert.ok(!JSON.stringify(all).includes(b), 'opponent account IDs stay hidden');
    assert.deepEqual((await history('public')).map(m => m.id), [ids[0]]);
    assert.deepEqual((await history(null, '2026-11-01T11:05:00Z')).map(m => m.id), [ids[0]], 'pages by completion time');
    assert.deepEqual((await history(null, null, 1)).map(m => m.id), [ids[1]]);
    for (const [kind, limit] of [['ranked', 20], [null, 0], [null, 51]] as const) await assert.rejects(() => history(kind, null, limit), /Invalid match history/);
    assert.equal((await db.query('select * from public.match_participants')).rows.length, 2, 'direct reads still show only own rows');
    await as(c); assert.deepEqual((await history()).map(m => m.id), [ids[2]]);
  } finally { await db.close(); }
});
