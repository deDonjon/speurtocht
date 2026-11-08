// monster-token — geeft de app een tijdelijk ElevenLabs-gesprekstoken (WebRTC) voor de walkietalkie.
// De API-sleutel blijft hier op de server. Secrets (Supabase → Edge Functions → Secrets):
//   ELEVENLABS_API_KEY   jouw ElevenLabs API-sleutel (alleen recht op "ElevenAgents")
//   ELEVENLABS_AGENT_ID  het id van de Pannenkoekenmonster-agent
// verify_jwt staat uit (de app heeft een publishable key, geen JWT); misbruik remmen we met een origin-check
// en met de limieten in de agent zelf (max. gespreksduur, max. gelijktijdige gesprekken).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED = [/^https:\/\/dedonjon\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const ok = ALLOWED.some((r) => r.test(origin));
  const cors = {
    "Access-Control-Allow-Origin": ok ? origin : "https://dedonjon.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ok) return json({ error: "origin niet toegestaan" }, 403);

  const key = Deno.env.get("ELEVENLABS_API_KEY"), agent = Deno.env.get("ELEVENLABS_AGENT_ID");
  if (!key || !agent) return json({ error: "ELEVENLABS_API_KEY of ELEVENLABS_AGENT_ID ontbreekt in de Supabase-secrets" }, 500);

  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agent)}`, {
    headers: { "xi-api-key": key },
  });
  if (!r.ok) return json({ error: `ElevenLabs gaf ${r.status}`, detail: (await r.text()).slice(0, 300) }, 502);
  const { token } = await r.json();
  return json({ token });
});
