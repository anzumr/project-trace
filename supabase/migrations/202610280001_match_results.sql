-- Add-on 01. Apply after 202610270001_accounts.sql. Server-only finalization.
begin;
create table public.match_results (
  id uuid primary key, kind text not null check (kind in ('private','public','ai')),
  mode text not null check (mode in ('standard','heavy','agile','extreme')),
  status text not null check (status in ('completed','forfeit','cancelled')),
  started_at timestamptz not null, completed_at timestamptz not null,
  reason text not null check (length(reason) <= 300), check (completed_at >= started_at)
);
create table public.match_participants (
  match_id uuid not null references public.match_results(id) on delete cascade,
  player_id text not null check (length(player_id) between 1 and 100),
  user_id uuid references public.profiles(user_id) on delete set null,
  name text not null check (length(name) between 1 and 100), bot boolean not null,
  outcome text not null check (outcome in ('win','loss','cancelled')),
  rounds_won integer not null check (rounds_won between 0 and 2),
  damage_milli bigint not null check (damage_milli between 0 and 100000000),
  received_milli bigint not null check (received_milli between 0 and 100000000),
  tracking_ms bigint not null check (tracking_ms >= 0),
  opportunity_ms bigint not null check (opportunity_ms >= tracking_ms),
  play_ms bigint not null check (play_ms >= opportunity_ms and play_ms <= 86400000),
  xp integer not null check (xp between 0 and 100),
  primary key(match_id,player_id), unique(match_id,user_id), check (not bot or user_id is null)
);
create index participant_user_history on public.match_participants(user_id,match_id);
create table public.player_progress (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  total_xp bigint not null default 0 check(total_xp >= 0), updated_at timestamptz not null default now()
);
create table public.player_stats (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  kind text not null check(kind in ('private','public','ai')), wins bigint not null default 0,
  losses bigint not null default 0, rounds_won bigint not null default 0,
  damage_milli bigint not null default 0, received_milli bigint not null default 0,
  tracking_ms bigint not null default 0, opportunity_ms bigint not null default 0, play_ms bigint not null default 0,
  primary key(user_id,kind)
);
create table trace_private.result_receipts (match_id uuid primary key references public.match_results(id), payload jsonb not null);
revoke all on trace_private.result_receipts from public,anon,authenticated;
alter table public.match_results enable row level security;
alter table public.match_participants enable row level security;
alter table public.player_progress enable row level security;
alter table public.player_stats enable row level security;
revoke all on public.match_results,public.match_participants,public.player_progress,public.player_stats from public,anon,authenticated;
grant select on public.match_results,public.match_participants,public.player_progress,public.player_stats to authenticated;
create policy own_participation on public.match_participants for select to authenticated using (user_id=(select auth.uid()));
create policy own_match on public.match_results for select to authenticated using (exists(select 1 from public.match_participants p where p.match_id=id and p.user_id=(select auth.uid())));
create policy own_progress on public.player_progress for select to authenticated using(user_id=(select auth.uid()));
create policy own_stats on public.player_stats for select to authenticated using(user_id=(select auth.uid()));

create function public.record_match(p_result jsonb) returns void language plpgsql security definer set search_path='' as $$
declare
  v_match_id uuid := (p_result->>'id')::uuid;
  match_kind text := p_result->>'kind';
  match_status text := p_result->>'status';
  p jsonb; uid uuid; award integer; old_payload jsonb;
begin
  if jsonb_typeof(p_result->'players') is distinct from 'array' or jsonb_array_length(p_result->'players') <> 2 then raise exception 'Exactly two participants required'; end if;
  if (select count(distinct value->>'playerId') from jsonb_array_elements(p_result->'players')) <> 2 then raise exception 'Duplicate participants'; end if;
  if match_kind='public' and exists(select 1 from jsonb_array_elements(p_result->'players') where (value->>'bot')::boolean or nullif(value->>'userId','') is null) then raise exception 'Public matches require two accounts'; end if;
  if match_kind='ai' and (select count(*) from jsonb_array_elements(p_result->'players') where (value->>'bot')::boolean) <> 1 then raise exception 'AI matches require one bot'; end if;
  if match_kind<>'ai' and exists(select 1 from jsonb_array_elements(p_result->'players') where (value->>'bot')::boolean) then raise exception 'Bots cannot enter PvP records'; end if;
  if match_status in ('completed','forfeit') and ((select count(*) from jsonb_array_elements(p_result->'players') where value->>'outcome'='win') <> 1 or (select count(*) from jsonb_array_elements(p_result->'players') where value->>'outcome'='loss') <> 1) then raise exception 'Result needs one winner and one loser'; end if;
  if match_status='cancelled' and exists(select 1 from jsonb_array_elements(p_result->'players') where value->>'outcome'<>'cancelled') then raise exception 'Cancelled matches have no winner'; end if;
  -- Serializes retries, including simultaneous calls before the row exists.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_match_id::text,1));
  select payload into old_payload from trace_private.result_receipts where result_receipts.match_id=v_match_id;
  if found then
    if old_payload <> p_result then raise exception 'Conflicting finalization for match ID'; end if;
    return;
  end if;
  insert into public.match_results values(v_match_id,match_kind,p_result->>'mode',match_status,(p_result->>'startedAt')::timestamptz,(p_result->>'completedAt')::timestamptz,p_result->>'reason');
  -- Stable UUID order avoids cross-match deadlocks on aggregate rows.
  for p in select value from jsonb_array_elements(p_result->'players') order by value->>'userId' loop
    uid := nullif(p->>'userId','')::uuid;
    award := case when match_status<>'completed' or uid is null then 0
      when match_kind='public' then case when p->>'outcome'='win' then 100 else 40 end
      when match_kind='ai' then case when p->>'outcome'='win' then 25 else 10 end else 0 end;
    insert into public.match_participants values(v_match_id,p->>'playerId',uid,p->>'name',(p->>'bot')::boolean,p->>'outcome',(p->>'roundsWon')::integer,(p->>'damageMilli')::bigint,(p->>'receivedMilli')::bigint,(p->>'trackingMs')::bigint,(p->>'opportunityMs')::bigint,(p->>'playMs')::bigint,award);
    if uid is not null and match_status<>'cancelled' then
      insert into public.player_progress(user_id,total_xp) values(uid,award) on conflict(user_id) do update set total_xp=public.player_progress.total_xp+excluded.total_xp,updated_at=now();
      insert into public.player_stats values(uid,match_kind,(p->>'outcome'='win')::integer,(p->>'outcome'='loss')::integer,(p->>'roundsWon')::integer,(p->>'damageMilli')::bigint,(p->>'receivedMilli')::bigint,(p->>'trackingMs')::bigint,(p->>'opportunityMs')::bigint,(p->>'playMs')::bigint)
      on conflict(user_id,kind) do update set wins=public.player_stats.wins+excluded.wins,losses=public.player_stats.losses+excluded.losses,rounds_won=public.player_stats.rounds_won+excluded.rounds_won,damage_milli=public.player_stats.damage_milli+excluded.damage_milli,received_milli=public.player_stats.received_milli+excluded.received_milli,tracking_ms=public.player_stats.tracking_ms+excluded.tracking_ms,opportunity_ms=public.player_stats.opportunity_ms+excluded.opportunity_ms,play_ms=public.player_stats.play_ms+excluded.play_ms;
    end if;
  end loop;
  insert into trace_private.result_receipts values(v_match_id,p_result);
end; $$;
revoke all on function public.record_match(jsonb) from public,anon,authenticated;
grant execute on function public.record_match(jsonb) to service_role;
commit;
