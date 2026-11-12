// monster-portret — geeft een monteur haar eigen goedgekeurde portrettekening (gemaakt met monster-foto) voor haar eindkaart op de telefoon.
// Bewijs = haar eigen code van vier cijfers (dezelfde als op de monteurspas), plus de spelcode. Geen regiesleutel nodig, en dus ook
// alleen dit: geen lijst, geen andere tekeningen, niets schrijven. JWT uit; alleen https://dedonjon.github.io en localhost.
//   POST json { spel: 'hannah10', codes: ['1234', '5678'] }  (hooguit 2 codes: twee monteurs per telefoon)
//   → { ok: true, portret: { [player_id]: tijdelijke link } }   (leeg als er nog geen goedgekeurd portret is)
// Logboeken: niets over spelers of beelden.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "monster-prive";
const LINK_S = 6 * 3600; // de link blijft zes uur geldig; de pagina vraagt bij elk openen een nieuwe
const ALLOWED = [/^https:\/\/dedonjon\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const ok = ALLOWED.some((r) => r.test(origin));
  const cors = {
    "Access-Control-Allow-Origin": ok ? origin : "https://dedonjon.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ok) return json({ ok: false, error: "origin niet toegestaan" }, 403);
  if (req.method !== "POST") return json({ ok: false, error: "gebruik POST" }, 405);

  let b: any; try { b = await req.json(); } catch { return json({ ok: false, error: "ongeldige JSON" }, 400); }
  const spel = String(b?.spel ?? "");
  const codes = (Array.isArray(b?.codes) ? b.codes : []).map(String).filter((c: string) => /^[0-9]{4}$/.test(c)).slice(0, 2);
  if (!spel || !codes.length) return json({ ok: false, error: "spel en code nodig" }, 400);

  const { data: game } = await db.from("game").select("id").eq("code", spel).maybeSingle();
  if (!game) return json({ ok: false, error: "onbekend spel" }, 404);
  const { data: sec } = await db.from("player_secret").select("player_id").in("code", codes);
  const ids = (sec ?? []).map((s) => s.player_id as string);
  if (!ids.length) return json({ ok: false, error: "onbekende code" }, 401);

  const { data: rijen, error } = await db.from("foto_tekening").select("player_id,pad,created_at")
    .eq("game_id", game.id).eq("soort", "portret").eq("status", "klaar").eq("goedgekeurd", true).in("player_id", ids).order("created_at", { ascending: false });
  if (error) return json({ ok: false, error: "kon de tekening niet ophalen" }, 500);

  const portret: Record<string, string> = {};
  for (const r of rijen ?? []) {
    if (!r.pad || !r.player_id || portret[r.player_id]) continue;
    const { data: s } = await db.storage.from(BUCKET).createSignedUrl(r.pad as string, LINK_S);
    if (s?.signedUrl) portret[r.player_id] = s.signedUrl;
  }
  return json({ ok: true, portret });
});
