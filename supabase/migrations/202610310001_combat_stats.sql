-- Apply once after the accounts and match-results migrations. No historical data is rewritten.
begin;
create table public.match_combat (
  match_id uuid not null,
  player_id text not null,
  user_id uuid references public.profiles(user_id) on delete set null,
  attack_ms bigint not null check(attack_ms between 0 and 86400000),
  tracking_ms bigint not null check(tracking_ms between 0 and attack_ms),
  head_tracking_ms bigint not null check(head_tracking_ms between 0 and tracking_ms),
  head_damage_milli bigint not null check(head_damage_milli between 0 and 100000000),
  longest_ms bigint not null check(longest_ms between 0 and tracking_ms),
  totals jsonb not null check(jsonb_typeof(totals)='object'),
  rounds jsonb not null check(jsonb_typeof(rounds)='array' and jsonb_array_length(rounds)<=128),
  primary key(match_id,player_id),
  foreign key(match_id,player_id) references public.match_participants(match_id,player_id) on delete cascade
);
create table public.player_combat_stats (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  kind text not null check(kind in ('private','public','ai')),
  attack_ms bigint not null, tracking_ms bigint not null,
  head_tracking_ms bigint not null, head_damage_milli bigint not null, longest_ms bigint not null,
  primary key(user_id,kind)
);
alter table public.match_combat enable row level security;
alter table public.player_combat_stats enable row level security;
revoke all on public.match_combat,public.player_combat_stats from public,anon,authenticated;
grant select on public.match_combat,public.player_combat_stats to authenticated;
create policy own_combat on public.match_combat for select to authenticated using(user_id=(select auth.uid()));
create policy own_combat_totals on public.player_combat_stats for select to authenticated using(user_id=(select auth.uid()));

-- Keep the proven result/XP transaction and receipt checks, extend it atomically.
create function public.record_match_combat(p_result jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p jsonb; s jsonb; inserted uuid; uid uuid; v_kind text:=p_result->>'kind';
begin
  perform public.record_match(p_result);
  for p in select value from jsonb_array_elements(p_result->'players') order by value->>'userId' loop
    s:=p->'combat';
    -- Old outbox payloads and old history remain valid and have no invented attack denominator.
    if s is null or s='null'::jsonb then continue; end if;
    uid:=nullif(p->>'userId','')::uuid;
    inserted:=null;
    insert into public.match_combat values(
      (p_result->>'id')::uuid,p->>'playerId',uid,
      round((s->>'attack')::numeric*1000),round((s->>'tracked')::numeric*1000),
      round((s->>'headTracked')::numeric*1000),round((s->>'headDamage')::numeric*1000),round((s->>'longest')::numeric*1000),s,coalesce(p->'rounds','[]'::jsonb))
    on conflict do nothing returning match_id into inserted;
    if inserted is not null and uid is not null and p_result->>'status'<>'cancelled' then
      insert into public.player_combat_stats values(uid,v_kind,round((s->>'attack')::numeric*1000),round((s->>'tracked')::numeric*1000),round((s->>'headTracked')::numeric*1000),round((s->>'headDamage')::numeric*1000),round((s->>'longest')::numeric*1000))
      on conflict(user_id,kind) do update set
        attack_ms=public.player_combat_stats.attack_ms+excluded.attack_ms,
        tracking_ms=public.player_combat_stats.tracking_ms+excluded.tracking_ms,
        head_tracking_ms=public.player_combat_stats.head_tracking_ms+excluded.head_tracking_ms,
        head_damage_milli=public.player_combat_stats.head_damage_milli+excluded.head_damage_milli,
        longest_ms=greatest(public.player_combat_stats.longest_ms,excluded.longest_ms);
    end if;
  end loop;
end; $$;
revoke all on function public.record_match_combat(jsonb) from public,anon,authenticated;
grant execute on function public.record_match_combat(jsonb) to service_role;
commit;
