-- Apply once after match_history, BEFORE deploying the ranked server. Adds the 'ranked' match kind (first to 3),
-- rank points, a per-match rank log, repeat-opponent decay and thrown-match detection.
begin;
alter table public.match_results drop constraint match_results_kind_check, add constraint match_results_kind_check check (kind in ('private','public','ai','ranked'));
alter table public.match_participants drop constraint match_participants_rounds_won_check, add constraint match_participants_rounds_won_check check (rounds_won between 0 and 3);
alter table public.player_stats drop constraint player_stats_kind_check, add constraint player_stats_kind_check check (kind in ('private','public','ai','ranked'));
alter table public.player_combat_stats drop constraint player_combat_stats_kind_check, add constraint player_combat_stats_kind_check check (kind in ('private','public','ai','ranked'));

create table public.player_ranks (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  points integer not null default 0 check (points >= 0),
  streak integer not null default 0 check (streak between -99 and 99),
  shield integer not null default 0 check (shield between 0 and 3),
  wins integer not null default 0 check (wins >= 0), losses integer not null default 0 check (losses >= 0),
  peak integer not null default 0 check (peak >= 0), updated_at timestamptz not null default now()
);
-- Every rank change, so abuse can be audited and reversed by hand.
create table public.rank_history (
  match_id uuid not null references public.match_results(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  opponent_id uuid references public.profiles(user_id) on delete set null,
  won boolean not null, before integer not null, after integer not null, delta integer not null,
  streak integer not null, multiplier double precision not null, decay double precision not null,
  flagged boolean not null default false, created_at timestamptz not null,
  primary key (match_id, user_id)
);
create index rank_history_pair on public.rank_history(user_id, opponent_id, created_at);
alter table public.player_ranks enable row level security;
alter table public.rank_history enable row level security;
revoke all on public.player_ranks,public.rank_history from public,anon,authenticated;
grant select on public.player_ranks,public.rank_history to authenticated;
create policy own_rank on public.player_ranks for select to authenticated using (user_id=(select auth.uid()));
create policy own_rank_history on public.rank_history for select to authenticated using (user_id=(select auth.uid()));

-- Mirror of rankStep() in packages/shared/src/ranked.ts; ranked.test.ts checks they agree. Float maths matches JavaScript.
create function trace_private.rank_step(p_points integer,p_streak integer,p_shield integer,p_opponent integer,p_won boolean,p_decay double precision,p_no_gain boolean,
  out points integer,out streak integer,out shield integer,out delta integer,out multiplier double precision)
language plpgsql immutable set search_path='' as $$
declare e double precision:=1/(1+power(10::double precision,(p_opponent-p_points)/800.0::double precision)); run integer; base double precision; change integer; promoted boolean;
begin
  run:=case when p_won then case when p_streak>0 then p_streak+1 else 1 end else case when p_streak<0 then 1-p_streak else 1 end end;
  base:=greatest(5::double precision,least(55::double precision,60*(case when p_won then 1-e else e end)));
  multiplier:=(array[1,1,1,1.3,1.45,1.6,1.75]::double precision[])[least(6,greatest(0,run))+1];
  change:=case when p_won and p_no_gain then 0 else floor(base*multiplier*p_decay+0.5)::integer end*(case when p_won then 1 else -1 end);
  points:=greatest(0,p_points+change);
  if not p_won and p_shield>0 then points:=greatest(points,least(31,p_points/100)*100); end if;
  delta:=points-p_points;
  promoted:=least(31,points/100)>least(31,p_points/100);
  if p_decay<1 or (p_won and p_no_gain) then streak:=p_streak; shield:=case when promoted then 3 else p_shield end;
  else streak:=greatest(-99,least(99,case when p_won then run else -run end)); shield:=case when promoted then 3 else greatest(0,p_shield-1) end;
  end if;
end; $$;

create function trace_private.apply_ranked(p_result jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_match uuid:=(p_result->>'id')::uuid; v_at timestamptz:=(p_result->>'completedAt')::timestamptz; w jsonb; l jsonb; wid uuid; lid uuid;
  a public.player_ranks; b public.player_ranks; prior integer; v_decay double precision; thrown boolean; s record; t record;
begin
  if p_result->>'status' not in ('completed','forfeit') or exists(select 1 from public.rank_history where match_id=v_match) then return; end if;
  select value into w from jsonb_array_elements(p_result->'players') where value->>'outcome'='win';
  select value into l from jsonb_array_elements(p_result->'players') where value->>'outcome'='loss';
  wid:=(w->>'userId')::uuid; lid:=(l->>'userId')::uuid;
  insert into public.player_ranks(user_id) values (wid),(lid) on conflict do nothing;
  perform 1 from public.player_ranks where user_id in (wid,lid) order by user_id for update;
  select * into a from public.player_ranks where user_id=wid;
  select * into b from public.player_ranks where user_id=lid;
  select count(*) into prior from public.rank_history where user_id=wid and opponent_id=lid and created_at>v_at-interval '24 hours' and created_at<=v_at;
  v_decay:=case when prior=0 then 1 when prior=1 then 0.5 else 0 end;
  -- A loser who barely fired or dealt almost no damage looks like a feeder: the win earns nothing.
  thrown:=jsonb_typeof(l->'combat') is distinct from 'object'
    or coalesce((l->'combat'->>'attack')::double precision,0)*1000<0.1*coalesce((l->>'playMs')::double precision,0)
    or coalesce((l->>'damageMilli')::double precision,0)<15000;
  select * into s from trace_private.rank_step(a.points,a.streak,a.shield,b.points,true,v_decay,thrown);
  select * into t from trace_private.rank_step(b.points,b.streak,b.shield,a.points,false,v_decay,false);
  update public.player_ranks set points=s.points,streak=s.streak,shield=s.shield,wins=wins+1,peak=greatest(peak,s.points),updated_at=now() where user_id=wid;
  update public.player_ranks set points=t.points,streak=t.streak,shield=t.shield,losses=losses+1,updated_at=now() where user_id=lid;
  insert into public.rank_history values
    (v_match,wid,lid,true,a.points,s.points,s.delta,s.streak,s.multiplier,v_decay,thrown,v_at),
    (v_match,lid,wid,false,b.points,t.points,t.delta,t.streak,t.multiplier,v_decay,thrown,v_at);
end; $$;
revoke all on function trace_private.rank_step(integer,integer,integer,integer,boolean,double precision,boolean),trace_private.apply_ranked(jsonb) from public,anon,authenticated;

-- Same as 202610280001 with 'ranked' treated like Quick Play (two accounts, no bots, full XP) plus the rank update.
create or replace function public.record_match(p_result jsonb) returns void language plpgsql security definer set search_path='' as $$
declare
  v_match_id uuid := (p_result->>'id')::uuid;
  match_kind text := p_result->>'kind';
  match_status text := p_result->>'status';
  p jsonb; uid uuid; award integer; old_payload jsonb;
begin
  if jsonb_typeof(p_result->'players') is distinct from 'array' or jsonb_array_length(p_result->'players') <> 2 then raise exception 'Exactly two participants required'; end if;
  if (select count(distinct value->>'playerId') from jsonb_array_elements(p_result->'players')) <> 2 then raise exception 'Duplicate participants'; end if;
  if match_kind in ('public','ranked') and exists(select 1 from jsonb_array_elements(p_result->'players') where (value->>'bot')::boolean or nullif(value->>'userId','') is null) then raise exception 'Public matches require two accounts'; end if;
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
      when match_kind in ('public','ranked') then case when p->>'outcome'='win' then 100 else 40 end
      when match_kind='ai' then case when p->>'outcome'='win' then 25 else 10 end else 0 end;
    insert into public.match_participants values(v_match_id,p->>'playerId',uid,p->>'name',(p->>'bot')::boolean,p->>'outcome',(p->>'roundsWon')::integer,(p->>'damageMilli')::bigint,(p->>'receivedMilli')::bigint,(p->>'trackingMs')::bigint,(p->>'opportunityMs')::bigint,(p->>'playMs')::bigint,award);
    if uid is not null and match_status<>'cancelled' then
      insert into public.player_progress(user_id,total_xp) values(uid,award) on conflict(user_id) do update set total_xp=public.player_progress.total_xp+excluded.total_xp,updated_at=now();
      insert into public.player_stats values(uid,match_kind,(p->>'outcome'='win')::integer,(p->>'outcome'='loss')::integer,(p->>'roundsWon')::integer,(p->>'damageMilli')::bigint,(p->>'receivedMilli')::bigint,(p->>'trackingMs')::bigint,(p->>'opportunityMs')::bigint,(p->>'playMs')::bigint)
      on conflict(user_id,kind) do update set wins=public.player_stats.wins+excluded.wins,losses=public.player_stats.losses+excluded.losses,rounds_won=public.player_stats.rounds_won+excluded.rounds_won,damage_milli=public.player_stats.damage_milli+excluded.damage_milli,received_milli=public.player_stats.received_milli+excluded.received_milli,tracking_ms=public.player_stats.tracking_ms+excluded.tracking_ms,opportunity_ms=public.player_stats.opportunity_ms+excluded.opportunity_ms,play_ms=public.player_stats.play_ms+excluded.play_ms;
    end if;
  end loop;
  insert into trace_private.result_receipts values(v_match_id,p_result);
  if match_kind='ranked' then perform trace_private.apply_ranked(p_result); end if;
end; $$;

-- The game server reads a player's rank and XP when they join the ranked queue.
create function public.ranked_profile(p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('points',coalesce((select points from public.player_ranks where user_id=p_user),0),'xp',coalesce((select total_xp from public.player_progress where user_id=p_user),0));
$$;
revoke all on function public.ranked_profile(uuid) from public,anon,authenticated;
grant execute on function public.ranked_profile(uuid) to service_role;

create function public.ranked_leaderboard(p_scope text default 'global',p_offset integer default 0)
returns table(rank bigint,user_id uuid,username text,points integer,wins integer,losses integer,streak integer)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  if p_scope is null or p_scope not in ('global','friends') or p_offset is null or p_offset not between 0 and 100000 then raise exception 'Invalid leaderboard filter.'; end if;
  return query
  select row_number() over(order by r.points desc,r.wins desc,p.username_display collate "C",r.user_id),r.user_id,p.username_display,r.points,r.wins,r.losses,r.streak
  from public.player_ranks r join public.profiles p on p.user_id=r.user_id
  where r.wins+r.losses>0 and (p_scope='global' or r.user_id=auth.uid() or exists(
    select 1 from public.friendships f where f.accepted and least(f.sender,f.recipient)=least(auth.uid(),r.user_id) and greatest(f.sender,f.recipient)=greatest(auth.uid(),r.user_id)))
  order by 1 limit 50 offset p_offset;
end; $$;
revoke all on function public.ranked_leaderboard(text,integer) from public,anon,authenticated;
grant execute on function public.ranked_leaderboard(text,integer) to authenticated;

-- Same as 202611030001 plus the 'ranked' filter and the caller's rank change.
create or replace function public.match_history(p_kind text default null,p_before timestamptz default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); result jsonb;
begin
  if owner_id is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  if (p_kind is not null and p_kind not in ('public','private','ai','ranked')) or p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid match history filter.'; end if;
  select coalesce(jsonb_agg(h.entry order by h.completed_at desc,h.id),'[]'::jsonb) into result from (
    select r.id,r.completed_at,jsonb_build_object('id',r.id,'kind',r.kind,'mode',r.mode,'status',r.status,'reason',r.reason,'started_at',r.started_at,'completed_at',r.completed_at,
      'rank',(select jsonb_build_object('before',k.before,'after',k.after,'delta',k.delta,'multiplier',k.multiplier,'decay',k.decay,'flagged',k.flagged) from public.rank_history k where k.match_id=r.id and k.user_id=owner_id),
      'players',(select jsonb_agg(jsonb_build_object('id',p.player_id,'me',coalesce(p.user_id=owner_id,false),'name',p.name,'bot',p.bot,'outcome',p.outcome,'rounds_won',p.rounds_won,
        'damage_milli',p.damage_milli,'received_milli',p.received_milli,'xp',p.xp,'combat',c.totals,'rounds',c.rounds) order by coalesce(p.user_id=owner_id,false) desc,p.player_id)
        from public.match_participants p left join public.match_combat c on c.match_id=p.match_id and c.player_id=p.player_id where p.match_id=r.id)) entry
    from public.match_participants mine join public.match_results r on r.id=mine.match_id
    where mine.user_id=owner_id and (p_kind is null or r.kind=p_kind) and (p_before is null or r.completed_at<p_before)
    order by r.completed_at desc,r.id limit p_limit
  ) h;
  return result;
end; $$;
commit;
