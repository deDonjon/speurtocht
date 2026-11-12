// sync.js — Supabase-client, login met code, Realtime-abonnementen, presence, offline-buffer en regie-functies.
// Zie CONTRACTS.md §4. Alleen dit bestand praat met de server en alleen dit bestand schrijft in `state`.
import { state } from './state.js';

export const SUPABASE_URL = 'https://lnhliamckstuwiwyzxyl.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_hoQWFp1gmy-qfG6IICNckw_ewEXmm_3'; // publishable key: mag openbaar
// Welk spel: 'hannah10' (het echte feest) of 'test' (supabase/testspel.sql). Kiezen met ?spel=test in de adresbalk; het toestel
// onthoudt de keuze tot ?spel=hannah10. Sessie, buffer en regiesleutel staan per spel apart, zodat testen het echte spel niet raakt.
const GAMES = ['hannah10', 'test'];
function pickGame() {
  try {
    const q = new URLSearchParams(location.search).get('spel');
    if (q && GAMES.includes(q)) { localStorage.setItem('pkm2_spel', q); return q; }
    const saved = localStorage.getItem('pkm2_spel'); if (GAMES.includes(saved)) return saved;
  } catch {}
  return 'hannah10';
}
export const GAME_CODE = typeof location !== 'undefined' ? pickGame() : 'hannah10';
export const IS_TEST = GAME_CODE !== 'hannah10';
if (IS_TEST && typeof document !== 'undefined') { // duidelijk merkteken op elk scherm
  const tag = () => { if (document.getElementById('pkm-testspel')) return; const d = document.createElement('div'); d.id = 'pkm-testspel'; d.textContent = 'TESTSPEL';
    d.title = 'Terug naar het echte spel: ?spel=hannah10';
    d.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 2px);transform:translateX(-50%);z-index:99999;pointer-events:none;background:#FF5A4E;color:#fff;font:900 10px/1 system-ui,sans-serif;letter-spacing:.18em;padding:3px 8px;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.4)';
    document.body.appendChild(d); };
  if (document.body) tag(); else addEventListener('DOMContentLoaded', tag);
}
const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SFX = IS_TEST ? '_' + GAME_CODE : '';
const SESSION_KEY = 'pkm2_session' + SFX, OUTBOX_KEY = 'pkm2_outbox' + SFX, REGIE_KEY = 'pkm2_regie' + SFX;
const HEARTBEAT_MS = 10_000, FLUSH_MS = 5_000, EVENTS_LOAD = 50;
// Alleen de spelerspagina (index.html) meldt bewakers aan in presence en stuurt de hartslag. Kern, regie en bord delen de
// sessie van de browser (localStorage) en zouden anders als extra "telefoon" meetellen en een rol (werkbank, radio) pakken.
const PLAYER_PAGE = typeof location === 'undefined' || !/\/(kern|regie|bord|scout|dans|qr-kaartje)\.html$/.test(location.pathname);

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let createClientFn = null, sb = null, channel = null, gameId = null;
let session = store.get(SESSION_KEY, { codes: {} }); // { codes: { playerId: code } }
let outbox = store.get(OUTBOX_KEY, []);               // [{ name, args, at }]
let hbTimer = null, flushTimer = null, regieKey = null;

/** Optioneel: eigen createClient (voor tests of node). Zonder aanroep wordt supabase-js van de CDN geladen. */
export function configure({ createClient } = {}) { if (createClient) createClientFn = createClient; }

async function client() {
  if (sb) return sb;
  if (!createClientFn) ({ createClient: createClientFn } = await import(SUPABASE_ESM));
  sb = createClientFn(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 20 } } });
  return sb;
}

// ---------------------------------------------------------------- RPC met nette fouten en buffer
class SyncError extends Error { constructor(msg, code, cause) { super(msg); this.code = code; this.cause = cause; } }
const isNetworkError = e => !e?.code && (e instanceof TypeError || /fetch|network|Failed|ECONN|timeout/i.test(e?.message || ''));

async function rpc(name, args, { buffer = false } = {}) {
  const c = await client();
  try {
    const { data, error } = await c.rpc(name, args);
    if (error) {
      if (isNetworkError(error)) throw error;
      throw new SyncError(error.message?.replace(/^.*?: /, '') || 'Serverfout', error.code, error);
    }
    if (state.get().conn === 'offline') setConn('online');
    return data;
  } catch (e) {
    if (e instanceof SyncError) throw e;
    setConn('offline');
    if (buffer) { outbox.push({ name, args, at: new Date().toISOString() }); store.set(OUTBOX_KEY, outbox); scheduleFlush(); return null; }
    throw new SyncError('Geen verbinding', 'offline', e);
  }
}
function setConn(v) { if (state.get().conn !== v) state.set({ conn: v }); }
function scheduleFlush() { if (!flushTimer) flushTimer = setInterval(flush, FLUSH_MS); }
async function flush() {
  if (!outbox.length) { clearInterval(flushTimer); flushTimer = null; return; }
  const item = outbox[0];
  try { await rpc(item.name, item.args); outbox.shift(); store.set(OUTBOX_KEY, outbox); if (outbox.length) flush(); }
  catch (e) { if (e.code !== 'offline') { outbox.shift(); store.set(OUTBOX_KEY, outbox); console.warn('[sync] zet weggegooid:', item.name, e.message); } }
}
if (typeof addEventListener === 'function') addEventListener('online', () => { flush(); reload().catch(() => {}); });

// ---------------------------------------------------------------- spelers op dit toestel
function myIds() { return Object.keys(session.codes); }
function codeFor(playerId) { return session.codes[playerId]; }
function actorCode(preferTalent) { // code van een ingelogde bewaker, liefst met dit talent
  const me = state.me();
  const pick = (preferTalent && me.find(p => p.talent === preferTalent)) || me[0];
  const code = pick ? codeFor(pick.id) : Object.values(session.codes)[0];
  if (!code) throw new SyncError('Nog niet ingelogd', 'nologin');
  return code;
}
function saveSession() { store.set(SESSION_KEY, session); state.set({ device: { ...state.get().device, players: myIds() } }); track(); }

// ---------------------------------------------------------------- laden en abonneren
async function loadAll() {
  const c = await client();
  const { data: game, error } = await c.from('game').select('*').eq('code', GAME_CODE).maybeSingle();
  if (error) throw new SyncError(error.message, error.code, error);
  if (!game) throw new SyncError(`Spel ${GAME_CODE} bestaat niet`, 'nogame');
  gameId = game.id;
  const activeStop = game.stop_order?.[game.active_index];
  const [players, stops, puzzle, events] = await Promise.all([
    c.from('player').select('*').eq('game_id', gameId),
    c.from('stop').select('*').eq('game_id', gameId).order('seq'),
    activeStop ? c.from('puzzle_state').select('*').eq('game_id', gameId).eq('stop_id', activeStop).maybeSingle() : { data: null },
    c.from('event').select('*').eq('game_id', gameId).order('at', { ascending: false }).limit(EVENTS_LOAD),
  ]);
  for (const r of [players, stops, puzzle, events]) if (r.error) throw new SyncError(r.error.message, r.error.code, r.error);
  // spelers die niet meer bestaan uit de sessie halen
  const ids = new Set((players.data || []).map(p => p.id));
  for (const id of myIds()) if (!ids.has(id)) delete session.codes[id];
  store.set(SESSION_KEY, session);
  state.set({ device: { ...state.get().device, players: myIds() } });
  state.load({ game, players: players.data, stops: stops.data, puzzle: puzzle.data, events: events.data });
}

function onChange(payload) {
  const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
  state.apply(payload.table, row, payload.eventType);
}
function presenceMap() {
  const raw = channel?.presenceState() || {};
  const out = {};
  for (const [key, metas] of Object.entries(raw)) { const m = metas[metas.length - 1] || {}; out[key] = { players: m.players || [], at: m.at }; }
  return out;
}
async function track() {
  if (!channel || channel.state !== 'joined') return;
  try { await channel.track({ device_id: state.get().device.id, players: PLAYER_PAGE ? myIds() : [], at: new Date().toISOString() }); } catch {}
}
async function subscribe() {
  const c = await client();
  if (channel) { await c.removeChannel(channel); channel = null; }
  channel = c.channel('game:' + gameId, { config: { presence: { key: state.get().device.id } } });
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'game', filter: `id=eq.${gameId}` }, onChange);
  for (const t of ['player', 'stop', 'puzzle_state', 'event'])
    channel.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `game_id=eq.${gameId}` }, onChange);
  channel.on('presence', { event: 'sync' }, () => state.presence(presenceMap()));
  await new Promise(resolve => {
    channel.subscribe(async status => {
      if (status === 'SUBSCRIBED') { setConn('online'); await track(); resolve(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { setConn('offline'); resolve(); }
    });
  });
}
async function reload() { if (!gameId) return; await loadAll(); }

function startHeartbeat() {
  clearInterval(hbTimer);
  hbTimer = setInterval(async () => {
    const codes = Object.values(session.codes); if (!codes.length || !PLAYER_PAGE) return;
    const pos = state.get().pos; let battery = null;
    try { if (navigator.getBattery) battery = Math.round((await navigator.getBattery()).level * 100); } catch {}
    rpc('heartbeat', { p_codes: codes, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_acc: pos?.acc ?? null, p_battery: battery }).catch(() => {});
  }, HEARTBEAT_MS);
}

// ---------------------------------------------------------------- publieke API
export const sync = {
  /** Verbindt met het spel: laadt alles, abonneert op Realtime en start de hartslag. */
  async connect(gameCode = GAME_CODE) {
    if (gameCode !== GAME_CODE) throw new SyncError('Alleen het spel uit sync.js wordt ondersteund', 'nogame');
    state.set({ conn: 'connecting' });
    await loadAll();
    await subscribe();
    startHeartbeat();
    if (outbox.length) scheduleFlush();
    return state.get();
  },
  async disconnect() {
    clearInterval(hbTimer); hbTimer = null;
    if (channel && sb) { await sb.removeChannel(channel); channel = null; }
    setConn('offline');
  },
  /** Inloggen met een viercijferige code; geeft { player, mission, mission_first_time }. Een toestel kan twee bewakers dragen. */
  async login(code) {
    code = String(code).trim();
    const res = await rpc('login', { p_game: GAME_CODE, p_code: code, p_device: state.get().device.id });
    session.codes[res.player.id] = code;
    state.apply('player', res.player, 'UPDATE');
    saveSession();
    return res;
  },
  logout(playerId) { if (playerId) delete session.codes[playerId]; else session.codes = {}; saveSession(); },
  isLoggedIn() { return myIds().length > 0; },

  setPos(pos) { state.set({ pos: pos ? { ...pos, at: new Date().toISOString() } : null }); },

  /** Aangekomen bij de actieve stop: maakt de gedeelde puzzelstand (variant + seed) aan of haalt hem op. */
  async arrive(stopId = state.activeStop()?.id) {
    const ps = await rpc('arrive', { p_code: actorCode(), p_stop: stopId });
    state.apply('puzzle_state', ps, 'UPDATE');
    return ps;
  },
  /** Zet in de gedeelde puzzel; gebufferd als de verbinding weg is. */
  async move(move, stopId = state.activeStop()?.id) {
    const ps = await rpc('puzzle_move', { p_code: actorCode(), p_stop: stopId, p_move: move }, { buffer: true });
    if (ps) state.apply('puzzle_state', ps, 'UPDATE');
    return ps;
  },
  async hint(stopId = state.activeStop()?.id) {
    const ps = await rpc('puzzle_hint', { p_code: actorCode(), p_stop: stopId });
    state.apply('puzzle_state', ps, 'UPDATE');
    return ps;
  },
  /** Stop indienen: alleen de Sleutelbewaarder (server controleert). */
  async solve(drops = 10, stopId = state.activeStop()?.id) {
    const g = await rpc('complete_stop', { p_code: actorCode('sleutelbewaarder'), p_stop: stopId, p_drops: drops });
    state.apply('game', g, 'UPDATE');
    return g;
  },
  async badge(playerId, badge) { return rpc('award_badge', { p_code: actorCode(), p_player: playerId, p_badge: badge }, { buffer: true }); },
  async log(type, payload = {}) { return rpc('log_event', { p_code: actorCode(), p_type: type, p_payload: payload }, { buffer: true }); },
  /** Zelfde als log(), maar namens een bepaalde bewaker op dit toestel (bijv. fork.vote per speelster). Valt terug op log(). */
  async logAs(playerId, type, payload = {}) { const code = codeFor(playerId); return rpc('log_event', { p_code: code || actorCode(), p_type: type, p_payload: payload }, { buffer: true }); },
  /** Verjaardagswens inzetten: vereist dat de jarige op dit toestel is ingelogd. */
  async wish(forWhat) {
    const h = state.me().find(p => p.is_birthday); if (!h) throw new SyncError('De jarige is niet op dit toestel ingelogd', 'nobirthday');
    return rpc('log_event', { p_code: codeFor(h.id), p_type: 'wish.used', p_payload: { for: forWhat } });
  },
  reload,
  outboxSize() { return outbox.length; },

  // ---- regie (regie.html): bewijs is de regiesleutel, bewaard in sessionStorage
  regie: {
    async login(key) {
      const r = await rpc('regie_check', { p_key: key });
      if (r?.code && r.code !== GAME_CODE) throw new SyncError(`Deze regiesleutel hoort bij spel "${r.code}", niet bij "${GAME_CODE}"`, 'wronggame');
      regieKey = key; try { sessionStorage.setItem(REGIE_KEY, key); } catch {}
      return r;
    },
    restore() { try { regieKey = sessionStorage.getItem(REGIE_KEY); } catch {} return !!regieKey; },
    logout() { regieKey = null; try { sessionStorage.removeItem(REGIE_KEY); } catch {} },
    sleutel() { return regieKey; }, // voor de Edge Function monster-foto (js/tekening.js)
    state()                 { return rpc('regie_state', { p_key: key() }); },
    start()                 { return rpc('regie_start', { p_key: key() }); },
    reset(keepLog = false)  { return rpc('regie_reset', { p_key: key(), p_keep_log: keepLog }); },
    event(type, payload={}) { return rpc('regie_event', { p_key: key(), p_type: type, p_payload: payload }); },
    patchGame(patch)        { return rpc('regie_patch_game', { p_key: key(), p_patch: patch }); },
    upsertStop(stop)        { return rpc('regie_upsert_stop', { p_key: key(), p_stop: stop }); },
    deleteStop(stopId)      { return rpc('regie_delete_stop', { p_key: key(), p_stop: stopId }); },
    setPlayer(player)       { return rpc('regie_set_player', { p_key: key(), p_player: player }); },
    approveStop(drops = 10) { return rpc('regie_approve_stop', { p_key: key(), p_drops: drops }); },
    hint(text = null)       { return rpc('regie_hint', { p_key: key(), p_text: text }); },
  },
};
function key() { if (!regieKey) throw new SyncError('Regie niet ingelogd', 'noregie'); return regieKey; }

export { SyncError };
export default sync;
