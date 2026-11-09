// board.js — het 3D-speelbord: route A als zwevend hex-eiland. De looproute is een stroopbaan van gouden tegels, elke stop staat
// op een sokkel met zijn onderdeel van Mecha-Pof, thuis is een pannenkoekentoren. Echte gebouwen, straten, water en bomen komen uit
// OpenStreetMap (data/osm.json in de repo, anders één keer live opgehaald en op het toestel bewaard; zonder kaart een getekend bord).
//
// Gebruik:
//   const board = await createBoard(host, { mode: 'spel' | 'regie' | 'kern' });
//   board.update({ stops, activeIndex, phase, pos, players, meIds });   // stops = state.route()
//   board.update({ progress: 2.5 });                                    // demo: halverwege stop 2 → 3
//   board.setMode('regie'); board.recenter(); board.info(); board.destroy();
// Weergaven: spel = wolken over wat nog komt, alleen de volgende stop met een lichtbaken en een LED-lijn ernaartoe;
//            regie = alles, met bonus, reserve, verrassingen, buitenprints en antwoorden; kern = als spel, met een langzaam draaiende camera.
import { ROUTE, HOME, BBOX, EXTRAS, CRUMBS, STOP_INFO, TIMES, SUNSET } from './board-data.js?v=1';
import { PARTS } from './state.js';
import { SUPABASE_URL, SUPABASE_KEY } from './sync.js';

let T = null, OrbitControls = null, merge = null;
async function loadThree() {
  if (T) return;
  const [t, oc, bgu] = await Promise.all([import('./vendor/three/three.module.min.js'), import('./vendor/three/OrbitControls.js'), import('./vendor/three/BufferGeometryUtils.js')]);
  T = t; OrbitControls = oc.OrbitControls; merge = bgu.mergeGeometries;
}

/* ================================================================ OpenStreetMap */
const OSM_CACHE = 'pkm2_osm_v1';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
export function overpassQuery(b = BBOX) {
  const bb = `${b.s},${b.w},${b.n},${b.e}`;
  return `[out:json][timeout:25];(way["building"](${bb});way["highway"](${bb});way["waterway"](${bb});way["natural"](${bb});way["landuse"](${bb});way["leisure"](${bb});node["natural"="tree"](${bb}););out tags geom;`;
}
const r6 = x => Math.round(x * 1e6) / 1e6;
/** Overpass-JSON → compact formaat { v, at, bbox, b:[[hoogte, lat,lng,…]], r:[[soort, …]], w:[[l|a, …]], a:[[klasse, …]], t:[[lat,lng]] } */
export function compactOsm(j) {
  const out = { v: 1, at: new Date().toISOString(), bbox: BBOX, b: [], r: [], w: [], a: [], t: [] };
  const FOOT = ['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track', 'bridleway'];
  const SMALL = ['garage', 'garages', 'shed', 'carport', 'roof', 'hut'];
  for (const el of j?.elements || []) {
    const tg = el.tags || {};
    if (el.type === 'node') { if (tg.natural === 'tree') out.t.push([r6(el.lat), r6(el.lon)]); continue; }
    if (el.type !== 'way' || !el.geometry?.length) continue;
    const pts = el.geometry.flatMap(g => [r6(g.lat), r6(g.lon)]);
    if (tg.building) {
      const lv = parseFloat(tg['building:levels']) || 0, hh = parseFloat(tg.height) || 0;
      const h = hh || (lv ? lv * 3 + 2.5 : SMALL.includes(tg.building) ? 3 : 7);
      out.b.push([Math.round(Math.min(h, 20) * 10) / 10, ...pts]);
    } else if (tg.highway) out.r.push([FOOT.includes(tg.highway) ? 'f' : 'r', ...pts]);
    else if (tg.waterway) out.w.push(['l', ...pts]);
    else if (tg.natural === 'water' || ['basin', 'reservoir'].includes(tg.landuse)) out.w.push(['a', ...pts]);
    else {
      const lu = tg.landuse, le = tg.leisure, na = tg.natural;
      const cls = (lu === 'forest' || ['wood', 'scrub', 'tree_row'].includes(na)) ? 'bos'
        : (['grass', 'meadow', 'village_green', 'recreation_ground', 'flowerbed'].includes(lu) || ['park', 'garden', 'playground', 'pitch', 'common'].includes(le) || na === 'grassland') ? 'gras'
        : ['farmland', 'orchard', 'allotments', 'farmyard', 'plant_nursery'].includes(lu) ? 'veld' : null;
      if (cls) out.a.push([cls, ...pts]);
    }
  }
  return out;
}
/** OSM-API-XML (api.openstreetmap.org/api/0.6/map) → dezelfde vorm als een Overpass-antwoord. */
export function osmXmlToElements(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('kaart-XML onleesbaar');
  const tags = el => Object.fromEntries([...el.querySelectorAll(':scope > tag')].map(t => [t.getAttribute('k'), t.getAttribute('v')]));
  const nodes = new Map(), elements = [];
  for (const n of doc.querySelectorAll('osm > node')) {
    const lat = +n.getAttribute('lat'), lon = +n.getAttribute('lon'); nodes.set(n.getAttribute('id'), { lat, lon });
    if (n.querySelector(':scope > tag')) elements.push({ type: 'node', lat, lon, tags: tags(n) });
  }
  for (const w of doc.querySelectorAll('osm > way')) {
    const geometry = [...w.querySelectorAll(':scope > nd')].map(nd => nodes.get(nd.getAttribute('ref'))).filter(Boolean);
    if (geometry.length > 1) elements.push({ type: 'way', tags: tags(w), geometry });
  }
  return { elements };
}
// Bronnen in volgorde: vier Overpass-servers (POST, dan GET) en als laatste de gewone OSM-API (XML, ook zonder Overpass).
function sources() {
  const q = overpassQuery(), b = BBOX, out = [];
  for (const url of OVERPASS) {
    out.push({ name: new URL(url).host, req: () => fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded' } }), parse: r => r.json() });
    out.push({ name: new URL(url).host + ' (GET)', req: () => fetch(url + '?data=' + encodeURIComponent(q)), parse: r => r.json() });
  }
  out.push({ name: 'api.openstreetmap.org', req: () => fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${b.w},${b.s},${b.e},${b.n}`), parse: async r => osmXmlToElements(await r.text()) });
  return out;
}
/** Haalt de kaart live op (alleen in de browser; geen sleutel nodig). Gooit een fout met per bron wat er misging. */
export async function fetchOsmLive(timeoutMs = 20000, onTry) {
  const errs = [];
  for (const s of sources()) {
    onTry?.(s.name);
    let tm;
    try {
      const r = await Promise.race([s.req(), new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('geen antwoord binnen ' + timeoutMs / 1000 + ' s')), timeoutMs); })]);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const c = compactOsm(await s.parse(r));
      if (!c.b.length && !c.r.length) throw new Error('lege kaart');
      c.src = s.name; return c;
    } catch (e) { errs.push(`${s.name}: ${e.message || e}`); } finally { clearTimeout(tm); }
  }
  const e = new Error('Kaart ophalen lukte bij geen enkele bron'); e.details = errs; throw e;
}
export function cacheOsm(data) { try { localStorage.setItem(OSM_CACHE, JSON.stringify(data)); return true; } catch { return false; } }
/** Eerst de kaart in Supabase (tabel board_data, gevuld door de Edge Function board-osm), dan data/osm.json uit de repo,
 *  dan de eigen cache. Ophalen bij OpenStreetMap doet createBoard zelf op de achtergrond als er nog niets is. */
export async function loadOsm() {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/board_data?key=eq.osm&select=data`, { headers: { apikey: SUPABASE_KEY } });
    if (r.ok) { const j = (await r.json())?.[0]?.data; if (j?.v) { cacheOsm(j); return { data: j, source: 'server' }; } }
  } catch {}
  try { const r = await fetch(new URL('../data/osm.json', import.meta.url), { cache: 'no-cache' }); if (r.ok) { const j = await r.json(); if (j?.v) return { data: j, source: 'bestand' }; } } catch {}
  try { const j = JSON.parse(localStorage.getItem(OSM_CACHE)); if (j?.v) return { data: j, source: 'cache' }; } catch {}
  return { data: null, source: 'geen' };
}
/** Laat de Edge Function board-osm de kaart ophalen en voor iedereen bewaren. Geeft { data, saved, src, counts } of gooit met details. */
export async function fetchOsmServer(timeoutMs = 150000) {
  let tm;
  try {
    const r = await Promise.race([fetch(`${SUPABASE_URL}/functions/v1/board-osm`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: '{}' }),
      new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('server gaf geen antwoord binnen ' + timeoutMs / 1000 + ' s')), timeoutMs); })]);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.data?.v) { const e = new Error(j?.error || 'server: HTTP ' + r.status); e.details = j?.details || []; throw e; }
    return j;
  } finally { clearTimeout(tm); }
}

/* ================================================================ meetkunde */
const LAT0 = (BBOX.s + BBOX.n) / 2, LNG0 = (BBOX.w + BBOX.e) / 2;
const MLAT = 111230, MLNG = 111320 * Math.cos(LAT0 * Math.PI / 180);
const toXZ = (lat, lng) => ({ x: (lng - LNG0) * MLNG, z: -(lat - LAT0) * MLAT });
const toLL = (x, z) => ({ lat: LAT0 - z / MLAT, lng: LNG0 + x / MLNG });
const pairs = (arr, from = 0) => { const o = []; for (let i = from; i + 1 < arr.length; i += 2) o.push(toXZ(arr[i], arr[i + 1])); return o; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function segDist(x, z, a, b) { const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1; let t = ((x - a.x) * dx + (z - a.z) * dz) / L2; t = clamp(t, 0, 1); return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)); }
function lineDist(x, z, pts) { let d = 1e9; for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(x, z, pts[i - 1], pts[i])); return d; }
function inPoly(x, z, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if (((a.z > z) !== (b.z > z)) && (x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x)) c = !c; } return c; }
function bboxOf(pts) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); } return { x0, x1, z0, z1 }; }
const inBox = (b, x, z, m = 0) => x >= b.x0 - m && x <= b.x1 + m && z >= b.z0 - m && z <= b.z1 + m;
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash = (q, r) => { const f = rng(q * 73856093 ^ r * 19349663); f(); return f(); };

/** Looproute als lijn; stops met dezelfde seq volgen de live coördinaten uit Supabase. */
function makePath(stops) {
  const live = new Map((stops || []).filter(s => s.seq != null && s.lat != null).map(s => [s.seq, s]));
  const pts = ROUTE.map(([id, lat, lng, seq]) => { const st = seq ? live.get(seq) : null; const p = st ? toXZ(st.lat, st.lng) : toXZ(lat, lng); return { ...p, seq: seq || null, id }; });
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i], pts[i - 1]));
  const stopS = { 0: 0 }; pts.forEach((p, i) => { if (p.seq) stopS[p.seq] = cum[i]; });
  const total = cum[cum.length - 1];
  function nearest(x, z, sMin = -1, sMax = 1e9) {
    let best = { d: 1e9, s: 0, x, z };
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] < sMin || cum[i - 1] > sMax) continue;
      const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
      let t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1);
      const s = clamp(cum[i - 1] + t * Math.sqrt(L2), sMin, sMax); const p = at(s);
      const d = Math.hypot(x - p.x, z - p.z); if (d < best.d) best = { d, s, x: p.x, z: p.z };
    }
    return best;
  }
  function at(s) {
    s = clamp(s, 0, total); let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / seg;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dir: Math.atan2(b.x - a.x, b.z - a.z) };
  }
  function slice(s0, s1) { // punten van s0 naar s1 langs de route
    const o = [at(s0)]; for (let i = 0; i < pts.length; i++) if (cum[i] > s0 && cum[i] < s1) o.push(pts[i]); o.push(at(s1)); return o;
  }
  return { pts, cum, total, stopS, nearest, at, slice, key: pts.map(p => p.x.toFixed(1) + ',' + p.z.toFixed(1)).join(';') };
}

/* ================================================================ stijl */
const H = { pad: 2.4, straat: 2.15, voetpad: 2.25, erf: 2.3, tuin: 2.0, gras: 1.95, veld: 2.05, bos: 2.1, water: 0.8 };
const TC = { pad: '#E9A64B', straat: '#6B7385', voetpad: '#B7A68E', erf: '#D8C6A3', tuin: '#8CB85C', gras: '#7DB056', veld: '#B6CB66', bos: '#5A994C', water: '#4AA8D2' };
const WALLS = ['#F4E4C1', '#EED6A6', '#F2DCC0', '#E7CC9E', '#EFE1CC'], ROOFS = ['#A8532F', '#8C3F2A', '#B86B3A', '#6E3A2A', '#5B4A44'];
const LEAVES = ['#4F8F45', '#5EA24F', '#3F7D3F', '#6AA955'];
const CSS = `
.pkb{position:relative;width:100%;height:100%;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none}
.pkb canvas{display:block;width:100%;height:100%;outline:none}
.pkb-labels{position:absolute;inset:0;pointer-events:none}
.pkb-tag{position:absolute;left:0;top:0;pointer-events:auto;border:0;cursor:pointer;white-space:nowrap;min-height:0;
  font:900 12px/1 Nunito,system-ui,sans-serif;padding:5px 8px;border-radius:999px;background:#EAF2FF;color:#0E1B2E;box-shadow:0 2px 0 rgba(0,0,0,.45)}
.pkb-tag.done{background:#F2BE62;color:#3A1C06}.pkb-tag.next{background:#7FE8FF;color:#0E1B2E;box-shadow:0 0 12px rgba(127,232,255,.9)}
.pkb-tag.bonus{background:#F2BE62;color:#3A1C06}.pkb-tag.reserve{background:#B794F6;color:#1B0F3A}.pkb-tag.surprise{background:#FF5A4E;color:#2C0710}.pkb-tag.print{background:#F8F1E4;color:#3B2A1E}
.pkb-tag.who{font-size:10px;padding:3px 6px}
.pkb-tag[hidden]{display:none!important}
.pkb-card{position:absolute;left:10px;right:10px;bottom:10px;z-index:3;max-width:420px;background:rgba(26,31,42,.97);border:2px solid #3C4A66;border-radius:14px;padding:12px 14px;color:#EAF2FF;font:600 14px/1.45 Nunito,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5)}
.pkb-card h3{margin:0 34px 6px 0;font:400 17px/1.2 'Lilita One','Arial Rounded MT Bold',sans-serif;color:#F2BE62}
.pkb-card .chips{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px}
.pkb-card .chips span{font:700 11px/1 'Chakra Petch',ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;padding:4px 7px;border-radius:6px;background:#0E1B2E;color:#7FE8FF}
.pkb-card p{margin:0}.pkb-card p+p{margin-top:5px;color:#93A0B8;font-size:13px}
.pkb-card button{position:absolute;top:8px;right:8px;width:30px;height:30px;min-height:0;padding:0;border-radius:50%;border:0;background:#2A3142;color:#EAF2FF;font-size:18px;cursor:pointer;box-shadow:none}
.pkb-warn{position:absolute;left:10px;right:10px;top:10px;z-index:3;max-width:440px;margin:0 auto;background:#F59E2E;color:#2A1300;border-radius:12px;padding:9px 12px;font:800 13.5px/1.35 Nunito,system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.45);text-align:center}
.pkb-warn b{font-weight:900}
.pkb-msg{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:20px;color:#93A0B8;font:700 14px/1.4 Nunito,system-ui,sans-serif}
`;

/* ================================================================ het bord */
export async function createBoard(host, opts = {}) {
  if (!document.getElementById('pkb-css')) { const s = document.createElement('style'); s.id = 'pkb-css'; s.textContent = CSS; document.head.appendChild(s); }
  const root = document.createElement('div'); root.className = 'pkb'; host.appendChild(root);
  const msg = document.createElement('div'); msg.className = 'pkb-msg'; msg.textContent = 'Het speelbord wordt gebouwd…'; root.appendChild(msg);
  try { await loadThree(); } catch (e) { msg.textContent = 'Het 3D-bord kon niet laden. De gewone kaart werkt nog.'; throw e; }

  const canvas = document.createElement('canvas'); root.appendChild(canvas);
  const labelsEl = document.createElement('div'); labelsEl.className = 'pkb-labels'; root.appendChild(labelsEl);
  const card = document.createElement('div'); card.className = 'pkb-card'; card.hidden = true; root.appendChild(card);
  const warn = document.createElement('div'); warn.className = 'pkb-warn'; warn.hidden = true; warn.setAttribute('role', 'status'); root.appendChild(warn);
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' }); }
  catch (e) { canvas.remove(); msg.textContent = 'Dit toestel kan geen 3D tonen (WebGL staat uit). De gewone kaart werkt nog.'; throw e; }
  msg.remove();
  const small = Math.min(innerWidth, innerHeight) < 700;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.75 : 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

  const scene = new T.Scene();
  const BG_DAY = new T.Color(opts.bg || '#14213A'), BG_DUSK = new T.Color(opts.bgDusk || '#090F1D');
  scene.background = BG_DAY.clone(); scene.fog = new T.Fog(scene.background, 1100, 2600);
  const camera = new T.PerspectiveCamera(36, 1, 5, 5000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = 1.2; controls.minDistance = 60; controls.maxDistance = 1600; controls.screenSpacePanning = false;
  const hemi = new T.HemisphereLight('#FFF1D6', '#2A3142', 1.15); scene.add(hemi, new T.AmbientLight('#B9C6E0', 0.35));
  const sun = new T.DirectionalLight('#FFF0D0', 2.4); sun.castShadow = true; sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -440, right: 440, top: 440, bottom: -440, near: 50, far: 1500 }); sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const ground = new T.Mesh(new T.PlaneGeometry(4000, 4000), new T.ShadowMaterial({ opacity: 0.3 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -14; ground.receiveShadow = true; scene.add(ground);

  const m4 = new T.Matrix4(), q4 = new T.Quaternion(), v3 = new T.Vector3(), s3 = new T.Vector3(), col = new T.Color();
  const ZERO = new T.Matrix4().makeScale(0, 0, 0), FOGC = new T.Color('#2B3445'), SIDE = new T.Color('#232A38');
  const flat = (c, o = {}) => new T.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.85, metalness: 0, ...o });
  const ledMat = flat('#7FE8FF', { emissive: '#38C9F0', emissiveIntensity: 0.9, roughness: 0.4 });
  const goldMat = flat('#F2BE62', { emissive: '#A86A00', emissiveIntensity: 0.25, roughness: 0.3, metalness: 0.5 });
  const batter = flat('#F2DFB8');

  // ---- toestand
  let mode = opts.mode || 'spel', osm = null, osmSource = 'geen', path = makePath(opts.stops), world = null, B = null;
  let last = { stops: opts.stops || null }, follow = mode !== 'regie', disposed = false, fogKey = '';
  const clickables = [], labels = [];
  const dyn = { groupS: 0, groupPos: null, targetSeq: null, targetPt: null, lineLen: 0, pawnTo: null, mega: false };

  /* ---------------------------------------------------------------- bouwen */
  function clearWorld() {
    if (!world) return;
    scene.remove(world);
    world.traverse(o => { o.geometry?.dispose?.(); if (o.material && !Array.isArray(o.material) && ![ledMat, goldMat, batter].includes(o.material)) o.material.dispose?.(); });
    clickables.length = 0; labels.forEach(l => l.el.remove()); labels.length = 0; world = null;
  }
  function build() {
    clearWorld();
    world = new T.Group(); scene.add(world);
    const R = 10.5, SQ3 = Math.sqrt(3);
    const bb = bboxOf(path.pts);
    const cells = [], byKey = new Map();
    const rMin = Math.floor((bb.z0 - 70) / (1.5 * R)), rMax = Math.ceil((bb.z1 + 70) / (1.5 * R));
    for (let r = rMin; r <= rMax; r++) {
      const qMin = Math.floor((bb.x0 - 70) / (SQ3 * R) - r / 2) - 1, qMax = Math.ceil((bb.x1 + 70) / (SQ3 * R) - r / 2) + 1;
      for (let q = qMin; q <= qMax; q++) {
        const x = R * SQ3 * (q + r / 2), z = R * 1.5 * r, np = path.nearest(x, z);
        if (np.d < 36 || inPoly(x, z, path.pts)) { const c = { q, r, x, z, d: np.d, s: np.s, n: hash(q, r), i: cells.length, decos: [] }; cells.push(c); byKey.set(q + ',' + r, c); }
      }
    }
    const cellAt = (x, z) => { // pixel → hex (afgerond)
      const qf = (SQ3 / 3 * x - z / 3) / R, rf = (2 / 3 * z) / R, sf = -qf - rf;
      let q = Math.round(qf), r = Math.round(rf); const s = Math.round(sf);
      const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
      if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
      return byKey.get(q + ',' + r) || null;
    };
    const home = toXZ(HOME.lat, HOME.lng);

    // OSM-lagen voorbereiden
    const F = { b: [], r: [], f: [], wl: [], wa: [], a: [], t: [] };
    if (osm) {
      for (const b of osm.b) { const pts = pairs(b, 1); if (pts.length >= 3) F.b.push({ h: b[0], pts, box: bboxOf(pts) }); }
      for (const r of osm.r) { const pts = pairs(r, 1); (r[0] === 'f' ? F.f : F.r).push({ pts, box: bboxOf(pts) }); }
      for (const w of osm.w) { const pts = pairs(w, 1); (w[0] === 'l' ? F.wl : F.wa).push({ pts, box: bboxOf(pts) }); }
      for (const a of osm.a) { const pts = pairs(a, 1); F.a.push({ cls: a[0], pts, box: bboxOf(pts) }); }
      for (const t of osm.t) F.t.push(toXZ(t[0], t[1]));
    }
    const near = (list, x, z, m) => list.some(f => inBox(f.box, x, z, m) && lineDist(x, z, f.pts) < m);
    const inside = (list, x, z) => list.find(f => inBox(f.box, x, z) && inPoly(x, z, f.pts));
    const STREAM = [toXZ(51.61388, 5.55975), toXZ(51.61398, 5.5606), toXZ(51.61405, 5.56145)];
    for (const c of cells) {
      let t;
      if (c.d < 7.6) t = 'pad';
      else if (osm) {
        if (near(F.wl, c.x, c.z, 4.5) || inside(F.wa, c.x, c.z)) t = 'water';
        else if (near(F.r, c.x, c.z, 5.5)) t = 'straat';
        else if (inside(F.b, c.x, c.z)) t = 'erf';
        else if (near(F.f, c.x, c.z, 3.5)) t = 'voetpad';
        else t = inside(F.a, c.x, c.z)?.cls || 'tuin';
      } else {
        if (dist(c, home) < 24) t = 'erf';
        else if (lineDist(c.x, c.z, STREAM) < 6.5) t = 'water';
        else if (c.d < 30) t = c.n < 0.5 ? 'erf' : c.n < 0.78 ? 'tuin' : 'bos';
        else t = c.n < 0.22 ? 'erf' : c.n < 0.6 ? 'tuin' : c.n < 0.84 ? 'bos' : 'veld';
      }
      c.t = t; c.h = H[t];
      c.base = new T.Color(TC[t]).offsetHSL(0, 0, (c.n - 0.5) * 0.06); c.side = c.base.clone().lerp(SIDE, 0.62);
    }

    // tegels: zuil + bovenplaat
    const N = cells.length;
    const colMesh = new T.InstancedMesh(new T.CylinderGeometry(R * 0.985, R * 0.985, 1, 6), flat('#fff', { roughness: 1 }), N);
    const topMesh = new T.InstancedMesh(new T.CylinderGeometry(R * 0.93, R * 0.97, 0.7, 6), flat('#fff'), N);
    topMesh.receiveShadow = colMesh.receiveShadow = true;
    cells.forEach((c, i) => {
      const base = -12, hh = c.h - base;
      m4.compose(v3.set(c.x, base + hh / 2, c.z), q4.identity(), s3.set(1, hh, 1)); colMesh.setMatrixAt(i, m4);
      m4.compose(v3.set(c.x, c.h, c.z), q4.identity(), s3.set(1, 1, 1)); topMesh.setMatrixAt(i, m4);
      topMesh.setColorAt(i, c.base); colMesh.setColorAt(i, c.side);
    });
    world.add(colMesh, topMesh);

    // gebouwen (OSM: echte plattegronden, opgetrokken; zonder OSM: blokjes op de erf-tegels)
    const rnd = rng(42), bParts = [], bInfo = [];
    const steelPt = toXZ(51.6159852836062, 5.56485384055174);
    if (osm) {
      let steelIdx = -1, steelD = 25;
      F.b.forEach((b, k) => { const cx = (b.box.x0 + b.box.x1) / 2, cz = (b.box.z0 + b.box.z1) / 2; const d = inPoly(steelPt.x, steelPt.z, b.pts) ? 0 : Math.hypot(cx - steelPt.x, cz - steelPt.z); if (d < steelD) { steelD = d; steelIdx = k; } });
      F.b.forEach((b, k) => {
        const cx = (b.box.x0 + b.box.x1) / 2, cz = (b.box.z0 + b.box.z1) / 2, cell = cellAt(cx, cz);
        if (!cell || cell.d < 4) return;
        const pts = b.pts.slice(); if (dist(pts[0], pts[pts.length - 1]) < 0.01) pts.pop(); if (pts.length < 3) return;
        const shape = new T.Shape(pts.map(p => new T.Vector2(p.x, p.z)));
        let g; try { g = new T.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false }); } catch { return; }
        g.rotateX(Math.PI / 2); g.translate(0, 2.3 + b.h, 0); g.deleteAttribute('uv');
        const steel = k === steelIdx;
        const wall = new T.Color(steel ? '#C9D3E0' : WALLS[Math.floor(rnd() * WALLS.length)]), roof = new T.Color(steel ? '#8E979F' : ROOFS[Math.floor(rnd() * ROOFS.length)]);
        const cnt = g.attributes.position.count, colors = new Float32Array(cnt * 3);
        const caps = g.groups[0] || { start: 0, count: 0 };
        for (let v = 0; v < cnt; v++) { const c2 = v >= caps.start && v < caps.start + caps.count ? roof : wall; colors.set([c2.r, c2.g, c2.b], v * 3); }
        g.setAttribute('color', new T.BufferAttribute(colors, 3)); g.clearGroups();
        bParts.push(g); bInfo.push({ cell: cell.i, count: cnt, colors: colors.slice() });
      });
    }
    let bMesh = null;
    if (bParts.length) {
      const g = merge(bParts, false); bParts.forEach(p => p.dispose());
      bMesh = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }));
      bMesh.castShadow = bMesh.receiveShadow = true; world.add(bMesh);
      let off = 0; bInfo.forEach(b => { b.start = off; off += b.count; });
    }

    // decoratie: huisjes (zonder OSM), bomen, bloemen
    const spec = [];
    cells.forEach(c => {
      if (!osm && c.t === 'erf' && dist(c, home) > 24 && c.d > 9) spec.push({ c, k: 'house' });
      if (c.t === 'bos') { const n = 2 + (c.n > 0.5 ? 1 : 0); for (let k = 0; k < n; k++) spec.push({ c, k: 'tree', a: k / n * Math.PI * 2 + c.n * 6, r: R * 0.42 }); }
      if (c.t === 'tuin' && c.n < 0.16) spec.push({ c, k: 'tree', a: c.n * 40, r: R * 0.25 });
      if (c.t === 'veld' || c.t === 'gras' && c.n > 0.85) for (let k = 0; k < 3; k++) spec.push({ c, k: 'flower' });
    });
    if (osm) for (const t of F.t) { const c = cellAt(t.x, t.z); if (c && c.d > 5 && c.t !== 'water') spec.push({ c, k: 'tree', at: t }); }
    const cnt = k => spec.filter(s => s.k === k).length;
    const houseBody = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), flat('#fff'), Math.max(1, cnt('house')));
    const roofGeo = new T.ConeGeometry(0.75, 1, 4); roofGeo.rotateY(Math.PI / 4);
    const houseRoof = new T.InstancedMesh(roofGeo, flat('#fff'), Math.max(1, cnt('house')));
    const trees = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), flat('#fff'), Math.max(1, cnt('tree')));
    const trunks = new T.InstancedMesh(new T.CylinderGeometry(0.5, 0.7, 1, 5), flat('#6B4A32'), Math.max(1, cnt('tree')));
    const flowers = new T.InstancedMesh(new T.IcosahedronGeometry(0.9, 0), flat('#fff'), Math.max(1, cnt('flower')));
    [houseBody, houseRoof, trees, trunks].forEach(m => { m.castShadow = true; m.receiveShadow = true; });
    [houseBody, houseRoof, trees, trunks, flowers].forEach(m => { m.count = 0; });
    const FLOW = ['#FFD166', '#FF5A4E', '#FFF4E0', '#B794F6'];
    const put = (m, mat, c, color) => { const i = m.count++; m.setMatrixAt(i, mat); if (color) m.setColorAt(i, col.set(color)); c.decos.push({ m, i, mat: mat.clone() }); };
    for (const d of spec) {
      const c = d.c, top = c.h + 0.35;
      if (d.k === 'house') {
        const w = 6 + rnd() * 2.5, dd = 6 + rnd() * 2.5, h = 4.5 + rnd() * 3; q4.setFromAxisAngle(v3.set(0, 1, 0), (rnd() < 0.5 ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.2);
        const jx = (rnd() - 0.5) * 3, jz = (rnd() - 0.5) * 3;
        put(houseBody, m4.compose(v3.set(c.x + jx, top + h / 2, c.z + jz), q4, s3.set(w, h, dd)), c, WALLS[Math.floor(rnd() * WALLS.length)]);
        const rs = Math.max(w, dd); put(houseRoof, m4.compose(v3.set(c.x + jx, top + h + 2.2, c.z + jz), q4, s3.set(rs, 4.4, rs)), c, ROOFS[Math.floor(rnd() * ROOFS.length)]);
      } else if (d.k === 'tree') {
        const x = d.at ? d.at.x : c.x + Math.cos(d.a) * d.r, z = d.at ? d.at.z : c.z + Math.sin(d.a) * d.r;
        const s = 2.4 + rnd() * 2.2, th = 2.5 + rnd() * 1.5;
        put(trunks, m4.compose(v3.set(x, top + th / 2, z), q4.identity(), s3.set(1, th, 1)), c);
        q4.setFromEuler(new T.Euler(rnd(), rnd(), rnd()));
        put(trees, m4.compose(v3.set(x, top + th + s * 0.8, z), q4, s3.set(s, s * 1.25, s)), c, LEAVES[Math.floor(rnd() * LEAVES.length)]);
      } else {
        put(flowers, m4.compose(v3.set(c.x + (rnd() - 0.5) * R, top + 0.5, c.z + (rnd() - 0.5) * R), q4.identity(), s3.set(1, 1, 1)), c, FLOW[Math.floor(rnd() * FLOW.length)]);
      }
    }
    world.add(houseBody, houseRoof, trees, trunks, flowers);

    // ---- pannenkoekenwereld: stroop die over de rand van het eiland druipt, poffertjes met poedersuiker in het gras
    const syrupMat = flat('#D9861C', { emissive: '#7A3E00', emissiveIntensity: 0.25, roughness: 0.18, metalness: 0.1 });
    const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
    const drips = [];
    for (const c of cells) for (const [dq, dr] of NB) {
      if (byKey.has((c.q + dq) + ',' + (c.r + dr))) continue;
      if (hash(c.q * 7 + dq, c.r * 13 + dr) > 0.3) continue;
      const ox = R * SQ3 * (dq + dr / 2), oz = R * 1.5 * dr, L = Math.hypot(ox, oz), k = (R * 0.9) / L;
      drips.push({ x: c.x + ox / L * R * 0.9 * (L / L), z: c.z + oz / L * R * 0.9, h: c.h, len: 3 + hash(c.q + dq * 31, c.r - dr * 17) * 9, k });
    }
    const dripMesh = new T.InstancedMesh(new T.CapsuleGeometry(0.85, 1, 3, 8), syrupMat, Math.max(1, drips.length)); dripMesh.count = drips.length;
    drips.forEach((d, i) => dripMesh.setMatrixAt(i, m4.compose(v3.set(d.x, d.h + 0.2 - d.len / 2, d.z), q4.identity(), s3.set(1, d.len, 1))));
    dripMesh.castShadow = true; world.add(dripMesh);
    const poffs = [];
    for (const c of cells) if (['gras', 'tuin', 'veld'].includes(c.t) && c.d > 12 && c.n > 0.93) { const n = 4 + Math.floor(c.n * 100) % 4; for (let k = 0; k < n; k++) poffs.push({ c, a: k / n * Math.PI * 2 + c.n * 9, r: k ? 2.6 : 0, y: k ? 0 : 1.1 }); }
    const s7 = path.pts.find(p => p.seq === 7);
    if (s7) { const c = cellAt(s7.x, s7.z); for (let k = 0; k < 12; k++) poffs.push({ c: c || { x: s7.x, z: s7.z, h: 2.3, decos: [] }, x: s7.x, z: s7.z, a: k / 12 * Math.PI * 2, r: 10.2, y: 0 }); }
    const poffMesh = new T.InstancedMesh(new T.SphereGeometry(1.5, 12, 8), flat('#C98A3E', { roughness: 0.55 }), Math.max(1, poffs.length));
    const sugarMesh = new T.InstancedMesh(new T.SphereGeometry(1, 8, 6), flat('#FFFDF8', { roughness: 1, emissive: '#FFFFFF', emissiveIntensity: 0.08 }), Math.max(1, poffs.length));
    poffMesh.count = sugarMesh.count = 0; poffMesh.castShadow = true;
    for (const p of poffs) {
      const cx = p.x ?? p.c.x, cz = p.z ?? p.c.z, x = cx + Math.cos(p.a) * p.r, z = cz + Math.sin(p.a) * p.r, y = p.c.h + 0.35 + 0.6 + p.y;
      put(poffMesh, m4.compose(v3.set(x, y, z), q4.identity(), s3.set(1, 0.5, 1)), p.c);
      put(sugarMesh, m4.compose(v3.set(x, y + 0.55, z), q4.identity(), s3.set(0.9, 0.22, 0.9)), p.c);
    }
    world.add(poffMesh, sugarMesh);

    // wolken (alleen spelers- en kernweergave)
    const cloudMat = flat('#E8EEF7', { roughness: 1, emissive: '#5A6C8E', emissiveIntensity: 0 });
    const clouds = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), cloudMat, N);
    cells.forEach((c, i) => { q4.setFromAxisAngle(v3.set(0, 1, 0), c.n * 6); c.cloud = new T.Matrix4().compose(v3.set(c.x, c.h + 9 + c.n * 3, c.z), q4.clone(), s3.set(R * 0.98, 5 + c.n * 2.5, R * 0.98)); clouds.setMatrixAt(i, ZERO); });
    world.add(clouds);

    // stroopdruppels langs de hele route
    const drops = []; for (let s = 4; s < path.total - 4; s += 8) drops.push(s);
    const dropMat = flat('#fff', { emissive: '#FFB347', emissiveIntensity: 0, roughness: 0.35, metalness: 0.1 });
    const dropMesh = new T.InstancedMesh(new T.SphereGeometry(1.15, 10, 8), dropMat, drops.length);
    drops.forEach((s, i) => { const p = path.at(s); dropMesh.setMatrixAt(i, m4.compose(v3.set(p.x, H.pad + 1.5, p.z), q4.identity(), s3.set(1, 0.8, 1))); dropMesh.setColorAt(i, col.set('#9A6A3A')); });
    world.add(dropMesh);

    // stops (sokkels met onderdeel; 7 = pannenkoekentoren)
    const topOf = p => { const c = cellAt(p.x, p.z); return c ? c.h : 2.3; };
    const stopObjs = {};
    for (const p of path.pts) {
      if (!p.seq || stopObjs[p.seq]) continue;
      const g = new T.Group(), h = topOf(p); g.position.set(p.x, h, p.z);
      let topY;
      if (p.seq === 7) {
        const cs = ['#E8B062', '#DFA556', '#EAB868', '#D99A4E', '#E6AD5C'];
        for (let i = 0; i < 5; i++) { const pk = new T.Mesh(new T.CylinderGeometry(8.5 - i * 0.35, 8.7 - i * 0.35, 1.5, 24), flat(cs[i], { roughness: 0.7 })); pk.position.y = 0.8 + i * 1.55; pk.castShadow = pk.receiveShadow = true; g.add(pk); }
        const butter = new T.Mesh(new T.BoxGeometry(3.2, 1.6, 3.2), flat('#FFF1A8', { roughness: 0.5 })); butter.position.y = 8.9; butter.rotation.y = 0.4; butter.castShadow = true; g.add(butter);
        // stroop over de toren, poedersuiker erop en een zeef die erboven strooit
        const glaze = new T.Mesh(new T.CylinderGeometry(6.6, 7.2, 0.5, 24), syrupMat); glaze.position.y = 8.05; g.add(glaze);
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3, d = new T.Mesh(new T.CapsuleGeometry(0.6, 1, 3, 8), syrupMat), len = 2 + (i % 3) * 1.6;
          d.scale.y = len; d.position.set(Math.cos(a) * 7.4, 8 - len / 2, Math.sin(a) * 7.4); g.add(d); }
        const dust = new T.Mesh(new T.CylinderGeometry(6.2, 6.2, 0.15, 24), flat('#FFFDF8', { roughness: 1 })); dust.position.y = 8.35; g.add(dust);
        const sieve = new T.Group(); const rim = new T.Mesh(new T.TorusGeometry(4, 0.35, 6, 24), flat('#C9D3E0', { metalness: 0.6, roughness: 0.3 })); rim.rotation.x = Math.PI / 2;
        const mesh = new T.Mesh(new T.CircleGeometry(4, 24), new T.MeshBasicMaterial({ color: '#C9D3E0', transparent: true, opacity: 0.45, side: T.DoubleSide })); mesh.rotation.x = Math.PI / 2;
        const grip = new T.Mesh(new T.BoxGeometry(5, 0.5, 0.8), rim.material); grip.position.x = 6.4; sieve.add(rim, mesh, grip); sieve.position.y = 34; g.add(sieve);
        const NS = 220, sp = new Float32Array(NS * 3), sv = new Float32Array(NS);
        for (let i = 0; i < NS; i++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 3.8; sp.set([Math.cos(a) * r, 10 + Math.random() * 24, Math.sin(a) * r], i * 3); sv[i] = 4 + Math.random() * 5; }
        const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3));
        const sugar = new T.Points(sg, new T.PointsMaterial({ color: '#FFFFFF', size: 0.9, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false }));
        sugar.userData.speed = sv; g.add(sugar); g.userData.sugar = sugar; g.userData.sieve = sieve;
        topY = 10;
      } else {
        const ped = new T.Mesh(new T.CylinderGeometry(R * 0.6, R * 0.75, 4.5, 6), batter); ped.position.y = 2.25; ped.castShadow = ped.receiveShadow = true; g.add(ped);
        const ring = new T.Mesh(new T.TorusGeometry(R * 0.55, 0.45, 6, 6), ledMat); ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 6; ring.position.y = 4.6; g.add(ring);
        topY = 4.6;
      }
      const partKey = ['lijf', 'ogen', 'neus', 'mond', 'armen', 'benen', 'hoed'][p.seq - 1];
      const tk = token(partKey); tk.position.y = topY + 7; tk.userData.baseY = topY + 7; g.add(tk);
      world.add(g);
      const info = { kind: 'stop', seq: p.seq };
      g.traverse(o => { if (o.isMesh) { o.userData.info = info; clickables.push(o); } });
      const anchor = new T.Object3D(); anchor.position.y = topY + 14; g.add(anchor);
      stopObjs[p.seq] = { g, tk, p, h, topY, anchor, el: label('', info, anchor, { kind: 'stop', seq: p.seq }) };
    }

    // regie-markers
    const extras = EXTRAS.map((ex, idx) => {
      const b = toXZ(ex.at[0], ex.at[1]), p = { x: b.x + ex.off[0], z: b.z + ex.off[1] }, h = topOf(p);
      const g = new T.Group(); g.position.set(p.x, h, p.z);
      let obj, y = 7;
      if (ex.k === 'bonus') { obj = new T.Mesh(new T.CylinderGeometry(3.4, 3.4, 0.9, 24), goldMat); obj.rotation.x = Math.PI / 2; y = 9; }
      else if (ex.k === 'reserve') { obj = new T.Mesh(new T.OctahedronGeometry(3), flat('#B794F6', { emissive: '#4B2FB0', emissiveIntensity: 0.35 })); y = 8; }
      else if (ex.k === 'surprise') obj = new T.Mesh(new T.TetrahedronGeometry(3), flat('#FF5A4E', { emissive: '#7A1426', emissiveIntensity: 0.35 }));
      else { obj = new T.Group(); const pole = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 7, 6), flat('#6B4A32')); pole.position.y = -3.5; const sheet = new T.Mesh(new T.BoxGeometry(6, 7.5, 0.4), flat('#FFF6E8', { emissive: '#3A2A1A', emissiveIntensity: 0.2 })); sheet.position.y = 1; obj.add(pole, sheet); y = 7.5; }
      obj.position.y = y; obj.userData.baseY = y; g.add(obj);
      const info = { kind: 'extra', idx };
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.info = info; clickables.push(o); } });
      world.add(g);
      const anchor = new T.Object3D(); anchor.position.y = y + 6; g.add(anchor);
      label(ex.lab, info, anchor, { kind: 'extra', cls: ex.k });
      return { g, obj, ex };
    });
    const crumbs = CRUMBS.map(([lat, lng], i) => { const p = toXZ(lat, lng), m = new T.Mesh(new T.DodecahedronGeometry(1.3, 0), flat('#B07A45')); m.position.set(p.x + (i % 2 ? 3 : -3), H.pad + 1.6, p.z + 3); m.castShadow = true; world.add(m); return m; });

    // live bonusstop (zonder deel) als gouden munt
    const bonusCoin = new T.Group(); { const c = new T.Mesh(new T.CylinderGeometry(4, 4, 1, 24), goldMat); c.rotation.x = Math.PI / 2; c.position.y = 10; c.userData.baseY = 10; bonusCoin.add(c); bonusCoin.userData.coin = c; bonusCoin.visible = false; world.add(bonusCoin);
      const info = { kind: 'bonusstop' }; c.userData.info = info; clickables.push(c);
      const anchor = new T.Object3D(); anchor.position.y = 16; bonusCoin.add(anchor); label('⭐ bonus', info, anchor, { kind: 'bonusstop', cls: 'bonus' }); }

    // lichtbaken + puls boven de volgende stop
    const beacon = new T.Mesh(new T.CylinderGeometry(2.8, 2.8, 220, 20, 1, true), new T.MeshBasicMaterial({ color: '#7FE8FF', transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    const pulse = new T.Mesh(new T.RingGeometry(7, 9, 32), new T.MeshBasicMaterial({ color: '#7FE8FF', transparent: true, opacity: 0.7, depthWrite: false, side: T.DoubleSide }));
    pulse.rotation.x = -Math.PI / 2; world.add(beacon, pulse);

    // de LED-lijn naar de volgende stop + pijltjes die erlangs schuiven
    const lineMat = new T.MeshStandardMaterial({ color: '#7FE8FF', emissive: '#38C9F0', emissiveIntensity: 1.2, roughness: 0.4 });
    const line = new T.Mesh(new T.BufferGeometry(), lineMat); line.renderOrder = 2; world.add(line);
    const linkMat = new T.MeshBasicMaterial({ color: '#EAF2FF', transparent: true, opacity: 0.8 });
    const link = new T.Mesh(new T.BufferGeometry(), linkMat); world.add(link);
    const arrowGeo = new T.ConeGeometry(1.6, 3.6, 3); arrowGeo.rotateX(Math.PI / 2);
    const arrows = new T.InstancedMesh(arrowGeo, new T.MeshBasicMaterial({ color: '#EAF2FF' }), 80); arrows.count = 0; world.add(arrows);

    // Mecha-Pof (de groep) en de telefoons
    const pawn = new T.Group();
    { const st = flat('#C9D3E0', { metalness: 0.6, roughness: 0.35 });
      const body = new T.Mesh(new T.CylinderGeometry(2.8, 3.2, 5, 10), st); body.position.y = 2.5;
      const pan = new T.Mesh(new T.CylinderGeometry(3.6, 3.2, 0.9, 18), flat('#2B2B30', { metalness: 0.4, roughness: 0.5 })); pan.position.y = 5.6;
      const handle = new T.Mesh(new T.BoxGeometry(0.9, 0.5, 5), flat('#2B2B30')); handle.position.set(0, 5.6, -4.4);
      const eyeL = new T.Mesh(new T.SphereGeometry(0.8, 10, 8), ledMat); eyeL.position.set(-1.2, 3.5, 2.7); const eyeR = eyeL.clone(); eyeR.position.x = 1.2;
      const jet = new T.Mesh(new T.CylinderGeometry(1, 1, 3.4, 8), flat('#D9822B', { roughness: 0.3 })); jet.position.set(0, 3, -3.4);
      [body, pan, handle, eyeL, eyeR, jet].forEach(m => { m.castShadow = true; pawn.add(m); }); }
    pawn.scale.setScalar(1.8); world.add(pawn);
    // losse tegel onder Mecha-Pof als de groep buiten het bord staat
    const stone = new T.Mesh(new T.CylinderGeometry(R * 0.97, R * 0.97, 14.3, 6), flat('#8E979F', { emissive: '#F59E2E', emissiveIntensity: 0.25 })); stone.position.y = -4.85; stone.visible = false; stone.castShadow = stone.receiveShadow = true; world.add(stone);
    const pinGeo = new T.SphereGeometry(2, 12, 10), pins = new Map();

    B = { syrupMat, sugarStop: stopObjs[7], cloudMat, cells, cellAt, colMesh, topMesh, clouds, bMesh, bInfo, decoMeshes: [houseBody, houseRoof, trees, trunks, flowers, poffMesh, sugarMesh], drops, dropMesh, dropMat, stopObjs, extras, crumbs, bonusCoin, beacon, pulse, line, link, arrows, pawn, stone, pinGeo, pins, R };
    [houseBody, houseRoof, trees, trunks, flowers, clouds, dropMesh, colMesh, topMesh].forEach(m => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    fogKey = ''; dyn.groupPos = null;
    applyDynamic(true);
    fitCamera(true);
  }

  function token(part) {
    const g = new T.Group(); const add = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new T.Mesh(geo, ledMat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
    switch (part) {
      case 'lijf': add(new T.BoxGeometry(5, 6, 3.5)); add(new T.CylinderGeometry(1, 1, 0.6, 6), 0, 0.8, 1.9, Math.PI / 2); break;
      case 'ogen': add(new T.SphereGeometry(1.7, 12, 10), -2.1); add(new T.SphereGeometry(1.7, 12, 10), 2.1); break;
      case 'neus': add(new T.ConeGeometry(2, 4.4, 6), 0, 0, 0, Math.PI / 2); break;
      case 'mond': add(new T.TorusGeometry(2.6, 0.75, 8, 16, Math.PI), 0, 1, 0, 0, 0, Math.PI); break;
      case 'armen': add(new T.BoxGeometry(0.8, 7, 0.6), 0, 0, 0, 0, 0, 0.5); add(new T.BoxGeometry(3, 2.6, 0.5), -1.6, 3.2, 0, 0, 0, 0.5); add(new T.CylinderGeometry(0.4, 0.4, 7, 6), 0, 0, 0, 0, 0, -0.5); add(new T.SphereGeometry(1.6, 8, 6), 1.8, 3.2, 0); break;
      case 'benen': add(new T.CylinderGeometry(0.9, 0.9, 6, 8), -1.7); add(new T.CylinderGeometry(0.9, 0.9, 6, 8), 1.7); add(new T.BoxGeometry(2.2, 0.9, 3), -1.7, -3.2, 0.6); add(new T.BoxGeometry(2.2, 0.9, 3), 1.7, -3.2, 0.6); break;
      default: add(new T.CylinderGeometry(3.4, 3, 0.9, 20)); add(new T.BoxGeometry(5, 0.5, 0.9), 5, 0, 0);
    }
    return g;
  }
  function label(text, info, anchor, meta) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pkb-tag' + (meta.cls ? ' ' + meta.cls : ''); b.textContent = text;
    b.addEventListener('click', e => { e.stopPropagation(); openCard(info); });
    labelsEl.appendChild(b); labels.push({ el: b, anchor, vis: true, ...meta }); return b;
  }

  /* ---------------------------------------------------------------- dynamisch: voortgang, wolken, lijn, pion */
  function derive() {
    const o = last, out = { reached: 0, targetSeq: 1, targetLL: null, targetStop: null, groupS: 0, groupXZ: null, phase: o.phase || 'onderweg', finished: false, minutes: null };
    const seqOf = st => st?.seq != null && (st.part || st.key) ? st.seq : null;
    if (o.progress != null) { // demo
      const p = clamp(o.progress, 0, 7), i = Math.min(6, Math.floor(p)), f = p - i;
      out.reached = Math.floor(p + 1e-4); out.finished = p >= 7 - 1e-4; out.targetSeq = out.finished ? null : out.reached + 1;
      out.groupS = lerp(path.stopS[i] ?? 0, path.stopS[i + 1] ?? path.total, f);
      out.phase = out.finished ? 'finale' : f < 0.02 && p > 0 ? 'puzzel' : 'onderweg';
      out.minutes = lerp(TIMES[i], TIMES[i + 1], f);
      return out;
    }
    const route = o.stops || [], ai = o.activeIndex ?? 0, target = route[ai] || null;
    out.finished = ['finale', 'klaar'].includes(o.phase) || (!target && route.length > 0 && ai >= route.length);
    const done = route.slice(0, ai).map(seqOf).filter(Boolean);
    out.reached = done.length ? Math.max(...done) : 0;
    if (out.finished) out.reached = 7;
    out.targetStop = out.finished ? null : target;
    out.targetSeq = out.finished ? null : seqOf(target);
    if (target && out.targetSeq == null && target.lat != null) out.targetLL = toXZ(target.lat, target.lng);
    const sPrev = path.stopS[out.reached] ?? 0, sTgt = out.targetSeq ? path.stopS[out.targetSeq] : sPrev + 60;
    // groepspositie: GPS van dit toestel, anders het gemiddelde van de online telefoons, anders de laatste stop
    let gp = o.pos?.lat != null ? toXZ(o.pos.lat, o.pos.lng) : null;
    if (!gp) { const on = (o.players || []).filter(p => p.online && p.lat != null); if (on.length) { const a = on.reduce((s, p) => ({ lat: s.lat + p.lat / on.length, lng: s.lng + p.lng / on.length }), { lat: 0, lng: 0 }); gp = toXZ(a.lat, a.lng); } }
    if (gp) {
      const np = path.nearest(gp.x, gp.z, sPrev - 40, Math.max(sTgt, sPrev) + 10);
      out.groupS = np.d < 70 ? np.s : sPrev; out.groupXZ = gp; out.joinS = np.s; out.offRoute = np.d; // joinS: waar de groep weer op de route komt
      out.offBoard = !!B && !B.cellAt(gp.x, gp.z);
    }
    else out.groupS = out.phase === 'puzzel' && out.targetSeq ? sTgt : sPrev;
    if (out.finished) out.groupS = path.total;
    return out;
  }

  function applyDynamic(force = false) {
    if (!B) return;
    const D = derive(), fogOn = mode !== 'regie';
    const sTgt = D.targetSeq ? path.stopS[D.targetSeq] : D.targetLL ? D.groupS : path.total;
    // wolken: zichtbaar is wat gelopen is, de lijn naar de volgende stop en de buurt van thuis
    const key = [mode, Math.round(D.groupS / 6), D.targetSeq, D.reached, !!D.targetLL].join('|');
    if (force || key !== fogKey) {
      fogKey = key;
      const home = toXZ(HOME.lat, HOME.lng);
      const tXZ = D.targetSeq ? path.at(sTgt) : D.targetLL;
      B.cells.forEach((c, i) => {
        const seen = !fogOn || D.finished || (c.d < 50 && c.s <= Math.max(D.groupS, sTgt) + 8) || dist(c, home) < 46 || (tXZ && dist(c, tXZ) < 30) || (D.groupXZ && dist(c, D.groupXZ) < 45);
        c.seen = seen;
        B.topMesh.setColorAt(i, seen ? c.base : col.copy(c.base).lerp(FOGC, 0.78));
        B.colMesh.setColorAt(i, seen ? c.side : col.copy(c.side).lerp(FOGC, 0.6));
        B.clouds.setMatrixAt(i, seen ? ZERO : c.cloud);
        for (const d of c.decos) d.m.setMatrixAt(d.i, seen ? d.mat : ZERO);
      });
      if (B.bMesh) { const ca = B.bMesh.geometry.attributes.color; for (const b of B.bInfo) { const seen = B.cells[b.cell].seen; for (let v = 0; v < b.count; v++) { const k = v * 3; if (seen) ca.array.set(b.colors.subarray(k, k + 3), (b.start + v) * 3); else { col.setRGB(b.colors[k], b.colors[k + 1], b.colors[k + 2]).lerp(FOGC, 0.8); ca.array.set([col.r, col.g, col.b], (b.start + v) * 3); } } } ca.needsUpdate = true; }
      [B.topMesh, B.colMesh].forEach(m => m.instanceColor.needsUpdate = true);
      [B.clouds, ...B.decoMeshes].forEach(m => m.instanceMatrix.needsUpdate = true);
      B.drops.forEach((s, i) => {
        const behind = s <= D.groupS, onLine = s > D.groupS && s <= sTgt;
        B.dropMesh.setColorAt(i, col.set(behind ? '#FFC340' : '#9A6A3A'));
        if (fogOn && !behind) B.dropMesh.setMatrixAt(i, ZERO);
        else { const p = path.at(s); B.dropMesh.setMatrixAt(i, m4.compose(v3.set(p.x, H.pad + 1.5, p.z), q4.identity(), behind ? s3.set(1.15, 0.9, 1.15) : s3.set(0.85, 0.6, 0.85))); }
        if (onLine && fogOn) B.dropMesh.setMatrixAt(i, ZERO);
      });
      B.dropMesh.instanceColor.needsUpdate = true; B.dropMesh.instanceMatrix.needsUpdate = true;
      // stops
      for (const k in B.stopObjs) {
        const o = B.stopObjs[k], n = +k, isDone = D.reached >= n, isNext = D.targetSeq === n;
        o.g.visible = !fogOn || isDone || isNext || n === 7;
        o.tk.traverse(m => { if (m.isMesh) m.material = isDone ? goldMat : ledMat; });
        o.el.classList.toggle('done', isDone); o.el.classList.toggle('next', isNext);
        o.el.textContent = `${n} ${PARTS[['lijf', 'ogen', 'neus', 'mond', 'armen', 'benen', 'hoed'][n - 1]]?.icon || ''}${isDone ? ' ✓' : ''}`;
        labels.find(l => l.el === o.el).vis = o.g.visible;
      }
      B.extras.forEach(e => e.g.visible = !fogOn);
      B.crumbs.forEach(c => c.visible = !fogOn);
      labels.forEach(l => { if (l.kind === 'extra') l.vis = !fogOn; });
      // bonusstop als volgende doel
      B.bonusCoin.visible = !!D.targetLL;
      if (D.targetLL) B.bonusCoin.position.set(D.targetLL.x, (B.cellAt(D.targetLL.x, D.targetLL.z)?.h ?? 2.3), D.targetLL.z);
      labels.forEach(l => { if (l.kind === 'bonusstop') l.vis = !!D.targetLL; });
      // baken
      const bt = D.targetLL ? { x: D.targetLL.x, z: D.targetLL.z, h: 2.3 } : D.targetSeq ? B.stopObjs[D.targetSeq] && { x: B.stopObjs[D.targetSeq].p.x, z: B.stopObjs[D.targetSeq].p.z, h: B.stopObjs[D.targetSeq].h } : null;
      B.beacon.visible = B.pulse.visible = !!bt;
      if (bt) { B.beacon.position.set(bt.x, bt.h + 110, bt.z); B.pulse.position.set(bt.x, bt.h + 0.9, bt.z); }
    }
    // lijn naar de volgende stop (ook in regie)
    const lineKey = Math.round(D.groupS) + '|' + D.targetSeq + '|' + (D.groupXZ ? Math.round(D.groupXZ.x) + ',' + Math.round(D.groupXZ.z) : '') + '|' + (D.targetLL ? 'b' : '');
    if (force || lineKey !== dyn.lineKey) {
      dyn.lineKey = lineKey;
      let pts = [];
      const s0 = D.groupXZ && D.joinS != null ? D.joinS : D.groupS;
      if (D.targetSeq && sTgt > s0 + 1) pts = path.slice(s0, sTgt);
      else if (D.targetLL) { const from = D.groupXZ || path.at(D.groupS); pts = [from, D.targetLL]; }
      dyn.linePts = pts; dyn.lineLen = 0; for (let i = 1; i < pts.length; i++) dyn.lineLen += dist(pts[i - 1], pts[i]);
      B.line.geometry.dispose();
      if (pts.length >= 2) {
        const cp = new T.CurvePath(); for (let i = 1; i < pts.length; i++) if (dist(pts[i - 1], pts[i]) > 0.01) cp.add(new T.LineCurve3(new T.Vector3(pts[i - 1].x, H.pad + 1.6, pts[i - 1].z), new T.Vector3(pts[i].x, H.pad + 1.6, pts[i].z)));
        B.line.geometry = cp.curves.length ? new T.TubeGeometry(cp, Math.max(8, Math.ceil(dyn.lineLen / 2)), 1.25, 6, false) : new T.BufferGeometry();
      } else B.line.geometry = new T.BufferGeometry();
      // dun lijntje van de echte GPS-positie naar de route als je ernaast loopt
      B.link.geometry.dispose(); B.link.geometry = new T.BufferGeometry();
      // terugweg: van de echte positie naar het punt waar de LED-lijn begint; oranje en dikker als de groep ver weg of buiten het bord is
      if (D.groupXZ && D.targetSeq && !D.finished) { const np = path.at(s0), d = dist(np, D.groupXZ); if (d > 10) { const far = D.offBoard || d > 35;
        B.link.material.color.set(far ? '#F59E2E' : '#EAF2FF'); B.link.material.opacity = far ? 1 : 0.8;
        const c = new T.LineCurve3(new T.Vector3(D.groupXZ.x, H.pad + 1.6, D.groupXZ.z), new T.Vector3(np.x, H.pad + 1.6, np.z)); B.link.geometry = new T.TubeGeometry(c, Math.max(8, Math.ceil(d / 4)), far ? 1 : 0.5, 6, false); } }
      dyn.linkLen = D.groupXZ && D.targetSeq ? Math.round(dist(path.at(s0), D.groupXZ)) : 0;
    }
    // pion
    const pp = D.groupXZ && !D.finished ? { ...D.groupXZ, dir: path.at(D.groupS).dir } : path.at(D.groupS);
    dyn.pawnTo = pp; dyn.mega = D.finished; dyn.D = D;
    B.stone.visible = !!D.offBoard && !D.finished; if (B.stone.visible) B.stone.position.set(D.groupXZ.x, -4.85, D.groupXZ.z);
    // melding als de groep van het bord af is (of ver van de route)
    const lost = !D.finished && D.groupXZ && (D.offBoard || D.offRoute > 60);
    warn.hidden = !lost;
    if (lost) { const m = Math.round(D.offRoute / 5) * 5; warn.innerHTML = mode === 'regie' ? `De groep is <b>±${m} m</b> van de route${D.offBoard ? ', buiten het bord' : ''}.`
      : `Oeps, jullie zijn van het speelbord gelopen! Volg de <b>oranje lijn</b> terug naar de route (±${m} m).`; }
    // telefoons als bessen (regie/kern; in spel alleen de anderen)
    const want = new Set();
    for (const p of last.players || []) {
      if (!p.online || p.lat == null) continue; if (mode === 'spel' && (last.meIds || []).includes(p.id)) continue;
      want.add(p.id); let m = B.pins.get(p.id);
      if (!m) { m = new T.Mesh(B.pinGeo, flat(p.color || '#7FE8FF', { emissive: p.color || '#7FE8FF', emissiveIntensity: 0.35 })); m.castShadow = true; world.add(m); B.pins.set(p.id, m); }
      const xz = toXZ(p.lat, p.lng); m.position.set(xz.x, (B.cellAt(xz.x, xz.z)?.h ?? 2.3) + 6, xz.z);
    }
    for (const [id, m] of B.pins) if (!want.has(id)) { world.remove(m); m.material.dispose(); B.pins.delete(id); }
    applyLight(D);
  }

  function applyLight(D) {
    const now = new Date(), m = opts.minutes ?? D.minutes ?? (now.getHours() * 60 + now.getMinutes());
    const q = new URLSearchParams(location.search).get('avond'); const forced = q == null ? null : q !== '0';
    const f = forced == null ? clamp((m - 975) / 50, 0, 1) : forced ? 1 : 0; // 16:15 → 17:05: van dag naar schemer
    const bb = path ? bboxOf(path.pts) : { x0: 0, x1: 0, z0: 0, z1: 0 }, cx = (bb.x0 + bb.x1) / 2, cz = (bb.z0 + bb.z1) / 2;
    const lf = Math.min(f, 0.6); // het bord blijft leesbaar, ook na zonsondergang
    sun.intensity = lerp(2.4, 0.9, lf); sun.color.set('#FFF0D0').lerp(col.set('#FF8A4A'), f);
    sun.position.set(cx - 320, lerp(420, 180, lf), cz + lerp(260, 420, lf)); sun.target.position.set(cx, 0, cz);
    hemi.intensity = lerp(1.15, 0.95, lf); hemi.color.set('#FFF1D6').lerp(col.set('#8F86C8'), lf);
    scene.background.copy(BG_DAY).lerp(BG_DUSK, f); scene.fog.color.copy(scene.background);
    ledMat.emissiveIntensity = lerp(0.9, 2.2, f); if (B) { B.dropMat.emissiveIntensity = lerp(0.05, 0.9, f); B.beacon.material.opacity = lerp(0.22, 0.42, f); B.line.material.emissiveIntensity = lerp(1.1, 2.4, f); B.cloudMat.emissiveIntensity = lerp(0, 0.55, f); }
    dyn.minutes = m; dyn.dusk = f;
  }

  /* ---------------------------------------------------------------- camera */
  function fitCamera(jump = false) {
    if (!B) return;
    const D = dyn.D; let pts;
    if (mode === 'spel' && D && !D.finished) { pts = [path.at(D.groupS)]; if (D.groupXZ) pts.push(D.groupXZ); if (dyn.linePts?.length) pts.push(...dyn.linePts); }
    else { pts = path.pts.slice(); if (D?.groupXZ && !D.finished) pts.push(D.groupXZ); } // groep buiten het bord blijft in beeld
    const bb = bboxOf(pts), cx = (bb.x0 + bb.x1) / 2, cz = (bb.z0 + bb.z1) / 2;
    const span = Math.max(bb.x1 - bb.x0, bb.z1 - bb.z0) + (mode === 'spel' ? 70 : 40);
    const fit = span / (2 * Math.tan(T.MathUtils.degToRad(camera.fov / 2))) / Math.min(1, camera.aspect * 1.15);
    const d = clamp(fit * (mode === 'spel' ? 0.8 : 0.82), mode === 'spel' ? 130 : 260, 1300);
    const want = { tx: cx, tz: cz, px: cx + d * 0.32, py: d * 0.72, pz: cz + d * 0.62 };
    if (jump) { controls.target.set(want.tx, 0, want.tz); camera.position.set(want.px, want.py, want.pz); controls.update(); dyn.camWant = null; }
    else dyn.camWant = want;
  }
  controls.addEventListener('start', () => { follow = false; dyn.camWant = null; controls.autoRotate = false; });

  /* ---------------------------------------------------------------- kaartje */
  function chips(list) { return `<div class="chips">${list.map(t => `<span>${esc(t)}</span>`).join('')}</div>`; }
  function openCard(info) {
    const spel = mode !== 'regie'; let h = '', c = [], p = '', p2 = '';
    if (info.kind === 'stop') {
      const live = (last.stops || []).find(s => s.seq === info.seq), si = STOP_INFO[info.seq] || {}, part = ['lijf', 'ogen', 'neus', 'mond', 'armen', 'benen', 'hoed'][info.seq - 1];
      h = `${info.seq === 7 ? 'Thuis' : 'Stop ' + info.seq} · ${live?.name || ''}`.replace(/ · $/, ''); c = [PARTS[part]?.label || part, si.puz || '', TIMES[info.seq] ? '± ' + fmt(TIMES[info.seq]) : ''].filter(Boolean);
      p = spel ? si.teaser || '' : si.kern || ''; p2 = spel ? '' : 'Regieweergave: met antwoord.';
    } else if (info.kind === 'extra') { const ex = EXTRAS[info.idx]; h = ex.h; c = ex.chips; p = ex.p; p2 = ex.p2; }
    else { const t = dyn.D?.targetStop; h = '⭐ ' + (t?.name || 'Bonusopdracht'); c = ['bonus', 'geen onderdeel']; p = t?.clue || 'Een extra klus voor stroopdruppels.'; }
    card.innerHTML = `<button type="button" aria-label="Sluiten">×</button><h3>${esc(h)}</h3>${chips(c)}<p>${esc(p)}</p>${p2 ? `<p>${esc(p2)}</p>` : ''}`;
    card.querySelector('button').onclick = () => { card.hidden = true; };
    card.hidden = false;
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
  const ray = new T.Raycaster(), ndc = new T.Vector2(); let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; } down = null;
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(clickables, false).find(h => { let o = h.object; while (o) { if (!o.visible) return false; o = o.parent; } return true; });
    if (hit) openCard(hit.object.userData.info); else card.hidden = true;
  });

  /* ---------------------------------------------------------------- lus */
  function resize() { const w = root.clientWidth, h = root.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  const ro = new ResizeObserver(() => { resize(); if (follow) fitCamera(); }); ro.observe(root); resize();
  const clock = new T.Clock(), tmp = new T.Vector3(); let lastFit = 0;
  renderer.setAnimationLoop(() => {
    if (disposed || document.hidden || !root.isConnected || !B) return;
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
    // pion glijdt naar zijn plek
    if (dyn.pawnTo) {
      const P = B.pawn, tx = dyn.pawnTo.x, tz = dyn.pawnTo.z, dx = tx - P.position.x, dz = tz - P.position.z, dd = Math.hypot(dx, dz);
      if (dd > 300) P.position.set(tx, P.position.y, tz);
      else if (dd > 0.05) { const k = Math.min(1, dt * 3); P.position.x += dx * k; P.position.z += dz * k; P.rotation.y = Math.atan2(dx, dz); }
      const moving = dd > 0.6, seven = B.stopObjs[7];
      const baseY = dyn.mega && seven ? seven.h + 10 : H.pad + 0.35;
      P.position.y = baseY + (moving ? Math.abs(Math.sin(t * 12)) * 1.2 : 0);
      const sc = dyn.mega ? 3 : 1.8; P.scale.setScalar(lerp(P.scale.x, sc, 0.06));
    }
    for (const k in B.stopObjs) { const o = B.stopObjs[k]; o.tk.position.y = o.tk.userData.baseY + Math.sin(t * 1.6 + +k) * 0.9; o.tk.rotation.y = t * 0.6 + +k; }
    B.extras.forEach((o, k) => { o.obj.position.y = o.obj.userData.baseY + Math.sin(t * 2 + k) * 0.5; if (o.ex.k !== 'print') o.obj.rotation.y = t * 1.2 + k; });
    if (B.bonusCoin.visible) B.bonusCoin.userData.coin.rotation.y = t * 1.5;
    const ph = (t * 0.8) % 1; B.pulse.scale.setScalar(1 + ph * 1.4); B.pulse.material.opacity = 0.7 * (1 - ph);
    // poedersuiker dwarrelt uit de zeef op de pannenkoekentoren
    const sg7 = B.sugarStop?.g.userData.sugar;
    if (sg7 && B.sugarStop.g.visible) { const pa = sg7.geometry.attributes.position, sv = sg7.userData.speed;
      for (let i = 0; i < sv.length; i++) { let y = pa.array[i * 3 + 1] - sv[i] * dt; if (y < 8.6) y = 33.5; pa.array[i * 3 + 1] = y; }
      pa.needsUpdate = true; const sv2 = B.sugarStop.g.userData.sieve; sv2.rotation.z = Math.sin(t * 9) * 0.06; sv2.position.x = Math.sin(t * 9) * 0.5; }
    // pijltjes op de lijn
    const L = dyn.lineLen || 0, pts = dyn.linePts || [];
    let n = 0;
    if (L > 6 && pts.length > 1) {
      const gap = 11, off = (t * 9) % gap; let seg = 1, acc = 0;
      for (let s = off; s < L - 4 && n < 80; s += gap) {
        while (seg < pts.length - 1 && acc + dist(pts[seg - 1], pts[seg]) < s) { acc += dist(pts[seg - 1], pts[seg]); seg++; }
        const a = pts[seg - 1], b = pts[seg], sl = dist(a, b) || 1, u = clamp((s - acc) / sl, 0, 1);
        q4.setFromAxisAngle(v3.set(0, 1, 0), Math.atan2(b.x - a.x, b.z - a.z));
        B.arrows.setMatrixAt(n++, m4.compose(v3.set(a.x + (b.x - a.x) * u, H.pad + 3.4, a.z + (b.z - a.z) * u), q4, s3.set(1, 1, 1)));
      }
    }
    B.arrows.count = n; B.arrows.instanceMatrix.needsUpdate = true;
    // camera
    if (mode === 'kern') { controls.autoRotate = follow; controls.autoRotateSpeed = 0.35; }
    if (follow && t - lastFit > 1.5) { lastFit = t; fitCamera(); }
    if (dyn.camWant) { const w = dyn.camWant, k = 1 - Math.exp(-dt * 3); controls.target.x += (w.tx - controls.target.x) * k; controls.target.z += (w.tz - controls.target.z) * k;
      if (mode !== 'kern') { camera.position.x += (w.px - camera.position.x) * k; camera.position.y += (w.py - camera.position.y) * k; camera.position.z += (w.pz - camera.position.z) * k; } }
    controls.update();
    renderer.render(scene, camera);
    // labels
    const w = root.clientWidth, h = root.clientHeight;
    for (const l of labels) {
      l.anchor.getWorldPosition(tmp); tmp.project(camera);
      const vis = l.vis && tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      if (l.el.hidden === vis) l.el.hidden = !vis;
      if (vis) l.el.style.transform = `translate(${((tmp.x * 0.5 + 0.5) * w).toFixed(1)}px,${((-tmp.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%,-100%)`;
    }
  });

  /* ---------------------------------------------------------------- kaartdata en eerste opbouw */
  const status = (s, detail) => { osmSource = s; opts.onStatus?.(s, detail); };
  const got = await loadOsm(); osm = got.data; status(got.source);
  build();
  let liveTried = false, lastFetch = null;
  // Ophalen: eerst via de server (bewaart de kaart voor iedereen), anders rechtstreeks vanuit deze browser (alleen voor dit toestel).
  async function tryLive(force = false) {
    if (!force && (liveTried || osm || opts.live === false)) return lastFetch; liveTried = true;
    const prev = osmSource; status('ophalen');
    const details = [];
    try {
      const j = await fetchOsmServer(); cacheOsm(j.data); osm = j.data;
      lastFetch = { ok: true, source: 'server', saved: j.saved, src: j.src, counts: j.counts, details: j.skipped || [], saveError: j.saveError };
      if (!disposed) build(); status('server', lastFetch); return lastFetch;
    } catch (e) { details.push(e.message, ...(e.details || [])); console.warn('[board] board-osm', e); }
    try {
      const d = await fetchOsmLive(20000, n => status('ophalen', { trying: n })); cacheOsm(d); osm = d;
      lastFetch = { ok: true, source: 'live', saved: false, src: d.src, details };
      if (!disposed) build(); status('live', lastFetch); return lastFetch;
    } catch (e) { details.push(...(e.details || [e.message])); console.warn('[board] OSM', e); }
    lastFetch = { ok: false, details }; status(osm ? prev : 'geen', lastFetch); return lastFetch;
  }
  tryLive();

  return {
    el: root,
    update(o = {}) {
      last = { ...last, ...o };
      if (o.progress === undefined && 'stops' in o) delete last.progress;
      if (o.stops) { const np = makePath(o.stops); if (np.key !== path.key) { path = np; build(); return; } }
      applyDynamic();
      if (follow && mode === 'spel') fitCamera();
    },
    setMode(m) { if (m === mode) return; mode = m; follow = m !== 'regie'; controls.autoRotate = false; card.hidden = true; applyDynamic(true); fitCamera(); },
    recenter() { follow = true; card.hidden = true; fitCamera(); },
    info() { const D = dyn.D || {}; return { offBoard: !!D.offBoard, offRoute: D.offRoute != null ? Math.round(D.offRoute) : null, backMeters: dyn.linkLen || 0, mode, osm: osmSource, lineMeters: Math.round(dyn.lineLen || 0), minutes: dyn.minutes, dusk: dyn.dusk, reached: D.reached, targetSeq: D.targetSeq, finished: !!D.finished, cells: B?.cells.length || 0, buildings: B?.bInfo.length || 0 }; },
    osmData: () => osm,
    /** Kaart opnieuw ophalen (server, dan browser). Geeft { ok, source, saved, src, counts, details }. Het huidige bord blijft staan als het mislukt. */
    refetchOsm() { return tryLive(true); },
    destroy() { disposed = true; renderer.setAnimationLoop(null); ro.disconnect(); clearWorld(); controls.dispose(); renderer.dispose(); root.remove(); },
  };
}
