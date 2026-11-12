// state.js — de spelstand in één object, met afgeleide waarden en events.
// Zie CONTRACTS.md §1. Alleen sync.js schrijft hierin (apply / set); alle andere modules lezen en luisteren.

export const PARTS = { // Mecha-Pof: de keukenrobot (zie MECHA-POF.md)
  lijf:  { icon: '🤖', label: 'het pannenkoekenpantser', color: '#F2BE62' },
  ogen:  { icon: '🔦', label: 'de LED-ogen',             color: '#7FE8FF' },
  neus:  { icon: '🍓', label: 'de aardbei-knop',         color: '#FF5A4E' },
  mond:  { icon: '🔊', label: 'het luidsprekerrooster',  color: '#4ADE80' },
  armen: { icon: '🍳', label: 'de spatel en de garde',   color: '#C9D3E0' },
  benen: { icon: '⚙️', label: 'de zuigerbenen',          color: '#B794F6' },
  hoed:  { icon: '🧈', label: 'de boterknop en de jetpack', color: '#F59E2E' },
};
export const TALENTS = {
  speurneus:        { part: 'ogen',  label: 'Speurneus' },
  kaartlezer:       { part: 'neus',  label: 'Kaartlezer' },
  codekraker:       { part: 'mond',  label: 'Codekraker' },
  rekenmeester:     { part: 'armen', label: 'Rekenmeester' },
  tijdbewaker:      { part: 'benen', label: 'Tijdbewaker' },
  sleutelbewaarder: { part: 'hoed',  label: 'Sleutelbewaarder' },
};
export const PHASES = ['lobby', 'onderweg', 'puzzel', 'finale', 'klaar'];
export const ONLINE_MS = 30_000; // last_seen_at jonger dan dit = online (naast presence)

const DEVICE_KEY = 'pkm2_device';
function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch { return 'dev-' + Math.random().toString(36).slice(2); }
}

const EVENTS_MAX = 50;
let s = {
  conn: 'connecting',
  device: { id: deviceId(), players: [] },
  game: null,
  players: [],
  stops: [],
  puzzle: null,
  events: [],
  pos: null,
};
const presence = new Map(); // device_id -> { players:[], at }
const listeners = new Map(); // evt -> Set<fn>

function emit(evt, payload) {
  for (const fn of listeners.get(evt) || []) { try { fn(payload); } catch (e) { console.error('[state]', evt, e); } }
  if (evt !== 'change') emit('change', { evt, payload });
}
function sortBy(arr, key) { return arr.slice().sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0)); }
function withOnline(p) {
  const seen = p.last_seen_at ? Date.now() - Date.parse(p.last_seen_at) < ONLINE_MS : false;
  let present = false;
  for (const d of presence.values()) if (d.players?.includes(p.id)) { present = true; break; }
  return { ...p, online: seen || present };
}

export const state = {
  // ---- lezen
  get() { return s; },
  on(evt, fn) { if (!listeners.has(evt)) listeners.set(evt, new Set()); listeners.get(evt).add(fn); return () => state.off(evt, fn); },
  off(evt, fn) { listeners.get(evt)?.delete(fn); },

  // ---- afgeleid
  route() { const byId = Object.fromEntries(s.stops.map(st => [st.id, st])); return (s.game?.stop_order || []).map(id => byId[id]).filter(Boolean); },
  activeStop() { const g = s.game; if (!g) return null; return s.stops.find(st => st.id === g.stop_order?.[g.active_index]) || null; },
  stop(id) { return s.stops.find(st => st.id === id) || null; },
  player(id) { return s.players.find(p => p.id === id) || null; },
  me() { return s.device.players.map(id => state.player(id)).filter(Boolean); },
  myTalents() { return state.me().map(p => p.talent).filter(Boolean); },
  hasTalent(t) { return state.myTalents().includes(t); },
  onlinePlayers() { return s.players.filter(p => p.online); },
  /** Gesorteerde lijst van toestel-id's die meedoen: presence met minstens één bewaker, bewakers die online zijn (last_seen_at)
   *  en dit toestel zelf zodra er hier iemand is ingelogd. Dezelfde lijst op elke telefoon → dezelfde rolverdeling (js/roles.js). */
  devices() {
    // Elke bewaker telt op één toestel: staat dezelfde speler op meer toestellen (link twee keer geopend, Safari én
    // beginscherm, oud tabblad op de laptop), dan wint het toestel dat het laatst inlogde/verbond (presence `at`,
    // gelijk → hoogste id). Een toestel waarvan alle bewakers elders "winnen" is een spooktoestel en telt niet mee.
    const claims = new Map(); // player_id -> { dev, at }
    const claim = (pid, dev, at) => { const c = claims.get(pid); if (!c || at > c.at || (at === c.at && dev > c.dev)) claims.set(pid, { dev, at }); };
    for (const [k, d] of presence) for (const pid of d.players || []) claim(pid, k, Date.parse(d.at) || 0);
    if (s.device.players.length && !presence.get(s.device.id)?.players?.length) // nog niet in presence (net ingelogd)
      for (const pid of s.device.players) claim(pid, s.device.id, Date.now());
    const ids = new Set([...claims.values()].map(c => c.dev));
    for (const p of s.players) if (p.online && p.device_id && !claims.has(p.id)) ids.add(p.device_id);
    return [...ids].sort();
  },
  phones() { return Math.max(1, state.devices().length); }, // aantal toestellen online (1, 2 of 3)
  partsMissing() { const have = new Set(s.game?.parts || []); return Object.keys(PARTS).filter(p => !have.has(p)); },
  partsFound() { return s.game?.parts || []; },
  isBirthday(id) { return !!state.player(id)?.is_birthday; },

  // ---- schrijven (alleen sync.js)
  set(patch) {
    s = { ...s, ...patch };
    for (const k of Object.keys(patch)) {
      if (k === 'conn') emit('conn', s.conn);
      else if (k === 'pos') emit('pos', s.pos);
      else if (k === 'device') emit('players', s.players);
      else if (k === 'game') emit('game', s.game);
      else if (k === 'players') emit('players', s.players);
      else if (k === 'stops') emit('stops', s.stops);
      else if (k === 'puzzle') emit('puzzle', s.puzzle);
      else if (k === 'events') emit('event', s.events[0] || null);
    }
  },
  /** Verwerk één rij van de server. type: 'INSERT' | 'UPDATE' | 'DELETE' (DELETE geeft de oude rij). */
  apply(table, row, type = 'UPDATE') {
    if (!row) return;
    if (table === 'game') {
      const old = s.game; s = { ...s, game: type === 'DELETE' ? null : { ...(old || {}), ...row } };
      emit('game', s.game);
      // actieve stop veranderd → puzzelstand hoort bij een andere stop
      if (old && s.game && (old.active_index !== s.game.active_index || old.stop_order?.join() !== s.game.stop_order?.join())) {
        if (s.puzzle && s.puzzle.stop_id !== s.game.stop_order?.[s.game.active_index]) { s = { ...s, puzzle: null }; emit('puzzle', null); }
      }
    } else if (table === 'player') {
      const rest = s.players.filter(p => p.id !== row.id);
      s = { ...s, players: type === 'DELETE' ? rest : sortBy([...rest, withOnline(row)], 'name') };
      emit('players', s.players);
    } else if (table === 'stop') {
      const rest = s.stops.filter(st => st.id !== row.id);
      s = { ...s, stops: type === 'DELETE' ? rest : sortBy([...rest, row], 'seq') };
      emit('stops', s.stops);
    } else if (table === 'puzzle_state') {
      const activeId = s.game?.stop_order?.[s.game.active_index];
      if (type === 'DELETE') { if (s.puzzle?.id === row.id) { s = { ...s, puzzle: null }; emit('puzzle', null); } return; }
      if (row.stop_id === activeId || !activeId) { s = { ...s, puzzle: row }; emit('puzzle', s.puzzle); }
    } else if (table === 'event') {
      if (type !== 'INSERT') return;
      if (s.events.some(e => e.id === row.id)) return;
      s = { ...s, events: [row, ...s.events].slice(0, EVENTS_MAX) };
      emit('event', row);
    }
  },
  /** Volledige lading na connect(): vervangt alles in één keer. */
  load({ game, players, stops, puzzle, events }) {
    s = { ...s, game: game || null, players: sortBy((players || []).map(withOnline), 'name'), stops: sortBy(stops || [], 'seq'), puzzle: puzzle || null, events: (events || []).slice(0, EVENTS_MAX) };
    emit('game', s.game); emit('players', s.players); emit('stops', s.stops); emit('puzzle', s.puzzle); emit('event', s.events[0] || null);
  },
  presence(map) { // map: device_id -> { players, at }
    presence.clear(); for (const [k, v] of Object.entries(map || {})) presence.set(k, v);
    s = { ...s, players: s.players.map(withOnline) };
    emit('players', s.players); emit('presence', state.phones());
  },
  refreshOnline() { s = { ...s, players: s.players.map(withOnline) }; emit('players', s.players); },
};

// Online-status veroudert vanzelf: elke 10 s opnieuw bepalen.
if (typeof setInterval === 'function') setInterval(() => state.refreshOnline(), 10_000);

export default state;
