-- teaser.sql — voorpret vóór het feest (zie js/teaser.js en claude/MECHA-POF-SPEL.md). Uitgerold als migratie `teaser_visits` (9 nov 2026).
-- Instellingen staan in game.settings.teaser = { until, enabled, lines:[{from, part, text}] } (aan te passen in regie.html → Spel → Voorpret).
create table if not exists teaser_visit (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references game(id) on delete cascade,
  device_id   text not null,
  name_typed  text not null default '',
  player_id   uuid references player(id) on delete set null,
  first_at    timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  visits      int not null default 1,
  plays       int not null default 0,
  unique (game_id, device_id)
);
alter table teaser_visit enable row level security;
revoke all on teaser_visit from anon, authenticated;

-- Naam vergelijken zonder hoofdletters, spaties en accenten (Evy = evy = EVY = " Evy ").
create or replace function _norm_name(t text) returns text language sql immutable set search_path = public as $$
  select regexp_replace(lower(translate(coalesce(t,''), 'áàäâãéèëêíìïîóòöôõúùüûçñýÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÇÑÝ', 'aaaaaeeeeiiiiooooouuuucnyaaaaaeeeeiiiiooooouuuucny')), '[^a-z0-9]', '', 'g')
$$;
revoke execute on function _norm_name(text) from public, anon, authenticated;

-- Aanroepbaar door anon: naam proberen, bezoek tellen. Geeft de gevonden speler (zonder code) of null terug.
create or replace function teaser_hello(p_game text, p_name text, p_device text, p_play boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g game; pl player; n text; dev text;
begin
  select * into g from game where code = p_game;
  if not found then raise exception 'Onbekend spel' using errcode = 'P0001'; end if;
  n := left(coalesce(p_name,''), 40); dev := left(coalesce(p_device,''), 64);
  if dev = '' then raise exception 'Geen toestel' using errcode = 'P0001'; end if;
  select * into pl from player where game_id = g.id and _norm_name(name) = _norm_name(n) limit 1;
  insert into teaser_visit (game_id, device_id, name_typed, player_id, plays)
    values (g.id, dev, n, pl.id, case when p_play then 1 else 0 end)
  on conflict (game_id, device_id) do update set
    last_at = now(), visits = teaser_visit.visits + 1,
    name_typed = case when excluded.name_typed <> '' then excluded.name_typed else teaser_visit.name_typed end,
    player_id = coalesce(excluded.player_id, teaser_visit.player_id),
    plays = teaser_visit.plays + (case when p_play then 1 else 0 end);
  return jsonb_build_object('player', case when pl.id is null then null else jsonb_build_object('id', pl.id, 'name', pl.name, 'is_birthday', pl.is_birthday, 'part', pl.part, 'talent', pl.talent) end,
                            'teaser', g.settings->'teaser');
end $$;
grant execute on function teaser_hello(text, text, text, boolean) to anon, authenticated;

-- regie_state: bezoekers van de teaser erbij (sleutel teaser_visits).
create or replace function regie_state(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g game;
begin
  g := _regie_game(p_key);
  return jsonb_build_object(
    'game', to_jsonb(g),
    'players', (select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('code', s.code, 'mission', s.mission, 'mission_shown_at', s.mission_shown_at, 'mission_done', s.mission_done) order by p.name), '[]'::jsonb)
                from player p left join player_secret s on s.player_id = p.id where p.game_id = g.id),
    'stops',   (select coalesce(jsonb_agg(to_jsonb(st) || jsonb_build_object('geheim', coalesce(ss.geheim,'{}'::jsonb)) order by st.seq), '[]'::jsonb)
                from stop st left join stop_secret ss on ss.stop_id = st.id where st.game_id = g.id),
    'puzzle_states', (select coalesce(jsonb_agg(to_jsonb(ps)), '[]'::jsonb) from puzzle_state ps where ps.game_id = g.id),
    'events',  (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from (select * from event where game_id = g.id order by at desc limit 200) e),
    'teaser_visits', (select coalesce(jsonb_agg(to_jsonb(v) order by v.last_at desc), '[]'::jsonb) from teaser_visit v where v.game_id = g.id));
end $$;
