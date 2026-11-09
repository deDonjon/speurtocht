// fake-supabase.mjs — nep-supabase-js voor browsertests (test/browser-chat5.mjs). Wordt via Playwright in plaats van de CDN-module
// geserveerd. Houdt een kleine database in het geheugen en laat de test rijen "binnenkomen" via window.__fake.emit(table, row).
// Geen netwerk, geen Realtime: precies genoeg voor index.html (loadAll, subscribe, presence, rpc).
const now = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2, 10);
const DEV_PLAYER = { id: 'p1', name: 'Hannah', is_birthday: true, part: 'hoed', talent: 'sleutelbewaarder', color: '#FFE98A', badges: [], device_id: null, last_seen_at: null };
const db = {
  game: { id: 'g1', code: 'hannah10', title: 'Mecha-Pof', phase: 'onderweg', stop_order: ['s1', 's2', 's3'], active_index: 0, parts: [], drops: 0, hints: 0, energy: 2, wish_used: false, surprise: null,
    settings: { radius: 20, min_gap: 150, any_can_submit: false }, started_at: now(), finished_at: null },
  player: [DEV_PLAYER, { id: 'p2', game_id: 'g1', name: 'Elin', is_birthday: false, part: 'armen', talent: 'rekenmeester', color: '#C9D3E0', badges: [], device_id: 'devB', last_seen_at: null }],
  stop: [
    { id: 's1', game_id: 'g1', seq: 1, key: 'start', name: 'De speeltuin', clue: 'Zoek de hoogste glijbaan.', lat: 51.6168, lng: 5.5622, radius: 20, part: 'lijf', puzzles: [{ type: 'wachtwoord', question: 'Fluister het geheime woord dat op het bankje staat.', password: 'stroop|stroopwafel', answer: '42', hint: 'Het is plakkerig.' }] },
    { id: 's2', game_id: 'g1', seq: 2, key: null, name: 'De grote boom', clue: 'Waar de kastanjes vallen.', lat: 51.6178, lng: 5.5630, radius: 20, part: 'ogen', puzzles: [{ type: 'vraag', question: 'Hoeveel poten heeft een kat?', answer: '4|vier' }] },
    { id: 's3', game_id: 'g1', seq: 3, key: 'home', name: 'Thuis', clue: 'Waar de pannenkoeken wachten.', lat: 51.6160, lng: 5.5615, radius: 20, part: 'hoed', puzzles: [{ type: 'opdracht', question: 'Roep allemaal: over en sluiten!' }] },
  ],
  puzzle_state: [],
  event: [],
};
const codes = { '1111': 'p1', '2222': 'p2' };
// chat 7: een test kan vóór het laden een eigen database neerzetten met page.addInitScript(() => { globalThis.__FAKE_INIT = { game, player, stop, codes } }).
if (globalThis.__FAKE_INIT) { const i = globalThis.__FAKE_INIT; for (const k of ['game', 'player', 'stop', 'puzzle_state', 'event']) if (i[k]) db[k] = i[k]; if (i.codes) { for (const k of Object.keys(codes)) delete codes[k]; Object.assign(codes, i.codes); } }
const REGIE_KEY = 'job';
const extraPresence = {}; // device_id -> players (andere telefoons; test zet ze via __fake.presence)
const listeners = []; let presenceCb = null, deviceId = null;
const rpcLog = [];
function emit(table, row, eventType = 'INSERT') { for (const fn of listeners) fn({ table, eventType, new: row, old: row }); }
function logEvent(type, actor, player_id, payload) { const e = { id: uid(), game_id: 'g1', at: now(), type, actor, player_id, payload }; db.event.unshift(e); emit('event', e); return e; }
function finishStop(stopId, by, drops, actor) {
  const st = db.stop.find(s => s.id === stopId), home = st?.key === 'home';
  const ps = db.puzzle_state.find(x => x.stop_id === stopId); if (ps) { ps.solved_at = now(); ps.solved_by = by; emit('puzzle_state', ps, 'UPDATE'); }
  const g = patchGame({ parts: st?.part && !db.game.parts.includes(st.part) ? [...db.game.parts, st.part] : db.game.parts, active_index: db.game.active_index + 1, phase: home ? 'klaar' : 'onderweg', drops: db.game.drops + (drops ?? 10), finished_at: home ? now() : null });
  logEvent('stop.solved', actor, by, { stop_id: stopId, part: st?.part ?? null, drops, by });
  return g;
}
function patchGame(patch) { db.game = { ...db.game, ...patch }; emit('game', db.game, 'UPDATE'); return db.game; }
const q = rows => { const o = { eq: () => o, order: () => o, limit: () => o, maybeSingle: () => Promise.resolve({ data: Array.isArray(rows) ? rows[0] ?? null : rows, error: null }), then: (f, g) => Promise.resolve({ data: rows, error: null }).then(f, g) }; return o; };

export function createClient() {
  return {
    from: t => ({ select: () => q(t === 'game' ? [db.game] : db[t] || []) }),
    async rpc(name, args) {
      rpcLog.push({ name, args });
      const pid = args?.p_code ? codes[args.p_code] : null;
      if (['login', 'arrive', 'puzzle_move', 'complete_stop', 'award_badge', 'log_event', 'heartbeat', 'puzzle_hint'].includes(name) && name !== 'heartbeat' && !pid) return { data: null, error: { message: 'Onbekende code', code: 'P0001' } };
      switch (name) {
        case 'login': { deviceId = args.p_device; const pl = db.player.find(p => p.id === pid); pl.device_id = deviceId; pl.last_seen_at = now(); return { data: { player: pl, mission: null, mission_first_time: false }, error: null }; }
        case 'heartbeat': return { data: null, error: null };
        case 'arrive': { let ps = db.puzzle_state.find(x => x.stop_id === args.p_stop); if (!ps) { ps = { id: uid(), game_id: 'g1', stop_id: args.p_stop, variant: 0, seed: 7, moves: [], hints: 0, arrived_at: now(), solved_at: null, updated_at: now() }; db.puzzle_state.push(ps); patchGame({ phase: db.stop.find(s => s.id === args.p_stop)?.key === 'home' ? 'finale' : 'puzzel' }); logEvent('stop.arrived', 'player', pid, { stop_id: args.p_stop }); } return { data: ps, error: null }; }
        case 'puzzle_move': { const ps = db.puzzle_state.find(x => x.stop_id === args.p_stop); if (!ps) return { data: null, error: { message: 'Geen puzzel', code: 'P0001' } }; ps.moves = [...ps.moves, { ...args.p_move, by: pid, at: now() }]; ps.updated_at = now(); emit('puzzle_state', ps, 'UPDATE'); return { data: ps, error: null }; }
        case 'complete_stop': { const pl = db.player.find(p => p.id === pid); if (pl.talent !== 'sleutelbewaarder' && !db.game.settings.any_can_submit) return { data: null, error: { message: 'Alleen de Sleutelbewaarder mag indienen', code: 'P0001' } };
          return { data: finishStop(args.p_stop, pid, args.p_drops, 'player'), error: null }; }
        case 'award_badge': { const t = db.player.find(p => p.id === args.p_player); if (t && !t.badges.includes(args.p_badge)) { t.badges = [...t.badges, args.p_badge]; emit('player', t, 'UPDATE'); logEvent('badge.awarded', 'player', pid, { player_id: args.p_player, badge: args.p_badge }); } return { data: t, error: null }; }
        case 'log_event': { if (args.p_type === 'wish.used') { if (db.game.wish_used) return { data: null, error: { message: 'De Verjaardagswens is al gebruikt', code: 'P0001' } }; patchGame({ wish_used: true }); } return { data: logEvent(args.p_type, 'player', pid, args.p_payload), error: null }; }
        // ---- regie (chat 7): sleutel 'job'
        case 'regie_check': return args.p_key === REGIE_KEY ? { data: { ok: true, game_id: 'g1', code: 'hannah10' }, error: null } : { data: null, error: { message: 'Verkeerde regiesleutel', code: 'P0001' } };
        case 'regie_state': return { data: { game: db.game, players: db.player.map(p => ({ ...p, code: Object.keys(codes).find(c => codes[c] === p.id) })), stops: db.stop.map(st => ({ ...st, geheim: {} })), puzzle_states: db.puzzle_state, events: db.event }, error: null };
        case 'regie_event': { const t = args.p_type, pl = args.p_payload || {};
          if (t === 'roles.shuffle') for (const [id, tal] of Object.entries(pl.talents || {})) { const x = db.player.find(p => p.id === id); if (x) { x.talent = tal; emit('player', x, 'UPDATE'); } }
          if (t === 'wish.used') patchGame({ wish_used: true });
          return { data: globalThis.__fake.regie(t, pl), error: null }; }
        case 'regie_patch_game': { const p = { ...args.p_patch }; if (p.settings) p.settings = { ...db.game.settings, ...p.settings }; return { data: patchGame(p), error: null }; }
        case 'regie_upsert_stop': { const st = { game_id: 'g1', ...args.p_stop, id: args.p_stop.id || uid() }; delete st.geheim; if (st.part === '') st.part = null; if (st.key === '') st.key = null;
          const i = db.stop.findIndex(x => x.id === st.id); if (i >= 0) db.stop[i] = st; else db.stop.push(st); emit('stop', st, i >= 0 ? 'UPDATE' : 'INSERT'); return { data: st, error: null }; }
        case 'regie_approve_stop': return { data: finishStop(db.game.stop_order[db.game.active_index], null, args.p_drops, 'regie'), error: null };
        case 'regie_start': { const ord = db.stop.filter(s => s.part || s.key).sort((a, b) => (a.key === 'start' ? -1 : 0) - (b.key === 'start' ? -1 : 0) || (a.key === 'home') - (b.key === 'home') || a.seq - b.seq).map(s => s.id);
          db.puzzle_state = []; const g = patchGame({ stop_order: ord, active_index: 0, phase: 'onderweg', parts: [], drops: 0, hints: 0, surprise: null, wish_used: false, started_at: now(), finished_at: null }); logEvent('game.start', 'regie', null, { stop_order: ord }); return { data: g, error: null }; }
        default: return { data: {}, error: null };
      }
    },
    channel() {
      const ch = { state: 'joined', on(kind, _f, cb) { if (kind === 'postgres_changes') listeners.push(cb); if (kind === 'presence') presenceCb = cb; return ch; },
        subscribe(cb) { setTimeout(() => cb('SUBSCRIBED'), 0); return ch; }, async track() { presenceCb?.(); }, presenceState() { const o = {}; if (deviceId) o[deviceId] = [{ device_id: deviceId, players: db.player.filter(p => p.device_id === deviceId).map(p => p.id), at: now() }]; for (const [k, v] of Object.entries(extraPresence)) o[k] = [{ device_id: k, players: v, at: now() }]; return o; } };
      return ch;
    },
    async removeChannel() {},
  };
}
// Regie-knoppen voor de test: window.__fake.regie('thief.start', {...}) zet ook game.surprise, zoals regie_event op de server.
globalThis.__fake = {
  db, rpcLog, emit, patchGame, codes, rpc: (name, args) => createClient().rpc(name, args),
  presence(dev, players) { if (players) extraPresence[dev] = players; else delete extraPresence[dev]; presenceCb?.(); },
  regie(type, payload = {}) {
    if (['thief.start', 'storm.start', 'fork.open', 'finale.timer'].includes(type)) patchGame({ surprise: { kind: type.split('.')[0], started_at: now(), data: payload } });
    else if (['thief.caught', 'thief.end', 'storm.end', 'fork.result'].includes(type)) patchGame({ surprise: null });
    return logEvent(type, 'regie', null, payload);
  },
};
export default { createClient };
