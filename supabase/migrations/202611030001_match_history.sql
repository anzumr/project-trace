-- Apply once after social_leaderboards, before deploying the Career screen.
-- RLS only lets a player read their own participant row; this returns both sides of matches the caller played,
-- without exposing the opponent's account ID.
begin;
create function public.match_history(p_kind text default null,p_before timestamptz default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); result jsonb;
begin
  if owner_id is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  if (p_kind is not null and p_kind not in ('public','private','ai')) or p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid match history filter.'; end if;
  select coalesce(jsonb_agg(h.entry order by h.completed_at desc,h.id),'[]'::jsonb) into result from (
    select r.id,r.completed_at,jsonb_build_object('id',r.id,'kind',r.kind,'mode',r.mode,'status',r.status,'reason',r.reason,'started_at',r.started_at,'completed_at',r.completed_at,
      'players',(select jsonb_agg(jsonb_build_object('id',p.player_id,'me',coalesce(p.user_id=owner_id,false),'name',p.name,'bot',p.bot,'outcome',p.outcome,'rounds_won',p.rounds_won,
        'damage_milli',p.damage_milli,'received_milli',p.received_milli,'xp',p.xp,'combat',c.totals,'rounds',c.rounds) order by coalesce(p.user_id=owner_id,false) desc,p.player_id)
        from public.match_participants p left join public.match_combat c on c.match_id=p.match_id and c.player_id=p.player_id where p.match_id=r.id)) entry
    from public.match_participants mine join public.match_results r on r.id=mine.match_id
    where mine.user_id=owner_id and (p_kind is null or r.kind=p_kind) and (p_before is null or r.completed_at<p_before)
    order by r.completed_at desc,r.id limit p_limit
  ) h;
  return result;
end; $$;
revoke all on function public.match_history(text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.match_history(text,timestamptz,integer) to authenticated;
commit;
