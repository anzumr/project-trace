-- Usernames are permanent once claimed. Run once in the Supabase SQL editor as the database owner,
-- after the earlier migrations. claim_username now only creates a profile or re-confirms the same name.
begin;
create or replace function public.claim_username(p_username text) returns public.profiles
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
  -- Serialize first claims for one account.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  select * into previous from public.profiles where user_id = owner_id for update;
  if found then
    if previous.username_display = candidate then return previous; end if;
    raise exception 'Usernames cannot be changed once claimed.' using errcode = 'UN001';
  end if;
  insert into public.profiles(user_id, username_display) values (owner_id, candidate) returning * into result;
  return result;
end;
$$;
revoke all on function public.claim_username(text) from public, anon;
grant execute on function public.claim_username(text) to authenticated;
commit;
