// monster-music — maakt een instrumentaal dansnummer voor de finale met ElevenLabs Music en bewaart het in de bucket
// `monster` onder music/<naam>.mp3. Eenmalig gebruikt (9 nov) om een paar versies te maken waaruit Job kiest.
// Kostenrem: een naam die al bestaat wordt niet opnieuw gemaakt, en er komen nooit meer dan MAX_TRACKS nummers.
// Secrets: ELEVENLABS_API_KEY (met recht "Music"). verify_jwt uit, zelfde origin-check als monster-tts.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED = [/^https:\/\/dedonjon\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const BUCKET = "monster";
const MAX_TRACKS = 6;
const MODELS = ["music_v1", "music_v2", "music_v2_5"];

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const ok = ALLOWED.some((r) => r.test(origin));
  const cors = { "Access-Control-Allow-Origin": ok ? origin : "https://dedonjon.github.io", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ok) return json({ error: "origin niet toegestaan" }, 403);
  if (req.method !== "POST") return json({ error: "gebruik POST" }, 405);

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? ""), prompt = String(body.prompt ?? "").trim();
  const ms = Math.min(90_000, Math.max(10_000, Number(body.ms) || 60_000));
  const model = MODELS.includes(body.model) ? body.model : "music_v1";
  if (!/^[a-z0-9-]{1,30}$/.test(name)) return json({ error: "ongeldige naam" }, 400);
  if (!prompt || prompt.length > 1000) return json({ error: "prompt leeg of te lang" }, 400);

  const key = Deno.env.get("ELEVENLABS_API_KEY");
  if (!key) return json({ error: "ELEVENLABS_API_KEY ontbreekt" }, 500);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const path = `music/${name}.mp3`;
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const { data: list } = await sb.storage.from(BUCKET).list("music", { limit: 100 });
  const names = (list ?? []).map((f) => f.name);
  if (names.includes(name + ".mp3")) return json({ url, cached: true });
  if (names.filter((n) => n.endsWith(".mp3")).length >= MAX_TRACKS) return json({ error: `maximaal ${MAX_TRACKS} nummers` }, 429);

  const r = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, music_length_ms: ms, model_id: model, force_instrumental: true }),
  });
  if (!r.ok) return json({ error: `ElevenLabs gaf ${r.status}`, detail: (await r.text()).slice(0, 400) }, 502);
  const mp3 = new Uint8Array(await r.arrayBuffer());
  const up = await sb.storage.from(BUCKET).upload(path, mp3, { contentType: "audio/mpeg", cacheControl: "31536000", upsert: false });
  if (up.error) return json({ error: "opslaan mislukt: " + up.error.message }, 500);
  return json({ url, cached: false, bytes: mp3.length, model });
});
