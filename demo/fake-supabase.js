// demo/fake-supabase.js — nep-Supabase voor de demo (ouders, oefenen). Vervangt supabase-js via de import map in
// demo/index.html; js/sync.js en de rest van de app blijven ongewijzigd. Alles draait in deze browser en wordt bewaard in
// de afgeschermde demo-opslag (demo/prelude.js). Er gaat niets naar het echte spel.
// Gebaseerd op test/fake-supabase.mjs, plus: echte stops (demo/data.js), zes monteurs, bewaren bij herladen en een demopaneel
// (knop DEMO bovenin) dat de regie speelt: starten, aankomen, goedkeuren, verrassingen.
import { STOPS, PLAYERS, CODES, DEMO_V } from './data.js';

const now = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2, 10);
const DB_KEY = 'demo_db';
const fresh = () => ({
  v: DEMO_V,
  game: { id: 'demo-g', code: 'hannah10', title: 'Mecha-Pof (demo)', phase: 'lobby', stop_order: [], active_index: 0, parts: [], drops: 0, hints: 0,
    energy: null, wish_used: false, surprise: null, settings: { radius: 20, min_gap: 150, any_can_submit: true }, started_at: null, finished_at: null },
  player: PLAYERS.map(p => ({ game_id: 'demo-g', badges: [], device_id: null, last_seen_at: null, lat: null, lng: null, acc: null, color: null, ...p })),
  stop: STOPS.map(s => ({ game_id: 'demo-g', ...s })),
  puzzle_state: [],
  event: [],
});
let db;
try { db = JSON.parse(localStorage.getItem(DB_KEY) || 'null'); } catch { db = null; }
if (!db || db.v !== DEMO_V) db = fresh();
let saveT = null;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(DB_KEY, JSON.stringify({ ...db, event: db.event.slice(0, 200) })); } catch {} }, 150); };
let lastPos = null;

// ---------------------------------------------------------------- "realtime"
const listeners = []; let presenceCb = null, deviceId = null, ownBusy = null;
function emit(table, row, eventType = 'INSERT') { save(); for (const fn of listeners) { try { fn({ table, eventType, new: row, old: row }); } catch (e) { console.warn('[demo]', e); } } panel.render(); }
function logEvent(type, actor, player_id, payload = {}) { const e = { id: uid(), game_id: db.game.id, at: now(), type, actor, player_id, payload }; db.event.unshift(e); emit('event', e); return e; }
function patchGame(patch) { db.game = { ...db.game, ...patch }; emit('game', db.game, 'UPDATE'); return db.game; }
const activeStopId = () => db.game.stop_order[db.game.active_index];
const stopById = id => db.stop.find(s => s.id === id);

function arriveStop(stopId, pid) {
  let ps = db.puzzle_state.find(x => x.stop_id === stopId);
  if (!ps) {
    ps = { id: uid(), game_id: db.game.id, stop_id: stopId, variant: 0, seed: 1 + Math.floor(Math.random() * 9999), moves: [], hints: 0, arrived_at: now(), solved_at: null, solved_by: null, updated_at: now() };
    db.puzzle_state.push(ps);
    patchGame({ phase: stopById(stopId)?.key === 'home' ? 'finale' : 'puzzel' });
    logEvent('stop.arrived', pid ? 'player' : 'regie', pid || null, { stop_id: stopId });
  }
  return ps;
}
function finishStop(stopId, by, drops, actor) {
  const st = stopById(stopId), home = st?.key === 'home';
  const ps = db.puzzle_state.find(x => x.stop_id === stopId); if (ps) { ps.solved_at = now(); ps.solved_by = by; emit('puzzle_state', ps, 'UPDATE'); }
  const g = patchGame({ parts: st?.part && !db.game.parts.includes(st.part) ? [...db.game.parts, st.part] : db.game.parts, active_index: db.game.active_index + 1,
    phase: home ? 'klaar' : 'onderweg', drops: db.game.drops + (drops ?? 10), finished_at: home ? now() : null, ...(home && db.game.surprise?.kind === 'finale' ? { surprise: null } : {}) });
  logEvent('stop.solved', actor, by, { stop_id: stopId, part: st?.part ?? null, drops: drops ?? 10, by });
  return g;
}
const normCode = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Regie-gebeurtenis, zoals regie_event op de server (houdt game.surprise bij)
let stormT = null, forkT = null;
function regie(type, payload = {}) {
  if (['thief.start', 'storm.start', 'fork.open', 'finale.timer'].includes(type)) patchGame({ surprise: { kind: type.split('.')[0], started_at: now(), data: payload } });
  else if (['thief.caught', 'thief.end', 'storm.end', 'fork.result'].includes(type)) patchGame({ surprise: null });
  const e = logEvent(type, 'regie', null, payload);
  if (type === 'storm.start') { clearTimeout(stormT); stormT = setTimeout(() => { if (db.game.surprise?.kind !== 'storm') return;
    const since = db.game.surprise.started_at, total = db.event.filter(x => x.type === 'storm.score' && x.at >= since).reduce((n, x) => n + (+x.payload?.n || 0), 0);
    regie('storm.end', { total }); }, (payload.seconds || 30) * 1000 + 2500); }
  return e;
}

// ---------------------------------------------------------------- query-bouwer (from(t).select().eq().order().limit())
function query(table) {
  const f = []; let ord = null, lim = null;
  const run = () => {
    let rows = (table === 'game' ? [db.game] : db[table] || []).filter(r => f.every(([k, v]) => k === 'code' && table === 'game' ? true : String(r[k]) === String(v)));
    if (ord) rows = [...rows].sort((a, b) => (a[ord.k] > b[ord.k] ? 1 : a[ord.k] < b[ord.k] ? -1 : 0) * (ord.asc ? 1 : -1));
    if (lim != null) rows = rows.slice(0, lim);
    return JSON.parse(JSON.stringify(rows));
  };
  const o = {
    select: () => o, eq: (k, v) => { f.push([k, v]); return o; }, order: (k, opt = {}) => { ord = { k, asc: opt.ascending !== false }; return o; }, limit: n => { lim = n; return o; },
    maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
    then: (a, b) => Promise.resolve({ data: run(), error: null }).then(a, b),
  };
  return o;
}
const err = m => ({ data: null, error: { message: m, code: 'P0001' } });
const clone = x => JSON.parse(JSON.stringify(x));

async function rpc(name, args = {}) {
  const pid = args.p_code ? CODES[args.p_code] : null;
  const needsCode = ['login', 'arrive', 'puzzle_move', 'puzzle_hint', 'complete_stop', 'award_badge', 'log_event'];
  if (needsCode.includes(name) && !pid) return err('Onbekende code');
  switch (name) {
    case 'login': { deviceId = args.p_device; const pl = db.player.find(p => p.id === pid);
      const op = db.player.filter(p => p.device_id === deviceId && p.id !== pid);
      if (op.length >= 2) return err('Op deze telefoon zijn al twee monteurs ingelogd');
      pl.device_id = deviceId; pl.last_seen_at = now(); emit('player', pl, 'UPDATE'); presenceCb?.();
      return { data: { player: clone(pl), mission: null, mission_first_time: false }, error: null }; }
    case 'heartbeat': { for (const c of args.p_codes || []) { const pl = db.player.find(p => p.id === CODES[c]); if (pl) pl.last_seen_at = now(); }
      if (args.p_lat != null) lastPos = { lat: args.p_lat, lng: args.p_lng }; save(); return { data: null, error: null }; }
    case 'arrive': return { data: clone(arriveStop(args.p_stop, pid)), error: null };
    case 'puzzle_move': { const ps = db.puzzle_state.find(x => x.stop_id === args.p_stop); if (!ps) return err('Nog niet bij deze plek');
      let mv = { ...args.p_move }; delete mv.by; delete mv.at; delete mv.ok;
      if (mv.t === 'scan') { const want = stopById(args.p_stop)?.geheim?.qr; if (!want) mv.ok = null; else { const good = [].concat(want).some(w => normCode(w) && normCode(w) === normCode(mv.v)); if (good) { delete mv.v; mv.ok = true; } else mv.ok = false; } }
      ps.moves = [...ps.moves, { ...mv, by: pid, at: now() }]; ps.updated_at = now(); emit('puzzle_state', ps, 'UPDATE'); return { data: clone(ps), error: null }; }
    case 'puzzle_hint': { const ps = db.puzzle_state.find(x => x.stop_id === args.p_stop); if (!ps) return err('Nog niet bij deze plek');
      ps.hints = (ps.hints || 0) + 1; ps.updated_at = now(); emit('puzzle_state', ps, 'UPDATE'); patchGame({ hints: (db.game.hints || 0) + 1 }); logEvent('hint.used', 'player', pid, { stop_id: args.p_stop });
      return { data: clone(ps), error: null }; }
    case 'complete_stop': { if (args.p_stop !== activeStopId()) return err('Dit is niet de actieve plek');
      return { data: clone(finishStop(args.p_stop, pid, args.p_drops, 'player')), error: null }; }
    case 'award_badge': { const t = db.player.find(p => p.id === args.p_player); if (t && !t.badges.includes(args.p_badge)) { t.badges = [...t.badges, args.p_badge]; emit('player', t, 'UPDATE'); logEvent('badge.awarded', 'player', pid, { player_id: args.p_player, badge: args.p_badge }); }
      return { data: clone(t), error: null }; }
    case 'log_event': {
      if (args.p_type === 'wish.used') { if (db.game.wish_used) return err('De Verjaardagswens is al gebruikt'); patchGame({ wish_used: true }); }
      const e = logEvent(args.p_type, 'player', pid, args.p_payload || {});
      if (args.p_type === 'fork.vote' && db.game.surprise?.kind === 'fork') { clearTimeout(forkT); const choice = args.p_payload?.choice === 'b' ? 'b' : 'a'; forkT = setTimeout(() => { if (db.game.surprise?.kind === 'fork') regie('fork.result', { choice }); }, 2500); }
      if (args.p_type === 'thief.caught' && db.game.surprise?.kind === 'thief') patchGame({ surprise: null });
      return { data: e, error: null }; }
    case 'regie_check': return err('Het regiescherm hoort niet bij de demo; gebruik de knop DEMO bovenin');
    default: console.info('[demo] rpc zonder nep-versie:', name); return { data: null, error: null };
  }
}

export function createClient() {
  return {
    from: t => query(t),
    rpc,
    channel() {
      const ch = { state: 'joined',
        on(kind, _f, cb) { if (kind === 'postgres_changes') listeners.push(cb); if (kind === 'presence') presenceCb = cb; return ch; },
        subscribe(cb) { setTimeout(() => cb('SUBSCRIBED'), 0); return ch; },
        async track(meta) { if (meta?.device_id) deviceId = meta.device_id; ownBusy = meta?.busy || null; setTimeout(() => presenceCb?.(), 0); },
        presenceState() { if (!deviceId) return {}; return { [deviceId]: [{ device_id: deviceId, players: db.player.filter(p => p.device_id === deviceId).map(p => p.id), at: now(), ...(ownBusy ? { busy: ownBusy } : {}) }] }; },
      };
      return ch;
    },
    async removeChannel() {},
  };
}
export default { createClient };

// ---------------------------------------------------------------- demopaneel (speelt de regie)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function spiek(st) { // antwoord van de actieve plek, zodat je thuis kunt oefenen
  const p = st?.puzzles?.[0]; if (!p) return '';
  switch (p.type) {
    case 'code': case 'vraag': case 'splits': return 'Antwoord: <b>' + esc(String(p.answer).split('|')[0]) + '</b>';
    case 'slot': return 'Schijven: <b>' + esc((p.dials || []).map(d => d.answer).join(' · ')) + '</b>';
    case 'wachtwoord': return 'Wachtwoord: <b>' + esc(String(p.password || p.answer).split('|')[0]) + '</b> (zeg je via de walkie; in de demo: ✅ goedkeuren)';
    case 'qr': return 'Code om te typen: <b>' + esc([].concat(st.geheim?.qr || '')[0]) + '</b>';
    case 'formatie': return 'Driehoek met drie telefoons, kan alleen buiten: ✅ goedkeuren';
    case 'licht': return 'Bouw de kleuren na die knipperen';
    case 'sync': return 'Tik precies in de groene zone op <b>BOTER</b>';
    case 'keuze': return 'Antwoord: <b>' + esc(p.answer) + '</b>';
    default: return '';
  }
}
const PHASE = { lobby: 'Nog niet begonnen', onderweg: 'Onderweg naar', puzzel: 'Puzzel bij', finale: 'Finale bij', klaar: 'Klaar: Mecha-Pof is compleet' };
const panel = (() => {
  let open = false, root = null, pill = null;
  const css = `
  #demo-pill{position:fixed;right:0;top:42%;z-index:100000;background:#7C5CFF;color:#fff;font:900 11px/1 system-ui,sans-serif;letter-spacing:.2em;writing-mode:vertical-rl;padding:12px 7px;border-radius:12px 0 0 12px;border:0;box-shadow:0 2px 8px rgba(0,0,0,.45);cursor:pointer}
  #demo-panel{position:fixed;inset:auto 0 0 0;z-index:100001;max-height:86vh;overflow:auto;background:#1B2232;color:#EEF2FA;font:600 15px/1.35 system-ui,sans-serif;border-radius:18px 18px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.6);padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px))}
  #demo-panel h3{margin:0 0 4px;font:900 18px/1.2 system-ui,sans-serif}
  #demo-panel p{margin:6px 0;color:#C9D3E0}
  #demo-panel .st{background:#11161F;border-radius:12px;padding:10px 12px;margin:10px 0}
  #demo-panel .g{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}
  #demo-panel button{font:800 14px/1.2 system-ui,sans-serif;color:#fff;background:#2F3A52;border:0;border-radius:12px;min-height:46px;padding:8px 10px;cursor:pointer}
  #demo-panel button.main{grid-column:1/-1;background:#7C5CFF;min-height:52px;font-size:16px}
  #demo-panel button:disabled{opacity:.45}
  #demo-panel .k{font:900 11px/1 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#8C97AE;margin-top:12px}
  #demo-panel label{display:flex;gap:10px;align-items:center;margin:8px 0}
  #demo-panel .x{position:absolute;right:10px;top:10px;min-height:36px;width:36px;padding:0;background:#11161F}
  #demo-panel small{color:#8C97AE}`;
  function me() { return db.player.filter(p => p.device_id && p.device_id === deviceId); }
  function html() {
    const g = db.game, st = stopById(activeStopId()), mine = me(), n = db.game.stop_order.length;
    const live = window.__demo?.liveWalkie?.(), party = window.__demo?.partyNow?.();
    const sp = g.surprise?.kind;
    let main = '';
    if (!mine.length) main = `<button class="main" data-d="login">🪪 Log in als ${esc(PLAYERS[0].name)} (jarige)</button>`;
    else if (g.phase === 'lobby') main = '<button class="main" data-d="start">▶ Start de tocht</button>';
    else if (g.phase === 'onderweg' && st) main = '<button class="main" data-d="arrive">🛸 We zijn er (plek gaat open)</button>';
    else if ((g.phase === 'puzzel' || g.phase === 'finale') && st) main = '<button class="main" data-d="approve">✅ Plek goedkeuren (overslaan)</button>';
    else if (g.phase === 'klaar') main = '<button class="main" data-d="reset">↺ Nog een keer</button>';
    return `<button class="x" data-d="close" aria-label="Sluiten">✕</button>
      <h3>Demo · Mecha-Pof</h3>
      <p>Oefenversie die alleen op deze telefoon draait. Er gaat niets naar het echte spel. GPS staat uit: je hoeft niet te lopen.</p>
      <div class="st"><b>${esc(PHASE[g.phase] || g.phase)}${st && g.phase !== 'lobby' && g.phase !== 'klaar' ? ' ' + esc(st.name) : ''}</b>
        ${n && g.phase !== 'lobby' ? `<br><small>Plek ${Math.min(g.active_index + 1, n)} van ${n} · ${g.parts.length} van 7 onderdelen · ${g.drops} stroopdruppels</small>` : ''}
        ${st && (g.phase === 'puzzel' || g.phase === 'finale') ? `<p>Spiekbriefje: ${spiek(st)}</p>` : ''}
        ${mine.length ? `<br><small>Ingelogd: ${esc(mine.map(p => p.name).join(' & '))}</small>` : '<p>Je kunt ook zelf een code intikken: ' + Object.entries(CODES).map(([c, id]) => esc(PLAYERS.find(p => p.id === id)?.name) + ' ' + c).join(', ') + '.</p>'}</div>
      <div class="g">${main}</div>
      ${mine.length && g.phase !== 'lobby' && g.phase !== 'klaar' ? `<div class="k">Verrassingen (doet normaal de begeleider)</div>
      <div class="g">
        <button data-d="call">📞 Mecha-Pof belt</button>
        <button data-d="storm" ${sp ? 'disabled' : ''}>⚡ Kortsluiting</button>
        <button data-d="fork" ${sp ? 'disabled' : ''}>📡 Dubbel signaal</button>
        <button data-d="timer" ${sp ? 'disabled' : ''}>🔥 Jetpack-timer</button>
        <button data-d="thief" ${sp ? 'disabled' : ''}>🍪 Kruimelaar</button>
        <button data-d="stopsp" ${sp ? '' : 'disabled'}>⏹ Verrassing stoppen</button>
      </div>` : ''}
      <div class="k">Instellingen</div>
      <label><input type="checkbox" data-d="live" ${live ? 'checked' : ''} ${party ? 'disabled' : ''}> Live walkie met Mecha-Pof${party ? ' <small>(niet tijdens het feest)</small>' : ' <small>(gebruikt ElevenLabs-tegoed)</small>'}</label>
      <div class="g"><button data-d="reset">↺ Opnieuw beginnen</button><button data-d="close">Verder spelen</button></div>`;
  }
  function render() { if (!root || !open) return; root.innerHTML = html(); }
  function show(v) { open = v; if (!root) return; root.hidden = !v; render(); }
  function act(a, el) {
    const mine = me(), pid = mine[0]?.id || null, g = db.game;
    switch (a) {
      case 'close': return show(false);
      case 'login': show(false); location.hash = 'm=' + Object.keys(CODES).find(c => CODES[c] === PLAYERS[0].id); return;
      case 'start': { const ord = [...db.stop].filter(s => s.part || s.key).sort((x, y) => x.seq - y.seq).map(s => s.id);
        db.puzzle_state = []; patchGame({ stop_order: ord, active_index: 0, phase: 'onderweg', parts: [], drops: 0, hints: 0, surprise: null, wish_used: false, started_at: now(), finished_at: null });
        logEvent('game.start', 'regie', null, { stop_order: ord }); return show(false); }
      case 'arrive': { const st = stopById(activeStopId()); if (st) { window.pkm?.sync?.setPos?.({ lat: st.lat, lng: st.lng, acc: 5 }); arriveStop(st.id, null); } return show(false); }
      case 'approve': { const id = activeStopId(); if (id) { if (!db.puzzle_state.find(x => x.stop_id === id)) arriveStop(id, null); finishStop(id, null, 10, 'regie'); } return show(false); }
      case 'call': { const who = mine.find(p => p.is_birthday) || mine[0]; if (who) regie('monster.call', { player_id: who.id, message_id: uid() }); return show(false); }
      case 'storm': regie('storm.start', { seconds: 20 }); return show(false);
      case 'fork': regie('fork.open', { a: 'Linksaf langs het water', b: 'Rechtsaf door het steegje' }); return show(false);
      case 'timer': regie('finale.timer', { seconds: 5 * 60 }); return show(false);
      case 'thief': { const st = stopById(activeStopId()) || db.stop[0], c = lastPos || { lat: st.lat, lng: st.lng }, part = g.parts[0] || 'lijf';
        const pts = [0, 1, 2, 3].map(i => { const ang = (i * 95 + 20) * Math.PI / 180, d = 70 + i * 22; return [c.lat + d / 111320 * Math.cos(ang), c.lng + d / (111320 * Math.cos(c.lat * Math.PI / 180)) * Math.sin(ang)]; });
        regie('thief.start', { part, points: pts }); return show(false); }
      case 'stopsp': { const k = g.surprise?.kind; if (k === 'thief') regie('thief.end'); else if (k === 'storm') { const since = g.surprise.started_at; regie('storm.end', { total: db.event.filter(x => x.type === 'storm.score' && x.at >= since).reduce((n, x) => n + (+x.payload?.n || 0), 0) }); }
        else if (k === 'fork') regie('fork.result', { choice: 'a' }); else if (k) patchGame({ surprise: null }); return render(); }
      case 'live': try { localStorage.setItem('demo_live_walkie', el.checked ? '1' : '0'); } catch {} return render();
      case 'reset': { if (!confirm('Demo opnieuw beginnen? Alles van deze demo op deze telefoon wordt gewist.')) return;
        try { const real = window.__demoRealStorage; const ks = []; for (let i = 0; i < real.length; i++) { const k = real.key(i); if (k?.startsWith('pkmdemo:')) ks.push(k); } ks.forEach(k => real.removeItem(k)); sessionStorage.clear(); } catch {}
        location.replace(location.pathname); return; }
    }
  }
  function mount() {
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    pill = document.createElement('button'); pill.id = 'demo-pill'; pill.textContent = 'DEMO'; pill.onclick = () => show(!open); document.body.appendChild(pill);
    root = document.createElement('div'); root.id = 'demo-panel'; root.hidden = true; document.body.appendChild(root);
    root.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (!b || b.tagName === 'INPUT') return; act(b.dataset.d, b); });
    root.addEventListener('change', e => { const b = e.target.closest('input[data-d]'); if (b) act(b.dataset.d, b); });
    if (!localStorage.getItem('demo_seen')) { try { localStorage.setItem('demo_seen', '1'); } catch {} setTimeout(() => show(true), 900); }
  }
  if (document.body) mount(); else addEventListener('DOMContentLoaded', mount);
  return { render, show };
})();
window.__demo = Object.assign(window.__demo || {}, { db: () => db, panel, rpc, regie });
