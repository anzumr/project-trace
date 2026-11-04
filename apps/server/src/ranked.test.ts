import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { rankStep } from '@trace/shared/ranked';

const MIGRATIONS = ['202610270001_accounts.sql', '202610280001_match_results.sql', '202610310001_combat_stats.sql', '202611010001_permanent_usernames.sql', '202611020001_social_leaderboards.sql', '202611030001_match_history.sql', '202611040001_ranked.sql'];
const combat = (attack: number, damage: number) => ({ attack, tracked: attack / 2, damage, received: 80, headDamage: 2, headTracked: attack / 8, streak: 0, longest: attack / 8, duration: 100 });
const player = (playerId: string, userId: string | null, outcome: string, roundsWon: number, attack = 40, damage = 180) => ({ playerId, userId, name: playerId, bot: userId === null, outcome, roundsWon,
  damageMilli: damage * 1000, receivedMilli: 90000, trackingMs: 20000, opportunityMs: 60000, playMs: 100000, combat: combat(attack, damage), rounds: [] });
let serial = 0;
const result = (minute: number, players: unknown[], status = 'completed', kind = 'ranked') => ({ id: `bbbbbbbb-0000-4000-8000-${String(++serial).padStart(12, '0')}`, kind, mode: 'standard', status,
  startedAt: `2026-11-04T10:${String(minute).padStart(2, '0')}:00Z`, completedAt: `2026-11-04T10:${String(minute).padStart(2, '0')}:30Z`, reason: 'Match complete', players });

test('ranked SQL matches the shared formula exactly', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
    for (const name of MIGRATIONS) await db.exec(await readFile(new URL('../../../supabase/migrations/' + name, import.meta.url), 'utf8'));
    const cases: { points: number; streak: number; shield: number; opp: number; won: boolean; decay: number; nogain: boolean }[] = [];
    const ratings = [0, 7, 99, 100, 450, 605, 1249, 2050, 2799, 3100, 3725];
    for (const points of ratings) for (const opp of ratings) for (const streak of [-6, -2, 0, 2, 3, 5]) for (const won of [true, false]) for (const decay of [1, 0.5, 0])
      cases.push({ points, streak, shield: (points + opp) % 3 === 0 ? 2 : 0, opp, won, decay, nogain: won && opp % 2 === 1 });
    const rows = (await db.query<{ points: number; streak: number; shield: number; delta: number; multiplier: number }>(`select s.* from rows from (jsonb_to_recordset($1::jsonb) as (points int,streak int,shield int,opp int,won boolean,decay float8,nogain boolean)) with ordinality as c(points,streak,shield,opp,won,decay,nogain,n),
      lateral trace_private.rank_step(c.points,c.streak,c.shield,c.opp,c.won,c.decay,c.nogain) s order by c.n`, [JSON.stringify(cases)])).rows;
    assert.equal(rows.length, cases.length);
    cases.forEach((c, i) => assert.deepEqual({ ...rows[i] }, rankStep({ points: c.points, streak: c.streak, shield: c.shield }, c.opp, c.won, c.decay, c.nogain), JSON.stringify(c)));
  } finally { await db.close(); }
});

test('ranked results update ranks once, decay repeat opponents, flag throws and stay private', async () => {
  const db = new PGlite(), a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222', c = '33333333-3333-4333-8333-333333333333';
  const as = async (id: string) => { await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`); };
  const record = async (r: unknown) => { await db.exec('reset role;set role service_role'); try { await db.query('select public.record_match_combat($1::jsonb)', [JSON.stringify(r)]); } finally { await db.exec('reset role'); } };
  const rank = async (id: string) => (await db.query<{ points: number; streak: number; wins: number; losses: number }>('select points,streak,wins,losses from public.player_ranks where user_id=$1', [id])).rows[0];
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
    for (const name of MIGRATIONS) await db.exec(await readFile(new URL('../../../supabase/migrations/' + name, import.meta.url), 'utf8'));
    await db.exec(`insert into auth.users values('${a}',now()),('${b}',now()),('${c}',now());insert into public.profiles(user_id,username_display) values('${a}','Alpha'),('${b}','Beta'),('${c}','Gamma');
      insert into public.player_ranks(user_id,points) values('${a}',1000),('${b}',1000),('${c}',1000);`);

    const first = result(1, [player('pa', a, 'win', 3), player('pb', b, 'loss', 1)]);
    await record(first); await record(first);
    assert.deepEqual(await rank(a), { points: 1030, streak: 1, wins: 1, losses: 0 }, 'first-to-3 saves, and a retry does not apply twice');
    assert.deepEqual(await rank(b), { points: 970, streak: -1, wins: 0, losses: 1 });
    const second = rankStep({ points: 1030, streak: 1, shield: 0 }, 970, true, 0.5);
    await record(result(2, [player('pa', a, 'win', 3), player('pb', b, 'loss', 0)]));
    assert.equal((await rank(a)).points, second.points, 'second match against the same opponent pays half'); assert.equal((await rank(a)).streak, 1, 'and builds no streak');
    const before = await rank(a);
    await record(result(3, [player('pa', a, 'win', 3), player('pb', b, 'loss', 2)]));
    assert.deepEqual(await rank(a), { ...before, wins: before.wins + 1 }, 'third match in 24 hours is worth nothing');

    const fed = await rank(a);
    await record(result(4, [player('pa', a, 'win', 3), player('pc', c, 'loss', 0, 1, 4)]));
    assert.equal((await rank(a)).points, fed.points, 'a loser who barely fired gives the winner nothing');
    assert.ok((await rank(c)).points < 1000, 'the feeder still loses');
    assert.equal((await db.query<{ flagged: boolean }>('select flagged from public.rank_history where user_id=$1 and opponent_id=$2', [a, c])).rows[0].flagged, true);

    await record(result(5, [player('pb', b, 'cancelled', 0), player('pc', c, 'cancelled', 0)], 'cancelled'));
    assert.equal(Number((await db.query<{ n: number }>('select count(*) n from public.rank_history')).rows[0].n), 8, 'cancelled matches change no rank');
    await record(result(6, [player('pc', c, 'win', 1), player('pb', b, 'loss', 0)], 'forfeit'));
    assert.ok((await rank(c)).points > 970, 'a forfeit win counts');
    await assert.rejects(record(result(7, [player('pa', a, 'win', 3), player('bot', null, 'loss', 0)])), /require two accounts/);
    assert.equal(Number((await db.query<{ total_xp: number }>('select total_xp from public.player_progress where user_id=$1', [a])).rows[0].total_xp), 400, 'ranked wins give Quick Play XP');

    const betaPoints = (await rank(b)).points;
    await db.exec('set role service_role');
    assert.deepEqual((await db.query<{ v: unknown }>('select public.ranked_profile($1) v', [b])).rows[0].v, { points: betaPoints, xp: 40 * 3 }, 'three completed losses; forfeits give no XP');
    await db.exec('reset role');
    await as(a);
    await assert.rejects(db.query('select public.ranked_profile($1)', [a]), /permission denied/);
    assert.deepEqual((await db.query<{ user_id: string }>('select user_id from public.player_ranks')).rows.map(r => r.user_id), [a], 'own rank only');
    assert.ok((await db.query<{ user_id: string }>('select user_id from public.rank_history')).rows.every(r => r.user_id === a));
    const board = (await db.query<{ username: string; rank: string; points: number }>('select * from public.ranked_leaderboard()')).rows;
    assert.deepEqual(board.map(r => r.username), ['Alpha', 'Gamma', 'Beta'].sort((x, y) => board.find(r => r.username === y)!.points - board.find(r => r.username === x)!.points));
    const history = (await db.query<{ value: { kind: string; rank: { delta: number; decay: number } }[] }>(`select public.match_history('ranked') value`)).rows[0].value;
    assert.equal(history.length, 4); assert.deepEqual(history.map(m => m.rank.decay), [1, 0, 0.5, 1]); assert.equal(history[3].rank.delta, 30);
    await assert.rejects(db.query(`select * from public.ranked_leaderboard('everyone')`), /Invalid leaderboard/);
    for (const sql of ['update public.player_ranks set points=9999', 'delete from public.rank_history']) await assert.rejects(db.query(sql), /permission denied/);
  } finally { await db.close(); }
});
