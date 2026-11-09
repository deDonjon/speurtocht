-- Pannenkoekenmonster 2.0 — Supabase-schema
-- Project: pannenkoekenmonster (lnhliamckstuwiwyzxyl). Uitgerold via apply_migration; idempotent waar het kan.
-- Model: anon LEEST de vijf speltabellen (Realtime werkt daardoor), SCHRIJVEN kan alleen via RPC's.
-- Bewijs voor spelers = eigen code (player_secret), voor de regie = regiesleutel (game_secret).
-- Geheimen staan in aparte tabellen zonder anon-rechten, zodat Realtime ze nooit kan lekken.

create extension if not exists pgcrypto;

-- ============================================================ tabellen
create table if not exists game (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  title         text not null default 'Het Pannenkoekenmonster',
  phase         text not null default 'lobby' check (phase in ('lobby','onderweg','puzzel','finale','klaar')),
  stop_order    uuid[] not null default '{}',
  active_index  int  not null default 0,
  parts         text[] not null default '{}',
  drops         int  not null default 0,
  hints         int  not null default 0,
  energy        int  check (energy between 1 and 3),
  wish_used     boolean not null default false,
  surprise      jsonb,
  settings      jsonb not null default '{"radius":20,"min_gap":150,"any_can_submit":false}'::jsonb,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists game_secret (
  game_id    uuid primary key references game(id) on delete cascade,
  regie_key  text not null unique
);

create table if not exists player (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references game(id) on delete cascade,
  name          text not null,
  is_birthday   boolean not null default false,
  part          text check (part in ('lijf','ogen','neus','mond','armen','benen','hoed')),
  talent        text check (talent in ('speurneus','kaartlezer','codekraker','rekenmeester','tijdbewaker','sleutelbewaarder')),
  color         text,
  badges        text[] not null default '{}',
  device_id     text,
  last_seen_at  timestamptz,
  lat           double precision,
  lng           double precision,
  acc           real,
  battery       real,
  updated_at    timestamptz not null default now()
);

create table if not exists player_secret (
  player_id         uuid primary key references player(id) on delete cascade,
  code              text not null unique check (code ~ '^[0-9]{4}$'),
  mission           text,
  mission_shown_at  timestamptz,
  mission_done      boolean not null default false
);

create table if not exists stop (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references game(id) on delete cascade,
  seq        int  not null default 0,
  key        text check (key in ('start','home')),
  name       text not null default '',
  clue       text not null default '',
  lat        double precision not null,
  lng        double precision not null,
  radius     int,
  part       text check (part in ('lijf','ogen','neus','mond','armen','benen','hoed')),
  puzzles    jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (game_id, key)
);

create table if not exists stop_secret (
  stop_id  uuid primary key references stop(id) on delete cascade,
  geheim   jsonb not null default '{}'::jsonb
);

create table if not exists puzzle_state (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references game(id) on delete cascade,
  stop_id     uuid not null references stop(id) on delete cascade,
  variant     int  not null default 0,
  seed        int  not null default 0,
  moves       jsonb not null default '[]'::jsonb,
  hints       int  not null default 0,
  arrived_at  timestamptz not null default now(),
  solved_at   timestamptz,
  solved_by   uuid references player(id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique (game_id, stop_id)
);

create table if not exists event (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references game(id) on delete cascade,
  at         timestamptz not null default now(),
  type       text not null,
  actor      text not null check (actor in ('regie','player','system')),
  player_id  uuid references player(id) on delete set null,
  payload    jsonb not null default '{}'::jsonb
);
create index if not exists event_game_at on event (game_id, at desc);
create index if not exists player_game on player (game_id);
create index if not exists stop_game_seq on stop (game_id, seq);

-- updated_at bijhouden
create or replace function _touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['game','player','stop','puzzle_state'] loop
    execute format('drop trigger if exists touch on %I; create trigger touch before update on %I for each row execute function _touch()', t, t);
  end loop;
end $$;

-- ============================================================ rechten en RLS
alter table game          enable row level security;
alter table player        enable row level security;
alter table stop          enable row level security;
alter table puzzle_state  enable row level security;
alter table event         enable row level security;
alter table game_secret   enable row level security;
alter table player_secret enable row level security;
alter table stop_secret   enable row level security;

revoke all on game, player, stop, puzzle_state, event, game_secret, player_secret, stop_secret from anon, authenticated;
grant select on game, player, stop, puzzle_state, event to anon, authenticated;

drop policy if exists "lezen" on game;         create policy "lezen" on game         for select to anon, authenticated using (true);
drop policy if exists "lezen" on player;       create policy "lezen" on player       for select to anon, authenticated using (true);
drop policy if exists "lezen" on stop;         create policy "lezen" on stop         for select to anon, authenticated using (true);
drop policy if exists "lezen" on puzzle_state; create policy "lezen" on puzzle_state for select to anon, authenticated using (true);
drop policy if exists "lezen" on event;        create policy "lezen" on event        for select to anon, authenticated using (true);
-- *_secret: RLS aan, geen policies, geen grants → voor anon onzichtbaar; alleen security-definer-functies lezen ze.

-- Realtime: alle vijf speltabellen, met volledige rijen zodat filters op game_id ook bij updates werken.
alter table game         replica identity full;
alter table player       replica identity full;
alter table stop         replica identity full;
alter table puzzle_state replica identity full;
alter table event        replica identity full;
do $$ declare t text; begin
  foreach t in array array['game','player','stop','puzzle_state','event'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- Storage: bucket voor monsterberichten (mp3) en foto's; publiek leesbaar, uploaden via het dashboard.
insert into storage.buckets (id, name, public) values ('monster','monster',true) on conflict (id) do nothing;
drop policy if exists "monster lezen" on storage.objects;
create policy "monster lezen" on storage.objects for select to anon, authenticated using (bucket_id = 'monster');

-- ============================================================ hulpfuncties (niet voor anon)
create or replace function _dist_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = public as $$
  select 2 * 6371000 * asin(sqrt(
    sin(radians(lat2-lat1)/2)^2 + cos(radians(lat1))*cos(radians(lat2))*sin(radians(lng2-lng1)/2)^2))
$$;

create or replace function _log(p_game uuid, p_type text, p_actor text, p_player uuid, p_payload jsonb default '{}'::jsonb)
returns event language sql security definer set search_path = public as $$
  insert into event (game_id, type, actor, player_id, payload) values (p_game, p_type, p_actor, p_player, coalesce(p_payload,'{}'::jsonb)) returning *
$$;

create or replace function _player_by_code(p_code text) returns player
language plpgsql security definer set search_path = public as $$
declare pl player;
begin
  select p.* into pl from player p join player_secret s on s.player_id = p.id where s.code = p_code;
  if not found then raise exception 'Onbekende code' using errcode = 'P0001'; end if;
  return pl;
end $$;

create or replace function _regie_game(p_key text) returns game
language plpgsql security definer set search_path = public as $$
declare g game;
begin
  select g1.* into g from game g1 join game_secret s on s.game_id = g1.id where s.regie_key = p_key;
  if not found then raise exception 'Verkeerde regiesleutel' using errcode = 'P0001'; end if;
  return g;
end $$;

-- Rondt de actieve stop af: puzzel dicht, deel erbij, druppels erbij, volgende stop actief.
create or replace function _finish_stop(p_game uuid, p_stop uuid, p_by uuid, p_drops int, p_actor text)
returns game language plpgsql security definer set search_path = public as $$
declare g game; st stop; next_key text;
begin
  select * into g from game where id = p_game for update;
  select * into st from stop where id = p_stop and game_id = p_game;
  if st.id is null then raise exception 'Stop bestaat niet'; end if;
  if g.stop_order[g.active_index+1] is distinct from p_stop then raise exception 'Dit is niet de actieve stop'; end if;
  insert into puzzle_state (game_id, stop_id) values (p_game, p_stop) on conflict (game_id, stop_id) do nothing;
  update puzzle_state set solved_at = now(), solved_by = p_by where game_id = p_game and stop_id = p_stop and solved_at is null;
  update game set
    parts        = case when st.part is not null and not (st.part = any(parts)) then array_append(parts, st.part) else parts end,
    drops        = drops + greatest(0, coalesce(p_drops, 0)),
    active_index = active_index + 1,
    phase        = case when st.key = 'home' then 'klaar' else 'onderweg' end,
    finished_at  = case when st.key = 'home' then now() else finished_at end
  where id = p_game returning * into g;
  perform _log(p_game, 'stop.solved', p_actor, p_by, jsonb_build_object('stop_id', p_stop, 'part', st.part, 'drops', p_drops, 'by', p_by));
  return g;
end $$;

-- ============================================================ RPC's voor spelers
create or replace function login(p_game text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pl player; sec player_secret; first boolean;
begin
  select p.* into pl from player p join player_secret s on s.player_id = p.id join game g on g.id = p.game_id
    where g.code = p_game and s.code = p_code;
  if not found then raise exception 'Onbekende code' using errcode = 'P0001'; end if;
  select * into sec from player_secret where player_id = pl.id;
  first := sec.mission_shown_at is null;
  update player set device_id = p_device, last_seen_at = now() where id = pl.id returning * into pl;
  if first then update player_secret set mission_shown_at = now() where player_id = pl.id; end if;
  return jsonb_build_object('player', to_jsonb(pl), 'mission', case when first then sec.mission end, 'mission_first_time', first);
end $$;

create or replace function heartbeat(p_codes text[], p_lat double precision default null, p_lng double precision default null,
                                     p_acc real default null, p_battery real default null)
returns void language sql security definer set search_path = public as $$
  update player set last_seen_at = now(),
    lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng), acc = coalesce(p_acc, acc), battery = coalesce(p_battery, battery)
  where id in (select player_id from player_secret where code = any(p_codes))
$$;

create or replace function arrive(p_code text, p_stop uuid)
returns puzzle_state language plpgsql security definer set search_path = public as $$
declare pl player; g game; st stop; ps puzzle_state; n int;
begin
  pl := _player_by_code(p_code);
  select * into g from game where id = pl.game_id for update;
  if g.phase not in ('onderweg','puzzel','finale') then raise exception 'Het spel loopt niet'; end if;
  if g.stop_order[g.active_index+1] is distinct from p_stop then raise exception 'Dit is niet de actieve stop'; end if;
  select * into st from stop where id = p_stop;
  select * into ps from puzzle_state where game_id = g.id and stop_id = p_stop;
  if not found then
    n := greatest(1, jsonb_array_length(st.puzzles));
    insert into puzzle_state (game_id, stop_id, variant, seed)
      values (g.id, p_stop, floor(random()*n)::int, floor(random()*2147483647)::int) returning * into ps;
    update game set phase = case when st.key = 'home' then 'finale' else 'puzzel' end where id = g.id;
    perform _log(g.id, 'stop.arrived', 'player', pl.id, jsonb_build_object('stop_id', p_stop));
  end if;
  return ps;
end $$;

-- Normalisatie voor geheime codes (QR): kleine letters, alleen a-z en 0-9. Zelfde als normCode() in js/puzzles/qr.js.
create or replace function _norm_code(t text) returns text language sql immutable set search_path = public as $$
  select regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]', '', 'g')
$$;

-- Een zet achter de puzzel hangen. by/at/ok vult de server zelf in (wat de telefoon meestuurt wordt genegeerd).
-- t = 'scan' (qr.js): de server vergelijkt v met stop_secret.geheim.qr (tekst of lijst) en zet ok:true|false;
-- een goede code wordt niet bewaard. Geen geheim ingesteld → ok:null (de puzzel valt dan terug op config.answer).
create or replace function puzzle_move(p_code text, p_stop uuid, p_move jsonb)
returns puzzle_state language plpgsql security definer set search_path = public as $$
declare pl player; ps puzzle_state; mv jsonb; want jsonb; good boolean;
begin
  pl := _player_by_code(p_code);
  if jsonb_typeof(p_move) <> 'object' or p_move->>'t' is null then raise exception 'Een zet is een object met een veld t'; end if;
  mv := p_move - 'by' - 'at' - 'ok';
  if mv->>'t' = 'scan' then
    mv := jsonb_set(mv, '{v}', to_jsonb(left(coalesce(mv->>'v', ''), 80)));
    select ss.geheim->'qr' into want from stop_secret ss join stop s on s.id = ss.stop_id where ss.stop_id = p_stop and s.game_id = pl.game_id;
    if want is null or jsonb_typeof(want) = 'null' or _norm_code(want #>> '{}') = '' and jsonb_typeof(want) <> 'array' then
      mv := mv || '{"ok": null}'::jsonb;
    else
      select exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(want) = 'array' then want else jsonb_build_array(want) end) w
                     where _norm_code(w) <> '' and _norm_code(w) = _norm_code(mv->>'v')) into good;
      mv := case when good then (mv - 'v') || '{"ok": true}'::jsonb else mv || '{"ok": false}'::jsonb end;
    end if;
  end if;
  update puzzle_state set moves = moves || jsonb_build_array(mv || jsonb_build_object('by', pl.id, 'at', now()))
    where game_id = pl.game_id and stop_id = p_stop and solved_at is null returning * into ps;
  if not found then raise exception 'Geen open puzzel voor deze stop'; end if;
  return ps;
end $$;

create or replace function puzzle_hint(p_code text, p_stop uuid)
returns puzzle_state language plpgsql security definer set search_path = public as $$
declare pl player; ps puzzle_state;
begin
  pl := _player_by_code(p_code);
  update puzzle_state set hints = hints + 1 where game_id = pl.game_id and stop_id = p_stop and solved_at is null returning * into ps;
  if not found then raise exception 'Geen open puzzel voor deze stop'; end if;
  update game set hints = hints + 1 where id = pl.game_id;
  perform _log(pl.game_id, 'hint.given', 'player', pl.id, jsonb_build_object('stop_id', p_stop));
  return ps;
end $$;

create or replace function complete_stop(p_code text, p_stop uuid, p_drops int default 10)
returns game language plpgsql security definer set search_path = public as $$
declare pl player; g game;
begin
  pl := _player_by_code(p_code);
  select * into g from game where id = pl.game_id;
  if not (coalesce(pl.talent = 'sleutelbewaarder', false) or coalesce((g.settings->>'any_can_submit')::boolean, false)) then
    raise exception 'Alleen de Sleutelbewaarder mag indienen';
  end if;
  return _finish_stop(g.id, p_stop, pl.id, p_drops, 'player');
end $$;

create or replace function award_badge(p_code text, p_player uuid, p_badge text)
returns player language plpgsql security definer set search_path = public as $$
declare pl player; target player;
begin
  pl := _player_by_code(p_code);
  update player set badges = array_append(badges, p_badge)
    where id = p_player and game_id = pl.game_id and not (p_badge = any(badges)) returning * into target;
  if found then perform _log(pl.game_id, 'badge.awarded', 'player', pl.id, jsonb_build_object('player_id', p_player, 'badge', p_badge)); end if;
  select * into target from player where id = p_player;
  return target;
end $$;

create or replace function log_event(p_code text, p_type text, p_payload jsonb default '{}'::jsonb)
returns event language plpgsql security definer set search_path = public as $$
declare pl player;
begin
  pl := _player_by_code(p_code);
  if p_type not in ('storm.score','fork.vote','wish.used','monster.say') then raise exception 'Dit type mag een speler niet sturen'; end if;
  if p_type = 'wish.used' then
    if not pl.is_birthday then raise exception 'Alleen de jarige heeft een Verjaardagswens'; end if;
    update game set wish_used = true where id = pl.game_id and wish_used = false;
    if not found then raise exception 'De Verjaardagswens is al gebruikt'; end if;
  end if;
  return _log(pl.game_id, p_type, 'player', pl.id, p_payload);
end $$;

-- ============================================================ RPC's voor de regie
create or replace function regie_check(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g game; begin g := _regie_game(p_key); return jsonb_build_object('ok', true, 'game_id', g.id, 'code', g.code); end $$;

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
    'events',  (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from (select * from event where game_id = g.id order by at desc limit 200) e));
end $$;

-- Start: route in volgorde van seq (chat 7): start vooraan, thuis achteraan, bonusstops (zonder deel) doen niet mee.
-- Met settings.shuffle_route = true: schudden zoals vroeger (tussenstops minstens min_gap uit elkaar waar het kan).
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

create or replace function regie_reset(p_key text, p_keep_log boolean default false) returns game
language plpgsql security definer set search_path = public as $$
declare g game;
begin
  g := _regie_game(p_key);
  delete from puzzle_state where game_id = g.id;
  if not p_keep_log then delete from event where game_id = g.id; end if;
  update player set badges = '{}', device_id = null, lat = null, lng = null, acc = null where game_id = g.id;
  update player_secret set mission_shown_at = null, mission_done = false where player_id in (select id from player where game_id = g.id);
  update game set phase = 'lobby', stop_order = '{}', active_index = 0, parts = '{}', drops = 0, hints = 0, energy = null,
    surprise = null, wish_used = false, started_at = null, finished_at = null where id = g.id returning * into g;
  perform _log(g.id, 'game.reset', 'regie', null, '{}'::jsonb);
  return g;
end $$;

-- Eén rij in event; houdt game.surprise en (bij rolwissel) de talenten bij.
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

create or replace function regie_upsert_stop(p_key text, p_stop jsonb) returns stop
language plpgsql security definer set search_path = public as $$
declare g game; st stop; sid uuid;
begin
  g := _regie_game(p_key);
  sid := coalesce((p_stop->>'id')::uuid, gen_random_uuid());
  insert into stop (id, game_id, seq, key, name, clue, lat, lng, radius, part, puzzles)
    values (sid, g.id, coalesce((p_stop->>'seq')::int, 0), nullif(p_stop->>'key',''), coalesce(p_stop->>'name',''), coalesce(p_stop->>'clue',''),
            (p_stop->>'lat')::double precision, (p_stop->>'lng')::double precision, (p_stop->>'radius')::int, nullif(p_stop->>'part',''),
            coalesce(p_stop->'puzzles','[]'::jsonb))
  on conflict (id) do update set
    seq = excluded.seq, key = excluded.key, name = excluded.name, clue = excluded.clue, lat = excluded.lat, lng = excluded.lng,
    radius = excluded.radius, part = excluded.part, puzzles = excluded.puzzles
  where stop.game_id = g.id
  returning * into st;
  if p_stop ? 'geheim' then
    insert into stop_secret (stop_id, geheim) values (sid, coalesce(p_stop->'geheim','{}'::jsonb))
    on conflict (stop_id) do update set geheim = excluded.geheim;
  end if;
  return st;
end $$;

create or replace function regie_delete_stop(p_key text, p_stop uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g game; begin g := _regie_game(p_key); delete from stop where id = p_stop and game_id = g.id; end $$;

create or replace function regie_set_player(p_key text, p_player jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g game; pl player; pid uuid; sec player_secret;
begin
  g := _regie_game(p_key);
  pid := coalesce((p_player->>'id')::uuid, gen_random_uuid());
  insert into player (id, game_id, name, is_birthday, part, talent, color)
    values (pid, g.id, coalesce(p_player->>'name','?'), coalesce((p_player->>'is_birthday')::boolean,false),
            nullif(p_player->>'part',''), nullif(p_player->>'talent',''), p_player->>'color')
  on conflict (id) do update set
    name = excluded.name, is_birthday = excluded.is_birthday, part = excluded.part, talent = excluded.talent, color = coalesce(excluded.color, player.color)
  where player.game_id = g.id
  returning * into pl;
  insert into player_secret (player_id, code, mission)
    values (pid, coalesce(nullif(p_player->>'code',''), lpad(floor(random()*10000)::text, 4, '0')), p_player->>'mission')
  on conflict (player_id) do update set
    code = case when nullif(p_player->>'code','') is not null then excluded.code else player_secret.code end,
    mission = case when p_player ? 'mission' then excluded.mission else player_secret.mission end,
    mission_done = coalesce((p_player->>'mission_done')::boolean, player_secret.mission_done);
  select * into sec from player_secret where player_id = pid;
  return to_jsonb(pl) || jsonb_build_object('code', sec.code, 'mission', sec.mission, 'mission_done', sec.mission_done);
end $$;

create or replace function regie_approve_stop(p_key text, p_drops int default 10) returns game
language plpgsql security definer set search_path = public as $$
declare g game; sid uuid;
begin
  g := _regie_game(p_key);
  sid := g.stop_order[g.active_index+1];
  if sid is null then raise exception 'Er is geen actieve stop'; end if;
  perform _log(g.id, 'stop.approve', 'regie', null, jsonb_build_object('stop_id', sid));
  return _finish_stop(g.id, sid, null, p_drops, 'regie');
end $$;

create or replace function regie_hint(p_key text, p_text text default null) returns event
language plpgsql security definer set search_path = public as $$
declare g game; sid uuid;
begin
  g := _regie_game(p_key);
  sid := g.stop_order[g.active_index+1];
  update puzzle_state set hints = hints + 1 where game_id = g.id and stop_id = sid and solved_at is null;
  update game set hints = hints + 1 where id = g.id;
  return _log(g.id, 'hint.given', 'regie', null, jsonb_build_object('stop_id', sid, 'text', p_text));
end $$;

-- ============================================================ uitvoerrechten
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function login(text,text,text), heartbeat(text[],double precision,double precision,real,real), arrive(text,uuid),
  puzzle_move(text,uuid,jsonb), puzzle_hint(text,uuid), complete_stop(text,uuid,int), award_badge(text,uuid,text), log_event(text,text,jsonb),
  regie_check(text), regie_state(text), regie_start(text), regie_reset(text,boolean), regie_event(text,text,jsonb), regie_patch_game(text,jsonb),
  regie_upsert_stop(text,jsonb), regie_delete_stop(text,uuid), regie_set_player(text,jsonb), regie_approve_stop(text,int), regie_hint(text,text)
  to anon, authenticated;

-- ============================================================ seed: één spel, zes speurders, de zeven stops van route A
-- Gelijk getrokken met de echte stops op 9 nov (chat 7; route gekozen in chat 6, zie claude/ROUTE.md). De teaser opent vrijdag om 15:00.
-- De regiesleutel en de spelerscodes komen willekeurig uit de database; de regie leest ze met regie_state(). Ze staan dus nooit in de repo.
-- Bonusstops (B1–B3) staan niet in de seed: regie.html → tab Bonus maakt ze aan als ze worden ingezet.
do $seed$
declare gid uuid; pid uuid; n text; c text;
begin
  if exists (select 1 from game where code = 'hannah10') then return; end if;
  insert into game (code, title, settings) values ('hannah10', 'Mecha-Pof', $j${"radius": 20, "teaser": {"lines": [{"from": "2026-11-09", "part": "lijf", "text": "Bzzzt. Systeem… start… op. Hallo? Is daar iemand? Mijn sensoren pikken zes slimme signalen op in Veghel. Jullie dus. Ik ben Mecha-Pof. Nou ja, een stukje van hem. De rest ben ik kwijt, overal in de buurt. Vrijdag heb ik jullie nodig. Over."}, {"from": "2026-11-10", "part": "ogen", "text": "PIEP PIEP PIEP. Felicitatieprotocol geactiveerd! Hannah is vandaag tien. Tien! Dat zijn meer kaarsjes dan ik vingers heb, en ik heb een garde. Mijn stroopmeter staat op feest. Van harte, Hannah. Over!"}, {"from": "2026-11-11", "part": "mond", "text": "Krrr… statusupdate. Ik heb mijn rooster teruggevonden, dus ik kan weer roepen. HALLO! Oeps, sorry. Nog drie keer slapen. Zoek alvast warme sokken en jullie slimste hoofd. Over."}, {"from": "2026-11-12", "part": "armen", "text": "Bliep. Morgen. MORGEN. Mijn processor is er een beetje zenuwachtig van. Ik heb geruchten gehoord over pannenkoeken. Als dat waar is, repareer ik mezelf extra snel. Neem een opgeladen telefoon mee. Over."}, {"from": "2026-11-13", "text": "SYSTEEM OPGESTART. Vandaag is het zover, speurders. Het dossier opent zodra jullie bij Hannah zijn. Laad je telefoon op, ik laad mijn stroopmeter op. Tot straks. Over en… nog niet sluiten!"}], "until": "2026-11-13T15:00:00+01:00", "enabled": true}, "min_gap": 150, "any_can_submit": false}$j$::jsonb) returning id into gid;
  insert into game_secret (game_id, regie_key) values (gid, 'regie-' || encode(gen_random_bytes(6), 'hex'));

  foreach n in array array['Hannah','Elin','Isa','Evy','Lauren','Julia'] loop
    insert into player (game_id, name, is_birthday, talent) values (gid, n, n = 'Hannah', case when n = 'Hannah' then 'sleutelbewaarder' end) returning id into pid;
    loop
      c := lpad(floor(random()*9000 + 1000)::text, 4, '0');
      exit when not exists (select 1 from player_secret where code = c);
    end loop;
    insert into player_secret (player_id, code) values (pid, c);
  end loop;

  insert into stop (game_id, seq, key, name, clue, lat, lng, radius, part, puzzles)
    select gid, x.seq, x.key, x.name, x.clue, x.lat, x.lng, x.radius, x.part, x.puzzles
    from jsonb_to_recordset($j$[{"seq": 1, "key": "start", "name": "De palenrij bij de zaaier", "clue": "Piep! Mijn pannenkoekenpantser is als een zak bloem neergeploft bij een rij palen, naast het huis met de zaaiende man op de gevel. Loop De Haag af en zoek de palen die allemaal nét een ander lengtetje hebben.", "lat": 51.61734, "lng": 5.560498, "radius": 25, "part": "lijf", "puzzles": [{"hint": "Begin bij de muur en tel met je vinger. Het zijn er meer dan twintig.", "type": "code", "answer": "23", "question": "Mijn pantser is tegen deze palen gestuiterd, tegen elke paal precies één keer. Hoe vaak heb ik \"au\" gezegd? Tel ze allemaal, ook de kleintjes!"}], "geheim": {}}, {"seq": 2, "key": null, "name": "Het bord met de sokjes", "clue": "Mijn LED-ogen zijn naar het zuiden gevlogen en staren nu naar een bord waar zes piepkleine sokjes aan hangen. Zes sokjes, net zoveel als jullie! Speurneus, ga voorop. O ja: mijn gebruiksaanwijzing is onder het bruggetje ernaast gerold.", "lat": 51.614426, "lng": 5.560948, "radius": null, "part": "ogen", "puzzles": [{"hint": "De datum staat als dag-maand-jaar op het bord. En tel de sokjes nog eens.", "type": "slot", "dials": [{"clue": "Op welke dag van de maand is het meisje geboren?", "answer": "6"}, {"clue": "In welke maand? (als cijfer)", "answer": "10"}, {"clue": "Hoeveel sokjes hangen er onder het bord?", "answer": "6"}], "symbols": ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"], "question": "Mijn ogen zitten achter een slot met drie schijven. Alles wat je nodig hebt staat op het bord met de sokjes, en hoe je het afleest staat in mijn gebruiksaanwijzing."}], "geheim": {}}, {"seq": 3, "key": null, "name": "Het veldje aan het pad", "clue": "Snuf snuf… mijn neus, het aardbeiknopje, ligt in het gras op het veldje aan het pad. Kaartlezer, het pad in; het ruikt daar naar natte bladeren en een heel klein beetje stroop.", "lat": 51.61309, "lng": 5.56152, "radius": null, "part": "neus", "puzzles": [{"hint": "Ga uit elkaar staan, ongeveer vijftien grote stappen, en houd de telefoon stil.", "loop": 20, "ring": 15, "type": "formatie", "margin": 8, "maxAcc": 30, "question": "Mijn neus werkt pas als jullie een driehoek om hem heen maken: drie telefoons, ieder op een eigen punt. Kijk op de radar en schuif tot alles groen is."}], "geheim": {}}, {"seq": 4, "key": null, "name": "De Stadsbrink", "clue": "Krrr… mijn luidsprekerrooster is helemaal naar de Stadsbrink gerold. Het pad uit en dan linksaf; waar de straat breder wordt hoor je mij misschien al mompelen.", "lat": 51.613259, "lng": 5.564092, "radius": null, "part": "mond", "puzzles": [{"hint": "Kijk naar het smeedijzeren bord. Mecha-Pof heeft één woordje verkeerd gelezen: hij dacht aan stroop.", "type": "wachtwoord", "image": "https://lnhliamckstuwiwyzxyl.supabase.co/storage/v1/object/public/monster/scout/e6aa0290-3cbb-41c4-99af-d61813c37110/1794236045870-foto-cdd1ae.jpg", "answer": "stadsbrink", "overlay": "DE STROOPBRINK", "password": "stadsbrink|de stadsbrink", "question": "Mijn processor leest het bord hier als DE STROOPBRINK. Dat klopt toch niet? Vergelijk mijn uitlezing met het echte bord aan de muur en zeg het échte woord tegen mij in de walkietalkie, met \"over\" erachter!"}], "geheim": {}}, {"seq": 5, "key": null, "name": "Het groene kastje", "clue": "Mijn spatel en mijn garde zwaaien om hulp bij een groen kastje langs de weg, richting de hoge bomen. Rekenmeester, daar hangt een kaartje met mijn handtekening.", "lat": 51.614586, "lng": 5.56587, "radius": null, "part": "armen", "puzzles": [{"hint": "Het kaartje hangt op ooghoogte aan het groene kastje.", "type": "qr", "question": "Scan het kaartje van Mecha-Pof. Lukt scannen niet? Typ de code die eronder staat."}], "geheim": {"qr": "POF-GARDE-35"}}, {"seq": 6, "key": null, "name": "Het huis met de steen", "clue": "Pssst, pssst… mijn zuigerbenen staan te wiebelen bij huisnummer 11, het huis met de witte rozetten en een oude steen in de muur. Tijdbewaker, de klok tikt!", "lat": 51.616365, "lng": 5.563619, "radius": null, "part": "benen", "puzzles": [{"hint": "Zeg de kleuren hardop mee terwijl de zender knippert, dan onthoud je ze met z'n drieën.", "type": "licht", "speed": 750, "colors": 4, "length": 5, "question": "Mijn zuigers pompen in een kleurenritme en ik ben het kwijt. Eén telefoon zendt de reeks, de andere twee bouwen hem samen na. Kijk goed, het gaat snel!"}], "geheim": {}}, {"seq": 7, "key": "home", "name": "Thuis op het erf", "clue": "Bijna compleet! Mijn jetpack wordt warm. Terug naar het erf, langs het tankstation van de buren (even bijtanken…), tot midden op ons erf. Daar wachten mijn boterknop en mijn stroop-jetpack. En pannenkoeken!", "lat": 51.616194, "lng": 5.561503, "radius": null, "part": "hoed", "puzzles": [{"hint": "Eén iemand telt hardop af, de rest drukt op BOTER.", "type": "sync", "rounds": 2, "window": 900, "question": "De boterknop! Alle telefoons moeten hem precies tegelijk indrukken, anders slaat mijn jetpack af. Tel samen af: drie, twee, één, BOTER!", "question_solo": "De boterknop! Tik precies in de groene zone, drie keer raak, anders slaat mijn jetpack af."}], "geheim": {}}]$j$::jsonb)
      as x(seq int, key text, name text, clue text, lat double precision, lng double precision, radius int, part text, puzzles jsonb, geheim jsonb);
  insert into stop_secret (stop_id, geheim)
    select st.id, coalesce(x.geheim, '{}'::jsonb) from stop st
    join jsonb_to_recordset($j$[{"seq": 1, "geheim": {}}, {"seq": 2, "geheim": {}}, {"seq": 3, "geheim": {}}, {"seq": 4, "geheim": {}}, {"seq": 5, "geheim": {"qr": "POF-GARDE-35"}}, {"seq": 6, "geheim": {}}, {"seq": 7, "geheim": {}}]$j$::jsonb) as x(seq int, geheim jsonb) on x.seq = st.seq
    where st.game_id = gid;
  update game set stop_order = (select array_agg(id order by seq) from stop where game_id = gid) where id = gid;
end $seed$;
