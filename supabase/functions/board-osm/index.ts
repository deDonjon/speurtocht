// board-osm — haalt de echte kaart rond route A op bij OpenStreetMap en bewaart hem in tabel board_data (key 'osm').
// Aangeroepen vanuit bord.html (knop "Kaart ophalen") of automatisch door js/board.js als er nog geen kaart is.
// Vaste uitsnede en vaste vraag: de functie haalt nooit iets anders op. verify_jwt staat uit (de app heeft een publishable key);
// misbruik remmen we met een origin-check zoals monster-token. Schrijven gebeurt met de service-role-sleutel van de functie zelf.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED = [/^https:\/\/dedonjon\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const BBOX = { s: 51.6105, w: 5.5594, n: 51.6181, e: 5.5670 }; // gelijk aan js/board-data.js
const BB = `${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e}`;
const QUERY = `[out:json][timeout:25];(way["building"](${BB});way["highway"](${BB});way["waterway"](${BB});way["natural"](${BB});way["landuse"](${BB});way["leisure"](${BB});node["natural"="tree"](${BB}););out tags geom;`;
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const UA = "speurtocht-mecha-pof/1.0 (verjaardagsspel; https://dedonjon.github.io/speurtocht/)";

type El = { type: string; lat?: number; lon?: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

// Zelfde compacte vorm als compactOsm() in js/board.js.
function compact(elements: El[]) {
  const out = { v: 1, at: new Date().toISOString(), bbox: BBOX, b: [] as unknown[], r: [] as unknown[], w: [] as unknown[], a: [] as unknown[], t: [] as unknown[], src: "" };
  const FOOT = ["footway", "path", "cycleway", "steps", "pedestrian", "track", "bridleway"];
  const SMALL = ["garage", "garages", "shed", "carport", "roof", "hut"];
  for (const el of elements) {
    const tg = el.tags || {};
    if (el.type === "node") { if (tg.natural === "tree" && el.lat != null) out.t.push([r6(el.lat), r6(el.lon!)]); continue; }
    if (el.type !== "way" || !el.geometry?.length) continue;
    const pts = el.geometry.flatMap((g) => [r6(g.lat), r6(g.lon)]);
    if (tg.building) {
      const lv = parseFloat(tg["building:levels"]) || 0, hh = parseFloat(tg.height) || 0;
      const h = hh || (lv ? lv * 3 + 2.5 : SMALL.includes(tg.building) ? 3 : 7);
      out.b.push([Math.round(Math.min(h, 20) * 10) / 10, ...pts]);
    } else if (tg.highway) out.r.push([FOOT.includes(tg.highway) ? "f" : "r", ...pts]);
    else if (tg.waterway) out.w.push(["l", ...pts]);
    else if (tg.natural === "water" || ["basin", "reservoir"].includes(tg.landuse)) out.w.push(["a", ...pts]);
    else {
      const lu = tg.landuse, le = tg.leisure, na = tg.natural;
      const cls = (lu === "forest" || ["wood", "scrub", "tree_row"].includes(na)) ? "bos"
        : (["grass", "meadow", "village_green", "recreation_ground", "flowerbed"].includes(lu) || ["park", "garden", "playground", "pitch", "common"].includes(le) || na === "grassland") ? "gras"
        : ["farmland", "orchard", "allotments", "farmyard", "plant_nursery"].includes(lu) ? "veld" : null;
      if (cls) out.a.push([cls, ...pts]);
    }
  }
  return out;
}

// OSM-API (XML) zonder DOM: nodes, ways met nd-refs en tags.
function xmlToElements(xml: string): El[] {
  const attr = (s: string, k: string) => s.match(new RegExp(`\\b${k}="([^"]*)"`))?.[1];
  const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const tagsOf = (body: string) => Object.fromEntries([...body.matchAll(/<tag\s+k="([^"]*)"\s+v="([^"]*)"\s*\/>/g)].map((m) => [unesc(m[1]), unesc(m[2])]));
  const nodes = new Map<string, { lat: number; lon: number }>(), els: El[] = [];
  for (const m of xml.matchAll(/<node\b([^>]*?)(\/>|>([\s\S]*?)<\/node>)/g)) {
    const lat = +attr(m[1], "lat")!, lon = +attr(m[1], "lon")!; nodes.set(attr(m[1], "id")!, { lat, lon });
    if (m[3]) els.push({ type: "node", lat, lon, tags: tagsOf(m[3]) });
  }
  for (const m of xml.matchAll(/<way\b[^>]*>([\s\S]*?)<\/way>/g)) {
    const geometry = [...m[1].matchAll(/<nd\s+ref="(\d+)"\s*\/>/g)].map((n) => nodes.get(n[1])).filter(Boolean) as { lat: number; lon: number }[];
    if (geometry.length > 1) els.push({ type: "way", tags: tagsOf(m[1]), geometry });
  }
  return els;
}

async function withTimeout(p: Promise<Response>, ms: number) {
  let t: number | undefined;
  try { return await Promise.race([p, new Promise<Response>((_, rej) => { t = setTimeout(() => rej(new Error(`geen antwoord binnen ${ms / 1000} s`)), ms); })]); }
  finally { clearTimeout(t); }
}

async function fetchMap() {
  const errs: string[] = [];
  for (const url of OVERPASS) {
    try {
      const r = await withTimeout(fetch(url, { method: "POST", body: "data=" + encodeURIComponent(QUERY), headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA } }), 30000);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const c = compact((await r.json()).elements || []);
      if (!c.b.length && !c.r.length) throw new Error("lege kaart");
      c.src = new URL(url).host; return { data: c, errs };
    } catch (e) { errs.push(`${new URL(url).host}: ${(e as Error).message}`); }
  }
  try {
    const r = await withTimeout(fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${BBOX.w},${BBOX.s},${BBOX.e},${BBOX.n}`, { headers: { "user-agent": UA } }), 30000);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const c = compact(xmlToElements(await r.text()));
    if (!c.b.length && !c.r.length) throw new Error("lege kaart");
    c.src = "api.openstreetmap.org"; return { data: c, errs };
  } catch (e) { errs.push(`api.openstreetmap.org: ${(e as Error).message}`); }
  return { data: null, errs };
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
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ok) return json({ error: "origin niet toegestaan" }, 403);
  if (req.method !== "POST") return json({ error: "alleen POST" }, 405);

  const { data, errs } = await fetchMap();
  if (!data) return json({ error: "Kaart ophalen lukte bij geen enkele bron", details: errs }, 502);

  const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let saved = false, saveError = "";
  if (url && service) {
    const r = await fetch(`${url}/rest/v1/board_data?on_conflict=key`, {
      method: "POST",
      headers: { apikey: service, authorization: `Bearer ${service}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key: "osm", data, updated_at: new Date().toISOString() }),
    });
    saved = r.ok; if (!r.ok) saveError = `opslaan: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`;
  } else saveError = "SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt";
  return json({ ok: true, saved, saveError, src: data.src, counts: { gebouwen: data.b.length, wegen: data.r.length, water: data.w.length, groen: data.a.length, bomen: data.t.length }, skipped: errs, data });
});
