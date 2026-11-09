-- Migratie puzzle_move_qr_check (9 nov): QR-code controleren tegen stop_secret.geheim.qr. Ook al verwerkt in schema.sql.
-- Uitrollen: Supabase-dashboard → SQL Editor → dit bestand plakken → Run (of via de connector als migratie).

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

revoke execute on function _norm_code(text) from public, anon, authenticated;
