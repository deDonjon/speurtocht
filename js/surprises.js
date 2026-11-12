// surprises.js — de verrassingen van Mecha-Pof (claude/MECHA-POF-SPEL.md, events uit CONTRACTS §2):
//   thief.*        de Kruimelaar: een kruimelrobotje pikt een onderdeel, achtervolging op de kaart, de armen pakken het terug
//   storm.*        Kortsluiting: 30 s vonken wegtikken op elke telefoon, scores tellen op (storm.score {n})
//   fork.*         Dubbel signaal: twee kanten op, elke speurder stemt (fork.vote {player_id, choice})
//   finale.timer   Jetpack oververhit: aftelklok naar huis; thuis aankomen = gered; tijd om = noodkoeling (samen koel tikken)
//   pan            Poffertjespan (12 nov avond): schuifpuzzel in een poffertjespan, op elke telefoon dezelfde husseling. Geen eigen events:
//                  de regie zet game.surprise = { kind:'pan', started_at, data:{ seed, mode:'wissel'|'makkelijk'|'gewoon', image?, nums } } (patchGame) en haalt hem weer weg.
//                  image = Mecha-Pof (leeg) of een goedgekeurde tekening (ondertekende link uit de regie).
//   wish.used      Verjaardagswens: alleen de jarige, één keer (puzzel overslaan, gratis hint, een dansje of papa moet het doen)
// De regie (regie.html) stuurt de events; de telefoons tonen ze. De lopende verrassing staat ook in game.surprise,
// zodat een telefoon die net inlogt hem meteen ziet. Zinnen: monster-lines.js (kruimelaar, kortsluiting, dubbelSignaal,
// oververhit, wens) via lineText(); badges via sync.badge() → award_badge → badge.awarded.
// Toon: grappig, plagerig, lief, mechanisch. Nooit eng: de Kruimelaar is ondeugend, vonken zijn een spelletje, de jetpack
// die op nul staat is alleen maar een sissend grapje.
//
//   const surprises = createSurprises({ mon, state, sync, router, audio, buzz, toast, lineText, PARTS, TALENTS, hasRole, confetti, isBusy });
//   surprises.destroy()
//   badgeLabel('vonkenvanger') → 'Vonkenvanger'  (index.html gebruikt dit in de toast bij badge.awarded)
// Pure hulpjes (getest in test/node-chat5.mjs): tally(events, type, startedAt), roundSecondsLeft(startedAt, seconds, now).

export const BADGES = {
  kruimelaar:   { id: 'kruimelaar-vanger', label: 'Kruimelaar-vanger', icon: '🍪' },
  vonkenvanger: { id: 'vonkenvanger',      label: 'Vonkenvanger',      icon: '⚡' },
  jetpack:      { id: 'jetpack-redder',    label: 'Jetpack-redder',    icon: '🔥' },
  wens:         { id: 'wensvervuller',     label: 'Wensvervuller',     icon: '🎂' },
  pan:          { id: 'poffertjesbakker',  label: 'Poffertjesbakker',  icon: '🥞' },
};
export function badgeLabel(badge) { const b = Object.values(BADGES).find(x => x.id === badge); return b ? `${b.icon} ${b.label}` : String(badge || ''); }

/** Telt events van één type sinds startedAt. events = state.events (nieuwste eerst). fork.vote → { a, b, by:{playerId:choice} };
    storm.score → { total, by:{playerId:n} }. De laatste stem per speler telt. */
export function tally(events, type, startedAt) {
  const t0 = startedAt ? Date.parse(startedAt) : 0;
  const list = (events || []).filter(e => e.type === type && (!t0 || Date.parse(e.at) >= t0)).slice().reverse(); // oudste eerst
  if (type === 'fork.vote') {
    const by = {}; for (const e of list) { const id = e.payload?.player_id || e.player_id; if (id) by[id] = e.payload?.choice; }
    const a = Object.values(by).filter(c => c === 'a').length, b = Object.values(by).filter(c => c === 'b').length;
    return { a, b, by };
  }
  const by = {}; let total = 0;
  for (const e of list) { const n = +e.payload?.n || 0; total += n; const id = e.payload?.player_id || e.player_id || '?'; by[id] = (by[id] || 0) + n; }
  return { total, by };
}
export function roundSecondsLeft(startedAt, seconds, now = Date.now()) {
  const end = (startedAt ? Date.parse(startedAt) : now) + (seconds || 0) * 1000;
  return Math.max(0, Math.round((end - now) / 1000));
}
/** Poffertjespan: 3×3 puzzel in drie standen (zelfde seed = zelfde husseling op elke telefoon).
    panInit(seed, mode) → { tiles, empty, moves }
      'gewoon'    schuifpuzzel, 60 geldige zetten vanaf opgelost (altijd oplosbaar)
      'makkelijk' schuifpuzzel, 10 zetten geschud en minstens 6 zetten van de oplossing af
      'wissel'    negen poffertjes, geen leeg kuiltje (empty = -1): twee aantikken = omwisselen
    panMove(data, i) schuift, panSwap(data, a, b) wisselt; beide geven dezelfde data terug bij een ongeldige zet.
    panHint(data) → { tile, to } de volgende goede zet (schuiven: kortste oplossing; wisselen: eerste poffertje dat verkeerd ligt). */
const panAdj = (a, b) => Math.abs((a / 3 | 0) - (b / 3 | 0)) + Math.abs(a % 3 - b % 3) === 1;
function panRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const PAN_MODES = { wissel: 'Wisselen', makkelijk: 'Schuiven, makkelijk', gewoon: 'Schuiven, gewoon' };
export const panSolved = data => data.tiles.every((t, k) => t === k);
function panShuffle(r, n) {
  const tiles = [0, 1, 2, 3, 4, 5, 6, 7, 8]; let empty = 8, prev = -1;
  for (let k = 0; k < n; k++) {
    const cand = [empty - 3, empty + 3, empty - 1, empty + 1].filter(x => x >= 0 && x < 9 && x !== prev && panAdj(x, empty));
    const pick = cand[Math.floor(r() * cand.length)];
    [tiles[empty], tiles[pick]] = [tiles[pick], tiles[empty]]; prev = empty; empty = pick;
  }
  return { tiles, empty, moves: 0 };
}
// Kortste oplossing van een schuifstand (breedte-eerst): rij tegelnummers om te tikken; null als het boven `max` zetten zit.
export function panRoute(data, max = 40) {
  if (data.empty < 0) return null;
  if (panSolved(data)) return [];
  const key = t => t.join(''), seen = new Map([[key(data.tiles), null]]); let q = [{ t: data.tiles, e: data.empty }];
  for (let depth = 0; depth < max && q.length; depth++) {
    const nx = [];
    for (const d of q) for (const i of [d.e - 3, d.e + 3, d.e - 1, d.e + 1]) {
      if (i < 0 || i > 8 || !panAdj(i, d.e)) continue;
      const t = d.t.slice(), tile = t[i]; [t[i], t[d.e]] = [t[d.e], t[i]]; const k = key(t);
      if (seen.has(k)) continue; seen.set(k, { from: key(d.t), tile });
      if (t.every((x, j) => x === j)) { const path = []; for (let c = k; seen.get(c); c = seen.get(c).from) path.unshift(seen.get(c).tile); return path; }
      nx.push({ t, e: i });
    }
    q = nx;
  }
  return null;
}
export function panInit(seed = 1, mode = 'gewoon') {
  const r = panRng(+seed || 1);
  if (mode === 'wissel') {
    const tiles = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (let pass = 0; pass < 5; pass++) { // schudden tot er hooguit twee poffertjes toevallig al goed liggen
      for (let i = 8; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }
      if (tiles.filter((t, k) => t === k).length <= 2) break;
    }
    if (tiles.every((t, k) => t === k)) [tiles[0], tiles[8]] = [tiles[8], tiles[0]];
    return { tiles, empty: -1, moves: 0 };
  }
  if (mode === 'makkelijk') {
    let d = null;
    for (let pass = 0; pass < 20; pass++) { d = panShuffle(r, 10); const route = panRoute(d, 10); if (route && route.length >= 6) return d; }
    return d;
  }
  const d = panShuffle(r, 60);
  if (panSolved(d)) { [d.tiles[7], d.tiles[8]] = [d.tiles[8], d.tiles[7]]; d.empty = 7; }
  return d;
}
export function panMove(data, i) {
  i |= 0; if (data.empty < 0 || i < 0 || i > 8 || !panAdj(i, data.empty)) return data;
  const tiles = data.tiles.slice(); [tiles[i], tiles[data.empty]] = [tiles[data.empty], tiles[i]];
  return { tiles, empty: i, moves: data.moves + 1 };
}
export function panSwap(data, a, b) {
  a |= 0; b |= 0; if (data.empty >= 0 || a === b || a < 0 || b < 0 || a > 8 || b > 8) return data;
  const tiles = data.tiles.slice(); [tiles[a], tiles[b]] = [tiles[b], tiles[a]];
  return { tiles, empty: -1, moves: data.moves + 1 };
}
export function panHint(data) {
  if (panSolved(data)) return null;
  if (data.empty < 0) { const k = data.tiles.findIndex((t, i) => t !== i); return { tile: data.tiles[k], to: data.tiles[k] }; }
  const route = panRoute(data); return route?.length ? { tile: route[0], to: data.empty } : null;
}
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function haversine(a, b) { const R = 6371000, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); }
// zelfde regel als js/map.js: vanaf 16:30 (of ?avond=1) de donkere avondkaart; de Kruimelaar-kaart gebruikt de spelkaartstijl (.wmap)
const isAvond = () => { const q = new URLSearchParams(location.search).get('avond'); if (q != null) return q !== '0'; const d = new Date(); return d.getHours() + d.getMinutes() / 60 >= 16.5; };
const WISHES = { overslaan: 'puzzel overslaan', hint: 'gratis hint', dansje: 'dansje van Mecha-Pof', papa: 'papa moet het doen' };
const WISH_ICON = { overslaan: '⏭️', hint: '💡', dansje: '🕺', papa: '👨' };
const wishKind = f => /papa/i.test(f) ? 'papa' : /dans/i.test(f) ? 'dansje' : /hint/i.test(f) ? 'hint' : 'overslaan';
// De opdracht voor papa in beeld; dezelfde als de gesproken zin LINES.wens.papa (js/monster-lines.js).
const PAPA_OPDRACHT = 'Doe de robotdans en zeg erbij: “bliep, bloep, ik ben een pannenkoek”. Iedereen telt hardop tot tien!';

const CSS = `
#sp-banner{max-width:540px;margin:10px auto 0;padding:0 16px}
#sp-banner button{width:100%;min-height:52px;display:flex;align-items:center;gap:10px;text-align:left;padding:8px 14px;border-radius:14px;color:#EAF2FF;font-weight:800;
  background:linear-gradient(160deg,#2C2240,#1A1F2A);border:2px solid #F2BE62;box-shadow:0 3px 0 #10141C,0 0 18px rgba(242,190,98,.25)}
#sp-banner button .led{width:10px;height:10px;border-radius:50%;background:#F2BE62;box-shadow:0 0 8px #F2BE62;animation:sp-led 1s steps(1) infinite;flex:none}
#sp-banner button .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#sp-banner button .v{font-family:'Chakra Petch',ui-monospace,monospace;font-weight:700;color:#7FE8FF;font-variant-numeric:tabular-nums}
#sp-ov{position:fixed;inset:0;z-index:32;background:rgba(8,11,18,.9);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);display:flex;padding:calc(env(safe-area-inset-top,0px) + 118px) 14px max(16px,env(safe-area-inset-bottom,0px));overflow:auto} /* bovenin ruimte voor de tekstballon van Mecha-Pof */
#sp-ov .sp-page{margin:auto;width:100%;max-width:440px;display:flex;flex-direction:column;gap:12px;text-align:center;align-items:center}
#sp-ov h2{margin:0;font:400 1.9rem 'Lilita One',system-ui,sans-serif;color:#F2BE62;text-shadow:0 3px 0 #9A5419;text-wrap:balance}
#sp-ov .sp-eye{font:700 .78rem 'Chakra Petch',ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:#7FE8FF}
#sp-ov p{margin:0;color:#EAF2FF;font-weight:800}
#sp-ov .sp-note{color:#93A0B8;font-size:.9rem;font-weight:700}
#sp-ov .sp-big{font-family:'Chakra Petch',ui-monospace,monospace;font-weight:700;font-size:3.2rem;color:#7FE8FF;line-height:1;text-shadow:0 0 16px rgba(127,232,255,.55);font-variant-numeric:tabular-nums}
#sp-ov .sp-map{width:100%;height:min(40vh,300px)!important;border-radius:14px;overflow:hidden;border:2px solid #15A4C8;background:#0E1B2E;position:relative}
#sp-ov .sp-map:not(.wmap) .leaflet-tile-pane{filter:invert(.92) hue-rotate(185deg) saturate(.75) brightness(.95) contrast(.95)}
#sp-ov .sp-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;width:100%}
#sp-ov .sp-list li{background:#0E1B2E;border:2px solid #3C4A66;border-radius:12px;padding:8px 12px;display:flex;justify-content:space-between;gap:10px;color:#EAF2FF;font-weight:800}
#sp-ov .sp-list li.now{border-color:#F2BE62;box-shadow:0 0 14px rgba(242,190,98,.3)}
#sp-ov .sp-list li.done{opacity:.5}
.sp-thief{width:34px;height:34px;border-radius:50%;background:#2C2240;border:2px solid #F2BE62;display:grid;place-items:center;font-size:18px;box-shadow:0 0 12px rgba(242,190,98,.6)}
.sp-thief.old{opacity:.4;border-style:dashed;box-shadow:none}
.sp-thief.now{animation:sp-hop .9s ease-in-out infinite}
.sp-me{width:28px;height:28px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FCE3A6,#F2BE62 55%,#C9792C);border:3px solid #0E1B2E;display:grid;place-items:center;font-size:12px;box-shadow:0 0 0 2px #F2BE62}
/* kortsluiting en poffertjespan: geen tekstballon over het spel (de stem klinkt wel) */
body.sp-storm .pkmon-bubble,body.sp-storm .bubble{display:none!important}
#sp-ov .sp-arena{position:relative;width:100%;height:min(52vh,420px);border-radius:18px;background:radial-gradient(circle at 50% 40%,#1E3352,#0A1322 75%);border:2px solid #15A4C8;overflow:hidden;touch-action:manipulation}
#sp-ov .sp-arena .wire{position:absolute;left:-10%;right:-10%;height:3px;background:repeating-linear-gradient(90deg,#4E5D7E 0 18px,#2A3142 18px 26px);opacity:.7}
#sp-ov .sp-spark{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border:0;border-radius:50%;padding:0;background:radial-gradient(circle,#FFE98A 0%,#F59E2E 45%,rgba(245,158,46,0) 70%);color:#3A1C06;font-size:30px;line-height:1;
  box-shadow:0 0 18px rgba(255,233,138,.8);animation:sp-pop .25s ease-out,sp-flicker .35s steps(2) infinite;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#sp-ov .sp-spark.hit{animation:sp-hit .22s ease-out forwards;pointer-events:none}
#sp-ov .sp-score{display:flex;justify-content:space-between;width:100%;color:#EAF2FF;font-weight:900;font-size:1.1rem}
/* jetpack: noodkoeling */
#sp-ov .sp-big.sp-hot{color:#FF8A5C;text-shadow:0 0 18px rgba(255,120,70,.7)}
#sp-ov .sp-temp{width:100%;height:26px;border-radius:13px;background:#0E1B2E;border:2px solid #3C4A66;overflow:hidden}
#sp-ov .sp-temp i{display:block;height:100%;background:linear-gradient(90deg,#7FE8FF,#F2BE62 45%,#FF5A3C);transition:width .12s linear}
#sp-ov .sp-koel{width:100%;min-height:120px;border-radius:22px;border:3px solid #7FE8FF;background:linear-gradient(180deg,#1E6F8C,#12425A);color:#EAF8FF;font:400 2.2rem 'Lilita One',system-ui,sans-serif;box-shadow:0 6px 0 #0A1322,0 0 26px rgba(127,232,255,.45);touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
#sp-ov .sp-koel:active{transform:translateY(4px);box-shadow:0 2px 0 #0A1322}
/* dubbel signaal */
#sp-ov .sp-fork{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%}
#sp-ov .sp-fork button{min-height:96px;border-radius:16px;border:2px solid #4E5D7E;background:linear-gradient(180deg,#3A4356,#2A3142);color:#EAF2FF;font:800 1rem/1.25 Nunito,system-ui,sans-serif;padding:10px;box-shadow:0 4px 0 #10141C}
#sp-ov .sp-fork button b{display:block;font:400 1.6rem 'Lilita One',system-ui,sans-serif;color:#7FE8FF;margin-bottom:4px}
#sp-ov .sp-fork button.mine{border-color:#4ADE80;box-shadow:0 4px 0 #10141C,0 0 16px rgba(74,222,128,.35)}
#sp-ov .sp-fork button.won{border-color:#F2BE62;background:linear-gradient(180deg,#5A4A2C,#2A3142);box-shadow:0 4px 0 #10141C,0 0 22px rgba(242,190,98,.45)}
#sp-ov .sp-votes{display:flex;flex-direction:column;gap:6px;width:100%}
#sp-ov .sp-votes .row{display:flex;align-items:center;gap:8px;background:#0E1B2E;border:2px solid #3C4A66;border-radius:12px;padding:6px 10px;color:#EAF2FF;font-weight:800}
#sp-ov .sp-votes .row span{flex:1;text-align:left}
#sp-ov .sp-votes .row button{min-height:42px;min-width:56px;border-radius:10px;border:2px solid #4E5D7E;background:#1A1F2A;color:#EAF2FF;font-weight:900;padding:4px 10px;box-shadow:none}
#sp-ov .sp-votes .row button.on{border-color:#4ADE80;background:rgba(74,222,128,.15)}
#sp-ov .sp-close{background:transparent;border:0;color:#93A0B8;text-decoration:underline;font:800 .95rem Nunito,system-ui,sans-serif;min-height:44px;padding:8px 14px;box-shadow:none}
#sp-ov .sp-ok{min-height:56px;width:100%;border:0;border-radius:14px;color:#062814;font:900 1.05rem Nunito,system-ui,sans-serif;background:linear-gradient(180deg,#86F0AE 0%,#4ADE80 50%,#2FBF66 100%);box-shadow:0 4px 0 #1F8A4C}
#sp-ov .sp-hint{background:#0E1B2E;border:1px solid #3C4A66;border-left:4px solid #F2BE62;border-radius:12px;padding:12px 14px;font-weight:800;color:#EAF2FF;text-align:left;width:100%}
/* poffertjespan */
#sp-ov .sp-pan{position:relative;width:min(100%,340px);margin:0 auto 46px;padding:14px;border-radius:30px;background:radial-gradient(circle at 30% 20%,#4A4F5C,#23262E 55%,#111318);
  box-shadow:inset 0 2px 0 rgba(255,255,255,.14),inset 0 -6px 12px rgba(0,0,0,.6),0 8px 0 #0A0B0E,0 14px 28px rgba(0,0,0,.6)}
#sp-ov .sp-pan::after{content:'';position:absolute;left:50%;bottom:-44px;width:54px;height:50px;margin-left:-27px;border-radius:0 0 22px 22px;background:linear-gradient(90deg,#16181D,#3A3E49 45%,#16181D);box-shadow:0 6px 0 #0A0B0E;z-index:-1}
#sp-ov .sp-pan::before{content:'';position:absolute;left:50%;bottom:-34px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:#080B12;box-shadow:inset 0 2px 3px rgba(0,0,0,.8);z-index:1}
#sp-ov .sp-pan .grid{position:relative;width:100%;aspect-ratio:1}
#sp-ov .sp-pan .dimple{position:absolute;width:33.333%;height:33.333%;padding:5px;box-sizing:border-box}
#sp-ov .sp-pan .dimple i{display:block;width:100%;height:100%;border-radius:50%;background:radial-gradient(circle at 50% 62%,#2B2E37,#0B0C10 72%);box-shadow:inset 0 5px 9px rgba(0,0,0,.85),inset 0 -2px 2px rgba(255,255,255,.1),0 1px 0 rgba(255,255,255,.08)}
#sp-ov .sp-pan .pof{position:absolute;width:33.333%;height:33.333%;padding:7px;box-sizing:border-box;border:0;background:transparent;box-shadow:none;min-height:0;border-radius:50%;transition:left .16s ease-out,top .16s ease-out;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#sp-ov .sp-pan .pof b{position:relative;display:block;width:100%;height:100%;border-radius:50%;overflow:hidden;background:#FFF1D2;border:4px solid #D9963A;box-sizing:border-box;
  box-shadow:0 0 0 2px #9A5A1C,0 4px 0 #6B3B10,0 6px 8px rgba(0,0,0,.55),inset 0 0 10px rgba(154,90,28,.55)}
#sp-ov .sp-pan .pof img{position:absolute;width:300%;height:300%;max-width:none;object-fit:cover;pointer-events:none;-webkit-user-drag:none;user-select:none}
#sp-ov .sp-pan .pof b::after{content:'';position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 32% 24%,rgba(255,255,255,.38),rgba(255,255,255,0) 42%);pointer-events:none}
#sp-ov .sp-pan .pof em{position:absolute;left:3px;top:3px;min-width:22px;height:22px;border-radius:11px;background:#1A1F2A;color:#FFE3A3;font:700 .8rem/22px 'Chakra Petch',ui-monospace,monospace;font-style:normal;text-align:center;box-shadow:0 0 0 2px #D9963A;z-index:1}
#sp-ov .sp-pan .pof.can b{border-color:#FFD27A;box-shadow:0 0 0 2px #9A5A1C,0 4px 0 #6B3B10,0 0 14px rgba(255,210,122,.6),inset 0 0 10px rgba(154,90,28,.55)}
#sp-ov .sp-pan .pof.last{animation:sp-pop .4s ease-out}
#sp-ov .sp-pan .pof.ok b{border-color:#4ADE80;box-shadow:0 0 0 2px #1F8A4C,0 4px 0 #14532D,0 6px 8px rgba(0,0,0,.55),inset 0 0 10px rgba(154,90,28,.4)}
#sp-ov .sp-pan .pof.sel b{border-color:#7FE8FF;box-shadow:0 0 0 3px #15A4C8,0 4px 0 #0B5F75,0 0 18px rgba(127,232,255,.8)}
#sp-ov .sp-pan .pof.sel{transform:scale(1.06)}
#sp-ov .sp-pan .pof.hint b{border-color:#FFF;box-shadow:0 0 0 4px #F2BE62,0 0 24px #FFE98A;animation:sp-hintp .5s ease-in-out 6 alternate}
#sp-ov .sp-pan .dimple i{display:grid;place-items:center;color:rgba(255,227,163,.38);font:700 1.5rem 'Chakra Petch',ui-monospace,monospace;font-style:normal}
#sp-ov .sp-panhelp{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%}
#sp-ov .sp-panhelp figure{margin:0;display:flex;align-items:center;gap:8px;color:#93A0B8;font-weight:700;font-size:.85rem;text-align:left}
#sp-ov .sp-panhelp figure img{width:64px;height:64px;border-radius:10px;object-fit:cover;background:#F8DC9C;border:2px solid #D9963A}
#sp-ov .sp-panhelp button{min-height:48px;border-radius:12px;border:2px solid #F2BE62;background:linear-gradient(180deg,#3A4356,#2A3142);color:#FFE3A3;font:800 .95rem Nunito,system-ui,sans-serif;padding:6px 14px;box-shadow:0 3px 0 #10141C}
#sp-ov .sp-panhelp button[hidden]{display:none}
@keyframes sp-hintp{from{transform:scale(1)}to{transform:scale(1.08)}}
#sp-ov .sp-pan.done{box-shadow:inset 0 2px 0 rgba(255,255,255,.14),inset 0 -6px 12px rgba(0,0,0,.6),0 8px 0 #0A0B0E,0 0 34px rgba(242,190,98,.55)}
#sp-ov .sp-pan .sugar{position:absolute;inset:0;border-radius:30px;pointer-events:none;overflow:hidden}
#sp-ov .sp-pan .sugar i{position:absolute;top:-6%;width:5px;height:5px;border-radius:50%;background:#fff;opacity:.9;animation:sp-sugar 1.6s ease-in forwards}
@keyframes sp-sugar{to{transform:translateY(var(--y,200px));opacity:.8}}
/* verjaardagswens-knop (alleen de jarige) */
#sp-wish{position:fixed;left:max(14px,env(safe-area-inset-left,0px));bottom:calc(env(safe-area-inset-bottom,0px) + 16px);z-index:26;width:58px;height:58px;border-radius:50%;border:2px solid #F2BE62;padding:0;font-size:28px;
  background:radial-gradient(circle at 40% 35%,#5A4A2C,#2C2240);box-shadow:0 4px 0 #10141C,0 0 18px rgba(242,190,98,.4);animation:sp-hop 2.4s ease-in-out infinite}
#sp-wish-tip{position:fixed;left:calc(max(14px,env(safe-area-inset-left,0px)) + 70px);bottom:calc(env(safe-area-inset-bottom,0px) + 18px);z-index:26;max-width:min(calc(100vw - 100px),300px);
  background:linear-gradient(180deg,#FFE3A3,#F2BE62);color:#2A1A05;border:0;border-radius:14px;padding:10px 14px;text-align:left;font:800 .95rem/1.25 Nunito,system-ui,sans-serif;box-shadow:0 4px 0 #A9782A,0 6px 22px rgba(0,0,0,.45);animation:sp-pop .35s ease-out}
#sp-wish-tip::before{content:'';position:absolute;left:-8px;bottom:16px;border:8px solid transparent;border-left:0;border-right-color:#F6CB77}
#sp-wish-tip small{display:block;margin-top:4px;font-weight:700;color:#5A3D0E;font-size:.8rem}
#sp-ov .sp-wishes{display:flex;flex-direction:column;gap:10px;width:100%}
#sp-ov .sp-wishes button{min-height:64px;border-radius:14px;border:2px solid #4E5D7E;background:linear-gradient(180deg,#3A4356,#2A3142);color:#EAF2FF;font:800 1.05rem Nunito,system-ui,sans-serif;box-shadow:0 4px 0 #10141C}
@keyframes sp-led{0%,55%{opacity:1}56%,100%{opacity:.3}}
@keyframes sp-hop{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes sp-pop{0%{transform:scale(.2)}70%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes sp-flicker{0%{filter:brightness(1)}100%{filter:brightness(1.4)}}
@keyframes sp-hit{to{transform:scale(1.9);opacity:0}}
@media (prefers-reduced-motion:reduce){#sp-banner button .led,.sp-thief.now,#sp-wish,#sp-ov .sp-spark{animation:none}#sp-ov .sp-pan .pof{transition:none}#sp-ov .sp-pan .pof.hint b{animation:none}#sp-ov .sp-pan .sugar i{animation:none;transform:translateY(var(--y,200px))}}`;

export function createSurprises({ mon, state, sync, router, audio, buzz = () => {}, toast = () => {}, lineText, PARTS = {}, TALENTS = {}, hasRole = () => true, confetti = () => {}, isBusy = () => false, now = () => Date.now() } = {}) {
  if (!document.getElementById('sp-css')) { const s = document.createElement('style'); s.id = 'sp-css'; s.textContent = CSS; document.head.appendChild(s); }
  const offs = [], timers = new Set();
  let cur = null;      // { kind:'thief'|'storm'|'fork'|'finale', ... } de lopende verrassing op deze telefoon
  let ov = null;       // open overlay-element (of null)
  let modal = null;    // overlay die los van `cur` staat: 'wens' (wens gebruikt) of 'wenskeuze' (de jarige kiest)
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const S = () => state.get();
  const parts = () => S().game?.parts || [];
  const has = p => parts().includes(p);
  const me = () => state.me();

  // ---- zeggen en alarm slaan. Met de mond (luidspreker) slaat hij alarm en praat hij; zonder mond alleen een piep en de tekst in de ballon.
  function speak(sit, sub, { interrupt = false, delay = 0 } = {}) {
    const text = lineText?.(sit, { sub }); if (!text) return Promise.resolve(false);
    const go = () => mon?.say(text, interrupt ? {} : { auto: true, force: true }) ?? Promise.resolve(false);
    return delay ? new Promise(r => later(() => r(go()), delay)) : go();
  }
  function alarm() {
    if (has('mond')) { audio?.play('alarm'); buzz([120, 60, 120, 60, 200]); }
    else { audio?.play('kruimel'); buzz([80, 40, 80]); }
  }
  function award(badgeKey, playerIds) {
    const b = BADGES[badgeKey]; if (!b || !sync?.badge) return;
    for (const id of [...new Set(playerIds.filter(Boolean))]) sync.badge(id, b.id).catch(e => console.warn('[surprises] badge', e?.message || e));
  }
  const monteurOf = part => { const t = Object.keys(TALENTS).find(k => TALENTS[k].part === part); return t ? S().players.find(p => p.talent === t) || null : null; };

  // ---- banner (onder de balk) en overlay
  let banner = null;
  function showBanner(html) {
    if (!banner) { banner = document.createElement('div'); banner.id = 'sp-banner'; banner.innerHTML = '<button type="button"><span class="led"></span><span class="t"></span><span class="v"></span></button>'; banner.querySelector('button').onclick = () => openOverlay(); }
    const bar = document.getElementById('bar');
    if (!banner.isConnected) { if (bar) bar.insertAdjacentElement('afterend', banner); else document.body.prepend(banner); }
    banner.querySelector('.t').innerHTML = html.t; banner.querySelector('.v').textContent = html.v || '';
  }
  function hideBanner() { banner?.remove(); }
  function openOverlay(html) {
    if (!cur && !html) return;
    if (!ov) { ov = document.createElement('div'); ov.id = 'sp-ov'; ov.setAttribute('role', 'dialog'); document.body.appendChild(ov); ov.addEventListener('click', onOverlayClick); }
    ov.innerHTML = `<div class="sp-page">${html ?? renderCur()}</div>`;
    afterRender();
  }
  function closeOverlay() { if (ov) { ov.remove(); ov = null; } cur?.map?.remove?.(); if (cur) cur.map = null; }
  const stormBody = () => document.body.classList.toggle('sp-storm', cur?.kind === 'storm' || cur?.kind === 'pan'); // ook bij de poffertjespan: geen ballon over de pan
  function refresh() { stormBody(); if (!cur) { if (!modal) closeOverlay(); hideBanner(); return; } showBanner(bannerFor()); if (ov && !modal) { ov.querySelector('.sp-page').innerHTML = renderCur(); afterRender(); } }
  function end(ms = 0) { const c = cur; const fin = () => { if (cur === c) { cur = null; stormBody(); if (!modal) closeOverlay(); hideBanner(); } }; ms ? later(fin, ms) : fin(); }

  // ---------------------------------------------------------------- de Kruimelaar (thief)
  function thiefStart(p, startedAt) {
    const points = Array.isArray(p.points) ? p.points.filter(x => x && isFinite(x.lat) && isFinite(x.lng)) : [];
    cur = { kind: 'thief', part: p.part, points, i: 0, startedAt: startedAt || new Date(now()).toISOString(), map: null };
    alarm(); refresh(); openOverlay();
    speak('kruimelaar', 'start', { interrupt: true });
  }
  const thiefDist = () => { const pos = S().pos, pt = cur?.points?.[cur.i]; return pos && pt ? Math.round(haversine(pos, pt)) : null; };
  function thiefHtml() {
    const d = thiefDist(), n = cur.points.length, label = PARTS[cur.part]?.label || 'een onderdeel';
    return `<span class="sp-eye">🍪 Alarm · kruimelrobot</span><h2>De Kruimelaar!</h2>
      <p>Hij heeft <b>${esc(label)}</b> gepikt en rent ermee weg. Volg het kruimelspoor op de kaart${n ? `: hij zit nu bij punt <b>${cur.i + 1} van ${n}</b>` : ''}.</p>
      ${d != null ? `<div class="sp-big">${d}<small style="font-size:1.1rem;color:#93A0B8"> m</small></div>` : '<p class="sp-note">Nog geen GPS: kijk op de kaart waar hij zit.</p>'}
      ${typeof L !== 'undefined' && n ? `<div class="sp-map wmap${isAvond() ? ' avond' : ''}" id="sp-map"></div>` : ''}
      <ul class="sp-list">${cur.points.map((pt, i) => `<li class="${i === cur.i ? 'now' : i < cur.i ? 'done' : ''}"><span>${i === cur.i ? '🍪' : i < cur.i ? '✓' : '·'} Punt ${i + 1}</span><span>${S().pos ? Math.round(haversine(S().pos, pt)) + ' m' : ''}</span></li>`).join('')}</ul>
      <p class="sp-note">${has('armen') ? 'Loop ernaartoe en roep de begeleider. Met mijn spatel en garde pak ik het terug!' : 'Loop ernaartoe en roep de begeleider. Zonder armen kan ik niks vastpakken, maar ik heb een reservelaatje.'}</p>
      <button class="sp-close" data-a="close">Kaart dicht (de achtervolging gaat door)</button>`;
  }
  function thiefMap() {
    const host = ov?.querySelector('#sp-map'); if (!host || typeof L === 'undefined') return;
    cur.map?.remove?.();
    const map = L.map(host, { zoomControl: false, attributionControl: false }); cur.map = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    const pts = cur.points.map((pt, i) => { const m = L.marker([pt.lat, pt.lng], { interactive: false, icon: L.divIcon({ className: '', html: `<div class="sp-thief ${i === cur.i ? 'now' : i < cur.i ? 'old' : 'old'}">${i === cur.i ? '🍪' : '·'}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(map); return [pt.lat, pt.lng]; });
    L.polyline(cur.points.map(p => [p.lat, p.lng]), { color: '#F2BE62', weight: 3, dashArray: '2 8', interactive: false }).addTo(map);
    const pos = S().pos; if (pos) { L.marker([pos.lat, pos.lng], { interactive: false, icon: L.divIcon({ className: '', html: '<div class="sp-me">🤖</div>', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(map); pts.push([pos.lat, pos.lng]); }
    map.fitBounds(L.latLngBounds(pts).pad(.3), { maxZoom: 18 });
    requestAnimationFrame(() => map.invalidateSize());
  }
  function thiefJump(p) { if (cur?.kind !== 'thief') return; cur.i = Math.max(0, Math.min(cur.points.length - 1, +p.i || 0)); audio?.play('kruimel'); buzz([60, 40, 60]); refresh(); speak('kruimelaar', 'sprong'); }
  function thiefCaught() {
    if (cur?.kind !== 'thief') return;
    const armen = has('armen');
    audio?.play(armen ? 'badge' : 'brom'); buzz([80, 40, 160]); if (armen) confetti();
    openOverlay(`<span class="sp-eye">🍪 Kruimelaar</span><h2>${armen ? 'Gevangen!' : 'Hij is weg…'}</h2><p>${armen ? `Spatel erin, onderdeel eruit: <b>${esc(PARTS[cur.part]?.label || 'het onderdeel')}</b> is terug.` : 'Geeft niks: dat onderdeel ligt ook in mijn reservelaatje. Doorlopen!'}</p>`);
    if (armen) { const m = monteurOf('armen'); award('kruimelaar', m?.online ? [m.id] : me().map(p => p.id)); }
    speak('kruimelaar', armen ? 'gevangen' : 'weg', { interrupt: true });
    end(5000);
  }
  function thiefEnd() { if (cur?.kind !== 'thief') return; audio?.play('kruimel'); openOverlay(`<span class="sp-eye">🍪 Kruimelaar</span><h2>Ontsnapt</h2><p>Met zijn kruimelstaartje. Geen zorgen: reservelaatje.</p>`); speak('kruimelaar', 'weg'); end(4500); }

  // ---------------------------------------------------------------- Kortsluiting (storm)
  function stormStart(p, startedAt) {
    cur = { kind: 'storm', seconds: +p.seconds || 30, startedAt: startedAt || new Date(now()).toISOString(), taps: 0, sent: 0, sparks: 0, over: false, total: null, halfSaid: false, timer: 0 };
    if (roundSecondsLeft(cur.startedAt, cur.seconds, now()) <= 0) { cur = null; return; } // al voorbij (telefoon logde laat in)
    alarm(); refresh(); openOverlay();
    speak('kortsluiting', 'start', { interrupt: true });
    cur.timer = setInterval(stormTick, 250); timers.add(cur.timer);
    cur.sendTimer = setInterval(stormSend, 3000); timers.add(cur.sendTimer);
  }
  const stormLeft = () => roundSecondsLeft(cur.startedAt, cur.seconds, now());
  function stormHtml() {
    const left = stormLeft();
    return `<span class="sp-eye">⚡ Kortsluiting</span><h2>${cur.over ? 'Vonken gedoofd' : 'Tik de vonken weg!'}</h2>
      ${cur.over ? `<p>${cur.total != null ? `Samen <b>${cur.total}</b> vonken weggetikt.` : 'Mecha-Pof telt de vonken van alle telefoons…'}</p>` : `<div class="sp-big">${left}</div>`}
      <div class="sp-arena" id="sp-arena">${[18, 38, 58, 78].map(y => `<i class="wire" style="top:${y}%;transform:rotate(${(y % 7) - 3}deg)"></i>`).join('')}</div>
      <div class="sp-score"><span>Deze telefoon: <b id="sp-taps">${cur.taps}</b> ⚡</span><span>${cur.over ? '' : 'Allemaal tegelijk, op elke telefoon!'}</span></div>
      ${cur.over ? '<button class="sp-ok" data-a="close">Verder</button>' : ''}`;
  }
  function stormSpawn() {
    const arena = ov?.querySelector('#sp-arena'); if (!arena || cur.over) return;
    if (arena.querySelectorAll('.sp-spark:not(.hit)').length >= 5) return;
    const b = document.createElement('button'); b.className = 'sp-spark'; b.type = 'button'; b.textContent = '⚡'; b.setAttribute('aria-label', 'vonk');
    b.style.left = (10 + Math.random() * 80) + '%'; b.style.top = (12 + Math.random() * 76) + '%';
    const die = later(() => b.remove(), 1800 + Math.random() * 1200);
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); if (b.classList.contains('hit') || cur?.over) return;
      clearTimeout(die); b.classList.add('hit'); later(() => b.remove(), 240);
      cur.taps++; const el = ov?.querySelector('#sp-taps'); if (el) el.textContent = cur.taps;
      audio?.play('vonk'); buzz(20);
      if (!cur.halfSaid && cur.taps >= 8) { cur.halfSaid = true; speak('kortsluiting', 'tik'); }
    }, { passive: false });
    arena.appendChild(b);
  }
  function stormTick() {
    if (cur?.kind !== 'storm') return;
    const left = stormLeft();
    if (!cur.over) {
      if (ov) { const big = ov.querySelector('.sp-big'); if (big) big.textContent = left; if (Math.random() < 0.45) stormSpawn(); }
      showBanner(bannerFor());
      if (left <= 0) { cur.over = true; stormSend(); clearInterval(cur.sendTimer); refresh(); }
    }
  }
  function stormSend() { if (cur?.kind !== 'storm') return; const d = cur.taps - cur.sent; if (d > 0) { cur.sent = cur.taps; const id = me()[0]?.id; sync?.log?.('storm.score', { n: d, player_id: id }).catch?.(e => console.warn('[surprises] storm.score', e?.message || e)); } }
  function stormEnd(p) {
    if (cur?.kind !== 'storm') return;
    clearInterval(cur.timer); clearInterval(cur.sendTimer); stormSend();
    cur.over = true; cur.total = +p.total || 0; refresh(); openOverlay();
    audio?.play('ok'); buzz([60, 40, 60]);
    if (cur.taps >= 10) award('vonkenvanger', me().map(x => x.id));
    speak('kortsluiting', 'eind', { interrupt: true });
    end(7000);
  }

  // ---------------------------------------------------------------- Dubbel signaal (fork)
  function forkOpen(p, startedAt) {
    cur = { kind: 'fork', a: String(p.a || 'A'), b: String(p.b || 'B'), startedAt: startedAt || new Date(now()).toISOString(), result: null, mine: {} };
    alarm(); refresh(); openOverlay();
    speak('dubbelSignaal', 'start', { interrupt: true });
  }
  const forkTally = () => tally(S().events, 'fork.vote', cur.startedAt);
  function forkHtml() {
    const t = forkTally(), players = me(), r = cur.result;
    return `<span class="sp-eye">📡 Dubbel signaal</span><h2>${r ? 'Signaal gekozen!' : 'Welke kant op?'}</h2>
      <p>${r ? `Mecha-Pof kiest <b>${esc(r === 'a' ? cur.a : cur.b)}</b>.` : 'Mijn processor wil twee kanten op. Stem per speurder; de regie telt de stemmen.'}</p>
      <div class="sp-fork"><button type="button" data-c="a" class="${r === 'a' ? 'won' : ''} ${!r && players.some(x => t.by[x.id] === 'a') ? 'mine' : ''}"><b>A</b>${esc(cur.a)}<br><small>${t.a} stem${t.a === 1 ? '' : 'men'}</small></button>
        <button type="button" data-c="b" class="${r === 'b' ? 'won' : ''} ${!r && players.some(x => t.by[x.id] === 'b') ? 'mine' : ''}"><b>B</b>${esc(cur.b)}<br><small>${t.b} stem${t.b === 1 ? '' : 'men'}</small></button></div>
      ${!r && players.length > 1 ? `<div class="sp-votes">${players.map(x => `<div class="row"><span>${esc(x.name)}</span><button type="button" data-v="a" data-p="${x.id}" class="${t.by[x.id] === 'a' ? 'on' : ''}">A</button><button type="button" data-v="b" data-p="${x.id}" class="${t.by[x.id] === 'b' ? 'on' : ''}">B</button></div>`).join('')}</div>` : ''}
      ${r ? '<button class="sp-ok" data-a="close">Die kant op!</button>' : '<button class="sp-close" data-a="close">Later stemmen</button>'}`;
  }
  async function forkVote(playerId, choice) {
    if (cur?.kind !== 'fork' || cur.result) return;
    audio?.play('stem'); buzz(30);
    const pid = playerId || me()[0]?.id; if (!pid) return;
    try { await (sync?.logAs ? sync.logAs(pid, 'fork.vote', { player_id: pid, choice }) : sync?.log?.('fork.vote', { player_id: pid, choice })); }
    catch (e) { toast('⚠️ ' + (e?.message || e)); }
  }
  function forkResult(p) {
    if (cur?.kind !== 'fork') return;
    cur.result = p.choice === 'b' ? 'b' : 'a'; refresh(); openOverlay();
    audio?.play('ok'); buzz([60, 40, 60]);
    speak('dubbelSignaal', 'uitslag', { interrupt: true });
    end(6000);
  }

  // ---------------------------------------------------------------- Jetpack oververhit (finale.timer)
  // Loopt de klok af vóór ze thuis zijn, dan volgt de noodkoeling: op elke telefoon springt een thermometer open en tikken ze
  // de jetpack samen koel (KOEL_TIKS tikken per telefoon). Daarna: 'afgekoeld', rustig naar huis. Geen straf, wel een echt einde.
  const KOEL_TIKS = 20;
  let rescuedAt = null; // started_at van de timer die thuis al is afgerond
  // Dezelfde timer herkennen: het event (ev.at) en game.surprise.started_at kunnen een fractie verschillen, dus met speling vergelijken.
  const sameTimer = (a, b) => !!a && !!b && Math.abs(Date.parse(a) - Date.parse(b)) < 5000;
  const koelGet = () => { try { return localStorage.getItem('pkm2_koel'); } catch { return null; } };
  function timerStart(p, startedAt) {
    cur = { kind: 'finale', seconds: +p.seconds || 300, startedAt: startedAt || new Date(now()).toISOString(), warned: false, out: false, cooled: false, taps: 0, timer: 0 };
    if (sameTimer(koelGet(), cur.startedAt)) { cur.out = true; cur.warned = true; cur.cooled = true; cur.taps = KOEL_TIKS; } // deze telefoon had al gekoeld (herladen)
    const late = timerLeft() <= 0; // een telefoon die pas inlogt als de tijd al om is: geen alarm en geen startzin meer
    if (!late) alarm();
    refresh();
    if (!late) speak('oververhit', 'start', { interrupt: true });
    cur.timer = setInterval(timerTick, 500); timers.add(cur.timer);
    if (late) timerTick();
  }
  const timerLeft = () => roundSecondsLeft(cur.startedAt, cur.seconds, now());
  function timerTick() {
    if (cur?.kind !== 'finale') return;
    const left = timerLeft();
    showBanner(bannerFor());
    if (ov && !cur.out) { const big = ov.querySelector('.sp-big'); if (big) big.textContent = mmss(left); }
    if (left <= 10 && left > 0 && !cur.out && hasRole('radio')) { if (cur.lastTick !== left) { cur.lastTick = left; audio?.play('klok'); } }
    if (left <= 60 && left > 0 && !cur.warned) { cur.warned = true; speak('oververhit', 'bijna'); }
    if (left <= 0 && !cur.out) timerOut();
  }
  // De tijd is om: alarm, de thermometer springt open op elke telefoon.
  function timerOut() {
    cur.out = true; cur.warned = true;
    alarm(); audio?.play('val'); buzz([200, 100, 200, 100, 400]);
    speak('oververhit', 'op', { interrupt: true });
    modal = null; refresh(); openOverlay();
  }
  const koelTemp = () => Math.max(0, Math.round(100 * (1 - cur.taps / KOEL_TIKS)));
  function koelTap() {
    if (cur?.kind !== 'finale' || !cur.out || cur.cooled) return;
    cur.taps++; audio?.play('vonk'); buzz(20);
    if (cur.taps >= KOEL_TIKS) return koelDone();
    const t = koelTemp(), bar = ov?.querySelector('.sp-temp i'), num = ov?.querySelector('.sp-big');
    if (bar) bar.style.width = t + '%';
    if (num) num.textContent = t + '°';
  }
  function koelDone() {
    cur.cooled = true;
    try { localStorage.setItem('pkm2_koel', cur.startedAt); } catch {}
    confetti(); audio?.play('ok'); buzz([60, 40, 60, 40, 200]);
    speak('oververhit', 'afgekoeld', { interrupt: true });
    refresh(); openOverlay();
    const c = cur; later(() => { if (cur === c && !modal) { closeOverlay(); refresh(); } }, 7000);
  }
  function timerHtml() {
    const left = timerLeft();
    if (cur.out && cur.cooled) return `<span class="sp-eye">❄️ Jetpack</span><h2>Afgekoeld!</h2><div class="sp-big">0°</div>
      <p>Pfff, dat scheelde een aangebrande bodem. Nu rustig naar huis, daar wacht Mecha-Pof op zijn hoed.</p>
      <button class="sp-ok" data-a="close">Verder</button>`;
    if (cur.out) return `<span class="sp-eye">🔥 Jetpack op nul</span><h2>Noodkoeling!</h2>
      <div class="sp-big sp-hot">${koelTemp()}°</div>
      <div class="sp-temp"><i style="width:${koelTemp()}%"></i></div>
      <p>De jetpack sist! Sta even stil en tik hem samen koel.</p>
      <button class="sp-koel" type="button" data-a="koel">🌬️ KOEL!</button>
      <p class="sp-note">Op elke telefoon. Daarna rustig verder lopen, bij de begeleider blijven.</p>`;
    return `<span class="sp-eye">🔥 Jetpack</span><h2>Jetpack oververhit!</h2>
      <div class="sp-big">${mmss(left)}</div><p>Zo lang houdt de jetpack het nog. Snel (maar veilig!) naar huis.</p>
      <p class="sp-note">Rennen over de weg hoeft nooit. Bij de begeleider blijven.</p>
      <button class="sp-ok" data-a="close">Verder</button>`;
  }
  function timerRescued() {
    if (cur?.kind !== 'finale') return;
    rescuedAt = cur.startedAt;
    clearInterval(cur.timer); confetti(); audio?.play('badge'); buzz([60, 40, 60, 40, 200]);
    openOverlay(cur.out
      ? `<span class="sp-eye">❄️ Jetpack</span><h2>Thuis!</h2><p>De jetpack is afgekoeld en Mecha-Pof is weer thuis. Goed gekoeld, monteurs!</p>`
      : `<span class="sp-eye">🔥 Jetpack</span><h2>Gered!</h2><p>Thuis! De jetpack koelt af. Jullie hebben Mecha-Pof gered van een gesmolten bodem.</p>`);
    if (!cur.out) award('jetpack', me().map(x => x.id));
    speak('oververhit', cur.out ? 'thuis' : 'gered', { interrupt: true });
    end(6000);
  }

  // ---------------------------------------------------------------- Poffertjespan (pan): schuifpuzzel in de pan
  // Elke telefoon schuift zijn eigen pan (zelfde husseling); de stand blijft op het toestel bewaard tot de regie de pan weghaalt.
  const panKey = () => `pkm2_pan:${cur?.startedAt || '-'}`;
  // Mecha-Pof als plaatje: het stilstaande beeld uit monster.js, met de donkere achtergrond vervangen door poffertjesgoud.
  const panFallback = () => {
    try {
      const url = globalThis.pkm?.monsterUrl?.() || ''; const k = url.indexOf(',');
      if (!url.startsWith('data:image/svg+xml') || k < 0) return url;
      const svg = decodeURIComponent(url.slice(k + 1)).replace(/(<rect\b[^>]*\bfill=")[^"]+(")/, '$1#F8DC9C$2'); // de eerste rect is de achtergrond
      return url.slice(0, k + 1) + encodeURIComponent(svg);
    } catch { return ''; }
  };
  const PAN_HELP_MS = 60_000; // na een minuut mag Mecha-Pof helpen
  function panSave() { try { localStorage.setItem(panKey(), JSON.stringify({ tiles: cur.tiles, empty: cur.empty, moves: cur.moves, doneMs: cur.doneMs, hints: cur.hints })); } catch {} }
  function panStart(p, startedAt) {
    const mode = PAN_MODES[p.mode] ? p.mode : 'gewoon', d = panInit(+p.seed || 1, mode), easy = mode !== 'gewoon';
    cur = { kind: 'pan', mode, easy, startedAt: startedAt || new Date(now()).toISOString(), image: p.image || panFallback(), eigen: !!p.image, nums: easy || p.nums !== false || !p.image, ...d, doneMs: null, sel: -1, hints: 0, hintTile: -1, hintTile2: -1, timer: 0 };
    try { const o = JSON.parse(localStorage.getItem(panKey()) || 'null'); if (o && Array.isArray(o.tiles) && o.tiles.length === 9) Object.assign(cur, { tiles: o.tiles, empty: o.empty, moves: o.moves | 0, doneMs: o.doneMs ?? null, hints: o.hints | 0 }); } catch {}
    if (cur.eigen) { const c = cur, im = new Image(); im.onerror = () => { if (cur === c) { c.image = panFallback(); c.eigen = false; refresh(); } }; im.src = cur.image; } // link verlopen of geen bereik: dan Mecha-Pof zelf
    alarm(); refresh(); openOverlay();
    speak('pan', mode === 'wissel' ? 'startWissel' : 'start', { interrupt: true });
    cur.timer = setInterval(() => {
      if (cur?.kind !== 'pan') return;
      const el = ov?.querySelector('#sp-pan-t'); if (el) el.textContent = mmss(panSecs());
      const hb = ov?.querySelector('#sp-pan-help'); if (hb && hb.hidden && panHelpOpen()) hb.hidden = false;
    }, 1000); timers.add(cur.timer);
  }
  const panSecs = () => Math.max(0, Math.round(((cur.doneMs ?? now()) - Date.parse(cur.startedAt)) / 1000));
  const panHelpOpen = () => cur.doneMs == null && now() - Date.parse(cur.startedAt) >= PAN_HELP_MS;
  const panPos = i => `left:${(i % 3) * 33.333}%;top:${(i / 3 | 0) * 33.333}%`;
  function panClasses(t, i) { // class per poffertje: kan schuiven, ligt goed, gekozen (wisselen), hulp
    const done = cur.doneMs != null, wissel = cur.mode === 'wissel';
    return ['pof', !done && !wissel && panAdj(i, cur.empty) ? 'can' : '', !done && t === i ? 'ok' : '', !done && wissel && cur.sel === t ? 'sel' : '', !done && (cur.hintTile === t || cur.hintTile2 === t) ? 'hint' : ''].filter(Boolean).join(' ');
  }
  function panBoard() {
    const done = cur.doneMs != null, src = esc(cur.image), wissel = cur.mode === 'wissel';
    const pof = (t, i, extra = '') => `<button type="button" class="${panClasses(t, i)} ${extra}" data-pof="${t}" style="${panPos(i)}" aria-label="poffertje ${t + 1}">
      <b>${src ? `<img src="${src}" alt="" style="left:${-(t % 3) * 100}%;top:${-(t / 3 | 0) * 100}%">` : ''}</b>${cur.nums && !done ? `<em>${t + 1}</em>` : ''}</button>`;
    return `<div class="sp-pan ${done ? 'done' : ''}" id="sp-pan"><div class="grid">
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `<span class="dimple" data-dimple="${i}" style="${panPos(i)}"><i>${cur.easy && !wissel && i < 8 ? i + 1 : ''}</i></span>`).join('')}
      ${cur.tiles.map((t, i) => t === 8 && !wissel ? (done ? pof(8, i, 'last') : '') : pof(t, i)).join('')}</div>
      ${done ? `<div class="sugar">${Array.from({ length: 34 }, (_, k) => `<i style="left:${(k * 37) % 97 + 1}%;--y:${30 + (k * 53) % 300}px;animation-delay:${(k % 9) * 0.09}s;animation-duration:${1.1 + (k % 5) * 0.22}s"></i>`).join('')}</div>` : ''}</div>`;
  }
  function panHtml() {
    const done = cur.doneMs != null, wissel = cur.mode === 'wissel', wat = cur.eigen ? 'de tekening' : 'ik';
    const uitleg = wissel ? `Mijn poffertjes liggen door elkaar. Tik er twee aan en ze wisselen van kuiltje, tot ${wat} weer klopt.`
      : `Mijn poffertjes liggen door elkaar. Schuif ze terug tot ${wat} weer klopt. Tik een poffertje naast het lege kuiltje.`;
    const tip = wissel ? 'Groen randje = dit poffertje ligt goed.' : `${cur.easy ? 'Het cijfer in het kuiltje zegt welk poffertje daar hoort. ' : cur.nums ? 'De cijfers lopen van linksboven naar rechtsonder. ' : ''}Groen randje = ligt goed. Het lege kuiltje hoort rechtsonder.`;
    return `<span class="sp-eye">🥞 Poffertjespan</span><h2>${done ? 'De pan is weer goed!' : 'Wie heeft er geschud?!'}</h2>
      <p>${done ? `Klaar in <b>${cur.moves}</b> zetten en <b>${mmss(panSecs())}</b>${cur.hints ? ` (met ${cur.hints} keer hulp)` : ''}. Poedersuiker erover!` : uitleg}</p>
      ${panBoard()}
      <div class="sp-score"><span>Zetten: <b id="sp-pan-m">${cur.moves}</b></span><span>⏱ <b id="sp-pan-t">${mmss(panSecs())}</b></span></div>
      ${done ? '<button class="sp-ok" data-a="close">Smullen!</button>' : `<div class="sp-panhelp"><figure>${cur.image ? `<img src="${esc(cur.image)}" alt="">` : ''}<span>Zo moet<br>het worden</span></figure><button type="button" id="sp-pan-help" data-a="panhelp" ${panHelpOpen() ? '' : 'hidden'}>🤖 Mecha-Pof helpt</button></div>
        <p class="sp-note">${tip}</p><button class="sp-close" data-a="close">Even dicht (de pan blijft staan)</button>`}`;
  }
  function panPaint() { // alleen verplaatsen en kleuren (geen nieuwe opbouw): zo glijdt het poffertje naar zijn kuiltje
    ov?.querySelectorAll('#sp-pan .pof').forEach(b => { const t = +b.dataset.pof, k = cur.tiles.indexOf(t); b.style.left = (k % 3) * 33.333 + '%'; b.style.top = (k / 3 | 0) * 33.333 + '%'; b.className = panClasses(t, k); });
    const m = ov?.querySelector('#sp-pan-m'); if (m) m.textContent = cur.moves;
    showBanner(bannerFor());
  }
  function panTap(t) {
    if (cur?.kind !== 'pan' || cur.doneMs != null) return;
    const i = cur.tiles.indexOf(+t); let next = cur;
    if (cur.mode === 'wissel') {
      if (cur.sel < 0) { cur.sel = +t; audio?.play('plop'); buzz(10); panPaint(); return; } // eerste poffertje gekozen
      if (cur.sel === +t) { cur.sel = -1; panPaint(); return; }                                               // nog eens = loslaten
      next = panSwap(cur, cur.tiles.indexOf(cur.sel), i); cur.sel = -1;
    } else next = panMove(cur, i);
    if (next === cur) { buzz(10); return; }
    Object.assign(cur, next); cur.hintTile = cur.hintTile2 = -1; audio?.play('plop'); buzz(15);
    if (panSolved(cur)) {
      cur.doneMs = now(); panSave(); clearInterval(cur.timer);
      confetti(); audio?.play('badge'); buzz([60, 40, 60, 40, 200]);
      award('pan', me().map(x => x.id));
      refresh(); openOverlay(); speak('pan', 'klaar', { interrupt: true });
      return;
    }
    panSave(); panPaint();
  }
  function panHelp() { // laat de volgende goede zet oplichten
    if (cur?.kind !== 'pan' || cur.doneMs != null) return;
    const h = panHint(cur); if (!h) return;
    cur.hints++; cur.hintTile = h.tile; cur.hintTile2 = cur.mode === 'wissel' ? cur.tiles[h.to] : -1; // wisselen: ook het poffertje waarmee het moet ruilen
    cur.sel = -1; panSave(); audio?.play('hint'); buzz([30, 30, 30]); panPaint();
    const c = cur, tile = h.tile; later(() => { if (cur === c && c.hintTile === tile) { c.hintTile = c.hintTile2 = -1; panPaint(); } }, 4000);
  }
  function panEnd() { // de regie haalt de pan weg
    if (cur?.kind !== 'pan') return;
    clearInterval(cur.timer); try { localStorage.removeItem(panKey()); } catch {}
    if (cur.doneMs == null) { openOverlay(`<span class="sp-eye">🥞 Poffertjespan</span><h2>Pan van het vuur</h2><p>Laat maar liggen, ik eet ze ook door elkaar op. Verder met de klus!</p>`); speak('pan', 'eind'); end(4000); }
    else end();
  }

  // ---------------------------------------------------------------- Verjaardagswens (wish.used)
  async function wishUsed(p, ev) {
    const kind = wishKind(p.for || ''), jarige = S().players.find(x => x.is_birthday);
    const label = WISHES[kind];
    audio?.play('badge'); buzz([60, 40, 60, 40, 60]);
    modal = 'wens';
    const cfg = (() => { const st = state.activeStop(), pz = S().puzzle; return st?.puzzles?.[pz?.variant ?? 0] || st?.puzzles?.[0] || null; })();
    openOverlay(`<span class="sp-eye">🎂 Verjaardagswens</span><h2>${esc(jarige?.name || 'De jarige')} doet een wens!</h2>
      <p>Wens: <b>${esc(label)}</b>.</p>
      ${kind === 'hint' ? (cfg?.hint ? `<div class="sp-hint">💡 ${esc(cfg.hint)}</div>` : '<p class="sp-note">De begeleider fluistert de hint.</p>') : ''}
      ${kind === 'overslaan' ? '<p class="sp-note">De begeleider keurt deze stop goed; het deel komt vanzelf.</p>' : ''}
      ${kind === 'dansje' ? '<p class="sp-note">Spatel omhoog, garde rondjes. Doe maar mee!</p>' : ''}
      ${kind === 'papa' ? `<div class="sp-hint">👨 Opdracht voor papa: ${esc(PAPA_OPDRACHT)}</div>` : ''}
      <button class="sp-ok" data-a="close">Hoera!</button>`);
    // Zelf ingezet: haar telefoon geeft de badge. Namens haar via de regie (chat 7): de telefoon waar zij is ingelogd geeft hem.
    if (jarige && (ev?.actor === 'player' || !ev || (ev.actor === 'regie' && me().some(x => x.id === jarige.id)))) award('wens', [jarige.id]);
    await speak('wens', 'gebruikt', { interrupt: true });
    if (kind === 'dansje' || kind === 'papa') { confetti(); for (let k = 0; k < 4; k++) later(() => mon?.react?.('goed'), 400 + k * 900); }
    await speak('wens', kind, { interrupt: true });
    later(() => { if (modal === 'wens') { modal = null; closeOverlay(); refresh(); } }, kind === 'papa' ? 15000 : 2500); // papa: de opdracht blijft in beeld tot hij klaar is
  }
  // Knop voor de jarige: alleen op haar telefoon, zolang de wens nog niet gebruikt is, tijdens het spel.
  let wishBtn = null;
  function wishButton() {
    const g = S().game, jarige = me().find(x => x.is_birthday);
    const show = !!g && !!jarige && !g.wish_used && ['onderweg', 'puzzel', 'finale'].includes(g.phase);
    if (!show) { wishBtn?.remove(); wishBtn = null; hideTip(); return; }
    if (!wishBtn) { wishBtn = document.createElement('button'); wishBtn.id = 'sp-wish'; wishBtn.type = 'button'; wishBtn.textContent = '🎂'; wishBtn.setAttribute('aria-label', 'Verjaardagswens'); wishBtn.onclick = wishSheet; }
    if (!wishBtn.isConnected) document.body.appendChild(wishBtn);
  }
  // Herinneringen (12 nov): een gouden ballonnetje naast de 🎂-knop, alleen op de telefoon van de jarige en zolang de wens vrij is.
  // Drie momenten, elk één keer per spel: bij de start, als een puzzel al 4 minuten duurt, en bij de voorlaatste plek.
  const TIPS = {
    start: ['🎂 Cadeautje van Mecha-Pof: jij hebt één verjaardagswens!', 'Tik op de taart: puzzel overslaan, gratis hint, robotdans of een opdracht voor papa.'],
    vast: ['Zitten jullie vast? Je verjaardagswens kan helpen!', 'Tik op de taart: puzzel overslaan of een gratis hint. Of bewaar hem nog even.'],
    laatste: ['Nog maar twee plekken! Je verjaardagswens is nog niet gebruikt.', 'Bewaren mag, maar vergeet hem niet. Een robotdans of een opdracht voor papa kan altijd!'],
  };
  let tipEl = null, tipTimer = null, puzzelSince = null;
  const tipKey = k => `pkm2_wenstip:${S().game?.started_at || '-'}:${k}`;
  const tipDone = k => { try { return localStorage.getItem(tipKey(k)) === '1'; } catch { return false; } };
  const tipMark = k => { try { localStorage.setItem(tipKey(k), '1'); } catch {} };
  function hideTip() { clearTimeout(tipTimer); tipEl?.remove(); tipEl = null; }
  function showTip(k) {
    if (!wishBtn?.isConnected || tipDone(k) || tipEl) return false;
    if (ov || isBusy()) return false; // straks opnieuw proberen (zie tipTick)
    tipMark(k);
    tipEl = document.createElement('button'); tipEl.type = 'button'; tipEl.id = 'sp-wish-tip';
    tipEl.innerHTML = `${esc(TIPS[k][0])}<small>${esc(TIPS[k][1])}</small>`;
    tipEl.onclick = () => { hideTip(); wishSheet(); };
    document.body.appendChild(tipEl);
    audio?.play('plop'); buzz([40, 30, 40]);
    tipTimer = setTimeout(hideTip, 15000);
    return true;
  }
  function tipTick() {
    const g = S().game;
    if (!wishBtn?.isConnected || !g) { hideTip(); return; }
    const total = g.stop_order?.length || S().stops?.length || 0, i = g.active_index ?? 0;
    if (!tipDone('start')) { showTip('start'); return; }
    if (g.phase === 'puzzel') {
      const key = `${g.started_at}:${i}`;
      if (puzzelSince?.key !== key) puzzelSince = { key, t: now() };
      if (now() - puzzelSince.t > 4 * 60_000 && !tipDone('vast')) { showTip('vast'); return; }
    } else puzzelSince = null;
    if (total >= 3 && i >= total - 2 && ['onderweg', 'puzzel'].includes(g.phase) && !tipDone('laatste')) showTip('laatste');
  }
  const tipIv = setInterval(tipTick, 5000); timers.add(tipIv);

  function wishSheet() {
    const jarige = me().find(x => x.is_birthday); if (!jarige) return;
    hideTip(); modal = 'wenskeuze';
    openOverlay(`<span class="sp-eye">🎂 Verjaardagswens</span><h2>${esc(jarige.name)}, wat wens je?</h2>
      <p class="sp-note">Dit mag maar één keer. Kies goed!</p>
      <div class="sp-wishes">${Object.entries(WISHES).map(([k, l]) => `<button type="button" data-w="${k}">${WISH_ICON[k]} ${esc(l[0].toUpperCase() + l.slice(1))}</button>`).join('')}</div>
      <button class="sp-close" data-a="close">Toch nog even bewaren</button>`);
  }
  async function wishPick(kind) {
    if (!confirm(`Verjaardagswens inzetten voor "${WISHES[kind]}"? Dit kan maar één keer.`)) return;
    modal = null; closeOverlay(); refresh(); // eerst het keuzeblad weg: het wish.used-event opent zo de wens-overlay
    try { await sync.wish(WISHES[kind]); }
    catch (e) { toast('⚠️ ' + (e?.message || e)); }
  }

  // ---------------------------------------------------------------- gedeeld: banner, overlay-inhoud, klikken
  function bannerFor() {
    if (!cur) return { t: '' };
    switch (cur.kind) {
      case 'thief': { const d = thiefDist(); return { t: `🍪 De Kruimelaar heeft <b>${esc(PARTS[cur.part]?.label || 'een deel')}</b> · punt ${cur.i + 1}/${cur.points.length || '?'}`, v: d != null ? d + ' m' : '' }; }
      case 'storm': return { t: cur.over ? '⚡ Kortsluiting: telling…' : '⚡ Kortsluiting! Tik de vonken', v: cur.over ? '' : stormLeft() + 's' };
      case 'fork': { const t = forkTally(); return { t: `📡 Dubbel signaal · A ${t.a} · B ${t.b}`, v: cur.result ? (cur.result === 'a' ? 'A' : 'B') : 'stem!' }; }
      case 'pan': return { t: cur.doneMs != null ? '🥞 Poffertjespan: gelukt!' : `🥞 Poffertjes door elkaar · tik om te ${cur.mode === 'wissel' ? 'wisselen' : 'schuiven'}`, v: cur.doneMs != null ? '✓' : cur.moves + ' zetten' };
      case 'finale': return cur.cooled ? { t: '❄️ Jetpack afgekoeld · rustig naar huis', v: '✓' } : cur.out ? { t: '🔥 Jetpack sist! Tik om te koelen', v: koelTemp() + '°' } : { t: '🔥 Jetpack oververhit · snel naar huis', v: mmss(timerLeft()) };
      default: return { t: '' };
    }
  }
  function renderCur() {
    switch (cur?.kind) { case 'thief': return thiefHtml(); case 'storm': return stormHtml(); case 'fork': return forkHtml(); case 'finale': return timerHtml(); case 'pan': return panHtml(); default: return ''; }
  }
  function afterRender() { if (cur?.kind === 'thief') thiefMap(); if (cur?.kind === 'storm' && !cur.over) { for (let k = 0; k < 3; k++) later(stormSpawn, 200 + k * 350); } }
  function onOverlayClick(e) {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'close') { modal = null; closeOverlay(); refresh(); return; }
    if (a === 'koel') { koelTap(); return; }
    if (a === 'panhelp') { panHelp(); return; }
    const w = e.target.closest('[data-w]')?.dataset.w; if (w) { wishPick(w); return; }
    const pf = e.target.closest('[data-pof]'); if (pf) { panTap(pf.dataset.pof); return; }
    const v = e.target.closest('[data-v]'); if (v) { forkVote(v.dataset.p, v.dataset.v); return; }
    const c = e.target.closest('[data-c]')?.dataset.c; if (c && cur?.kind === 'fork' && !cur.result) { if (me().length <= 1) forkVote(me()[0]?.id, c); return; }
  }

  // ---------------------------------------------------------------- koppeling met het spel
  const startedAtOf = ev => ev?.at || S().game?.surprise?.started_at || null;
  offs.push(router.on('thief.start', (p, ev) => thiefStart(p, startedAtOf(ev))));
  offs.push(router.on('thief.jump', p => thiefJump(p)));
  offs.push(router.on('thief.caught', () => thiefCaught()));
  offs.push(router.on('thief.end', () => thiefEnd()));
  offs.push(router.on('storm.start', (p, ev) => stormStart(p, startedAtOf(ev))));
  offs.push(router.on('storm.end', p => stormEnd(p)));
  offs.push(router.on('fork.open', (p, ev) => forkOpen(p, startedAtOf(ev))));
  offs.push(router.on('fork.vote', () => { if (cur?.kind === 'fork') refresh(); }));
  offs.push(router.on('fork.result', p => forkResult(p)));
  offs.push(router.on('finale.timer', (p, ev) => timerStart(p, startedAtOf(ev))));
  offs.push(router.on('wish.used', (p, ev) => wishUsed(p, ev)));
  offs.push(router.on('stop.arrived', p => { if (cur?.kind === 'finale' && state.stop(p.stop_id)?.key === 'home') timerRescued(); }));
  // game.surprise: een telefoon die later inlogt ziet de lopende verrassing; de regie die hem uitzet (surprise:null) sluit hem stil.
  function syncGame(g) {
    wishButton();
    if (!g) return;
    const s = g.surprise;
    if (s && !cur) {
      const d = s.data || {};
      if (s.kind === 'thief') thiefStart(d, s.started_at);
      else if (s.kind === 'storm') stormStart(d, s.started_at);
      else if (s.kind === 'fork') forkOpen(d, s.started_at);
      else if (s.kind === 'finale') { if (!['finale', 'klaar'].includes(g.phase) && !sameTimer(rescuedAt, s.started_at)) timerStart(d, s.started_at); } // thuis is de klok klaar: niet opnieuw starten zolang de regie hem laat staan
      else if (s.kind === 'pan') panStart(d, s.started_at);
    } else if (!s && cur && ['thief', 'storm', 'fork', 'finale', 'pan'].includes(cur.kind)) {
      if (cur.kind === 'pan') { panEnd(); return; }
      if (cur.kind === 'finale' && ['finale', 'klaar'].includes(g.phase)) { timerRescued(); return; }
      if (cur.kind === 'storm' && !cur.over) return; // de regie zet de storm straks af met storm.end
      if (cur.ending) return;
      cur.ending = true; later(() => { if (cur?.ending) end(); }, 1500); // kort wachten: misschien komt het eind-event nog
    }
    if (cur?.kind === 'finale' && ['finale', 'klaar'].includes(g.phase)) timerRescued();
  }
  offs.push(state.on('game', syncGame));
  offs.push(state.on('players', () => wishButton()));
  offs.push(state.on('pos', () => { if (cur?.kind === 'thief') showBanner(bannerFor()); }));
  later(() => syncGame(S().game), 0);

  return {
    get current() { return cur ? { kind: cur.kind, ...(cur.kind === 'storm' ? { taps: cur.taps, over: cur.over } : {}), ...(cur.kind === 'thief' ? { i: cur.i, part: cur.part } : {}), ...(cur.kind === 'fork' ? { result: cur.result } : {}), ...(cur.kind === 'pan' ? { mode: cur.mode, tiles: cur.tiles.slice(), empty: cur.empty, moves: cur.moves, hints: cur.hints, done: cur.doneMs != null } : {}) } : null; },
    get overlayOpen() { return !!ov; },
    get modal() { return modal; },
    openOverlay: () => openOverlay(),
    badgeLabel,
    destroy() { offs.forEach(f => f?.()); timers.forEach(t => { clearTimeout(t); clearInterval(t); }); cur = null; stormBody(); closeOverlay(); hideBanner(); wishBtn?.remove(); hideTip(); },
  };
}
export default createSurprises;
