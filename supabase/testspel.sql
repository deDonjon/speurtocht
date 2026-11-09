-- testspel.sql — een apart spel 'test' naast 'hannah10', om de app zelf te proberen zonder het echte spel te raken.
-- Kopie van de stops (met geheimen) van hannah10, drie testspelers en een eigen regiesleutel. De app kiest het spel met ?spel=test
-- (js/sync.js onthoudt die keuze op het toestel; ?spel=hannah10 zet hem terug). Eenmalig uitvoeren; doet niets als 'test' al bestaat.
do $$
declare src game; g uuid := gen_random_uuid(); m jsonb := '{}'; s stop; nid uuid; ord uuid[] := '{}'; x uuid;
begin
  if exists (select 1 from game where code = 'test') then raise notice 'testspel bestaat al'; return; end if;
  select * into src from game where code = 'hannah10';
  insert into game (id, code, title, phase, settings)
    values (g, 'test', 'Testspel Mecha-Pof', 'lobby', (src.settings - 'teaser' - 'kern_at'));
  insert into game_secret (game_id, regie_key) values (g, 'job-test-7319');
  for s in select * from stop where game_id = src.id order by seq loop
    nid := gen_random_uuid(); m := m || jsonb_build_object(s.id::text, nid);
    insert into stop (id, game_id, seq, key, name, clue, lat, lng, radius, part, puzzles)
      values (nid, g, s.seq, s.key, s.name, s.clue, s.lat, s.lng, s.radius, s.part, s.puzzles);
    insert into stop_secret (stop_id, geheim) select nid, geheim from stop_secret where stop_id = s.id;
  end loop;
  foreach x in array src.stop_order loop ord := ord || (m->>x::text)::uuid; end loop;
  update game set stop_order = ord where id = g;
  with p as (insert into player (game_id, name, is_birthday, talent) values
      (g, 'Job', true, 'sleutelbewaarder'), (g, 'Test 2', false, 'kaartlezer'), (g, 'Test 3', false, 'speurneus') returning id, name)
    insert into player_secret (player_id, code) select id, case name when 'Job' then '4242' when 'Test 2' then '4243' else '4244' end from p;
end $$;
select g.code, g.phase, array_length(g.stop_order, 1) stops, (select count(*) from player where game_id = g.id) spelers from game g where g.code = 'test';
