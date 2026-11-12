-- foto.sql — tekeningen van foto's (12 nov 2026). Migratie `monster_foto_tekening`.
-- Privé-bucket `monster-prive` (niet openbaar) en tabel `foto_tekening`. Alleen de Edge Function monster-foto (service role)
-- leest en schrijft; anon en authenticated hebben geen rechten. De regie en het kernscherm komen erbij via de functie
-- met de regiesleutel en krijgen kortlevende ondertekende links.
-- Na het feest: tabel en bucket mogen weg zodra Job de tekeningen heeft gedownload.

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('monster-prive', 'monster-prive', false, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false;

create table if not exists foto_tekening (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references game(id) on delete cascade,
  soort       text not null check (soort in ('groep', 'feest', 'portret')),
  player_id   uuid references player(id) on delete set null,
  stijl       text not null check (stijl in ('strip', 'prent')),
  status      text not null default 'bezig' check (status in ('bezig', 'klaar', 'fout')),
  fout        jsonb,
  pad         text,
  model       text,
  quality     text,
  ms          int,
  kosten_usd  numeric,
  goedgekeurd boolean not null default false,
  created_at  timestamptz not null default now(),
  klaar_at    timestamptz
);
create index if not exists foto_tekening_game on foto_tekening (game_id, created_at desc);
alter table foto_tekening enable row level security;
revoke all on foto_tekening from anon, authenticated;

-- 12 nov avond: originele foto's op volle resolutie in dezelfde privé-bucket (map <spel-id>/origineel/), via de functie monster-origineel.
-- iPhones kunnen HEIC aanleveren, dus dat mag er ook in.
update storage.buckets set allowed_mime_types = array['image/png','image/jpeg','image/webp','image/heic','image/heif'] where id = 'monster-prive';
