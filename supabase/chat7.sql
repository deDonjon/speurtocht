-- chat7.sql — finale, loting en bonusstops (chat 7, 9 nov 2026). Migratie `chat7_route_bonus_wish`; ook verwerkt in schema.sql.
-- 1. regie_start: de route volgt `seq` (start vooraan, thuis achteraan). Schudden zoals vroeger alleen met settings.shuffle_route = true.
--    Stops zonder deel en zonder key (bonusopdrachten) doen bij de start niet mee; de regie zet ze later in (tab Bonus).
-- 2. regie_patch_game: kan nu ook `stop_order` (lijst met stop-id's) zetten, voor het inzetten van een bonusstop.
-- 3. regie_event('wish.used'): telt mee als gebruikt (game.wish_used = true), net als wanneer de jarige hem zelf inzet.

create or replace function regie_start(p_key text) returns game
language plpgsql security definer set search_path = public as $$
declare g game; start_id uuid; home_id uuid; mids uuid[]; cand uuid[]; ord uuid[]; best uuid[]; best_min double precision := -1;
        mn double precision; d double precision; a stop; b stop; i int; j int; min_gap double precision; shuffle boolean;
begin
  g := _regie_game(p_key);
  min_gap := coalesce((g.settings->>'min_gap')::double precision, 150);
  shuffle := coalesce((g.settings->>'shuffle_route')::boolean, false);
  select id into home_id  from stop where game_id = g.id and key = 'home';
  if home_id is null then raise exception 'Er is geen stop met key home'; end if;
  select id into start_id from stop where game_id = g.id and key = 'start';
  if start_id is null then select id into start_id from stop where game_id = g.id and key is null and part is not null order by seq limit 1; end if;
  -- tussenstops: alleen stops met een deel (bonusstops zonder deel zet de regie later zelf in)
  select coalesce(array_agg(id order by seq), '{}') into mids from stop
    where game_id = g.id and key is null and part is not null and id is distinct from start_id;
  if not shuffle then
    best := array[start_id] || mids || array[home_id];
    mn := 1e9;
    for j in 1..array_length(best,1)-1 loop
      select * into a from stop where id = best[j]; select * into b from stop where id = best[j+1];
      d := _dist_m(a.lat, a.lng, b.lat, b.lng); if d < mn then mn := d; end if;
    end loop;
    best_min := mn;
  else
    for i in 1..200 loop
      select coalesce(array_agg(x order by random()), '{}') into cand from unnest(mids) x;
      ord := array[start_id] || cand || array[home_id];
      mn := 1e9;
      for j in 1..array_length(ord,1)-1 loop
        select * into a from stop where id = ord[j]; select * into b from stop where id = ord[j+1];
        d := _dist_m(a.lat, a.lng, b.lat, b.lng); if d < mn then mn := d; end if;
      end loop;
      if mn > best_min then best := ord; best_min := mn; end if;
      exit when mn >= min_gap;
    end loop;
  end if;
  delete from puzzle_state where game_id = g.id;
  update game set stop_order = best, active_index = 0, phase = 'onderweg', parts = '{}', drops = 0, hints = 0,
    surprise = null, wish_used = false, started_at = now(), finished_at = null where id = g.id returning * into g;
  perform _log(g.id, 'game.start', 'regie', null, jsonb_build_object('stop_order', to_jsonb(best), 'min_distance_m', round(best_min), 'shuffled', shuffle));
  return g;
end $$;

create or replace function regie_patch_game(p_key text, p_patch jsonb) returns game
language plpgsql security definer set search_path = public as $$
declare g game; ord uuid[];
begin
  g := _regie_game(p_key);
  if p_patch ? 'stop_order' then
    select coalesce(array_agg(x::uuid order by n), '{}') into ord from jsonb_array_elements_text(p_patch->'stop_order') with ordinality t(x, n);
    if exists (select 1 from unnest(ord) s where not exists (select 1 from stop where id = s and game_id = g.id)) then
      raise exception 'stop_order bevat een onbekende stop';
    end if;
  end if;
  update game set
    title        = coalesce(p_patch->>'title', title),
    settings     = coalesce(settings || (p_patch->'settings'), settings),
    phase        = coalesce(p_patch->>'phase', phase),
    active_index = coalesce((p_patch->>'active_index')::int, active_index),
    stop_order   = case when p_patch ? 'stop_order' then ord else stop_order end,
    energy       = case when p_patch ? 'energy' then (p_patch->>'energy')::int else energy end,
    surprise     = case when p_patch ? 'surprise' then nullif(p_patch->'surprise','null'::jsonb) else surprise end
  where id = g.id returning * into g;
  return g;
end $$;

create or replace function regie_event(p_key text, p_type text, p_payload jsonb default '{}'::jsonb) returns event
language plpgsql security definer set search_path = public as $$
declare g game; e event; k text; v text;
begin
  g := _regie_game(p_key);
  p_payload := coalesce(p_payload, '{}'::jsonb);
  if p_type in ('thief.start','storm.start','fork.open','finale.timer') then
    update game set surprise = jsonb_build_object('kind', split_part(p_type,'.',1), 'started_at', now(), 'data', p_payload) where id = g.id;
  elsif p_type in ('thief.caught','thief.end','storm.end','fork.result') then
    update game set surprise = null where id = g.id;
  elsif p_type = 'roles.shuffle' then
    for k, v in select * from jsonb_each_text(coalesce(p_payload->'talents','{}'::jsonb)) loop
      update player set talent = v where id = k::uuid and game_id = g.id;
    end loop;
  elsif p_type = 'energy' then
    update game set energy = (p_payload->>'level')::int where id = g.id;
  elsif p_type = 'wish.used' then
    update game set wish_used = true where id = g.id; -- namens de jarige: telt als gebruikt (de 🎂-knop verdwijnt)
  end if;
  e := _log(g.id, p_type, 'regie', null, p_payload);
  return e;
end $$;

revoke execute on function regie_start(text), regie_patch_game(text,jsonb), regie_event(text,text,jsonb) from public;
grant execute on function regie_start(text), regie_patch_game(text,jsonb), regie_event(text,text,jsonb) to anon, authenticated;
