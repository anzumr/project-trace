-- Apply once after permanent_usernames, before deploying the social UI.
begin;
create table public.friendships (
  sender uuid not null references public.profiles(user_id) on delete cascade,
  recipient uuid not null references public.profiles(user_id) on delete cascade,
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(sender,recipient), check(sender<>recipient)
);
create unique index friendship_pair on public.friendships(least(sender,recipient),greatest(sender,recipient));
create index friendship_recipient on public.friendships(recipient);
create table public.duel_invites (
  sender uuid not null references public.profiles(user_id) on delete cascade,
  recipient uuid not null references public.profiles(user_id) on delete cascade,
  room_code text not null check(room_code ~ '^[A-Z2-9]{5}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '10 minutes',
  primary key(sender,recipient), check(sender<>recipient)
);
create index duel_invite_recipient on public.duel_invites(recipient);
alter table public.friendships enable row level security;
alter table public.duel_invites enable row level security;
revoke all on public.friendships,public.duel_invites from public,anon,authenticated;

create function public.social_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); result jsonb;
begin
  if owner_id is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  select jsonb_build_object(
    'friends',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.user_id,'username',p.username_display,'accepted',f.accepted,'incoming',f.recipient=owner_id) order by p.username_normalized)
      from public.friendships f join public.profiles p on p.user_id=case when f.sender=owner_id then f.recipient else f.sender end
      where owner_id in (f.sender,f.recipient)),'[]'::jsonb),
    'invites',coalesce((select jsonb_agg(jsonb_build_object('user_id',i.sender,'username',p.username_display,'room_code',i.room_code,'expires_at',i.expires_at) order by i.created_at desc)
      from public.duel_invites i join public.profiles p on p.user_id=i.sender
      where i.recipient=owner_id and i.expires_at>now() and exists(select 1 from public.friendships f where f.accepted and least(f.sender,f.recipient)=least(i.sender,i.recipient) and greatest(f.sender,f.recipient)=greatest(i.sender,i.recipient))),'[]'::jsonb)
  ) into result;
  return result;
end; $$;

create function public.social_action(p_action text,p_username text default null,p_target uuid default null,p_code text default null) returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); target_id uuid:=p_target; relation public.friendships;
begin
  if owner_id is null or not exists(select 1 from public.profiles where user_id=owner_id) then raise exception 'Sign in and claim a username first.' using errcode='42501'; end if;
  if p_action='request' then
    select user_id into target_id from public.profiles where username_normalized=lower(btrim(p_username));
    if target_id is null then raise exception 'Username not found.'; end if;
  end if;
  if target_id is null or target_id=owner_id then raise exception 'Choose another player.'; end if;
  -- Pair operations and per-account limits stay atomic under concurrent requests.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(owner_id,target_id)::text,2));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(greatest(owner_id,target_id)::text,2));
  select * into relation from public.friendships where least(sender,recipient)=least(owner_id,target_id) and greatest(sender,recipient)=greatest(owner_id,target_id);
  if p_action='request' then
    if relation.sender is not null then raise exception 'You are already friends or have a pending request.'; end if;
    if (select count(*) from public.friendships where owner_id in (sender,recipient))>=200 or (select count(*) from public.friendships where target_id in (sender,recipient))>=200 then raise exception 'Friend list limit reached (200 including requests).'; end if;
    if (select count(*) from public.friendships where sender=owner_id and not accepted)>=50 then raise exception 'Too many pending friend requests.'; end if;
    insert into public.friendships(sender,recipient) values(owner_id,target_id);
  elsif p_action='accept' then
    if relation.recipient is distinct from owner_id or relation.accepted then raise exception 'Incoming request no longer available.'; end if;
    update public.friendships set accepted=true where sender=target_id and recipient=owner_id;
  elsif p_action='remove' then
    delete from public.friendships where least(sender,recipient)=least(owner_id,target_id) and greatest(sender,recipient)=greatest(owner_id,target_id);
    delete from public.duel_invites where least(sender,recipient)=least(owner_id,target_id) and greatest(sender,recipient)=greatest(owner_id,target_id);
  elsif p_action='invite' then
    if relation.accepted is distinct from true then raise exception 'Only accepted friends can be invited.'; end if;
    if p_code is null or p_code !~ '^[A-Z2-9]{5}$' then raise exception 'Create a private room first.'; end if;
    if exists(select 1 from public.duel_invites where sender=owner_id and recipient=target_id and created_at>now()-interval '30 seconds') then raise exception 'Wait 30 seconds before inviting this friend again.'; end if;
    insert into public.duel_invites(sender,recipient,room_code) values(owner_id,target_id,p_code)
      on conflict(sender,recipient) do update set room_code=excluded.room_code,created_at=now(),expires_at=now()+interval '10 minutes';
  elsif p_action='dismiss' then
    delete from public.duel_invites where sender=target_id and recipient=owner_id;
  else raise exception 'Unknown social action.';
  end if;
end; $$;

create function public.leaderboard(p_scope text default 'global',p_kind text default 'public',p_sort text default 'wins',p_min integer default 1,p_offset integer default 0)
returns table(rank bigint,user_id uuid,username text,wins bigint,losses bigint,win_rate numeric,loss_rate numeric,accuracy numeric,damage numeric,streak numeric)
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  if p_scope is null or p_scope not in ('global','friends') or p_kind is null or p_kind not in ('public','private','ai') or p_sort is null or p_sort not in ('wins','win_rate','accuracy','damage','streak') or p_min is null or p_min not between 1 and 1000 or p_offset is null or p_offset not between 0 and 100000 then raise exception 'Invalid leaderboard filter.'; end if;
  return query
  with entries as (
    select p.user_id,p.username_display,s.wins,s.losses,
      round(100.0*s.wins/nullif(s.wins+s.losses,0),2) win_rate,
      round(100.0*s.losses/nullif(s.wins+s.losses,0),2) loss_rate,
      round(100.0*c.tracking_ms/nullif(c.attack_ms,0),2) accuracy,
      round(s.damage_milli/1000.0,1) damage,round(c.longest_ms/1000.0,2) streak
    from public.player_stats s join public.profiles p on p.user_id=s.user_id
    left join public.player_combat_stats c on c.user_id=s.user_id and c.kind=s.kind
    where s.kind=p_kind and s.wins+s.losses>=p_min and (p_scope='global' or p.user_id=auth.uid() or exists(
      select 1 from public.friendships f where f.accepted and least(f.sender,f.recipient)=least(auth.uid(),p.user_id) and greatest(f.sender,f.recipient)=greatest(auth.uid(),p.user_id)))
  ), ranked as (
    select row_number() over(order by case p_sort when 'wins' then e.wins when 'win_rate' then e.win_rate when 'accuracy' then e.accuracy when 'damage' then e.damage when 'streak' then e.streak end desc nulls last,e.wins desc,e.username_display collate "C",e.user_id) rank,e.* from entries e
  ) select r.rank,r.user_id,r.username_display,r.wins,r.losses,r.win_rate,r.loss_rate,r.accuracy,r.damage,r.streak from ranked r order by r.rank limit 50 offset p_offset;
end; $$;
revoke all on function public.social_state(),public.social_action(text,text,uuid,text),public.leaderboard(text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.social_state(),public.social_action(text,text,uuid,text),public.leaderboard(text,text,text,integer,integer) to authenticated;
commit;
