// regie.js — het regiescherm van de begeleider (regie.html). Chat 4.
// Leest live mee via state.js/sync.js (Realtime) en bestuurt het spel met sync.regie.* (CONTRACTS.md §4).
// Geheimen (codes, missies, stop-geheimen) komen uit regie_state en staan alleen in `R`.
import { state, PARTS, TALENTS } from './state.js';
import { sync, IS_TEST } from './sync.js';
import { LINES } from './monster-lines.js?v=12'; // wekzin (chat 7)
import * as tk from './tekening.js?v=1'; // tab 📸 Tekeningen (12 nov)

/* ================================================================ hulpjes */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };
const S = () => state.get();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
const ago = iso => { if (!iso) return 'nooit'; const s = Math.round((Date.now() - Date.parse(iso)) / 1000); return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} u`; };
function haversine(a, b) { const R = 6371000, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); }
function toast(text, ms = 3200, bad = false) { const d = document.createElement('div'); d.textContent = text; if (bad) d.className = 'bad'; $('#toast').appendChild(d); setTimeout(() => d.remove(), ms); }
// Voert een regie-actie uit, meldt het resultaat en haalt daarna de volledige stand op. Geeft true bij succes, false bij een fout (geen throw).
const busy = async (fn, ok) => { try { await fn(); if (ok) toast(ok); schedule(loadRegie); return true; } catch (e) { toast('⚠️ ' + (e.message || e), 5000, true); return false; } };
let actx = null;
function beep(notes = [880, 1175]) {
  if (!sound) return;
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    notes.forEach((f, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'triangle'; o.frequency.value = f;
      const t = actx.currentTime + i * .12; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.2, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .3);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + .32); }); } catch {}
}

/* ================================================================ toestand van het scherm */
const KEY_REMEMBER = 'pkm2_regie_remember' + (IS_TEST ? '_test' : ''), KEY_TAB = 'pkm2_regie_tab', KEY_SOUND = 'pkm2_regie_sound', KEY_FOLLOW = 'pkm2_regie_follow';
let R = { game: null, players: [], stops: [], puzzle_states: [], events: [] }; // regie_state, met geheimen
let loggedIn = false, booted = false, bootError = '';
let tab = store.get(KEY_TAB, 'spel');
let sound = store.get(KEY_SOUND, true);
let follow = store.get(KEY_FOLLOW, true);
const ui = { say: '', mood: '', hint: '', drops: 10, forkA: '', forkB: '', storm: 30, timerMin: 5, call: '', callText: '', wish: 'puzzel overslaan', planb: '', thiefPart: '', logFilter: '' }; // ingetypte waarden overleven een re-render
let pendingPanel = false;

const SURPRISE_TYPES = ['thief.start', 'thief.jump', 'thief.caught', 'thief.end', 'storm.start', 'storm.score', 'storm.end', 'fork.open', 'fork.vote', 'fork.result', 'finale.timer', 'wish.used'];
const PHASES = { lobby: 'Lobby', onderweg: 'Onderweg', puzzel: 'Puzzel', finale: 'Finale', klaar: 'Klaar' };
const EV_LABEL = {
  'game.start': 'Spel gestart', 'game.reset': 'Spel teruggezet', 'stop.arrived': 'Aangekomen', 'stop.solved': 'Puzzel opgelost', 'stop.approve': 'Stop goedgekeurd (regie)', 'photo.approve': 'Foto goedgekeurd',
  'hint.given': 'Hint', 'badge.awarded': 'Badge', 'energy': 'Energie', 'monster.say': 'Mecha-Pof zegt', 'monster.call': 'Mecha-Pof belt', 'roles.shuffle': 'Talenten geschud', 'plan_b': 'Plan B', 'gps.skip': 'GPS overgeslagen',
  'thief.start': 'Kruimelaar komt!', 'thief.jump': 'Kruimelaar springt', 'thief.caught': 'Kruimelaar gevangen', 'thief.end': 'Kruimelaar weg', 'storm.start': 'Kortsluiting!', 'storm.score': 'Vonken getikt', 'storm.end': 'Kortsluiting voorbij',
  'fork.open': 'Dubbel signaal', 'fork.vote': 'Stem', 'fork.result': 'Signaal gekozen', 'finale.timer': 'Jetpack oververhit (timer)', 'wish.used': 'Verjaardagswens',
};
const PUZZLE_TYPES = ['vraag', 'code', 'keuze', 'opdracht', 'memory', 'schuif', 'splits', 'slot', 'sync', 'licht', 'formatie', 'qr'];
const QUICK_SAYS = [
  'Bzzzt! Mijn sensoren zien jullie. Doorlopen, speurders!',
  'Piep piep. Blijf bij de begeleider, mijn processor wordt zenuwachtig.',
  'Stroopmeter in het rood. Snel, ik heb honger!',
  'Goed bezig! Zeg het niet tegen de andere keukenrobots.',
  'Kijk uit bij het oversteken. Anders kortsluiting bij mij.',
  'Over tien minuten moeten we thuis zijn. Jetpack op volle kracht!',
];

/* ---------- samengevoegde gegevens: live (state) + geheimen (R) */
const game = () => S().game || R.game;
const players = () => { const sec = Object.fromEntries(R.players.map(p => [p.id, p])); return S().players.map(p => ({ ...sec[p.id], ...p, code: sec[p.id]?.code, mission: sec[p.id]?.mission, mission_done: sec[p.id]?.mission_done })); };
const stops = () => { const sec = Object.fromEntries(R.stops.map(s => [s.id, s])); return S().stops.map(s => ({ ...s, geheim: sec[s.id]?.geheim || {} })); };
const route = () => { const by = Object.fromEntries(stops().map(s => [s.id, s])); return (game()?.stop_order || []).map(id => by[id]).filter(Boolean); };
const activeStop = () => { const g = game(); return g ? stops().find(s => s.id === g.stop_order?.[g.active_index]) || null : null; };
function events() { const all = new Map(); for (const e of [...R.events, ...S().events]) all.set(e.id, e); return [...all.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)); }
function devices() { // telefoons: spelers gegroepeerd per device_id
  const m = new Map();
  for (const p of players()) { if (!p.device_id) continue; const d = m.get(p.device_id) || { id: p.device_id, players: [], online: false, lat: null, lng: null, acc: null, battery: null, last: null };
    d.players.push(p); d.online ||= p.online; if (p.lat != null && (!d.last || Date.parse(p.last_seen_at || 0) > Date.parse(d.last))) { d.lat = p.lat; d.lng = p.lng; d.acc = p.acc; d.battery = p.battery; d.last = p.last_seen_at; }
    m.set(p.device_id, d); }
  return [...m.values()].sort((a, b) => a.id < b.id ? -1 : 1);
}
const playerName = id => players().find(p => p.id === id)?.name || (id ? id.slice(0, 6) : '');
const partOf = p => p?.part || TALENTS[p?.talent]?.part || null; // zelfde regel als guard() in index.html: geen deel → het deel van het talent
const colorOf = p => p?.color || PARTS[partOf(p)]?.color || '#5B6680';
const stopName = id => stops().find(s => s.id === id)?.name || '';
const stopIndex = st => { const r = route(); const i = r.findIndex(x => x.id === st.id); return i >= 0 ? i : null; };
const stopLabel = st => st.key === 'home' ? '🏠' : st.key === 'start' ? 'S' : (stopIndex(st) != null ? String(stopIndex(st) + 1) : String(st.seq));
const activePuzzle = () => { const st = activeStop(); const live = S().puzzle; if (live && live.stop_id === st?.id) return live; return R.puzzle_states.find(p => p.stop_id === st?.id) || null; };
function sinceEvent(type) { return events().find(e => e.type === type); }
function eventsAfter(type, since) { const t = since ? Date.parse(since) : 0; return events().filter(e => e.type === type && Date.parse(e.at) >= t); }

/* ================================================================ laden */
let regieTimer = null;
async function loadRegie() {
  if (!loggedIn) return;
  try { const r = await sync.regie.state(); R = { game: r.game, players: r.players || [], stops: r.stops || [], puzzle_states: r.puzzle_states || [], events: r.events || [], teaser_visits: r.teaser_visits || [] }; render(); }
  catch (e) { if (/sleutel|regie/i.test(e.message)) { logout(); toast('Regiesleutel afgewezen. Log opnieuw in.', 5000, true); } else console.warn('[regie] state', e.message); }
}
let schedTimer = null;
function schedule(fn, ms = 400) { clearTimeout(schedTimer); schedTimer = setTimeout(fn, ms); }
async function login(key, remember) {
  await sync.regie.login(key);
  if (remember) store.set(KEY_REMEMBER, key); else store.del(KEY_REMEMBER);
  loggedIn = true; await loadRegie();
  clearInterval(regieTimer); regieTimer = setInterval(loadRegie, 60_000);
  tekeningAan();
}
function tekeningAan() { tk.init({ onChange: () => renderPanel(), toast, players }); }
function logout() { loggedIn = false; sync.regie.logout(); store.del(KEY_REMEMBER); clearInterval(regieTimer); R = { game: null, players: [], stops: [], puzzle_states: [], events: [] }; render(); }

/* ================================================================ kaart (eigen Leaflet-kaart: alle stops, de route, de telefoons, de Kruimelaar) */
const hasL = typeof L !== 'undefined';
const mapEl = document.createElement('div'); mapEl.className = 'rmap';
let map = null, mk = { stops: new Map(), devs: new Map(), accs: new Map(), route: null, thief: new Map() }, fittedKey = null;
const icon = (html, w, h = w, cls = '') => L.divIcon({ className: cls, html, iconSize: [w, h], iconAnchor: [w / 2, h / 2] });
function ensureMap() {
  if (!hasL) return null;
  if (!map) {
    map = L.map(mapEl, { zoomControl: false, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
    map.setView([51.6168, 5.5622], 16);
    map.on('dragstart zoomstart', () => { if (follow && !map._progFit) { follow = false; store.set(KEY_FOLLOW, false); renderMapBtns(); } });
  }
  return map;
}
function updateMap() {
  const m = ensureMap(); if (!m) return;
  const g = game(), all = stops(), r = route(), act = activeStop(), seen = new Set();
  // stops
  for (const st of all) {
    seen.add(st.id);
    const i = stopIndex(st), done = g && i != null && i < g.active_index && g.phase !== 'lobby';
    const cls = ['pin-stop', st.key === 'home' ? 'home' : '', act?.id === st.id ? 'active' : '', done ? 'done' : ''].join(' ');
    const html = `<div class="${cls}">${done ? PARTS[st.part]?.icon || '✓' : stopLabel(st)}</div>`;
    let x = mk.stops.get(st.id);
    if (!x) { x = L.marker([st.lat, st.lng], { icon: icon(html, 30), zIndexOffset: act?.id === st.id ? 500 : 0 }).addTo(m); x.on('click', () => editStop(st.id)); x.bindTooltip('', { className: 'rtip', direction: 'top', offset: [0, -14] }); mk.stops.set(st.id, x); }
    else { x.setLatLng([st.lat, st.lng]); x.setIcon(icon(html, 30)); x.setZIndexOffset(act?.id === st.id ? 500 : 0); }
    x.setTooltipContent(`${esc(st.name)}<br><span style="color:#93A0B8">${PARTS[st.part]?.icon || ''} ${esc(PARTS[st.part]?.label || '')} · straal ${st.radius || g?.settings?.radius || 20} m</span>`);
  }
  for (const [id, x] of mk.stops) if (!seen.has(id)) { x.remove(); mk.stops.delete(id); }
  // route
  const pts = (r.length ? r : all.slice().sort((a, b) => a.seq - b.seq)).map(s => [s.lat, s.lng]);
  if (!mk.route) mk.route = L.polyline(pts, { color: '#7FE8FF', weight: 3, opacity: r.length ? .7 : .25, dashArray: '2 10', interactive: false }).addTo(m);
  else mk.route.setLatLngs(pts).setStyle({ opacity: r.length ? .7 : .25 });
  // telefoons
  const dseen = new Set();
  for (const d of devices()) {
    if (d.lat == null) continue; dseen.add(d.id);
    const stale = !d.online || !d.last || Date.now() - Date.parse(d.last) > 60_000;
    const col = colorOf(d.players[0]);
    const html = `<div class="pin-dev ${stale ? 'stale' : ''}" style="background:${col}">${d.players.map(p => esc(p.name[0]?.toUpperCase())).join('+')}</div>`;
    let x = mk.devs.get(d.id), a = mk.accs.get(d.id);
    if (!x) { x = L.marker([d.lat, d.lng], { icon: icon(html, 36, 30), zIndexOffset: 1000 }).addTo(m); x.bindTooltip('', { className: 'rtip', direction: 'top', offset: [0, -14] }); mk.devs.set(d.id, x);
      a = L.circle([d.lat, d.lng], { radius: d.acc || 20, color: col, weight: 1, fillOpacity: .07, interactive: false }).addTo(m); mk.accs.set(d.id, a); }
    else { x.setLatLng([d.lat, d.lng]); x.setIcon(icon(html, 36, 30)); a.setLatLng([d.lat, d.lng]).setRadius(d.acc || 20); }
    x.setTooltipContent(`${d.players.map(p => esc(p.name)).join(' & ')}<br><span style="color:#93A0B8">${d.battery != null ? '🔋' + Math.round(d.battery) + '% · ' : ''}GPS ±${Math.round(d.acc || 0)} m · ${ago(d.last)} geleden</span>`);
  }
  for (const [id, x] of mk.devs) if (!dseen.has(id)) { x.remove(); mk.accs.get(id)?.remove(); mk.devs.delete(id); mk.accs.delete(id); }
  // de Kruimelaar
  const sur = g?.surprise, tseen = new Set();
  if (sur?.kind === 'thief' && Array.isArray(sur.data?.points)) {
    const jump = eventsAfter('thief.jump', sur.started_at)[0]; const now = jump ? +jump.payload?.i : 0;
    sur.data.points.forEach((p, i) => { const k = 't' + i; tseen.add(k); const html = `<div class="pin-thief ${i === now ? 'now' : ''}">🍪</div>`;
      let x = mk.thief.get(k); if (!x) { x = L.marker([p.lat, p.lng], { icon: icon(html, 30), interactive: false }).addTo(m); mk.thief.set(k, x); } else { x.setLatLng([p.lat, p.lng]); x.setIcon(icon(html, 30)); } });
  }
  for (const [k, x] of mk.thief) if (!tseen.has(k)) { x.remove(); mk.thief.delete(k); }
  // kader
  const key = (act?.id || 'all') + '|' + devices().filter(d => d.lat != null).length;
  if (follow || fittedKey !== key) { fittedKey = key; fitMap(); }
  requestAnimationFrame(() => m.invalidateSize());
}
function fitMap() {
  const m = ensureMap(); if (!m) return;
  const act = activeStop(), pts = [];
  for (const d of devices()) if (d.lat != null && d.online) pts.push([d.lat, d.lng]);
  if (act) pts.push([act.lat, act.lng]);
  if (!pts.length || game()?.phase === 'lobby' || game()?.phase === 'klaar') for (const s of stops()) pts.push([s.lat, s.lng]);
  if (!pts.length) return;
  m._progFit = true;
  if (pts.length === 1) m.setView(pts[0], 17); else m.fitBounds(L.latLngBounds(pts).pad(.2), { maxZoom: 18, padding: [24, 24] });
  setTimeout(() => m._progFit = false, 600);
}
function renderMapBtns() { const b = $('#followbtn'); if (b) b.classList.toggle('on', follow); }

/* ================================================================ render */
const app = $('#app'), bar = $('#bar');
function render() {
  renderBar();
  if (!booted && !bootError) { app.innerHTML = `<div class="page" style="grid-column:1/-1;max-width:480px;margin:10vh auto"><span class="tab">Verbinden</span><p>Het dossier wordt opgehaald…</p></div>`; return; }
  if (bootError) { app.innerHTML = `<div class="page warn" style="grid-column:1/-1;max-width:480px;margin:10vh auto"><span class="tab">Geen verbinding</span><p>⚠️ ${esc(bootError)}</p><button id="retry">Opnieuw proberen</button></div>`; $('#retry').onclick = () => { bootError = ''; booted = false; render(); boot(); }; return; }
  if (!loggedIn) { renderLogin(); return; }
  if (!$('#live')) { app.innerHTML = `<section id="live"></section><section id="panel"></section>`; }
  renderLive(); renderPanel();
}
function renderBar() {
  const g = game(), got = g?.parts || [], c = S().conn, act = activeStop();
  bar.innerHTML = `<div class="in">
    <h1>Regie · Mecha-Pof</h1>
    <span class="dot ${c === 'online' ? 'on' : c === 'connecting' ? 'conn' : 'off'}" title="${c}"></span>
    ${g ? `<span class="chip phase ${g.phase}">${PHASES[g.phase] || g.phase}</span>` : ''}
    ${act && g?.phase !== 'lobby' && g?.phase !== 'klaar' ? `<span class="chip">📍 ${esc(act.name)}</span>` : ''}
    ${g && g.phase !== 'lobby' ? `<span class="chip" title="stroopdruppels">💧 ${g.drops || 0}</span>` : ''}
    <span class="parts">${Object.keys(PARTS).map(k => `<span class="part ${got.includes(k) ? 'got' : ''}" title="${esc(PARTS[k].label)}">${got.includes(k) ? PARTS[k].icon : ''}</span>`).join('')}</span>
    <span class="grow"></span>
    ${loggedIn ? `<button class="iconbtn" data-b="sound" aria-label="Geluid bij gebeurtenissen">${sound ? '🔔' : '🔕'}</button><button class="iconbtn" data-b="reload" aria-label="Opnieuw laden">↻</button><button class="ghost sm onlywide" data-b="logout">Afmelden</button>` : ''}
  </div>`;
}
bar.addEventListener('click', e => {
  const b = e.target.closest('[data-b]')?.dataset.b;
  if (b === 'sound') { sound = !sound; store.set(KEY_SOUND, sound); renderBar(); if (sound) beep([660]); }
  if (b === 'reload') { toast('Opnieuw laden…', 1200); sync.reload().catch(() => {}); loadRegie(); }
  if (b === 'logout') logout();
});

function renderLogin() {
  app.innerHTML = `<div class="page" style="grid-column:1/-1;max-width:460px;margin:8vh auto;width:100%"><span class="tab">Begeleider</span>
    <h2>Regiesleutel</h2><p class="note">Dezelfde sleutel als in de ⚙︎-lade van de app en op scout.html.</p>
    <form class="stack" autocomplete="off"><input type="password" id="key" placeholder="sleutel" aria-label="Regiesleutel" autocapitalize="off">
      <label class="inline"><input type="checkbox" id="remember" checked> Onthoud op dit apparaat</label>
      <button class="led" type="submit">Inloggen</button><p class="feedback" id="fb"></p></form>
    <p class="note">De app voor de kinderen: <a href="./index.html">index.html</a> · plekken verkennen: <a href="./scout.html">scout.html</a></p></div>`;
  $('#key').focus();
  $('form', app).onsubmit = async e => { e.preventDefault(); const k = $('#key').value.trim(); if (!k) return; $('#fb').textContent = 'Even kijken…';
    try { await login(k, $('#remember').checked); render(); } catch (err) { $('#fb').textContent = /sleutel|regie/i.test(err.message) ? 'Verkeerde regiesleutel.' : 'Geen verbinding: ' + err.message; } };
}

/* ---------- live: kaart en status (DOM blijft staan; alleen teksten worden ververst) */
function renderLive() {
  const live = $('#live');
  if (!$('#mapslot', live)) {
    live.innerHTML = `${hasL ? `<div class="mapwrap"><div id="mapslot"></div><div class="mapbtns"><button class="plain" id="fitbtn" aria-label="Kaart passend maken">🎯</button><button class="plain ${follow ? 'on' : ''}" id="followbtn" aria-label="Kaart volgt het spel">📡</button></div></div>` : '<p class="note">Leaflet laadt niet; geen kaart.</p>'}
      <div id="cards" class="cards"></div><div id="surprise"></div><div class="page" style="padding-top:20px"><span class="tab">Telefoons</span><div id="devs" class="devs"></div></div>`;
    if (hasL) { $('#mapslot', live).appendChild(mapEl); $('#fitbtn', live).onclick = fitMap; $('#followbtn', live).onclick = () => { follow = !follow; store.set(KEY_FOLLOW, follow); renderMapBtns(); if (follow) fitMap(); }; }
  }
  const g = game(), act = activeStop(), r = route(), pz = activePuzzle(), i = act ? stopIndex(act) : null;
  const solvedWait = pz?.solved_at == null && pz && g?.phase === 'puzzel';
  $('#cards', live).innerHTML = g ? `
    <div class="card"><span class="k">Fase</span><span class="v">${PHASES[g.phase] || g.phase}</span></div>
    <div class="card ${act ? '' : 'warn'}"><span class="k">Actieve stop</span><span class="v">${act ? `${i != null ? i + 1 + '/' + r.length + ' · ' : ''}${esc(act.name)}` : '—'}</span></div>
    <div class="card gold"><span class="k">Druppels · hints</span><span class="v big">💧${g.drops || 0} <span style="font-size:1rem;color:var(--muted)">· ${g.hints || 0} hint${g.hints === 1 ? '' : 's'}</span></span></div>
    <div class="card ${pz ? (pz.solved_at ? 'ok' : 'warn') : ''}"><span class="k">Puzzel</span><span class="v">${pz ? (pz.solved_at ? `✓ opgelost door ${esc(playerName(pz.solved_by) || 'regie')}` : `${pz.moves?.length || 0} zetten · ${pz.hints || 0} hint · ${ago(pz.arrived_at)}`) : g.phase === 'onderweg' ? 'nog onderweg' : '—'}</span></div>
    <div class="card"><span class="k">Online</span><span class="v">${players().filter(p => p.online).length}/${players().length} · ${devices().filter(d => d.online).length} 📱</span></div>
    <div class="card ${g.energy === 1 ? 'bad' : g.energy === 3 ? 'ok' : ''}"><span class="k">Energie · wens</span><span class="v">${g.energy ? '⚡'.repeat(g.energy) : '—'} · ${g.wish_used ? '🎂 gebruikt' : '🎂 vrij'}</span></div>` : '';
  $('#surprise', live).innerHTML = surpriseStatus();
  $('#devs', live).innerHTML = devices().map(d => `<div class="dev ${d.online ? '' : 'off'}"><span class="dot ${d.online ? 'on' : ''}"></span><span class="who">${d.players.map(p => `<b>${esc(p.name)}</b>${p.talent ? ' <small class="note">(' + esc(TALENTS[p.talent]?.label || p.talent) + ')</small>' : ''}`).join(' & ')}</span>
      <span class="bat ${d.battery != null && d.battery < 20 ? 'low' : ''}">${d.battery != null ? '🔋' + Math.round(d.battery) + '%' : ''}</span><span class="note">${d.lat != null ? '±' + Math.round(d.acc || 0) + ' m' : 'geen GPS'} · ${ago(d.last)}</span></div>`).join('') || '<p class="note">Nog geen telefoon ingelogd.</p>';
  const offline = players().filter(p => !p.online && p.device_id);
  if (offline.length) $('#devs', live).insertAdjacentHTML('beforeend', `<p class="note">Zonder verbinding: ${offline.map(p => esc(p.name)).join(', ')}</p>`);
  updateMap();
}
function surpriseStatus() {
  const g = game(), s = g?.surprise; if (!s) return '';
  const started = s.started_at;
  if (s.kind === 'thief') { const j = eventsAfter('thief.jump', started)[0]; return `<div class="surprise"><span class="k">🍪 De Kruimelaar is actief</span><p>Gestolen: <b>${esc(PARTS[s.data?.part]?.label || s.data?.part || '?')}</b> · nu bij punt ${(j ? +j.payload?.i : 0) + 1} van ${s.data?.points?.length || 0} · ${ago(started)}</p></div>`; }
  const secondsLeft = total => Math.max(0, Math.round((Date.parse(started) + total * 1000 - Date.now()) / 1000));
  if (s.kind === 'storm') {
    const scores = eventsAfter('storm.score', started), total = scores.reduce((n, e) => n + (+e.payload?.n || 0), 0);
    const perPlayer = {}; for (const e of scores) perPlayer[e.player_id] = (perPlayer[e.player_id] || 0) + (+e.payload?.n || 0);
    const who = Object.entries(perPlayer).map(([id, n]) => esc(playerName(id)) + ' ' + n).join(', ');
    return `<div class="surprise"><span class="k">⚡ Kortsluiting</span><p><span class="countdown">${secondsLeft(s.data?.seconds || 30)}s</span> · ${total} vonken getikt${who ? ' (' + who + ')' : ''}</p></div>`;
  }
  if (s.kind === 'fork') {
    const last = {}; for (const v of eventsAfter('fork.vote', started).slice().reverse()) last[v.player_id] = v.payload?.choice;
    const a = Object.values(last).filter(c => c === 'a').length, b = Object.values(last).filter(c => c === 'b').length;
    return `<div class="surprise"><span class="k">📡 Dubbel signaal</span><p>A: <b>${esc(s.data?.a || 'A')}</b> (${a}) · B: <b>${esc(s.data?.b || 'B')}</b> (${b})</p></div>`;
  }
  if (s.kind === 'finale') { const left = secondsLeft(s.data?.seconds || 0); return `<div class="surprise"><span class="k">🔥 Jetpack oververhit</span><p><span class="countdown">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span> tot de jetpack het begeeft</p></div>`; }
  return `<div class="surprise"><span class="k">${esc(s.kind)}</span></div>`;
}
setInterval(() => { if (loggedIn && game()?.surprise && $('#surprise')) $('#surprise').innerHTML = surpriseStatus(); }, 1000);

/* ---------- tabbladen */
const TABS = [['spel', '🎮 Spel'], ['monster', '🤖 Mecha-Pof'], ['foto', '📸 Tekeningen'], ['verras', '✨ Verrassingen'], ['bonus', '⭐ Bonus'], ['spelers', '👧 Spelers'], ['stops', '📍 Stops'], ['log', '📜 Logboek']];
function renderPanel() {
  const panel = $('#panel');
  if (panel.contains(document.activeElement) && document.activeElement.matches('input,textarea,select')) { pendingPanel = true; return; }
  pendingPanel = false;
  const g = game(), pz = activePuzzle();
  const badge = { spel: pz && !pz.solved_at && g?.phase === 'puzzel' ? '!' : '', foto: tk.badge() };
  panel.innerHTML = `<nav class="tabs">${TABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}${badge[k] ? `<span class="n">${badge[k]}</span>` : ''}</button>`).join('')}</nav>
    <div id="tabbody" class="stack">${({ spel: tabSpel, monster: tabMonster, foto: tk.tabHTML, verras: tabVerras, bonus: tabBonus, spelers: tabSpelers, stops: tabStops, log: tabLog }[tab] || tabSpel)()}</div>`;
}
document.addEventListener('focusout', () => { if (pendingPanel) setTimeout(() => { if (!$('#panel')?.contains(document.activeElement)) renderPanel(); }, 50); });
app.addEventListener('click', e => { const t = e.target.closest('[data-tab]')?.dataset.tab; if (t) { tab = t; store.set(KEY_TAB, t); renderPanel(); } });
app.addEventListener('input', e => {
  const k = e.target.dataset.ui; if (!k) return;
  ui[k] = e.target.type === 'number' || e.target.type === 'range' ? +e.target.value : e.target.value;
  if (k === 'logFilter') { const l = $('#panel .log'); if (l) l.innerHTML = logList(); }
  if (k === 'call') { const b = $('[data-a=call]'); if (b) b.disabled = !ui.call; }
});

/* ---------- voorpret (teaser vóór het feest): wie heeft zich gemeld, teksten en tijd aanpassen. Zie js/teaser.js. */
const PARTS_KEYS = Object.keys(PARTS);
function teaserLinesText(t) { return (t?.lines || []).map(l => `${l.from || ''} | ${l.part || ''} | ${(l.text || '').replace(/\s*\n\s*/g, ' ')}`).join('\n'); }
function parseTeaserLines(txt) {
  return txt.split('\n').map(s => s.trim()).filter(Boolean).map(s => { const [from, part, ...rest] = s.split('|').map(x => x.trim()); const text = rest.join('|').trim(); if (!text) return null;
    return { ...(/^\d{4}-\d{2}-\d{2}$/.test(from) ? { from } : {}), ...(PARTS_KEYS.includes(part) ? { part } : {}), text }; }).filter(Boolean);
}
function toLocalInput(iso) { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return ''; const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
function fromLocalInput(v) { if (!v) return null; const d = new Date(v); if (isNaN(d)) return null; const off = -d.getTimezoneOffset(), sg = off >= 0 ? '+' : '-', p = n => String(Math.abs(n)).padStart(2, '0'); return `${v}:00${sg}${p(off / 60 | 0)}:${p(off % 60)}`; }
function teaserPanel() {
  const g = game(), t = g?.settings?.teaser; if (!t && (g?.phase && g.phase !== 'lobby')) return '';
  const visits = R.teaser_visits || [], known = new Set(visits.map(v => v.player_id).filter(Boolean));
  const active = t?.until && Date.parse(t.until) > Date.now() && t.enabled !== false;
  const today = new Date().toISOString().slice(0, 10), todayLine = (t?.lines || []).filter(l => l.from && l.from <= today).sort((a, b) => a.from < b.from ? 1 : -1)[0];
  return `<div class="page ${active ? '' : 'warn'}"><span class="tab">Voorpret (teaser)</span>
      <p class="note">${active ? `Aan tot ${esc(new Date(t.until).toLocaleString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}: de app toont de aftelklok en laat niemand inloggen (behalve met de regiesleutel).` : 'Uit: de app toont het gewone inlogscherm.'}</p>
      <p><b>${known.size} van ${players().length}</b> speurders hebben zich gemeld${visits.length ? ` · ${visits.length} telefoon${visits.length === 1 ? '' : 's'} · ${visits.reduce((n, v) => n + (v.plays || 0), 0)}× 🔊` : ''}</p>
      ${visits.length ? `<div class="stack" style="gap:4px">${visits.map(v => `<div class="row" style="justify-content:space-between"><span>${v.player_id ? '✅ ' + esc(playerName(v.player_id)) : '❓ '}${!v.player_id || playerName(v.player_id).toLowerCase() !== (v.name_typed || '').toLowerCase() ? `<span class="note"> typte "${esc(v.name_typed)}"</span>` : ''}</span><span class="note">${v.visits}× · laatst ${fmtTime(v.last_at)}</span></div>`).join('')}</div>` : '<p class="note">Nog niemand geweest.</p>'}
      ${todayLine ? `<p class="note">Melding van vandaag: “${esc(todayLine.text)}”</p>` : ''}
      <details class="adv"><summary>Teksten en tijd aanpassen</summary><div class="stack" style="margin-top:8px">
        <label class="inline"><input type="checkbox" id="teaser-enabled" ${t?.enabled !== false ? 'checked' : ''}> Teaser aan</label>
        <label>Dossier opent op (dan verschijnt het inlogscherm)<input type="datetime-local" id="teaser-until" value="${toLocalInput(t?.until)}"></label>
        <label>Meldingen, één per regel: <span class="code">datum | deel | tekst</span> (deel = ${PARTS_KEYS.join(', ')} of leeg; datum = vanaf wanneer zichtbaar)<textarea class="mono" id="teaser-lines" rows="8">${esc(teaserLinesText(t))}</textarea></label>
        <button class="led" data-a="teaser-save">💾 Voorpret opslaan</button>
      </div></details></div>`;
}

function tabSpel() {
  const g = game(), act = activeStop(), pz = activePuzzle(), r = route();
  const started = g?.phase && g.phase !== 'lobby';
  return `${teaserPanel()}${kernPanel()}<div class="page"><span class="tab">Spel</span>
      <div class="grid2"><button class="ok" data-a="start">${started ? '▶ Opnieuw starten' : '▶ Start (route in volgorde)'}</button><button class="danger" data-a="reset">↺ Reset naar lobby</button></div>
      <p class="note">${started ? `Gestart ${fmtTime(g.started_at)} · route: ${r.map(s => esc(s.name)).join(' → ')}` : `Nog niet gestart. ${players().filter(p => p.online).length} van ${players().length} speurders online.`}</p>
    </div>
    <div class="page ${pz && !pz.solved_at && g?.phase === 'puzzel' ? 'warn' : ''}"><span class="tab">Huidige stop${act ? ' · ' + esc(act.name) : ''}</span>
      ${act ? `<p class="note">${esc(act.clue)}</p>${act.puzzles?.[0]?.question ? `<p>Puzzel: <b>${esc(act.puzzles[pz?.variant ?? 0]?.question || act.puzzles[0].question)}</b>${act.puzzles?.[pz?.variant ?? 0]?.answer ? ` · antwoord <span class="code">${esc(act.puzzles[pz?.variant ?? 0].answer)}</span>` : ''}</p>` : ''}
        ${act.puzzles?.[pz?.variant ?? 0]?.hint ? `<p class="note">Hint in de puzzel: ${esc(act.puzzles[pz?.variant ?? 0].hint)}</p>` : ''}` : '<p class="note">Geen actieve stop.</p>'}
      <div class="grid2"><button class="plain" data-a="skip" ${g?.phase !== 'onderweg' ? 'disabled' : ''}>📡 GPS overslaan</button><button class="plain" data-a="hint" ${!started ? 'disabled' : ''}>💡 Hint geven</button></div>
      <label>Eigen hinttekst (leeg = de hint van de puzzel)<input data-ui="hint" value="${esc(ui.hint)}" placeholder="bijv. Kijk eens onder het bankje…"></label>
      <div class="row"><label class="grow">Druppels bij goedkeuren<input type="number" data-ui="drops" value="${ui.drops}" min="0" max="30"></label><button class="ok" data-a="approve" ${!started || g?.phase === 'klaar' ? 'disabled' : ''} style="align-self:end">✅ Stop goedkeuren</button></div>
      <p class="note">Goedkeuren rondt de actieve stop af alsof de Sleutelbewaarder heeft ingediend (deel erbij, volgende stop actief).</p>
    </div>
    <div class="page"><span class="tab">Instellingen</span>
      <label class="inline"><input type="checkbox" data-a="any" ${g?.settings?.any_can_submit ? 'checked' : ''}> Iedereen mag indienen (niet alleen de Sleutelbewaarder) — vóór het feest uit</label>
      <div class="grid2"><label>Standaardstraal (m)<input type="number" data-a="radius" value="${g?.settings?.radius ?? 20}" min="5" max="100"></label><label>Minimale afstand tussen stops (m)<input type="number" data-a="mingap" value="${g?.settings?.min_gap ?? 150}" min="20" max="1000"></label></div>
      <div class="row"><span class="note grow">Energie van Mecha-Pof</span>${[1, 2, 3].map(n => `<button class="plain sm ${g?.energy === n ? 'led' : ''}" data-a="energy" data-n="${n}">${'⚡'.repeat(n)}</button>`).join('')}</div>
      <div class="grid2"><button class="plain" data-a="deal">🎲 Talenten loten</button><button class="plain" data-a="planb" ${devices().length ? '' : 'disabled'}>🪫 Plan B (telefoon uitgevallen)</button></div>
      ${devices().length ? `<label>Telefoon die is uitgevallen (voor Plan B)<select data-ui="planb">${devices().map(d => `<option value="${d.id}" ${ui.planb === d.id ? 'selected' : ''}>${d.players.map(p => esc(p.name)).join(' & ')}${d.online ? '' : ' (offline)'}</option>`).join('')}</select></label>` : ''}
    </div>
    <details class="adv"><summary>Noodknoppen (fase en stop met de hand zetten)</summary>
      <div class="stack" style="margin-top:8px">
        <div class="row"><label class="grow">Fase<select id="phasesel">${Object.keys(PHASES).map(p => `<option value="${p}" ${g?.phase === p ? 'selected' : ''}>${PHASES[p]}</option>`).join('')}</select></label>
          <label class="grow">Actieve stop<select id="actsel">${r.map((s, i) => `<option value="${i}" ${g?.active_index === i ? 'selected' : ''}>${i + 1}. ${esc(s.name)}</option>`).join('') || '<option>— eerst starten —</option>'}</select></label>
          <button class="danger" data-a="force" style="align-self:end">Zet</button></div>
        <p class="note">Gebruik dit alleen als het spel vastloopt. De puzzelstand van de nieuwe stop wordt niet gewist; "GPS overslaan" na het zetten laat de telefoons aankomen.</p>
      </div></details>`;
}
/* ---------- thuis: het kernscherm (kern.html op de laptop), de wekknop en de loting met animatie (chat 7) */
const WEKZIN = LINES.wek?.[0] || 'Bzzzt... wie maakt mij wakker?';
function kernPanel() {
  const g = game(); if (g?.phase && g.phase !== 'lobby') return '';
  const at = g?.settings?.kern_at, on = at && Date.now() - Date.parse(at) < 3 * 60_000;
  const woke = (() => { for (const e of events()) { if (e.type === 'game.reset') return false; if (e.type === 'monster.say' && e.payload?.wake) return true; } return false; })();
  const ps = players(), bday = ps.find(p => p.is_birthday);
  return `<div class="page"><span class="tab">Thuis · kern en loting</span>
    <p class="note">Kernscherm: ${on ? `<b style="color:var(--ok)">aan</b> (${ago(at)} geleden gemeld)` : '<b style="color:var(--straw)">niet gezien</b> — open <a href="./kern.html" target="_blank">kern.html</a> op de laptop'}. ${woke ? 'Mecha-Pof is wakker.' : 'Mecha-Pof slaapt nog.'}</p>
    <div class="grid2"><button class="${woke ? 'plain' : 'ok'}" data-a="wake">⏻ Wek Mecha-Pof</button><button class="${woke ? 'ok' : 'plain'}" data-a="loting">🎰 Loting starten${bday ? ` (${esc(bday.name)} vast)` : ''}</button></div>
    <button class="plain wide" data-a="uitleg" style="margin-top:8px">📋 Speluitleg op het kernscherm (5 regels, ±1 min)</button>
    <p class="note">Wekken = de wekzin op de laptop. Loting = de vijf anderen krijgen een willekeurig talent, ${esc(bday?.name || 'de jarige')} wordt Sleutelbewaarder; de kern laat de namen draaien en Mecha-Pof kondigt elk talent aan. Volgorde: wekken → loting → passen uitdelen → voorstelronde via de walkie → speluitleg → inloggen → start. Monteurspassen (<a href="./print/monteurspas.html?namen=1" target="_blank">met namen en codes</a>).</p>
  </div>`;
}
function lotingVast() { // talenten al vooraf verdeeld (passen zijn gedrukt): zes verschillende, de jarige Sleutelbewaarder
  const ps = players(), t = ps.map(p => p.talent).filter(Boolean);
  return ps.length > 0 && t.length === ps.length && new Set(t).size === t.length && ps.filter(p => p.is_birthday).every(p => p.talent === 'sleutelbewaarder');
}
function lotingTalents() {
  if (lotingVast()) return Object.fromEntries(players().map(p => [p.id, p.talent])); // de animatie onthult de vaste verdeling
  const ps = players(), out = {}, bday = ps.filter(p => p.is_birthday), rest = ps.filter(p => !p.is_birthday).sort(() => Math.random() - .5);
  const pool = Object.keys(TALENTS).filter(t => !(bday.length && t === 'sleutelbewaarder')).sort(() => Math.random() - .5);
  bday.forEach(p => out[p.id] = 'sleutelbewaarder');
  rest.forEach((p, i) => out[p.id] = pool[i % pool.length]);
  return out;
}
/* ---------- bonusopdrachten (chat 7, claude/ROUTE.md): stops zonder deel die de begeleider live inzet als het team voorloopt.
   "Inzetten als volgende stop" = regie_upsert_stop (part leeg, key leeg) + stop_order bijwerken met regie_patch_game.
   Onderweg komt de bonus vóór de stop waar ze naartoe lopen; bij een puzzel komt hij direct na deze stop. */
const BONUS = [
  { id: 'B1', name: 'De steen van H van Kleef', where: 'bij stop 6 (huis met de steen), vóór of na de licht-puzzel', lat: 51.616365, lng: 5.563619, radius: 25,
    clue: 'Extra signaal! Bij het huis met de steen zit meer dan alleen mijn benen. Zoek de oude steen van H. van Kleef in de muur, en tel alle witte rozetten. Voorkant én zijkant!',
    puzzle: { type: 'splits', bonus: 'B1', pieces: ['ROZETTEN VOORKANT', 'ROZETTEN ZIJGEVEL', 'JAARTAL OP DE STEEN'], answer: '1935',
      question: 'Mijn processor zendt de code in drie stukjes. Elke telefoon heeft één opdracht. De code = het jaartal op de steen plus alle witte rozetten bij elkaar opgeteld.',
      question_solo: 'De code = het jaartal op de steen plus alle witte rozetten (voorkant én zijgevel) bij elkaar opgeteld. Tik de stukjes om ze te zien.',
      hint: 'Op de steen staat 19 ANNO 25. Dat jaartal is 1925. Tel er dan alle rozetten bij op.' } },
  { id: 'B2', name: 'Het bankje met de pijlen', where: 'tussen stop 4 en 5 (60 m van de lijn)', lat: 51.613806, lng: 5.564414, radius: 25,
    clue: 'Mijn sensoren zien een bankje, met twee pijlen op de lantaarnpaal ernaast. Net een stukje van de route af. Tijd voor een rustpunt. En een dansje.',
    puzzle: { type: 'opdracht', bonus: 'B2', question: 'Rustpunt! Robotdans op mijn ritme: spatel (zwaaien), garde (rondjes draaien), stroop (gieten). Drie keer achter elkaar, met zijn allen. Kijk daarna naar de twee pijlen op de lantaarnpaal: ze wijzen de kant op waar mijn armen liggen. Gelukt? Tik af.' } },
  { id: 'B3', name: 'Het stalen huis', where: 'tussen stop 5 en 6, bij de hoge bomen', lat: 51.615985, lng: 5.564854, radius: 25,
    clue: 'Help! Een huis hier vlakbij trekt aan mijn pantser alsof het een magneet is. Zoek het glimmende huis, vlak bij de hoge bomen.',
    puzzle: { type: 'keuze', bonus: 'B3', question: 'Help, ik word hiernaartoe gezogen! Waarvan is dit huis gebouwd? (Daarna: zoek bij de hoge bomen het punt waar je de minste bomen ziet.)',
      options: ['Hout', 'Baksteen', 'Staal', 'Stroopwafels'], answer: 'Staal', hint: 'Klop er maar eens zachtjes op. Waar zou een magneet aan blijven plakken?' } },
];
const bonusStop = b => stops().find(s => s.puzzles?.some(p => p.bonus === b.id)) || null;
function bonusSlot() { // waar komt een nieuwe bonus in de route: index in stop_order, of null als het niet kan
  const g = game(); if (!g || !['onderweg', 'puzzel', 'finale'].includes(g.phase)) return null;
  const idx = g.phase === 'onderweg' ? g.active_index : g.active_index + 1;
  const ord = g.stop_order || [];
  if (idx >= ord.length) return null; // na thuis kan niet
  return idx;
}
function bonusStatus(b) {
  const st = bonusStop(b), g = game(), ord = g?.stop_order || [], i = st ? ord.indexOf(st.id) : -1;
  if (i < 0) return { key: 'vrij', st };
  if (i < (g.active_index || 0)) return { key: 'gedaan', st, i };
  if (i === g.active_index) return { key: 'actief', st, i };
  return { key: 'gepland', st, i };
}
function tabBonus() {
  const g = game(), idx = bonusSlot(), ord = g?.stop_order || [], next = idx != null ? stops().find(s => s.id === ord[idx]) : null, act = activeStop();
  const where = idx == null ? (g?.phase === 'lobby' ? 'Eerst het spel starten.' : 'Nu niet: er is geen volgende stop meer vóór thuis.')
    : g.phase === 'onderweg' ? `komt vóór <b>${esc(next?.name || '?')}</b> (waar ze nu naartoe lopen)` : `komt direct na <b>${esc(act?.name || '?')}</b>, vóór ${esc(next?.name || '?')}`;
  const elapsed = g?.started_at ? Math.round((Date.now() - Date.parse(g.started_at)) / 60000) : 0;
  return `<div class="page"><span class="tab">Bonusopdrachten</span>
      <p class="note">Voor als het team voorloopt op de richttijden (stop 1 15:35 · 2 15:50 · 3 16:05 · 4 16:20 · 5 16:35 · 6 16:50 · thuis 17:05). Een bonus heeft geen onderdeel: geen installatie, wel druppels en een vreugdezin. ${g?.started_at ? `Nu ${elapsed} min onderweg.` : ''}</p>
      <p class="note">Inzetten: ${where}</p></div>
    ${BONUS.map(b => { const s = bonusStatus(b), d = act ? Math.round(haversine(act, b)) : null;
      const pz = b.puzzle, ans = pz.answer ? ` · antwoord <span class="code">${esc(pz.answer)}</span>` : ' · begeleider/team tikt af';
      return `<div class="page ${s.key === 'actief' ? 'warn' : ''}"><span class="tab">${b.id} · ${esc(b.name)}</span>
        <p class="note">${esc(b.where)}${d != null ? ` · ${d} m van ${esc(act.name)}` : ''} · puzzel <b>${esc(pz.type)}</b>${ans}</p>
        <p>${esc(b.clue)}</p>
        <p class="note">Status: <b>${{ vrij: 'nog niet ingezet', gepland: `gepland als stop ${s.i + 1} in de route`, actief: 'NU de actieve stop', gedaan: 'gedaan ✓' }[s.key]}</b></p>
        <div class="grid2">${s.key === 'vrij'
          ? `<button class="ok" data-a="bonus-in" data-b="${b.id}" ${idx == null ? 'disabled' : ''}>⭐ Inzetten als volgende stop</button>`
          : s.key === 'gepland' ? `<button class="danger" data-a="bonus-out" data-b="${b.id}">✕ Uit de route halen</button>` : '<span></span>'}
          <button class="plain" data-a="bonus-call" data-b="${b.id}">📞 Terugval: Mecha-Pof belt met de tekst</button></div>
      </div>`; }).join('')}`;
}
async function bonusIn(b) {
  const g = game(), idx = bonusSlot(); if (idx == null) return toast('Nu kan er geen bonus tussen.', 3200, true);
  const ord = [...(g.stop_order || [])], prev = stops().find(s => s.id === ord[idx - 1]);
  const old = bonusStop(b), id = old?.id || uid();
  if (ord.includes(id)) return toast('Deze bonus staat al in de route (of is al gedaan).', 3200, true); // één keer per spel: de puzzelstand hoort bij de stop
  const st = { id, seq: prev?.seq ?? 0, key: '', name: b.name, clue: b.clue, lat: b.lat, lng: b.lng, radius: b.radius, part: '', puzzles: [b.puzzle], geheim: old?.geheim || {} };
  const without = [...ord]; without.splice(idx, 0, id);
  if (!confirm(`${b.id} "${b.name}" inzetten als volgende stop?`)) return;
  await busy(async () => { await sync.regie.upsertStop(st); await sync.regie.patchGame({ stop_order: without }); }, `⭐ ${b.id} ingezet`);
}
async function bonusOut(b) {
  const g = game(), s = bonusStatus(b); if (s.key !== 'gepland') return;
  const ord = (g.stop_order || []).filter((x, i) => !(x === s.st.id && i > g.active_index));
  if (!confirm(`${b.id} weer uit de route halen?`)) return;
  await busy(() => sync.regie.patchGame({ stop_order: ord }), `${b.id} uit de route`);
}
function tabMonster() {
  const ps = players();
  return `<div class="page"><span class="tab">Mecha-Pof laten praten</span>
      <label>Wat zegt hij? (op alle telefoons, met de robotstem)<textarea data-ui="say" placeholder="Bzzzt! …">${esc(ui.say)}</textarea></label>
      <div class="quick">${QUICK_SAYS.map(s => `<button data-a="quick" data-s="${esc(s)}">${esc(s.slice(0, 34))}…</button>`).join('')}</div>
      <div class="row"><label class="grow">Stemming (optioneel)<select data-ui="mood"><option value="">— automatisch —</option>${['wakker', 'nieuwsgierig', 'brutaal', 'slaap', 'compleet'].map(m => `<option ${ui.mood === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label><button class="led" data-a="say" style="align-self:end">🗣️ Zeg het</button></div>
    </div>
    <div class="page"><span class="tab">Mecha-Pof laat bellen (walkietalkie)</span>
      <p class="note">De radiotelefoon van deze speurder krijgt een inkomende oproep (event <code>monster.call</code>). Optionele tekst gaat als briefing mee in de begroeting.</p>
      <label>Wie moet opnemen?<select data-ui="call"><option value="">— kies een speurder —</option>${ps.map(p => `<option value="${p.id}" ${ui.call === p.id ? 'selected' : ''}>${esc(p.name)}${p.online ? '' : ' (offline)'}</option>`).join('')}</select></label>
      <label>Briefing (optioneel)<input data-ui="callText" value="${esc(ui.callText)}" placeholder="bijv. Bzzzt, ik zie een kruimelspoor richting de speeltuin…"></label>
      <button class="led" data-a="call" ${ui.call ? '' : 'disabled'}>📞 Bellen</button>
    </div>`;
}
function tabVerras() {
  const g = game(), s = g?.surprise, got = g?.parts || [], act = activeStop(), devs = devices();
  const thiefOn = s?.kind === 'thief', stormOn = s?.kind === 'storm', forkOn = s?.kind === 'fork', timerOn = s?.kind === 'finale';
  const jump = thiefOn ? +(eventsAfter('thief.jump', s.started_at)[0]?.payload?.i ?? 0) : 0, n = s?.data?.points?.length || 0;
  const birthday = players().find(p => p.is_birthday);
  return `${s ? `<p class="note">Er loopt al een verrassing (${esc(s.kind)}). Eén tegelijk werkt het best: stop die eerst.</p>` : ''}
    <div class="page ${thiefOn ? 'warn' : ''}"><span class="tab">🍪 De Kruimelaar</span>
      <p class="note">Een kruimelrobot steelt een gevonden deel en springt van punt naar punt rond de groep. De Rekenmeester pakt het terug (armen). De punten verschijnen op de kaart.</p>
      ${thiefOn ? `<p>Heeft <b>${esc(PARTS[s.data?.part]?.label || '?')}</b> · punt ${jump + 1} van ${n}</p><div class="grid3"><button class="plain" data-a="thief.jump" ${jump + 1 >= n ? 'disabled' : ''}>⏭ Volgende punt</button><button class="ok" data-a="thief.caught">🫳 Gevangen!</button><button class="danger" data-a="thief.end">✖ Afbreken</button></div>`
        : `<div class="row"><label class="grow">Welk deel steelt hij?<select data-ui="thiefPart">${got.length ? got.map(k => `<option value="${k}" ${ui.thiefPart === k ? 'selected' : ''}>${PARTS[k].icon} ${esc(PARTS[k].label)}</option>`).join('') : '<option value="">— nog niets gevonden —</option>'}</select></label><button class="led" data-a="thief.start" ${got.length && act ? '' : 'disabled'} style="align-self:end">🍪 Start</button></div>
           <p class="note">Vier punten op 70–140 m rond ${devs.some(d => d.lat != null && d.online) ? 'de telefoons' : 'de actieve stop'}.</p>`}
    </div>
    <div class="page ${stormOn ? 'warn' : ''}"><span class="tab">⚡ Kortsluiting</span>
      <p class="note">Iedereen tikt vonken weg op de eigen telefoon; de scores tellen op.</p>
      ${stormOn ? `<p>Loopt sinds ${fmtTime(s.started_at)} (${s.data?.seconds || 30} s).</p><button class="ok" data-a="storm.end">🛑 Stop en tel op</button>`
        : `<div class="row"><label class="grow">Duur (seconden)<input type="number" data-ui="storm" value="${ui.storm}" min="10" max="120"></label><button class="led" data-a="storm.start" style="align-self:end">⚡ Start</button></div>`}
    </div>
    <div class="page ${forkOn ? 'warn' : ''}"><span class="tab">📡 Dubbel signaal</span>
      <p class="note">Twee keuzes; elke telefoon stemt. Jij hakt de knoop door.</p>
      ${forkOn ? `<p>A: <b>${esc(s.data?.a)}</b> · B: <b>${esc(s.data?.b)}</b></p><div class="grid2"><button class="ok" data-a="fork.result" data-c="a">Kies A</button><button class="ok" data-a="fork.result" data-c="b">Kies B</button></div>`
        : `<div class="grid2"><label>Keuze A<input data-ui="forkA" value="${esc(ui.forkA)}" placeholder="Linksaf langs het water"></label><label>Keuze B<input data-ui="forkB" value="${esc(ui.forkB)}" placeholder="Rechtsaf door het steegje"></label></div><button class="led" data-a="fork.open">📡 Open het dubbele signaal</button>`}
    </div>
    <div class="page ${timerOn ? 'warn' : ''}"><span class="tab">🔥 Jetpack oververhit (finaletimer)</span>
      ${timerOn ? `<p>Timer loopt sinds ${fmtTime(s.started_at)} (${Math.round((s.data?.seconds || 0) / 60)} min).</p><button class="danger" data-a="timer.stop">🛑 Timer stoppen</button>`
        : `<div class="row"><label class="grow">Minuten<input type="number" data-ui="timerMin" value="${ui.timerMin}" min="1" max="60"></label><button class="led" data-a="finale.timer" style="align-self:end">🔥 Start</button></div>`}
    </div>
    <div class="page"><span class="tab">🎂 Verjaardagswens</span>
      <p class="note">Alleen ${esc(birthday?.name || 'de jarige')} mag hem één keer inzetten vanaf haar telefoon. ${g?.wish_used ? '<b>Al gebruikt.</b>' : 'Nog niet gebruikt.'} Vanuit de regie kun je hem namens haar inzetten (telt dan niet als "gebruikt" in het spel, alleen in het logboek).</p>
      <div class="row"><label class="grow">Waarvoor<select data-ui="wish">${['puzzel overslaan', 'gratis hint', 'dansje van Mecha-Pof'].map(w => `<option ${ui.wish === w ? 'selected' : ''}>${w}</option>`).join('')}</select></label><button class="plain" data-a="wish" style="align-self:end">🎂 Inzetten namens ${esc(birthday?.name || 'jarige')}</button></div>
    </div>`;
}
function tabSpelers() {
  const ps = players(), talents = Object.keys(TALENTS);
  const dup = talents.filter(t => ps.filter(p => p.talent === t).length > 1);
  return `<div class="page"><span class="tab">De speurders</span>
      ${dup.length ? `<p class="feedback">⚠️ Dubbel talent: ${dup.map(t => TALENTS[t].label).join(', ')}</p>` : ''}
      <div class="list">${ps.map(p => `<div class="item" style="--acc:${colorOf(p)}"><span class="ic">${p.is_birthday ? '🎂' : PARTS[partOf(p)]?.icon || '🕵️'}</span>
        <div class="txt"><b>${esc(p.name)} <span class="dot ${p.online ? 'on' : ''}"></span></b><small>${p.talent ? esc(TALENTS[p.talent]?.label) : 'geen talent'} · ${partOf(p) ? esc(PARTS[partOf(p)].label) + (p.part ? '' : ' (via talent)') : 'geen deel'} · code <span class="code">${esc(p.code || '????')}</span>${p.badges?.length ? ' · 🏅' + p.badges.length : ''}${p.mission ? (p.mission_done ? ' · missie ✓' : ' · missie') : ''}</small></div>
        <button class="plain sm" data-a="editplayer" data-id="${p.id}">✏️</button></div>`).join('')}</div>
      <div class="row"><button class="plain" data-a="addplayer">+ Speurder toevoegen</button><button class="ghost sm" data-a="copycodes">Codes kopiëren</button></div>
    </div>`;
}
function tabStops() {
  const all = stops().slice().sort((a, b) => (a.key === 'start' ? -1 : b.key === 'start' ? 1 : a.key === 'home' ? 1 : b.key === 'home' ? -1 : a.seq - b.seq));
  const gap = game()?.settings?.min_gap || 150, act = activeStop(), g = game();
  let total = 0; const r = route(); for (let i = 1; i < r.length; i++) total += haversine(r[i - 1], r[i]);
  return `<div class="page"><span class="tab">Stops (${all.length})</span>
      <p class="note">${r.length ? `Route ${Math.round(total)} m in gelote volgorde.` : 'Volgorde = seq; bij Start wordt de route geschud (start vooraan, thuis achteraan).'} Tik op een stop op de kaart of op ✏️ om te bewerken; met 🗺️ kies je de plek op de kaart.</p>
      <div class="list">${all.map(st => { const i = stopIndex(st), done = g && i != null && i < g.active_index && g.phase !== 'lobby';
        const near = all.filter(x => x.id !== st.id).map(x => ({ x, d: haversine(st, x) })).sort((a, b) => a.d - b.d)[0];
        const warn = near && near.d < gap && st.key !== 'home' && near.x.key !== 'home';
        return `<div class="item ${act?.id === st.id ? 'active' : ''} ${done ? 'done' : ''}" style="--acc:${PARTS[st.part]?.color || '#5B6680'}"><span class="num">${stopLabel(st)}</span>
          <div class="txt"><b>${esc(st.name)} ${PARTS[st.part]?.icon || ''}</b><small>${(st.puzzles || []).map(p => p.type).join(' + ') || 'geen puzzel'} · straal ${st.radius || g?.settings?.radius || 20} m${near ? ` · ${warn ? '⚠️ ' : ''}${Math.round(near.d)} m tot ${esc(near.x.name)}` : ''}</small></div>
          <button class="plain sm" data-a="pickstop" data-id="${st.id}" aria-label="Kies op kaart">🗺️</button><button class="plain sm" data-a="editstop" data-id="${st.id}">✏️</button></div>`; }).join('')}</div>
      <button class="plain" data-a="addstop">+ Stop toevoegen</button>
    </div>`;
}
function filteredEvents() {
  const f = ui.logFilter.trim().toLowerCase();
  return events().filter(e => !f || (e.type + ' ' + (EV_LABEL[e.type] || '') + ' ' + payloadText(e) + ' ' + playerName(e.player_id)).toLowerCase().includes(f));
}
function logList() {
  return filteredEvents().slice(0, 200).map(e => `<div class="ev ${e.actor} ${['stop.solved', 'stop.arrived'].includes(e.type) ? 'hot' : ''} ${SURPRISE_TYPES.includes(e.type) ? 'sur' : ''}"><time>${fmtTime(e.at)}</time><div><span class="t">${esc(EV_LABEL[e.type] || e.type)}</span> <span class="note">${e.actor === 'player' ? esc(playerName(e.player_id)) : e.actor}</span><div class="p">${esc(payloadText(e))}</div></div></div>`).join('') || '<p class="note">Nog niets gebeurd.</p>';
}
function tabLog() {
  return `<div class="page"><span class="tab">Logboek (${filteredEvents().length})</span>
      <input data-ui="logFilter" value="${esc(ui.logFilter)}" placeholder="Filter: stop, hint, kruimelaar, naam…">
      <div class="log">${logList()}</div>
    </div>`;
}
function payloadText(e) {
  const p = e.payload || {};
  switch (e.type) {
    case 'stop.arrived': case 'gps.skip': case 'stop.approve': return stopName(p.stop_id);
    case 'stop.solved': return `${stopName(p.stop_id)} · ${PARTS[p.part]?.label || p.part} · +${p.drops} druppels${p.by ? ' · ' + playerName(p.by) : ''}`;
    case 'hint.given': return `${stopName(p.stop_id)}${p.text ? ' · ' + p.text : ' · hint uit de puzzel'}`;
    case 'monster.say': return p.text || '';
    case 'monster.call': return playerName(p.player_id) + (p.text ? ' · ' + p.text : '');
    case 'roles.shuffle': return Object.entries(p.talents || {}).map(([id, t]) => `${playerName(id)}=${TALENTS[t]?.label || t}`).join(', ');
    case 'badge.awarded': return `${playerName(p.player_id)} · ${p.badge}`;
    case 'game.start': return `${(p.stop_order || []).length} stops · kleinste afstand ${p.min_distance_m} m`;
    case 'thief.start': return `${PARTS[p.part]?.label || p.part} · ${(p.points || []).length} punten`;
    case 'thief.jump': return `punt ${(+p.i || 0) + 1}`;
    case 'storm.start': return `${p.seconds} s`;
    case 'storm.score': return `${p.n} vonken`;
    case 'storm.end': return `${p.total} vonken totaal`;
    case 'fork.open': return `A: ${p.a} · B: ${p.b}`;
    case 'fork.vote': case 'fork.result': return String(p.choice || '').toUpperCase();
    case 'finale.timer': return `${Math.round((p.seconds || 0) / 60)} min`;
    case 'wish.used': return p.for || '';
    case 'energy': return '⚡'.repeat(+p.level || 0);
    case 'plan_b': return 'telefoon ' + String(p.dropped_device || '').slice(0, 8);
    default: return Object.keys(p).length ? JSON.stringify(p) : '';
  }
}

/* ================================================================ acties */
app.addEventListener('change', async e => {
  const a = e.target.dataset.a; if (!a) return;
  if (a === 'any') await busy(() => sync.regie.patchGame({ settings: { any_can_submit: e.target.checked } }), e.target.checked ? 'Iedereen mag indienen' : 'Alleen de Sleutelbewaarder mag indienen');
  if (a === 'radius') await busy(() => sync.regie.patchGame({ settings: { radius: +e.target.value || 20 } }), 'Straal opgeslagen');
  if (a === 'mingap') await busy(() => sync.regie.patchGame({ settings: { min_gap: +e.target.value || 150 } }), 'Afstand opgeslagen');
});
app.addEventListener('click', async e => {
  const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, g = game(), act = activeStop();
  const confirmAnd = async (q, fn, ok) => { if (confirm(q)) await busy(fn, ok); };
  switch (a) {
    case 'teaser-save': { const t = game()?.settings?.teaser || {}; const until = fromLocalInput($('#teaser-until').value) || t.until || null; const lines = parseTeaserLines($('#teaser-lines').value);
      if (!until) return toast('Vul in wanneer het dossier opent.', 3200, true);
      return busy(() => sync.regie.patchGame({ settings: { teaser: { ...t, until, enabled: $('#teaser-enabled').checked, lines } } }), `Voorpret opgeslagen (${lines.length} meldingen)`); }
    case 'start': return confirmAnd(g?.phase !== 'lobby' ? 'Het spel loopt al. Opnieuw starten schudt de route en wist de voortgang. Doorgaan?' : 'Spel starten? De route wordt geschud en alle telefoons gaan naar de eerste stop.', () => sync.regie.start(), '▶ Gestart');
    case 'reset': return confirmAnd('Spel terugzetten naar de lobby? Voortgang, posities en badges gaan weg (het logboek blijft).', () => sync.regie.reset(true), '↺ Teruggezet');
    case 'skip': return busy(() => sync.regie.event('gps.skip', { stop_id: act?.id }), '📡 GPS overgeslagen: de telefoons komen nu aan');
    case 'hint': if (await busy(() => sync.regie.hint(ui.hint.trim() || null), '💡 Hint gegeven')) { ui.hint = ''; renderPanel(); } return;
    case 'approve': return confirmAnd(`Stop "${act?.name}" goedkeuren met ${ui.drops} druppels?`, () => sync.regie.approveStop(+ui.drops || 0), '✅ Goedgekeurd');
    case 'energy': return busy(() => sync.regie.event('energy', { level: +b.dataset.n }), 'Energie gezet');
    case 'deal': { const keys = Object.keys(TALENTS).sort(() => Math.random() - .5), talents = {}; players().forEach((p, i) => talents[p.id] = keys[i % keys.length]);
      return confirmAnd('Talenten opnieuw loten voor alle speurders?', () => sync.regie.event('roles.shuffle', { talents }), '🎲 Talenten verdeeld'); }
    case 'planb': { const d = ui.planb || devices()[0]?.id; return confirmAnd('Plan B: de app verdeelt de talenten van de uitgevallen telefoon opnieuw. Doorgaan?', () => sync.regie.event('plan_b', { dropped_device: d }), '🪫 Plan B gestuurd'); }
    case 'force': { const phase = $('#phasesel').value, idx = +$('#actsel').value; return confirmAnd(`Fase op "${PHASES[phase]}" en actieve stop op ${isNaN(idx) ? '(ongewijzigd)' : idx + 1} zetten?`, () => sync.regie.patchGame({ phase, ...(isNaN(idx) ? {} : { active_index: idx }) }), 'Gezet'); }
    case 'bonus-in': return bonusIn(BONUS.find(x => x.id === b.dataset.b));
    case 'bonus-out': return bonusOut(BONUS.find(x => x.id === b.dataset.b));
    case 'bonus-call': { const x = BONUS.find(y => y.id === b.dataset.b), kh = players().find(p => p.talent === 'sleutelbewaarder') || players()[0]; if (!kh) return;
      return busy(() => sync.regie.event('monster.call', { player_id: kh.id, message_id: uid(), text: `Bzzzt! Bonusklus, speurders. ${x.clue} ${x.puzzle.question} Over!` }), `📞 Mecha-Pof belt met ${x.id}; vink af met "Stop goedkeuren" of gewoon doorlopen`); }
    case 'wake': return busy(() => sync.regie.event('monster.say', { text: WEKZIN, mood: 'wakker', wake: true, kern: true }), '⏻ Mecha-Pof wordt wakker');
    case 'uitleg': return busy(() => sync.regie.event('monster.say', { text: 'Speluitleg! Volg mijn signaal, luister naar de radio, los samen de puzzel op, en blijf bij elkaar.', kern: true, uitleg: true }), '📋 Speluitleg gestart');
    case 'loting': return confirmAnd(lotingVast() ? 'Loting starten? De talenten zijn al verdeeld (zoals op de passen); het kernscherm onthult ze met de animatie.' : 'Loting starten? De talenten worden live geloot op het kernscherm (de jarige vast op Sleutelbewaarder).', () => sync.regie.event('roles.shuffle', { talents: lotingTalents(), loting: true }), '🎰 Loting gestart');
    case 'quick': ui.say = b.dataset.s; renderPanel(); return;
    case 'say': { const text = ui.say.trim(); if (!text) return toast('Typ eerst wat hij moet zeggen.'); if (await busy(() => sync.regie.event('monster.say', { text, ...(ui.mood ? { mood: ui.mood } : {}) }), '🗣️ Gestuurd')) { ui.say = ''; renderPanel(); } return; }
    case 'call': { if (!ui.call) return; const p = { player_id: ui.call, message_id: uid() }; if (ui.callText.trim()) p.text = ui.callText.trim(); return busy(() => sync.regie.event('monster.call', p), `📞 ${playerName(ui.call)} wordt gebeld`); }
    case 'thief.start': { const part = ui.thiefPart || (g?.parts || [])[0]; if (!part) return; return busy(() => sync.regie.event('thief.start', { part, points: thiefPoints() }), '🍪 De Kruimelaar is los'); }
    case 'thief.jump': { const i = +(eventsAfter('thief.jump', g.surprise.started_at)[0]?.payload?.i ?? 0) + 1; return busy(() => sync.regie.event('thief.jump', { i }), `⏭ Punt ${i + 1}`); }
    case 'thief.caught': return busy(() => sync.regie.event('thief.caught', {}), '🫳 Gevangen!');
    case 'thief.end': return busy(() => sync.regie.event('thief.end', {}), 'Kruimelaar afgebroken');
    case 'storm.start': return busy(() => sync.regie.event('storm.start', { seconds: +ui.storm || 30 }), '⚡ Kortsluiting!');
    case 'storm.end': { const total = eventsAfter('storm.score', g.surprise.started_at).reduce((n, e) => n + (+e.payload?.n || 0), 0); return busy(() => sync.regie.event('storm.end', { total }), `Kortsluiting voorbij: ${total} vonken`); }
    case 'fork.open': { if (!ui.forkA.trim() || !ui.forkB.trim()) return toast('Vul allebei de keuzes in.'); return busy(() => sync.regie.event('fork.open', { a: ui.forkA.trim(), b: ui.forkB.trim() }), '📡 Dubbel signaal open'); }
    case 'fork.result': return busy(() => sync.regie.event('fork.result', { choice: b.dataset.c }), 'Keuze ' + b.dataset.c.toUpperCase());
    case 'finale.timer': { const mins = Math.max(1, +ui.timerMin || 5); return busy(() => sync.regie.event('finale.timer', { seconds: mins * 60 }), `🔥 Timer ${mins} min gestart`); }
    case 'timer.stop': return busy(() => sync.regie.patchGame({ surprise: null }), 'Timer gestopt');
    case 'wish': return confirmAnd(`Verjaardagswens inzetten voor "${ui.wish}"?`, () => sync.regie.event('wish.used', { for: ui.wish }), '🎂 Wens ingezet');
    case 'editplayer': return editPlayer(b.dataset.id);
    case 'addplayer': return editPlayer(null);
    case 'copycodes': { const t = players().map(p => `${p.name}: ${p.code || '????'}`).join('\n'); try { await navigator.clipboard.writeText(t); toast('Codes gekopieerd'); } catch { prompt('Codes', t); } return; }
    case 'editstop': return editStop(b.dataset.id);
    case 'pickstop': return pickOnMap(stops().find(s => s.id === b.dataset.id), async ll => { const st = stops().find(s => s.id === b.dataset.id); await busy(() => sync.regie.upsertStop(stopPayload({ ...st, lat: ll.lat, lng: ll.lng })), `📍 ${st.name} verplaatst`); });
    case 'addstop': return editStop(null);
  }
});
function thiefPoints() { // vier punten in een kring rond de groep (of de actieve stop), 70–140 m
  const live = devices().filter(d => d.lat != null && d.online), act = activeStop();
  const c = live.length ? { lat: live.reduce((s, d) => s + d.lat, 0) / live.length, lng: live.reduce((s, d) => s + d.lng, 0) / live.length } : act || stops()[0];
  if (!c) return [];
  const a0 = Math.random() * Math.PI * 2, out = [];
  for (let i = 0; i < 4; i++) { const a = a0 + i * Math.PI / 2 + (Math.random() - .5) * .6, r = 70 + Math.random() * 70;
    out.push({ lat: +(c.lat + (r * Math.cos(a)) / 111320).toFixed(6), lng: +(c.lng + (r * Math.sin(a)) / (111320 * Math.cos(c.lat * Math.PI / 180))).toFixed(6) }); }
  return out;
}

/* ================================================================ overlays: speler en stop bewerken */
function overlay(html) { closeOverlay(); const o = document.createElement('div'); o.className = 'overlay'; o.id = 'ov'; o.innerHTML = html; document.body.appendChild(o); o.addEventListener('click', e => { if (e.target === o) closeOverlay(); }); return o; }
function closeOverlay() { $('#ov')?.remove(); }
const opts = (list, cur, label = x => x) => list.map(v => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label(v))}</option>`).join('');

function editPlayer(id) {
  const p = id ? players().find(x => x.id === id) : { id: null, name: '', is_birthday: false, part: '', talent: '', color: '', code: '', mission: '', mission_done: false };
  if (!p) return;
  const o = overlay(`<div class="page"><span class="tab">${id ? 'Speurder bewerken' : 'Nieuwe speurder'}</span>
    <form class="stack" autocomplete="off">
      <div class="grid2"><label>Naam<input name="name" value="${esc(p.name)}" required></label><label>Code (4 cijfers)<input name="code" value="${esc(p.code || '')}" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="${id ? '' : 'leeg = willekeurig'}"></label></div>
      <div class="grid2"><label>Monsterdeel<select name="part"><option value="">— geen —</option>${opts(Object.keys(PARTS), p.part || '', k => PARTS[k].icon + ' ' + PARTS[k].label)}</select></label>
        <label>Talent<select name="talent"><option value="">— geen —</option>${opts(Object.keys(TALENTS), p.talent || '', k => TALENTS[k].label)}</select></label></div>
      <div class="grid2"><label>Kleur<input type="color" name="color" value="${esc(colorOf(p))}"></label><label class="inline" style="align-self:end"><input type="checkbox" name="is_birthday" ${p.is_birthday ? 'checked' : ''}> Dit is de jarige</label></div>
      <label>Geheime missie (verschijnt 10 s bij het inloggen)<textarea name="mission">${esc(p.mission || '')}</textarea></label>
      <label class="inline"><input type="checkbox" name="mission_done" ${p.mission_done ? 'checked' : ''}> Missie volbracht</label>
      ${id ? `<p class="note">Badges: ${p.badges?.length ? p.badges.map(esc).join(', ') : 'nog geen'} · toestel ${p.device_id ? p.device_id.slice(0, 8) : '—'} · laatst gezien ${ago(p.last_seen_at)} geleden</p>` : ''}
      <p class="feedback" id="pfb"></p>
      <div class="row"><button class="ok grow" type="submit">Opslaan</button><button class="ghost" type="button" data-x="cancel">Annuleer</button></div>
    </form></div>`);
  $('[data-x=cancel]', o).onclick = closeOverlay;
  $('form', o).onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    const code = String(f.get('code') || '').trim(); if (code && !/^\d{4}$/.test(code)) { $('#pfb', o).textContent = 'De code is vier cijfers.'; return; }
    if (code && players().some(x => x.id !== p.id && x.code === code)) { $('#pfb', o).textContent = 'Die code heeft een andere speurder al.'; return; }
    const payload = { ...(p.id ? { id: p.id } : {}), name: String(f.get('name')).trim(), is_birthday: f.get('is_birthday') === 'on', part: f.get('part') || null, talent: f.get('talent') || null, color: f.get('color'), mission: String(f.get('mission') || ''), mission_done: f.get('mission_done') === 'on' };
    if (code) payload.code = code;
    if (await busy(() => sync.regie.setPlayer(payload), `✓ ${payload.name} opgeslagen`)) closeOverlay();
  };
}

function stopPayload(st) { // regie_upsert_stop overschrijft alles: stuur de hele stop mee (incl. geheim)
  return { id: st.id, seq: +st.seq || 0, key: st.key || '', name: st.name || '', clue: st.clue || '', lat: +(+st.lat).toFixed(7), lng: +(+st.lng).toFixed(7), radius: st.radius ? +st.radius : null, part: st.part || '', puzzles: st.puzzles || [], geheim: st.geheim || {} };
}
function editStop(id) {
  const all = stops(), existing = id ? all.find(x => x.id === id) : null;
  const home = all.find(s => s.key === 'home') || all[0];
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : { id: null, seq: Math.max(0, ...all.filter(s => s.key !== 'home').map(s => s.seq)) + 1, key: '', name: '', clue: '', lat: home?.lat || 51.6168, lng: home?.lng || 5.5622, radius: null, part: Object.keys(PARTS).find(k => !all.some(s => s.part === k)) || '', puzzles: [{ type: 'vraag', question: '', answer: '', hint: '' }], geheim: {} };
  const o = overlay(`<div class="page wide"><span class="tab">${existing ? 'Stop bewerken' : 'Nieuwe stop'}</span><div id="stopform"></div></div>`);
  const host = $('#stopform', o);
  const puzzleForm = (pz, i) => `<div class="puz" data-i="${i}"><div class="row"><h3 class="grow">Puzzel ${i + 1}${draft.puzzles.length > 1 ? (i === 0 ? ' (1 telefoon)' : ' (variant)') : ''}</h3>${draft.puzzles.length > 1 ? `<button type="button" class="ghost sm" data-pz="del" data-i="${i}">weg</button>` : ''}</div>
      <div class="grid2"><label>Type<select data-pz="type" data-i="${i}">${opts(PUZZLE_TYPES, pz.type || 'vraag')}</select></label>
        ${pz.type === 'memory' ? `<label>Aantal paren (3–8)<input type="number" min="3" max="8" data-pz="pairs" data-i="${i}" value="${pz.pairs || 6}"></label>` : pz.type === 'qr' || pz.type === 'slot' ? `<label>Wachtwoord / code<input data-pz="answer" data-i="${i}" value="${esc(pz.answer || '')}"></label>` : ''}</div>
      <label>${['memory', 'schuif', 'licht', 'formatie', 'sync'].includes(pz.type) ? 'Tekst boven het spel' : 'Vraag of opdracht'}<textarea data-pz="question" data-i="${i}" style="min-height:56px">${esc(pz.question || '')}</textarea></label>
      ${pz.type === 'keuze' ? `<label>Keuzes (één per regel)<textarea data-pz="options" data-i="${i}" style="min-height:56px">${esc((pz.options || []).join('\n'))}</textarea></label>` : ''}
      ${['vraag', 'code', 'keuze', 'splits'].includes(pz.type) ? `<label>Goede antwoord${pz.type === 'vraag' ? ' (meerdere mogen, gescheiden door |)' : ''}<input data-pz="answer" data-i="${i}" value="${esc(pz.answer || '')}"></label>` : ''}
      ${['opdracht', 'schuif', 'memory', 'licht', 'formatie', 'sync', 'qr'].includes(pz.type) ? '' : `<label>Hint<input data-pz="hint" data-i="${i}" value="${esc(pz.hint || '')}"></label>`}
      ${pz.image != null ? `<label>Foto-URL<input data-pz="image" data-i="${i}" value="${esc(pz.image || '')}"></label>` : ''}
    </div>`;
  const draw = () => {
    host.innerHTML = `<form class="stack" autocomplete="off">
      <div class="grid2"><label>Naam<input name="name" value="${esc(draft.name)}" required></label>
        <label>Soort<select name="key"><option value="" ${!draft.key ? 'selected' : ''}>tussenstop</option><option value="start" ${draft.key === 'start' ? 'selected' : ''}>start (eerste)</option><option value="home" ${draft.key === 'home' ? 'selected' : ''}>thuis (laatste)</option></select></label></div>
      <label>Aanwijzing (wat de kinderen lezen om de plek te vinden)<textarea name="clue">${esc(draft.clue)}</textarea></label>
      <div class="grid3"><label>Breedtegraad<input name="lat" inputmode="decimal" value="${draft.lat}"></label><label>Lengtegraad<input name="lng" inputmode="decimal" value="${draft.lng}"></label><label>Straal (m, leeg = standaard ${game()?.settings?.radius || 20})<input name="radius" type="number" min="5" value="${draft.radius || ''}"></label></div>
      <div class="row"><button type="button" class="led sm" data-x="pick">🗺️ Kies op kaart</button><button type="button" class="plain sm" data-x="here">📍 Mijn locatie</button><span class="note" id="locnote"></span></div>
      <div class="grid2"><label>Monsterdeel<select name="part"><option value="">— geen —</option>${opts(Object.keys(PARTS), draft.part || '', k => PARTS[k].icon + ' ' + PARTS[k].label)}</select></label><label>Volgnummer (seq)<input name="seq" type="number" value="${draft.seq}"></label></div>
      <div class="stack" id="puzzles">${draft.puzzles.map(puzzleForm).join('')}</div>
      <div class="row"><button type="button" class="plain sm" data-x="addpz">+ Variant voor meer telefoons</button></div>
      <details class="adv"><summary>Geavanceerd: puzzels als JSON en stop-geheim</summary>
        <div class="stack" style="margin-top:8px"><label>puzzles (JSON)<textarea class="mono" name="puzzles_json" style="min-height:110px">${esc(JSON.stringify(draft.puzzles, null, 1))}</textarea></label>
        <label>geheim (JSON, alleen leesbaar voor de regie; bijv. QR-code)<textarea class="mono" name="geheim_json">${esc(JSON.stringify(draft.geheim || {}, null, 1))}</textarea></label></div></details>
      <p class="feedback" id="sfb"></p>
      <div class="row"><button class="ok grow" type="submit">Opslaan</button>${existing ? `<button type="button" class="danger sm" data-x="del">Verwijderen</button>` : ''}<button class="ghost" type="button" data-x="cancel">Annuleer</button></div>
    </form>`;
  };
  const readForm = () => { // formulier → draft (JSON-velden winnen als ze zijn aangepast)
    const f = new FormData($('form', host));
    draft.name = String(f.get('name')).trim(); draft.key = f.get('key'); draft.clue = String(f.get('clue')); draft.part = f.get('part'); draft.seq = +f.get('seq') || 0;
    draft.lat = parseFloat(String(f.get('lat')).replace(',', '.')); draft.lng = parseFloat(String(f.get('lng')).replace(',', '.')); draft.radius = f.get('radius') ? +f.get('radius') : null;
    const pj = $('[name=puzzles_json]', host), gj = $('[name=geheim_json]', host);
    if (pj.dataset.dirty) draft.puzzles = JSON.parse(pj.value); if (gj.dataset.dirty) draft.geheim = JSON.parse(gj.value);
  };
  draw();
  host.addEventListener('input', e => {
    const t = e.target;
    if (t.name === 'puzzles_json' || t.name === 'geheim_json') { t.dataset.dirty = '1'; return; }
    if (t.dataset.pz) { const i = +t.dataset.i, pz = draft.puzzles[i]; if (!pz) return;
      if (t.dataset.pz === 'options') pz.options = t.value.split('\n').map(s => s.trim()).filter(Boolean); else if (t.dataset.pz === 'pairs') pz.pairs = +t.value; else pz[t.dataset.pz] = t.value;
      if (t.dataset.pz === 'type') { if (pz.type === 'keuze' && !pz.options) pz.options = []; try { readForm(); } catch {} draw(); } else $('[name=puzzles_json]', host).value = JSON.stringify(draft.puzzles, null, 1); }
  });
  host.addEventListener('click', async e => {
    const x = e.target.closest('[data-x]')?.dataset.x, pzb = e.target.closest('[data-pz=del]');
    if (pzb) { try { readForm(); } catch {} draft.puzzles.splice(+pzb.dataset.i, 1); draw(); return; }
    if (x === 'cancel') closeOverlay();
    else if (x === 'addpz') { try { readForm(); } catch {} draft.puzzles.push({ ...(draft.puzzles[0] || { type: 'vraag' }), question: draft.puzzles[0]?.question || '' }); draw(); }
    else if (x === 'pick') { try { readForm(); } catch {} pickOnMap(draft, ll => { draft.lat = ll.lat; draft.lng = ll.lng; draw(); $('#locnote', host).textContent = 'Plek gekozen op de kaart.'; }, true); }
    else if (x === 'here') { $('#locnote', host).textContent = 'Zoeken…'; try { const c = await gpsOnce(); draft.lat = +c.latitude.toFixed(7); draft.lng = +c.longitude.toFixed(7); $('[name=lat]', host).value = draft.lat; $('[name=lng]', host).value = draft.lng; $('#locnote', host).textContent = `Vastgelegd (±${Math.round(c.accuracy)} m)`; } catch (err) { $('#locnote', host).textContent = err.message; } }
    else if (x === 'del') { if (confirm(`Stop "${draft.name}" verwijderen? Dit kan niet ongedaan worden.`) && await busy(() => sync.regie.deleteStop(draft.id), 'Stop verwijderd')) closeOverlay(); }
  });
  host.addEventListener('submit', async e => {
    e.preventDefault();
    try { readForm(); } catch (err) { $('#sfb', host).textContent = 'De JSON klopt niet: ' + err.message; return; }
    if (isNaN(draft.lat) || isNaN(draft.lng)) { $('#sfb', host).textContent = 'Vul een geldige breedte- en lengtegraad in.'; return; }
    if (draft.key && all.some(s => s.id !== draft.id && s.key === draft.key)) { $('#sfb', host).textContent = `Er is al een stop met soort "${draft.key}". Zet die eerst op tussenstop.`; return; }
    const running = game()?.phase && !['lobby', 'klaar'].includes(game().phase);
    if (running && !confirm('Het spel loopt. De telefoons zien de wijziging meteen. Opslaan?')) return;
    if (await busy(() => sync.regie.upsertStop(stopPayload(draft)), `✓ ${draft.name} opgeslagen`)) closeOverlay();
  });
}
function gpsOnce() {
  return new Promise((res, rej) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => res(p.coords), e => rej(new Error(e.code === 1 ? 'Locatie geweigerd in de browser' : 'Geen GPS-fix, probeer het buiten nog eens')), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }) : rej(new Error('Geen GPS op dit apparaat')));
}

/* ---------- kaartkiezer: tik om de stip te zetten (ook te slepen) */
function pickOnMap(st, onPick, nested = false) {
  if (!hasL) return toast('Geen kaart beschikbaar.');
  const prev = nested ? $('#ov') : null; if (prev) prev.style.display = 'none';
  const ov = document.createElement('div'); ov.className = 'overlay'; ov.id = 'pickov';
  ov.innerHTML = `<div class="page wide"><span class="tab">Plek kiezen · ${esc(st.name || 'nieuwe stop')}</span>
    <p class="note">Tik op de kaart of sleep de rode speld. De andere stops staan er ter oriëntatie bij.</p>
    <div id="pickmap" class="pickmap"></div>
    <div class="row"><span class="note grow" id="pickll"></span><button class="plain sm" id="pickhere">📍 Mijn locatie</button></div>
    <div class="row"><button class="ok grow" id="pickok">Gebruik dit punt</button><button class="ghost" id="pickcancel">Annuleer</button></div></div>`;
  document.body.appendChild(ov);
  const pm = L.map($('#pickmap', ov), { zoomControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(pm);
  pm.setView([st.lat, st.lng], 17);
  for (const s of stops()) if (s.id !== st.id) L.marker([s.lat, s.lng], { interactive: false, icon: icon(`<div class="pin-stop ${s.key === 'home' ? 'home' : ''}">${stopLabel(s)}</div>`, 30) }).addTo(pm);
  const pin = L.marker([st.lat, st.lng], { draggable: true, icon: L.divIcon({ className: '', html: '<div class="pin-pick"></div>', iconSize: [34, 34], iconAnchor: [17, 34] }), zIndexOffset: 1000 }).addTo(pm);
  const show = () => { const ll = pin.getLatLng(); $('#pickll', ov).textContent = `${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`; }; show();
  pm.on('click', e => { pin.setLatLng(e.latlng); show(); }); pin.on('dragend', show);
  const close = () => { pm.remove(); ov.remove(); if (prev) prev.style.display = ''; };
  $('#pickcancel', ov).onclick = close;
  $('#pickhere', ov).onclick = async () => { try { const c = await gpsOnce(); pin.setLatLng([c.latitude, c.longitude]); pm.setView([c.latitude, c.longitude], 18); show(); } catch (err) { toast(err.message, 4000, true); } };
  $('#pickok', ov).onclick = async () => { const ll = pin.getLatLng(); close(); await onPick({ lat: +ll.lat.toFixed(7), lng: +ll.lng.toFixed(7) }); };
  setTimeout(() => pm.invalidateSize(), 60);
}

/* ================================================================ live meekijken en geluidjes */
let primed = false; const seen = new Set();
state.on('event', ev => {
  if (!ev || seen.has(ev.id)) return; seen.add(ev.id); if (!primed) return;
  if (ev.type === 'stop.arrived') beep([660, 880]); else if (ev.type === 'stop.solved') beep([659, 784, 988]); else if (ev.type === 'wish.used') beep([988, 1319]);
  else if (ev.type === 'monster.say' && ev.actor === 'player') { beep([523]); toast(`💬 ${playerName(ev.player_id)}: ${ev.payload?.text || ''}`, 6000); }
  else if (ev.type === 'fork.vote') beep([784]);
  if (ev.actor !== 'regie') schedule(loadRegie, 1500); // de volledige stand (incl. puzzle_states) bijhalen
});
let raf = 0;
state.on('change', () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (loggedIn) render(); else renderBar(); }); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && booted) { sync.reload().catch(() => {}); loadRegie(); } });

/* ================================================================ start */
async function boot() {
  render();
  try { await sync.connect(); for (const e of S().events) seen.add(e.id); primed = true; booted = true; }
  catch (e) { bootError = e.message || 'Geen verbinding'; render(); return; }
  const remembered = store.get(KEY_REMEMBER, null);
  if (sync.regie.restore()) { loggedIn = true; await loadRegie(); if (loggedIn) { clearInterval(regieTimer); regieTimer = setInterval(loadRegie, 60_000); tekeningAan(); } }
  else if (remembered) { try { await login(remembered, true); } catch { store.del(KEY_REMEMBER); } }
  render();
}
window.regie = { state, sync, R: () => R, render, loadRegie };
boot();
