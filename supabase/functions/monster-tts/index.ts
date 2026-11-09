// monster-tts — maakt van een zin een mp3 met de stem van Mecha-Pof (ElevenLabs Text-to-Speech)
// en bewaart die in de bucket `monster` onder tts/<versie>/<sha256 van de tekst>.mp3.
// De app probeert eerst die openbare URL zelf; alleen als hij nog niet bestaat roept hij deze functie aan.
// Zo wordt elke zin maar één keer gemaakt ("vast opgenomen"), en nieuwe zinnen (regie, hints) live.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   ELEVENLABS_API_KEY     sleutel met recht "Text to Speech" (naast "ElevenAgents" voor de walkietalkie)
//   ELEVENLABS_VOICE_ID    voice id van de Mecha-Pof-stem (dezelfde als in de agent)
//   ELEVENLABS_TTS_MODEL   optioneel, standaard eleven_multilingual_v2
// SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zet Supabase zelf.
// verify_jwt staat uit (de app heeft geen JWT); misbruik remmen we met de origin-check en een maximale lengte.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED = [/^https:\/\/dedonjon\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const MAX_CHARS = 400;
const BUCKET = "monster";
// Funky en een beetje wild: lage stabiliteit = meer expressie. Aanpassen? Hoog dan ook VOICE_VERSION op in js/voice.js.
const VOICE_SETTINGS = { stability: 0.35, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true, speed: 1.05 };

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const ok = ALLOWED.some((r) => r.test(origin));
  const cors = {
    "Access-Control-Allow-Origin": ok ? origin : "https://dedonjon.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ok) return json({ error: "origin niet toegestaan" }, 403);
  if (req.method !== "POST") return json({ error: "gebruik POST" }, 405);

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim();
  const v = String(body.v ?? "");
  if (!text || text.length > MAX_CHARS) return json({ error: `tekst leeg of langer dan ${MAX_CHARS} tekens` }, 400);
  if (!/^[a-z0-9-]{1,20}$/.test(v)) return json({ error: "ongeldige versie" }, 400);

  const key = Deno.env.get("ELEVENLABS_API_KEY"), voice = Deno.env.get("ELEVENLABS_VOICE_ID");
  if (!key || !voice) return json({ error: "ELEVENLABS_API_KEY of ELEVENLABS_VOICE_ID ontbreekt in de Supabase-secrets" }, 500);
  const model = Deno.env.get("ELEVENLABS_TTS_MODEL") || "eleven_multilingual_v2";

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const path = `tts/${v}/${await sha256(text)}.mp3`;
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  // Bestaat hij al (bijv. twee telefoons tegelijk)? Dan meteen teruggeven.
  const head = await fetch(url, { method: "HEAD" }).catch(() => null);
  if (head?.ok) return json({ url, cached: true });

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg" },
    // language_code werkt alleen bij de v2.5-modellen; andere modellen geven er een fout op.
    body: JSON.stringify({ text, model_id: model, ...(/v2_5/.test(model) ? { language_code: "nl" } : {}), voice_settings: VOICE_SETTINGS }),
  });
  if (!r.ok) return json({ error: `ElevenLabs gaf ${r.status}`, detail: (await r.text()).slice(0, 300) }, 502);
  const mp3 = new Uint8Array(await r.arrayBuffer());

  const up = await sb.storage.from(BUCKET).upload(path, mp3, { contentType: "audio/mpeg", cacheControl: "31536000", upsert: true });
  if (up.error) return json({ error: "opslaan mislukt: " + up.error.message }, 500);
  return json({ url, cached: false });
});
