// monster-origineel — originele foto's van het feest op volle resolutie bewaren (12 nov 2026 avond, besluit Job).
// Los van monster-foto (de tekeningen), zodat die functie ongemoeid blijft. Regiesleutel verplicht (header x-regie-key);
// JWT uit; alleen https://dedonjon.github.io en localhost. Bewaart in de PRIVÉ-bucket monster-prive, map <spel-id>/origineel/.
//
//   POST json {actie:'upload', slot:'groep'|<player_id>, type:'image/jpeg'} → { ok, pad, url }
//        url = ondertekende upload-link (2 uur): de regie zet het bestand er zelf met PUT neer, dus geen limiet van de functie.
//   POST json {actie:'lijst'} → { ok, rijen:[{ bestand, slot, naam, kb, created_at, url }] }   (leeslinks 3 uur geldig)
//
// Logboeken: alleen tijd en aantal; nooit een foto.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const BUCKET = "monster-prive";
const LINK_S = 3 * 3600;
const ALLOWED = [/^https:\/\/dedonjon\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };
const db = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const ok = ALLOWED.some((r) => r.test(origin));
  const cors = {
    "Access-Control-Allow-Origin": ok ? origin : "https://dedonjon.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-regie-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  const fout = (error: string, status: number) => json({ ok: false, error }, status);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ok) return fout("origin niet toegestaan", 403);
  if (req.method !== "POST") return fout("gebruik POST", 405);

  // Regiesleutel → spel. regie_check gooit een fout bij een verkeerde sleutel.
  const anon = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
  const { data: chk, error: keyErr } = await anon.rpc("regie_check", { p_key: req.headers.get("x-regie-key") ?? "" });
  if (keyErr || !chk?.game_id) return fout("verkeerde regiesleutel", 401);
  const gameId: string = chk.game_id;
  const map = `${gameId}/origineel`;

  let b: any; try { b = await req.json(); } catch { return fout("ongeldige JSON", 400); }

  if (b?.actie === "upload") {
    const slot = String(b?.slot ?? ""), ext = EXT[String(b?.type ?? "").toLowerCase()];
    if (!ext) return fout("alleen jpeg, png, webp of heic", 415);
    if (slot !== "groep") {
      if (!/^[0-9a-f-]{36}$/i.test(slot)) return fout("ongeldig slot", 400);
      const { data: p } = await db.from("player").select("id").eq("id", slot).eq("game_id", gameId).maybeSingle();
      if (!p) return fout("onbekende speler", 400);
    }
    const pad = `${map}/${slot}-${Date.now()}.${ext}`;
    const { data: up, error } = await db.storage.from(BUCKET).createSignedUploadUrl(pad);
    if (error || !up?.signedUrl) return fout("kon geen upload-link maken: " + (error?.message ?? "onbekend"), 500);
    console.log(`monster-origineel: upload-link voor ${slot === "groep" ? "groep" : "portret"}`);
    return json({ ok: true, pad, url: up.signedUrl });
  }

  if (b?.actie === "lijst") {
    const { data: files, error } = await db.storage.from(BUCKET).list(map, { limit: 200, sortBy: { column: "created_at", order: "asc" } });
    if (error) return fout(error.message, 500);
    const echte = (files ?? []).filter((f) => f.id && f.name);
    const { data: spelers } = await db.from("player").select("id,name").eq("game_id", gameId);
    const naam = Object.fromEntries((spelers ?? []).map((p) => [p.id, p.name]));
    const links: Record<string, string> = {};
    if (echte.length) {
      const { data: s } = await db.storage.from(BUCKET).createSignedUrls(echte.map((f) => `${map}/${f.name}`), LINK_S);
      for (const x of s ?? []) if (x.path && x.signedUrl) links[x.path] = x.signedUrl;
    }
    return json({ ok: true, rijen: echte.map((f) => {
      const slot = f.name.replace(/-\d+\.[a-z0-9]+$/i, "");
      return { bestand: f.name, slot, naam: slot === "groep" ? null : naam[slot] ?? null, kb: Math.round((Number((f.metadata as any)?.size) || 0) / 1024), created_at: f.created_at, url: links[`${map}/${f.name}`] ?? null };
    }) });
  }
  return fout("onbekende actie", 400);
});
