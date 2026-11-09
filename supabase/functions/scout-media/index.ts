// scout-media — upload van een foto, video of gesproken notitie uit scout.html naar de bucket `monster`,
// onder scout/<plek-id>/<tijd>-<rand>.<ext>. Alleen met de regiesleutel (header x-regie-key); de bucket zelf
// blijft dicht voor anon-uploads. Geeft { url } terug (publieke URL, de bucket is openbaar leesbaar).
//
// Headers: x-regie-key (verplicht), x-place (uuid van de plek), x-kind (foto|rondom|video|audio), content-type (van het bestand).
// Body: de ruwe bytes. Max 40 MB. verify_jwt uit (zoals monster-tts); origin-check zoals de andere functies.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED = [/^https:\/\/dedonjon\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const BUCKET = "monster";
const MAX_BYTES = 40 * 1024 * 1024;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav" };

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const ok = ALLOWED.some((r) => r.test(origin));
  const cors = {
    "Access-Control-Allow-Origin": ok ? origin : "https://dedonjon.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-regie-key, x-place, x-kind",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ok) return json({ error: "origin niet toegestaan" }, 403);
  if (req.method !== "POST") return json({ error: "gebruik POST" }, 405);

  const key = req.headers.get("x-regie-key") ?? "";
  const place = req.headers.get("x-place") ?? "";
  const kind = req.headers.get("x-kind") ?? "foto";
  const type = (req.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
  if (!/^[0-9a-f-]{36}$/i.test(place)) return json({ error: "ongeldige plek" }, 400);
  if (!["foto", "rondom", "video", "audio"].includes(kind)) return json({ error: "ongeldig soort" }, 400);
  const ext = EXT[type];
  if (!ext) return json({ error: `bestandstype ${type} niet toegestaan` }, 415);

  const url = Deno.env.get("SUPABASE_URL")!;
  // Regiesleutel controleren met de gewone (anon) client: regie_check gooit een fout bij een verkeerde sleutel.
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
  const { error: keyErr } = await anon.rpc("regie_check", { p_key: key });
  if (keyErr) return json({ error: "verkeerde regiesleutel" }, 401);

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return json({ error: "leeg bestand" }, 400);
  if (bytes.length > MAX_BYTES) return json({ error: "bestand groter dan 40 MB" }, 413);

  const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const path = `scout/${place}/${Date.now()}-${kind}-${crypto.randomUUID().slice(0, 6)}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (error) return json({ error: error.message }, 500);
  return json({ url: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, path, bytes: bytes.length });
});
