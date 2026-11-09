-- board.sql — kaartdata voor het 3D-speelbord (js/board.js, bord.html).
-- De Edge Function `board-osm` haalt de echte kaart (OpenStreetMap: gebouwen, straten, paden, water, groen, bomen) één keer op
-- en bewaart hem hier als rij key='osm'. Alle telefoons lezen hem hier; niemand hoeft op het feest bij OpenStreetMap aan te kloppen.
-- Schrijven kan alleen de Edge Function (service role); anon mag lezen.
create table if not exists board_data (
  key        text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table board_data enable row level security;
drop policy if exists board_data_read on board_data;
create policy board_data_read on board_data for select to anon, authenticated using (true);
grant select on board_data to anon, authenticated;
