import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Real embedded PostgreSQL; only Supabase's auth schema/JWT context is a fixture.
// This does not test the hosted Auth service or email delivery.
test('accounts migration: atomic uniqueness, validation, cooldown, verification and owner-only grants/RLS', { timeout: 30000 }, async () => {
  const db = new PGlite();
  const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222', unverified = '33333333-3333-4333-8333-333333333333';
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('${a}', now()), ('${b}', now()), ('${unverified}', null);`);
    await db.exec(await readFile(new URL('../../../supabase/migrations/202610270001_accounts.sql', import.meta.url), 'utf8'));
    const asUser = async (id: string, query: string, params: unknown[] = []) => {
      await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
      try { return await db.query(query, params); } finally { await db.exec('reset role'); }
    };
    await assert.rejects(asUser(unverified, 'select public.claim_username($1)', ['Unverified']), /Confirm your email/);
    for (const name of ['ab', 'a'.repeat(17), 'has space', '<script>', 'ADMIN', 'éclair']) {
      await assert.rejects(asUser(a, 'select public.claim_username($1)', [name]));
    }
    await asUser(a, 'select public.claim_username($1)', [' TracePlayer ']);
    await assert.rejects(asUser(b, 'select public.claim_username($1)', ['traceplayer']), /unique constraint/);
    await asUser(b, 'select public.claim_username($1)', ['PlayerTwo']);
    const owned = await asUser(a, 'select username_display from public.profiles');
    assert.deepEqual(owned.rows, [{ username_display: 'TracePlayer' }]);
    for (const sql of [
      `update public.profiles set username_display='Hacked' where user_id='${b}'`,
      `update public.profiles set username_changed_at='2000-01-01' where user_id='${a}'`,
      `delete from public.profiles`,
      `insert into public.profiles(user_id,username_display) values ('${unverified}','FakeAccount')`,
      `select * from trace_private.account_policy`,
    ]) await assert.rejects(asUser(a, sql), /permission denied/);
    await asUser(a, 'select public.claim_username($1)', ['TracePlayer']); // idempotent same name
    await assert.rejects(asUser(a, 'select public.claim_username($1)', ['Renamed']), /cooldown/);
    await db.exec(`update public.profiles set username_changed_at=now()-interval '31 days' where user_id='${a}'`);
    await asUser(a, 'select public.claim_username($1)', ['Renamed']);
    assert.equal((await asUser(a, 'select user_id from public.profiles')).rows.length, 1);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.profiles'), /permission denied/);
    await assert.rejects(db.query("select public.claim_username('AnonName')"), /permission denied/);
    await db.exec('reset role');
    // Concurrent promises against PGlite are serialized; checks the constraint but
    // does NOT substitute for a hosted multi-connection race (manual checklist).
    const race = await Promise.allSettled([a, b].map((id, index) => db.query('update public.profiles set username_display=$1 where user_id=$2', [index ? 'RACENAME' : 'RaceName', id])));
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
    await db.exec(`delete from auth.users where id='${a}'`);
    assert.equal((await db.query('select * from public.profiles where user_id=$1', [a])).rows.length, 0);
  } finally { await db.close(); }
});
