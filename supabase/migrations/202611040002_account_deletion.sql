-- Apply once after 202611040001_ranked.sql, BEFORE deploying the server with account deletion.
-- Deleting an Auth user (from the game's Account page, or from the dashboard) cascades to public.profiles, and from there to
-- progress, stats, ranks and friends. Opponents keep their match history, so the deleted player's name is scrubbed from it here,
-- while those rows can still be found by user id. The username is released for others to claim.
begin;
create function trace_private.forget_rounds(p_rounds jsonb, p_player text) returns jsonb language sql immutable set search_path='' as $$
  select case when jsonb_typeof(p_rounds) is distinct from 'array' then p_rounds else coalesce((
    select jsonb_agg(case when jsonb_typeof(r->'players')='array' then jsonb_set(r,'{players}',coalesce((
      select jsonb_agg(case when q->>'id'=p_player then q||'{"name":"Deleted player"}' else q end order by j)
      from jsonb_array_elements(r->'players') with ordinality y(q,j)),'[]')) else r end order by i)
    from jsonb_array_elements(p_rounds) with ordinality x(r,i)),'[]') end;
$$;
create function trace_private.forget_player() returns trigger language plpgsql security definer set search_path='' as $$
declare gone record;
begin
  for gone in select match_id,player_id from public.match_participants where user_id=old.user_id loop
    update public.match_combat set rounds=trace_private.forget_rounds(rounds,gone.player_id) where match_id=gone.match_id;
    -- Receipts only answer retries, and the server refuses deletion while a result is still unsaved.
    update trace_private.result_receipts set payload=jsonb_set(payload,'{players}',(
      select jsonb_agg(case when p->>'playerId'=gone.player_id then p||'{"userId":null,"name":"Deleted player"}' else p end
        ||case when p ? 'rounds' then jsonb_build_object('rounds',trace_private.forget_rounds(p->'rounds',gone.player_id)) else '{}' end order by i)
      from jsonb_array_elements(payload->'players') with ordinality x(p,i))) where match_id=gone.match_id;
  end loop;
  update public.match_participants set name='Deleted player' where user_id=old.user_id;
  return old;
end; $$;
revoke all on function trace_private.forget_rounds(jsonb,text),trace_private.forget_player() from public,anon,authenticated;
create trigger forget_player before delete on public.profiles for each row execute function trace_private.forget_player();
commit;
