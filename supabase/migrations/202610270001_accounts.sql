-- Phase 5A. Run once in the Supabase SQL editor as the database owner.
begin;
create schema if not exists trace_private;
revoke all on schema trace_private from public, anon, authenticated;
create table trace_private.account_policy (
  singleton boolean primary key default true check (singleton),
  username_cooldown interval not null default interval '30 days' check (username_cooldown >= interval '0 days')
);
insert into trace_private.account_policy default values;
create table trace_private.reserved_usernames (name text primary key check (name = lower(name)));
insert into trace_private.reserved_usernames values
 ('admin'), ('administrator'), ('moderator'), ('support'), ('system'), ('official'), ('trace'), ('projecttrace'), ('null'), ('undefined');
revoke all on all tables in schema trace_private from public, anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username_display text not null check (username_display ~ '^[A-Za-z0-9_]{3,16}$'),
  username_normalized text collate "C" generated always as (lower(username_display)) stored unique,
  created_at timestamptz not null default now(),
  username_changed_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
create policy profiles_read_own on public.profiles for select to authenticated using (user_id = (select auth.uid()));

create function public.claim_username(p_username text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  candidate text := btrim(p_username);
  previous public.profiles;
  result public.profiles;
begin
  if owner_id is null or not exists (select 1 from auth.users where id = owner_id and email_confirmed_at is not null) then
    raise exception 'Confirm your email before claiming a username.' using errcode = '42501';
  end if;
  if candidate is null or candidate !~ '^[A-Za-z0-9_]{3,16}$' then
    raise exception 'Use 3–16 ASCII letters, numbers or underscores.' using errcode = '22023';
  end if;
  if exists (select 1 from trace_private.reserved_usernames where name = lower(candidate)) then
    raise exception 'That username is reserved. Choose another.' using errcode = '22023';
  end if;
  -- Serialize claims/renames for one account, including its first claim.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  select * into previous from public.profiles where user_id = owner_id for update;
  if found then
    if previous.username_display = candidate then return previous; end if;
    if now() < previous.username_changed_at + (select username_cooldown from trace_private.account_policy where singleton) then
      raise exception 'Username changes are on cooldown.' using errcode = 'P0001';
    end if;
    update public.profiles set username_display = candidate, username_changed_at = now() where user_id = owner_id returning * into result;
  else
    insert into public.profiles(user_id, username_display) values (owner_id, candidate) returning * into result;
  end if;
  return result;
end;
$$;
revoke all on function public.claim_username(text) from public, anon;
grant execute on function public.claim_username(text) to authenticated;
commit;
