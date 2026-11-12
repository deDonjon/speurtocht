// monster-foto — PROEF (12 nov 2026): tekent een foto om tot Mecha-Pof-tekening via de beeld-bewerkfunctie van OpenAI.
// Losstaand van het spel; alleen gebruikt door test/foto.html.
//
// Aanvraag: POST multipart/form-data, header x-regie-key (verplicht).
//   foto     de foto (jpeg/png/webp, door de pagina al verkleind tot ±1600 px lange zijde), max 8 MB
//   stijl    het stijlvoorbeeld (test/mecha-pof-stijl.png), max 3 MB
//   variant  strip | prent                          (welke opdrachttekst, zie OPDRACHT hieronder)
//   size     1536x1024 | 1024x1536 | 1024x1024 | auto
//   quality  low | medium | high | xhigh            (standaard high)
//   model    zie MODELLEN                           (standaard gpt-image-2.5-sunburst)
// Antwoord: JSON. Omdat een beeld tot 2 minuten kan duren en Supabase na 150 s zonder antwoord afbreekt, gaat het antwoord
// direct open en komen er elke 10 s spaties (geldige JSON-witruimte) tot het resultaat er is. De HTTP-status is dan altijd
// 200: kijk naar `ok` in de JSON.  { ok:true, b64, mime, ms, model, variant, usage, kosten_usd }
//                                  { ok:false, error (letterlijke melding van OpenAI), code, type, status, details }
//
// Bewaart niets: geen opslag in de bucket, geen foto, opdracht of resultaat in de logboeken.
// Het geheim OPENAI_API_KEY staat in Supabase → Edge Functions → Secrets en komt nooit bij de pagina.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ---------------------------------------------------------------- opdrachttekst (hier aanpassen)
// Afbeelding 1 = de foto, afbeelding 2 = het stijlvoorbeeld van Mecha-Pof.
const BASIS = `Maak van afbeelding 1 (een foto) een getekende illustratie. Afbeelding 2 is het ontwerp van Mecha-Pof, een vriendelijke keukenrobot; gebruik die alleen om te zien hoe Mecha-Pof eruitziet.

Wie: precies dezelfde mensen als op de foto, evenveel mensen, in dezelfde opstelling, volgorde en houding. Ieder houdt zijn eigen gezicht, gezichtsuitdrukking, kapsel, haarkleur, bril en lengte, zodat je iedereen meteen herkent. Teken ze als monteurs van het Reparatieteam van Mecha-Pof: werkplaats-overall of schort, gereedschapsriem, een moersleutel, garde of spatel in de hand.

Mecha-Pof staat of zweeft vrolijk tussen of naast hen, als lid van het team: een lijf van vier gestapelde pannenkoeken met klinknagels en een meter op de borst, een koekenpan als helm met een donker vizier en twee cyaan LED-ogen, een rode aardbei als neus, een luidsprekerrooster als mond, een spatel en een garde als armen, zuigerbenen met pannetjes als voeten, een boterklontje bovenop.

Plek: de werkplaats-keuken van Mecha-Pof. Warme pannenkoek-kleuren (goudgeel, karamel, warm bruin) met cyaan LED-licht als accent.
Sfeer: vrolijk, lief en grappig, geschikt voor kinderen van tien. Niets engs.
Het moet duidelijk een tekening zijn, geen foto. Geen tekst, letters of logo's in beeld.`;

const OPDRACHT: Record<string, string> = {
  strip: BASIS + `

Tekenstijl: stripboek. Stevige, schone inktlijnen, egale kleurvlakken met eenvoudige schaduw, expressieve gezichten, helder en kleurrijk, als een plaat uit een vrolijk stripalbum.`,
  prent: BASIS + `

Tekenstijl: prentenboek. Zachte waterverf en kleurpotlood, ronde vormen, zacht warm licht, een beetje papierstructuur, als een plaat uit een lief voorleesboek.`,
};

// ---------------------------------------------------------------- instellingen
const MODELLEN = ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare", "gpt-image-2.6-sunburst", "gpt-image-1.5"];
const STANDAARD_MODEL = "gpt-image-2.5-sunburst";
const SIZES = ["1536x1024", "1024x1536", "1024x1024", "auto"];
const QUALITY = ["low", "medium", "high", "xhigh"];
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FOTO = 8 * 1024 * 1024, MAX_STIJL = 3 * 1024 * 1024;
const OPENAI_TIMEOUT_MS = 140_000; // net onder de 150 s wandklok van het gratis plan
// Prijzen per 1 miljoen tokens (OpenAI, GPT-Image-2.5, nov 2026): tekst in $5, beeld in $8, beeld uit $30.
const PRIJS = { tekst: 5, beeldIn: 8, beeldUit: 30 };

const ALLOWED = [/^https:\/\/dedonjon\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const ok = ALLOWED.some((r) => r.test(origin));
  const cors = {
    "Access-Control-Allow-Origin": ok ? origin : "https://dedonjon.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-regie-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  const fout = (error: string, status: number, extra: Record<string, unknown> = {}) => json({ ok: false, error, ...extra }, status);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ok) return fout("origin niet toegestaan", 403);
  if (req.method !== "POST") return fout("gebruik POST", 405);

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return fout("Het geheim OPENAI_API_KEY ontbreekt. Zet het in Supabase → Edge Functions → Secrets.", 500, { code: "geen_sleutel" });

  // Regiesleutel: regie_check gooit een fout bij een verkeerde sleutel (zelfde controle als scout-media).
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
  const { error: keyErr } = await anon.rpc("regie_check", { p_key: req.headers.get("x-regie-key") ?? "" });
  if (keyErr) return fout("verkeerde regiesleutel", 401);

  let form: FormData;
  try { form = await req.formData(); } catch { return fout("verwacht multipart/form-data", 400); }
  const foto = form.get("foto"), stijl = form.get("stijl");
  if (!(foto instanceof File) || !foto.size) return fout("geen foto meegestuurd", 400);
  if (!(stijl instanceof File) || !stijl.size) return fout("geen stijlvoorbeeld meegestuurd", 400);
  if (!TYPES.includes(foto.type) || !TYPES.includes(stijl.type)) return fout("alleen jpeg, png of webp", 415);
  if (foto.size > MAX_FOTO) return fout("foto groter dan 8 MB; verklein hem eerst", 413);
  if (stijl.size > MAX_STIJL) return fout("stijlvoorbeeld groter dan 3 MB", 413);
  const variant = String(form.get("variant") ?? "strip");
  const size = String(form.get("size") ?? "auto");
  const quality = String(form.get("quality") ?? "high");
  const model = String(form.get("model") ?? STANDAARD_MODEL);
  if (!OPDRACHT[variant]) return fout("variant moet strip of prent zijn", 400);
  if (!SIZES.includes(size)) return fout("ongeldig formaat", 400);
  if (!QUALITY.includes(quality)) return fout("ongeldige kwaliteit", 400);
  if (!MODELLEN.includes(model)) return fout("model niet toegestaan", 400);

  const body = new FormData();
  body.append("model", model);
  body.append("prompt", OPDRACHT[variant]);
  body.append("image[]", foto, "foto." + foto.type.split("/")[1]);
  body.append("image[]", stijl, "mecha-pof." + stijl.type.split("/")[1]);
  body.append("size", size);
  body.append("quality", quality);
  body.append("n", "1");
  body.append("output_format", "jpeg");
  body.append("output_compression", "92");
  // gelijkenis van gezichten: de 2.x-modellen lezen invoerbeelden altijd op hoge getrouwheid en weigeren deze instelling;
  // alleen gpt-image-1.5 heeft hem nog.
  if (model === "gpt-image-1.5") body.append("input_fidelity", "high");

  // Antwoord direct openen; spaties houden de verbinding levend tot OpenAI klaar is.
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const t0 = Date.now();
      const tick = setInterval(() => { try { ctrl.enqueue(enc.encode(" ")); } catch { /* client weg */ } }, 10_000);
      const abort = new AbortController();
      const stop = setTimeout(() => abort.abort(), OPENAI_TIMEOUT_MS);
      let out: Record<string, unknown>;
      try {
        const r = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST", headers: { Authorization: `Bearer ${openaiKey}` }, body, signal: abort.signal,
        });
        const j = await r.json().catch(() => ({}));
        const ms = Date.now() - t0;
        if (!r.ok || !j?.data?.[0]?.b64_json) {
          const e = j?.error ?? {};
          out = { ok: false, status: r.status, error: e.message ?? `OpenAI gaf HTTP ${r.status} zonder beeld`, code: e.code ?? null, type: e.type ?? null, details: e.moderation_details ?? null, ms, model, variant };
          console.log(`monster-foto: geweigerd/fout ${r.status} ${e.code ?? ""} na ${ms} ms (${model}, ${variant})`); // geen inhoud
        } else {
          const u = j.usage ?? null;
          const d = u?.input_tokens_details ?? {};
          const kosten = u ? ((d.text_tokens ?? 0) * PRIJS.tekst + (d.image_tokens ?? 0) * PRIJS.beeldIn + (u.output_tokens ?? 0) * PRIJS.beeldUit) / 1e6 : null;
          out = { ok: true, b64: j.data[0].b64_json, mime: "image/jpeg", ms, model, variant, quality, size: j.size ?? size, usage: u, kosten_usd: kosten, revised_prompt: j.data[0].revised_prompt ?? null };
          console.log(`monster-foto: klaar na ${ms} ms (${model}, ${variant}, ${quality})`); // geen inhoud
        }
      } catch (e) {
        const ms = Date.now() - t0;
        const tijd = (e as Error)?.name === "AbortError";
        out = { ok: false, status: 0, error: tijd ? `OpenAI gaf na ${Math.round(OPENAI_TIMEOUT_MS / 1000)} s geen antwoord` : `kon OpenAI niet bereiken: ${(e as Error)?.message ?? e}`, code: tijd ? "timeout" : "netwerk", ms, model, variant };
        console.log(`monster-foto: ${tijd ? "timeout" : "netwerkfout"} na ${ms} ms`);
      } finally { clearInterval(tick); clearTimeout(stop); }
      try { ctrl.enqueue(enc.encode(JSON.stringify(out))); ctrl.close(); } catch { /* client weg */ }
    },
  });
  return new Response(stream, { status: 200, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
});
