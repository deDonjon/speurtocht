// surprises.js — de verrassingen van Mecha-Pof (claude/MECHA-POF-SPEL.md, events uit CONTRACTS §2):
//   thief.*        de Kruimelaar: een kruimelrobotje pikt een onderdeel, achtervolging op de kaart, de armen pakken het terug
//   storm.*        Kortsluiting: 30 s vonken wegtikken op elke telefoon, scores tellen op (storm.score {n})
//   fork.*         Dubbel signaal: twee kanten op, elke speurder stemt (fork.vote {player_id, choice})
//   finale.timer   Jetpack oververhit: aftelklok naar huis; thuis aankomen = gered
//   wish.used      Verjaardagswens: alleen de jarige, één keer (puzzel overslaan, gratis hint of een dansje)
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
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function haversine(a, b) { const R = 6371000, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); }
const WISHES = { overslaan: 'puzzel overslaan', hint: 'gratis hint', dansje: 'dansje van Mecha-Pof' };
const wishKind = f => /dans/i.test(f) ? 'dansje' : /hint/i.test(f) ? 'hint' : 'overslaan';

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
#sp-ov .sp-map{width:100%;height:min(40vh,300px);border-radius:14px;overflow:hidden;border:2px solid #15A4C8;background:#0E1B2E;position:relative}
#sp-ov .sp-map .leaflet-tile-pane{filter:invert(.92) hue-rotate(185deg) saturate(.75) brightness(.95) contrast(.95)}
#sp-ov .sp-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;width:100%}
#sp-ov .sp-list li{background:#0E1B2E;border:2px solid #3C4A66;border-radius:12px;padding:8px 12px;display:flex;justify-content:space-between;gap:10px;color:#EAF2FF;font-weight:800}
#sp-ov .sp-list li.now{border-color:#F2BE62;box-shadow:0 0 14px rgba(242,190,98,.3)}
#sp-ov .sp-list li.done{opacity:.5}
.sp-thief{width:34px;height:34px;border-radius:50%;background:#2C2240;border:2px solid #F2BE62;display:grid;place-items:center;font-size:18px;box-shadow:0 0 12px rgba(242,190,98,.6)}
.sp-thief.old{opacity:.4;border-style:dashed;box-shadow:none}
.sp-thief.now{animation:sp-hop .9s ease-in-out infinite}
.sp-me{width:28px;height:28px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FCE3A6,#F2BE62 55%,#C9792C);border:3px solid #0E1B2E;display:grid;place-items:center;font-size:12px;box-shadow:0 0 0 2px #F2BE62}
/* kortsluiting */
#sp-ov .sp-arena{position:relative;width:100%;height:min(52vh,420px);border-radius:18px;background:radial-gradient(circle at 50% 40%,#1E3352,#0A1322 75%);border:2px solid #15A4C8;overflow:hidden;touch-action:manipulation}
#sp-ov .sp-arena .wire{position:absolute;left:-10%;right:-10%;height:3px;background:repeating-linear-gradient(90deg,#4E5D7E 0 18px,#2A3142 18px 26px);opacity:.7}
#sp-ov .sp-spark{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border:0;border-radius:50%;padding:0;background:radial-gradient(circle,#FFE98A 0%,#F59E2E 45%,rgba(245,158,46,0) 70%);color:#3A1C06;font-size:30px;line-height:1;
  box-shadow:0 0 18px rgba(255,233,138,.8);animation:sp-pop .25s ease-out,sp-flicker .35s steps(2) infinite;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#sp-ov .sp-spark.hit{animation:sp-hit .22s ease-out forwards;pointer-events:none}
#sp-ov .sp-score{display:flex;justify-content:space-between;width:100%;color:#EAF2FF;font-weight:900;font-size:1.1rem}
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
/* verjaardagswens-knop (alleen de jarige) */
#sp-wish{position:fixed;left:max(14px,env(safe-area-inset-left,0px));bottom:calc(env(safe-area-inset-bottom,0px) + 16px);z-index:26;width:58px;height:58px;border-radius:50%;border:2px solid #F2BE62;padding:0;font-size:28px;
  background:radial-gradient(circle at 40% 35%,#5A4A2C,#2C2240);box-shadow:0 4px 0 #10141C,0 0 18px rgba(242,190,98,.4);animation:sp-hop 2.4s ease-in-out infinite}
#sp-ov .sp-wishes{display:flex;flex-direction:column;gap:10px;width:100%}
#sp-ov .sp-wishes button{min-height:64px;border-radius:14px;border:2px solid #4E5D7E;background:linear-gradient(180deg,#3A4356,#2A3142);color:#EAF2FF;font:800 1.05rem Nunito,system-ui,sans-serif;box-shadow:0 4px 0 #10141C}
@keyframes sp-led{0%,55%{opacity:1}56%,100%{opacity:.3}}
@keyframes sp-hop{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes sp-pop{0%{transform:scale(.2)}70%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes sp-flicker{0%{filter:brightness(1)}100%{filter:brightness(1.4)}}
@keyframes sp-hit{to{transform:scale(1.9);opacity:0}}
@media (prefers-reduced-motion:reduce){#sp-banner button .led,.sp-thief.now,#sp-wish,#sp-ov .sp-spark{animation:none}}`;

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
  function refresh() { if (!cur) { if (!modal) closeOverlay(); hideBanner(); return; } showBanner(bannerFor()); if (ov && !modal) { ov.querySelector('.sp-page').innerHTML = renderCur(); afterRender(); } }
  function end(ms = 0) { const c = cur; const fin = () => { if (cur === c) { cur = null; if (!modal) closeOverlay(); hideBanner(); } }; ms ? later(fin, ms) : fin(); }

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
      ${typeof L !== 'undefined' && n ? '<div class="sp-map" id="sp-map"></div>' : ''}
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
  function timerStart(p, startedAt) {
    cur = { kind: 'finale', seconds: +p.seconds || 300, startedAt: startedAt || new Date(now()).toISOString(), warned: false, out: false, timer: 0 };
    alarm(); refresh();
    speak('oververhit', 'start', { interrupt: true });
    cur.timer = setInterval(timerTick, 500); timers.add(cur.timer);
  }
  const timerLeft = () => roundSecondsLeft(cur.startedAt, cur.seconds, now());
  function timerTick() {
    if (cur?.kind !== 'finale') return;
    const left = timerLeft();
    showBanner(bannerFor());
    if (ov) { const big = ov.querySelector('.sp-big'); if (big) big.textContent = mmss(left); }
    if (left <= 10 && left > 0 && !cur.out && hasRole('radio')) { if (cur.lastTick !== left) { cur.lastTick = left; audio?.play('klok'); } }
    if (left <= 60 && !cur.warned) { cur.warned = true; speak('oververhit', 'bijna'); }
    if (left <= 0 && !cur.out) { cur.out = true; audio?.play('val'); buzz([200, 100, 200]); speak('oververhit', 'op', { interrupt: true }); refresh(); }
  }
  function timerHtml() {
    const left = timerLeft();
    return `<span class="sp-eye">🔥 Jetpack</span><h2>${cur.out ? 'Pssst… de jetpack sist' : 'Jetpack oververhit!'}</h2>
      ${cur.out ? '<p>Geen zorgen, hij koelt wel weer af. Stevig doorlopen naar huis, niet rennen.</p>' : `<div class="sp-big">${mmss(left)}</div><p>Zo lang houdt de jetpack het nog. Snel (maar veilig!) naar huis.</p>`}
      <p class="sp-note">Rennen over de weg hoeft nooit. Bij de begeleider blijven.</p>
      <button class="sp-ok" data-a="close">Verder</button>`;
  }
  function timerRescued() {
    if (cur?.kind !== 'finale') return;
    clearInterval(cur.timer); confetti(); audio?.play('badge'); buzz([60, 40, 60, 40, 200]);
    openOverlay(`<span class="sp-eye">🔥 Jetpack</span><h2>Gered!</h2><p>Thuis! De jetpack koelt af. Jullie hebben Mecha-Pof gered van een gesmolten bodem.</p>`);
    if (!cur.out) award('jetpack', me().map(x => x.id));
    speak('oververhit', 'gered', { interrupt: true });
    end(6000);
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
      <button class="sp-ok" data-a="close">Hoera!</button>`);
    // Zelf ingezet: haar telefoon geeft de badge. Namens haar via de regie (chat 7): de telefoon waar zij is ingelogd geeft hem.
    if (jarige && (ev?.actor === 'player' || !ev || (ev.actor === 'regie' && me().some(x => x.id === jarige.id)))) award('wens', [jarige.id]);
    await speak('wens', 'gebruikt', { interrupt: true });
    if (kind === 'dansje') { confetti(); for (let k = 0; k < 4; k++) later(() => mon?.react?.('goed'), 400 + k * 900); }
    await speak('wens', kind, { interrupt: true });
    later(() => { if (modal === 'wens') { modal = null; closeOverlay(); refresh(); } }, 2500);
  }
  // Knop voor de jarige: alleen op haar telefoon, zolang de wens nog niet gebruikt is, tijdens het spel.
  let wishBtn = null;
  function wishButton() {
    const g = S().game, jarige = me().find(x => x.is_birthday);
    const show = !!g && !!jarige && !g.wish_used && ['onderweg', 'puzzel', 'finale'].includes(g.phase);
    if (!show) { wishBtn?.remove(); wishBtn = null; return; }
    if (!wishBtn) { wishBtn = document.createElement('button'); wishBtn.id = 'sp-wish'; wishBtn.type = 'button'; wishBtn.textContent = '🎂'; wishBtn.setAttribute('aria-label', 'Verjaardagswens'); wishBtn.onclick = wishSheet; }
    if (!wishBtn.isConnected) document.body.appendChild(wishBtn);
  }
  function wishSheet() {
    const jarige = me().find(x => x.is_birthday); if (!jarige) return;
    modal = 'wenskeuze';
    openOverlay(`<span class="sp-eye">🎂 Verjaardagswens</span><h2>${esc(jarige.name)}, wat wens je?</h2>
      <p class="sp-note">Dit mag maar één keer. Kies goed!</p>
      <div class="sp-wishes">${Object.entries(WISHES).map(([k, l]) => `<button type="button" data-w="${k}">${{ overslaan: '⏭️', hint: '💡', dansje: '🕺' }[k]} ${esc(l[0].toUpperCase() + l.slice(1))}</button>`).join('')}</div>
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
      case 'finale': return { t: cur.out ? '🔥 Jetpack sist… rustig naar huis' : '🔥 Jetpack oververhit · snel naar huis', v: cur.out ? '' : mmss(timerLeft()) };
      default: return { t: '' };
    }
  }
  function renderCur() {
    switch (cur?.kind) { case 'thief': return thiefHtml(); case 'storm': return stormHtml(); case 'fork': return forkHtml(); case 'finale': return timerHtml(); default: return ''; }
  }
  function afterRender() { if (cur?.kind === 'thief') thiefMap(); if (cur?.kind === 'storm' && !cur.over) { for (let k = 0; k < 3; k++) later(stormSpawn, 200 + k * 350); } }
  function onOverlayClick(e) {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'close') { modal = null; closeOverlay(); refresh(); return; }
    const w = e.target.closest('[data-w]')?.dataset.w; if (w) { wishPick(w); return; }
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
      else if (s.kind === 'finale') timerStart(d, s.started_at);
    } else if (!s && cur && ['thief', 'storm', 'fork', 'finale'].includes(cur.kind)) {
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
    get current() { return cur ? { kind: cur.kind, ...(cur.kind === 'storm' ? { taps: cur.taps, over: cur.over } : {}), ...(cur.kind === 'thief' ? { i: cur.i, part: cur.part } : {}), ...(cur.kind === 'fork' ? { result: cur.result } : {}) } : null; },
    get overlayOpen() { return !!ov; },
    get modal() { return modal; },
    openOverlay: () => openOverlay(),
    badgeLabel,
    destroy() { offs.forEach(f => f?.()); timers.forEach(t => { clearTimeout(t); clearInterval(t); }); cur = null; closeOverlay(); hideBanner(); wishBtn?.remove(); },
  };
}
export default createSurprises;
