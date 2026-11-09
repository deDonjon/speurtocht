-- scout.sql — Scouting: kandidaat-plekken en ideeën die de begeleider live vastlegt met scout.html.
-- Bewijs = regiesleutel (game_secret.regie_key). Media (foto's rondom, video, gesproken notities) staan in de
-- bucket `monster` onder scout/<plek-id>/…; de tabel bewaart de URL's. Zie claude/SCOUTING.md.
create table if not exists scout_place (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references game(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  name        text not null default '',
  kind        text not null default 'puzzelplek' check (kind in ('puzzelplek','start','thuis','rustpunt','verrassing','qr','oversteek','mooi','idee','afgekeurd')),
  notes       text not null default '',
  lat         double precision,
  lng         double precision,
  acc         double precision,
  photo       text,                         -- kleine jpeg-data-URL (miniatuur) of null
  media       jsonb not null default '[]'::jsonb,  -- [{kind:'foto'|'rondom'|'video'|'audio', url, label?, slot?, seconds?, at}]
  rating      int check (rating between 0 and 3) default 0,
  light       text check (light in ('goed','matig','donker')),
  status      text not null default 'kandidaat' check (status in ('kandidaat','gekozen','afgevallen','verwerkt')),
  order_hint  int,
  tags        jsonb not null default '[]'::jsonb
);
alter table scout_place add column if not exists media jsonb not null default '[]'::jsonb;
create index if not exists scout_place_game on scout_place(game_id, created_at);
alter table scout_place enable row level security;
revoke all on scout_place from anon, authenticated;

create or replace function scout_list(p_key text) returns setof scout_place
language plpgsql security definer set search_path = public as $$
declare g game;
begin
  g := _regie_game(p_key);
  return query select * from scout_place where game_id = g.id order by created_at;
end $$;

create or replace function scout_upsert(p_key text, p_place jsonb) returns scout_place
language plpgsql security definer set search_path = public as $$
declare g game; pid uuid; r scout_place;
begin
  g := _regie_game(p_key);
  if length(coalesce(p_place->>'photo','')) > 400000 then raise exception 'Miniatuur te groot (max 400 kB)' using errcode = 'P0001'; end if;
  pid := coalesce((p_place->>'id')::uuid, gen_random_uuid());
  insert into scout_place (id, game_id, created_at, name, kind, notes, lat, lng, acc, photo, media, rating, light, status, order_hint, tags)
    values (pid, g.id, coalesce((p_place->>'created_at')::timestamptz, now()),
            coalesce(p_place->>'name',''), coalesce(nullif(p_place->>'kind',''),'puzzelplek'), coalesce(p_place->>'notes',''),
            (p_place->>'lat')::double precision, (p_place->>'lng')::double precision, (p_place->>'acc')::double precision,
            nullif(p_place->>'photo',''), coalesce(p_place->'media','[]'::jsonb), coalesce((p_place->>'rating')::int, 0), nullif(p_place->>'light',''),
            coalesce(nullif(p_place->>'status',''),'kandidaat'), (p_place->>'order_hint')::int, coalesce(p_place->'tags','[]'::jsonb))
  on conflict (id) do update set
    updated_at = now(), name = excluded.name, kind = excluded.kind, notes = excluded.notes, lat = excluded.lat, lng = excluded.lng,
    acc = excluded.acc, photo = coalesce(excluded.photo, scout_place.photo), media = excluded.media, rating = excluded.rating, light = excluded.light,
    status = excluded.status, order_hint = excluded.order_hint, tags = excluded.tags
  where scout_place.game_id = g.id
  returning * into r;
  return r;
end $$;

create or replace function scout_delete(p_key text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g game; begin g := _regie_game(p_key); delete from scout_place where id = p_id and game_id = g.id; end $$;

grant execute on function scout_list(text), scout_upsert(text, jsonb), scout_delete(text, uuid) to anon, authenticated;

-- Media (foto's rondom, video, gesproken notities) gaan NIET rechtstreeks de bucket in: de Edge Function `scout-media`
-- controleert de regiesleutel en schrijft met de service role naar monster/scout/<plek-id>/… (zie supabase/functions/scout-media).
