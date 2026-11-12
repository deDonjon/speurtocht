// monster-foto — foto wordt Mecha-Pof-tekening (OpenAI, beeld-bewerkfunctie). 12 nov 2026.
// Alles met de regiesleutel (header x-regie-key); JWT uit; alleen https://dedonjon.github.io en localhost.
// Het geheim OPENAI_API_KEY staat in Supabase → Edge Functions → Secrets en komt nooit bij een pagina.
//
// 1. In het spel (regie.html → tab 📸 Tekeningen, kern.html in de finale; zie js/tekening.js):
//    POST multipart  actie=start, soort=groep|feest|portret, stijl=strip|prent, foto, stijlvoorbeeld (stijl-png), speler (bij portret)
//         → { ok, id } direct; de tekening wordt op de achtergrond gemaakt (± 1 minuut) en als PNG bewaard in de PRIVÉ-bucket
//           monster-prive/<spel-id>/<id>.png; de regel staat in de tabel foto_tekening (status bezig → klaar | fout).
//         De foto zelf wordt niet bewaard.
//    POST json {actie:'lijst'}              → { ok, rijen:[{ id, soort, stijl, player_id, naam, status, fout, url, goedgekeurd, ms, kosten_usd, created_at }] }
//                                             url = ondertekende link, 3 uur geldig
//    POST json {actie:'keur', id, ok:true|false} → goedkeuren (de vorige goedgekeurde van dezelfde soort/speler gaat uit) of intrekken
//    POST json {actie:'weg', id}            → tekening en bestand verwijderen
// 2. De proef (test/foto.html): POST multipart zonder actie → tekent direct en geeft het beeld terug; bewaart niets.
//
// Logboeken: alleen tijd, status en foutcode; nooit een foto, opdracht of beeld.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "jsr:@std/encoding@1/base64";

// ================================================================ opdrachtteksten (hier aanpassen)
// Afbeelding 1 = de foto, afbeelding 2 = het stijlvoorbeeld van Mecha-Pof (test/mecha-pof-stijl.png).
const FEEST_DATUM = "13 november 2026";
const FEEST_KOP = "OPERATIE MECHA-POF";

const MECHA_POF = `een lijf van vier gestapelde pannenkoeken met klinknagels en een meter op de borst, een koekenpan als helm met een donker vizier en twee cyaan LED-ogen, een rode aardbei als neus, een luidsprekerrooster als mond, een spatel en een garde als armen, zuigerbenen met pannetjes als voeten, een boterklontje bovenop`;
const SFEER = `Plek: de werkplaats-keuken van Mecha-Pof. Warme pannenkoek-kleuren (goudgeel, karamel, warm bruin) met cyaan LED-licht als accent.
Sfeer: vrolijk, lief en grappig, geschikt voor kinderen van tien. Niets engs.
Het moet duidelijk een tekening zijn, geen foto.`;
const GEEN_TEKST = `Geen tekst, letters of logo's in beeld.`;

const GROEP = `Maak van afbeelding 1 (een foto) een getekende illustratie. Afbeelding 2 is het ontwerp van Mecha-Pof, een vriendelijke keukenrobot; gebruik die alleen om te zien hoe Mecha-Pof eruitziet.

Wie: precies dezelfde mensen als op de foto, evenveel mensen, in dezelfde opstelling, volgorde en houding. Ieder houdt zijn eigen gezicht, gezichtsuitdrukking, kapsel, haarkleur, bril en lengte, zodat je iedereen meteen herkent. Teken ze als monteurs van het Reparatieteam van Mecha-Pof: werkplaats-overall of schort, gereedschapsriem, een moersleutel, garde of spatel in de hand.

Mecha-Pof staat of zweeft vrolijk tussen of naast hen, als lid van het team: ${MECHA_POF}.

${SFEER}`;

const STIJL: Record<string, string> = {
  strip: `Tekenstijl: stripboek. Stevige, schone inktlijnen, egale kleurvlakken met eenvoudige schaduw, expressieve gezichten, helder en kleurrijk, als een plaat uit een vrolijk stripalbum.`,
  prent: `Tekenstijl: prentenboek. Zachte waterverf en kleurpotlood, ronde vormen, zacht warm licht, een beetje papierstructuur, als een plaat uit een lief voorleesboek.`,
};

function opdrachtGroep(stijl: string) { return `${GROEP}\n${GEEN_TEKST}\n\n${STIJL[stijl]}`; }

function opdrachtFeest(stijl: string, jarige: string) {
  return `${GROEP}

Dit is de feestplaat van het verjaardagsfeest. Zet er twee vrolijke banners in, als slingers of geverfde borden in de werkplaats:
- bovenaan, groot: ${FEEST_KOP}
- onderaan: ${jarige} 10 jaar · ${FEEST_DATUM}
Spel de tekst precies zo, met dezelfde hoofdletters. Verder geen andere tekst in beeld. Een paar slingers, ballonnen en een pannenkoekentaart met tien kaarsjes passen erbij.

${STIJL[stijl]}`;
}

// Per talent: het onderdeel van Mecha-Pof dat zij verzorgt (zie TALENTS en PARTS in js/state.js).
const ONDERDEEL: Record<string, { label: string; tekst: string }> = {
  speurneus:        { label: "Speurneus",        tekst: "de LED-ogen van Mecha-Pof: een donker vizier met twee cyaan oplichtende LED-ogen" },
  kaartlezer:       { label: "Kaartlezer",       tekst: "de neus van Mecha-Pof: een glimmende rode aardbei-knop met een stalen rand" },
  codekraker:       { label: "Codekraker",       tekst: "de mond van Mecha-Pof: een luidsprekerrooster, een donkere afgeronde balk met zeven cyaan streepjes" },
  rekenmeester:     { label: "Rekenmeester",     tekst: "de armen van Mecha-Pof: een stalen spatel en een garde" },
  tijdbewaker:      { label: "Tijdbewaker",      tekst: "de benen van Mecha-Pof: twee stalen zuigers met kleine koekenpannetjes als voeten" },
  sleutelbewaarder: { label: "Sleutelbewaarder", tekst: "de boterknop en de jetpack van Mecha-Pof: een geel boterklontje met een aan-knop-teken en een stroopfles-jetpack met een klein vlammetje" },
};

function opdrachtPortret(stijl: string, talent: string, jarig: boolean) {
  const o = ONDERDEEL[talent] ?? { label: "monteur", tekst: "een moersleutel en een garde" };
  return `Maak van afbeelding 1 (een foto van één meisje) een getekend portret. Afbeelding 2 is het ontwerp van Mecha-Pof, een vriendelijke keukenrobot; gebruik die alleen om te zien hoe Mecha-Pof eruitziet.

Wie: hetzelfde meisje als op de foto, met haar eigen gezicht, gezichtsuitdrukking, kapsel, haarkleur en bril, zodat je haar meteen herkent. Van ongeveer het middel omhoog, vrolijk naar de kijker. Ze is monteur van het Reparatieteam van Mecha-Pof: werkplaats-overall of schort, gereedschapsriem.
Haar talent is ${o.label}. Zij zorgt voor ${o.tekst}. Dat onderdeel houdt ze trots vast of het staat groot en duidelijk naast haar.${jarig ? "\nZe is vandaag jarig: een klein feestmutsje of een paar slingers mogen erbij." : ""}
Mecha-Pof (${MECHA_POF}) staat klein op de achtergrond en zwaait naar haar.
Laat onderin een rustige strook vrij (ongeveer een vijfde van de hoogte) zonder gezichten of belangrijke dingen.

${SFEER}
${GEEN_TEKST}

${STIJL[stijl]}`;
}

// ================================================================ instellingen
const MODELLEN = ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare", "gpt-image-2.6-sunburst", "gpt-image-1.5"];
const STANDAARD_MODEL = "gpt-image-2.5-sunburst";
const SPEL_QUALITY = "high";
const SIZES = ["1536x1024", "1024x1536", "1024x1024", "auto"];
const QUALITY = ["low", "medium", "high", "xhigh"];
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FOTO = 8 * 1024 * 1024, MAX_STIJL = 3 * 1024 * 1024;
const DIRECT_TIMEOUT_MS = 140_000;     // proef: het antwoord moet binnen de wandklok
const ACHTERGROND_TIMEOUT_MS = 300_000; // spel: achtergrondtaak (Pro: 400 s wandklok)
const VASTGELOPEN_MS = 7 * 60_000;      // 'bezig' langer dan dit = mislukt
const LINK_S = 3 * 3600;                // ondertekende links: 3 uur
const BUCKET = "monster-prive";
// Prijzen per 1 miljoen tokens (OpenAI, GPT-Image-2.5, nov 2026): tekst in $5, beeld in $8, beeld uit $30.
const PRIJS = { tekst: 5, beeldIn: 8, beeldUit: 30 };

const ALLOWED = [/^https:\/\/dedonjon\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const URL_SB = Deno.env.get("SUPABASE_URL")!;
const db = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

type Uit = { ok: boolean; b64?: string; ms: number; usage?: Record<string, any> | null; kosten_usd?: number | null; status?: number; error?: string; code?: string | null; type?: string | null; details?: unknown };

/** Eén aanvraag bij OpenAI. Geeft het beeld als base64 of de letterlijke foutmelding. */
async function openai(key: string, p: { model: string; prompt: string; foto: File; stijl: File; size: string; quality: string; format: "png" | "jpeg" }, timeout: number): Promise<Uit> {
  const body = new FormData();
  body.append("model", p.model);
  body.append("prompt", p.prompt);
  body.append("image[]", p.foto, "foto." + p.foto.type.split("/")[1]);
  body.append("image[]", p.stijl, "mecha-pof." + p.stijl.type.split("/")[1]);
  body.append("size", p.size);
  body.append("quality", p.quality);
  body.append("n", "1");
  body.append("output_format", p.format);
  if (p.format === "jpeg") body.append("output_compression", "92");
  // Gelijkenis van gezichten: de 2.x-modellen lezen invoerbeelden altijd op hoge getrouwheid en weigeren deze instelling.
  if (p.model === "gpt-image-1.5") body.append("input_fidelity", "high");
  const t0 = Date.now(), abort = new AbortController(), stop = setTimeout(() => abort.abort(), timeout);
  try {
    const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body, signal: abort.signal });
    const j = await r.json().catch(() => ({}));
    const ms = Date.now() - t0;
    if (!r.ok || !j?.data?.[0]?.b64_json) {
      const e = j?.error ?? {};
      return { ok: false, ms, status: r.status, error: e.message ?? `OpenAI gaf HTTP ${r.status} zonder beeld`, code: e.code ?? null, type: e.type ?? null, details: e.moderation_details ?? null };
    }
    const u = j.usage ?? null, d = u?.input_tokens_details ?? {};
    const kosten = u ? ((d.text_tokens ?? 0) * PRIJS.tekst + (d.image_tokens ?? 0) * PRIJS.beeldIn + (u.output_tokens ?? 0) * PRIJS.beeldUit) / 1e6 : null;
    return { ok: true, ms, b64: j.data[0].b64_json, usage: u, kosten_usd: kosten };
  } catch (e) {
    const tijd = (e as Error)?.name === "AbortError";
    return { ok: false, ms: Date.now() - t0, status: 0, code: tijd ? "timeout" : "netwerk", error: tijd ? `OpenAI gaf na ${Math.round(timeout / 1000)} s geen antwoord` : `kon OpenAI niet bereiken: ${(e as Error)?.message ?? e}` };
  } finally { clearTimeout(stop); }
}

/** Achtergrondtaak voor het spel: tekenen, PNG in de privé-bucket, regel bijwerken. */
async function tekenOpAchtergrond(id: string, gameId: string, key: string, p: Parameters<typeof openai>[1]) {
  try {
    const r = await openai(key, p, ACHTERGROND_TIMEOUT_MS);
    if (!r.ok) {
      await db.from("foto_tekening").update({ status: "fout", ms: r.ms, fout: { error: r.error, code: r.code, type: r.type, status: r.status, details: r.details }, klaar_at: new Date().toISOString() }).eq("id", id);
      console.log(`monster-foto: ${id.slice(0, 8)} geweigerd/fout ${r.status} ${r.code ?? ""} na ${r.ms} ms`);
      return;
    }
    const pad = `${gameId}/${id}.png`;
    const { error: upErr } = await db.storage.from(BUCKET).upload(pad, decodeBase64(r.b64!), { contentType: "image/png", upsert: true });
    if (upErr) throw new Error("opslaan mislukt: " + upErr.message);
    await db.from("foto_tekening").update({ status: "klaar", pad, ms: r.ms, kosten_usd: r.kosten_usd, klaar_at: new Date().toISOString() }).eq("id", id);
    console.log(`monster-foto: ${id.slice(0, 8)} klaar na ${r.ms} ms`);
  } catch (e) {
    await db.from("foto_tekening").update({ status: "fout", fout: { error: String((e as Error)?.message ?? e), code: "intern" }, klaar_at: new Date().toISOString() }).eq("id", id);
    console.log(`monster-foto: ${id.slice(0, 8)} interne fout`);
  }
}

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
  const fout = (error: string, status: number, extra: Record<string, unknown> = {}) => json({ ok: false, error, ...extra }, status);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ok) return fout("origin niet toegestaan", 403);
  if (req.method !== "POST") return fout("gebruik POST", 405);

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return fout("Het geheim OPENAI_API_KEY ontbreekt. Zet het in Supabase → Edge Functions → Secrets.", 500, { code: "geen_sleutel" });

  // Regiesleutel → spel. regie_check gooit een fout bij een verkeerde sleutel.
  const anon = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
  const { data: chk, error: keyErr } = await anon.rpc("regie_check", { p_key: req.headers.get("x-regie-key") ?? "" });
  if (keyErr || !chk?.game_id) return fout("verkeerde regiesleutel", 401);
  const gameId: string = chk.game_id;

  const ctype = req.headers.get("content-type") ?? "";
  if (ctype.includes("application/json")) {
    let b: any; try { b = await req.json(); } catch { return fout("ongeldige JSON", 400); }
    return await beheer(b, gameId, json, fout);
  }

  let form: FormData;
  try { form = await req.formData(); } catch { return fout("verwacht multipart/form-data", 400); }
  const foto = form.get("foto"), stijlPng = form.get("stijl");
  if (!(foto instanceof File) || !foto.size) return fout("geen foto meegestuurd", 400);
  if (!(stijlPng instanceof File) || !stijlPng.size) return fout("geen stijlvoorbeeld meegestuurd", 400);
  if (!TYPES.includes(foto.type) || !TYPES.includes(stijlPng.type)) return fout("alleen jpeg, png of webp", 415);
  if (foto.size > MAX_FOTO) return fout("foto groter dan 8 MB; verklein hem eerst", 413);
  if (stijlPng.size > MAX_STIJL) return fout("stijlvoorbeeld groter dan 3 MB", 413);
  const size = String(form.get("size") ?? "auto");
  const model = String(form.get("model") ?? STANDAARD_MODEL);
  if (!SIZES.includes(size)) return fout("ongeldig formaat", 400);
  if (!MODELLEN.includes(model)) return fout("model niet toegestaan", 400);

  // ---------------------------------------------------------------- spel: op de achtergrond, PNG in de privé-bucket
  if (form.get("actie") === "start") {
    const soort = String(form.get("soort") ?? "");
    const stijl = String(form.get("stijl_naam") ?? "strip");
    if (!["groep", "feest", "portret"].includes(soort)) return fout("soort moet groep, feest of portret zijn", 400);
    if (!STIJL[stijl]) return fout("stijl moet strip of prent zijn", 400);
    let prompt: string, playerId: string | null = null;
    if (soort === "portret") {
      playerId = String(form.get("speler") ?? "");
      const { data: p } = await db.from("player").select("id,talent,is_birthday").eq("id", playerId).eq("game_id", gameId).maybeSingle();
      if (!p) return fout("onbekende speler", 400);
      prompt = opdrachtPortret(stijl, p.talent ?? "", !!p.is_birthday);
    } else if (soort === "feest") {
      const { data: j } = await db.from("player").select("name").eq("game_id", gameId).eq("is_birthday", true).limit(1).maybeSingle();
      prompt = opdrachtFeest(stijl, j?.name ?? "Hannah");
    } else prompt = opdrachtGroep(stijl);
    const { data: rij, error } = await db.from("foto_tekening").insert({ game_id: gameId, soort, stijl, player_id: playerId, model, quality: SPEL_QUALITY }).select("id").single();
    if (error) return fout("kon de tekening niet aanmaken: " + error.message, 500);
    EdgeRuntime.waitUntil(tekenOpAchtergrond(rij.id, gameId, openaiKey, { model, prompt, foto, stijl: stijlPng, size, quality: SPEL_QUALITY, format: "png" }));
    return json({ ok: true, id: rij.id });
  }

  // ---------------------------------------------------------------- proef (test/foto.html): direct, bewaart niets
  const variant = String(form.get("variant") ?? "strip");
  const quality = String(form.get("quality") ?? "high");
  if (!STIJL[variant]) return fout("variant moet strip of prent zijn", 400);
  if (!QUALITY.includes(quality)) return fout("ongeldige kwaliteit", 400);
  const enc = new TextEncoder();
  const stream = new ReadableStream({ // antwoord direct open; spaties houden de verbinding levend (Supabase breekt na 150 s stilte af)
    async start(ctrl) {
      const tick = setInterval(() => { try { ctrl.enqueue(enc.encode(" ")); } catch { /* client weg */ } }, 10_000);
      let out: Record<string, unknown>;
      try {
        const r = await openai(openaiKey, { model, prompt: opdrachtGroep(variant), foto, stijl: stijlPng, size, quality, format: "jpeg" }, DIRECT_TIMEOUT_MS);
        out = r.ok ? { ok: true, b64: r.b64, mime: "image/jpeg", ms: r.ms, model, variant, quality, size, usage: r.usage, kosten_usd: r.kosten_usd }
                   : { ok: false, status: r.status, error: r.error, code: r.code, type: r.type, details: r.details, ms: r.ms, model, variant };
        console.log(`monster-foto proef: ${r.ok ? "klaar" : "fout " + (r.code ?? r.status)} na ${r.ms} ms`);
      } finally { clearInterval(tick); }
      try { ctrl.enqueue(enc.encode(JSON.stringify(out!))); ctrl.close(); } catch { /* client weg */ }
    },
  });
  return new Response(stream, { status: 200, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
});

/** lijst / keur / weg (JSON). */
async function beheer(b: any, gameId: string, json: (b: unknown, s?: number) => Response, fout: (e: string, s: number) => Response) {
  if (b?.actie === "lijst") {
    // vastgelopen achtergrondtaken (instantie gestopt) als mislukt markeren
    await db.from("foto_tekening").update({ status: "fout", fout: { error: "geen antwoord: de tekening is niet afgekomen", code: "vastgelopen" } })
      .eq("game_id", gameId).eq("status", "bezig").lt("created_at", new Date(Date.now() - VASTGELOPEN_MS).toISOString());
    const { data: rijen, error } = await db.from("foto_tekening").select("id,soort,stijl,player_id,status,fout,pad,goedgekeurd,ms,kosten_usd,created_at,klaar_at")
      .eq("game_id", gameId).order("created_at", { ascending: false }).limit(200);
    if (error) return fout(error.message, 500);
    const { data: spelers } = await db.from("player").select("id,name").eq("game_id", gameId);
    const naam = Object.fromEntries((spelers ?? []).map((p) => [p.id, p.name]));
    const paden = (rijen ?? []).filter((r) => r.pad).map((r) => r.pad as string);
    const links: Record<string, string> = {};
    if (paden.length) {
      const { data: s } = await db.storage.from(BUCKET).createSignedUrls(paden, LINK_S);
      for (const x of s ?? []) if (x.path && x.signedUrl) links[x.path] = x.signedUrl;
    }
    return json({ ok: true, nu: new Date().toISOString(), rijen: (rijen ?? []).map(({ pad, ...r }) => ({ ...r, naam: r.player_id ? naam[r.player_id] ?? null : null, url: pad ? links[pad] ?? null : null })) });
  }
  const id = String(b?.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fout("ongeldige id", 400);
  const { data: rij } = await db.from("foto_tekening").select("id,soort,player_id,pad,status").eq("id", id).eq("game_id", gameId).maybeSingle();
  if (!rij) return fout("tekening niet gevonden", 404);
  if (b?.actie === "keur") {
    if (b.ok) {
      if (rij.status !== "klaar") return fout("alleen een klare tekening kan goedgekeurd worden", 400);
      let q = db.from("foto_tekening").update({ goedgekeurd: false }).eq("game_id", gameId).eq("soort", rij.soort);
      q = rij.player_id ? q.eq("player_id", rij.player_id) : q.is("player_id", null);
      await q;
    }
    const { error } = await db.from("foto_tekening").update({ goedgekeurd: !!b.ok }).eq("id", id);
    return error ? fout(error.message, 500) : json({ ok: true });
  }
  if (b?.actie === "weg") {
    if (rij.pad) await db.storage.from(BUCKET).remove([rij.pad]);
    const { error } = await db.from("foto_tekening").delete().eq("id", id);
    return error ? fout(error.message, 500) : json({ ok: true });
  }
  return fout("onbekende actie", 400);
}
