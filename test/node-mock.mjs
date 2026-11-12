// Unit-test van state.js + sync.js met een nep-Supabase (geen netwerk nodig):  node test/node-mock.mjs
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = mem(); globalThis.sessionStorage = mem(); globalThis.addEventListener = () => {};

const GID = 'g1', STOPS = [
  { id: 's1', game_id: GID, seq: 1, key: 'start', name: 'Speeltuin', clue: '', lat: 1, lng: 1, part: 'lijf', puzzles: [{ type: 'code', answer: '19' }] },
  { id: 's2', game_id: GID, seq: 2, key: null, name: 'Boom', clue: '', lat: 1.001, lng: 1, part: 'ogen', puzzles: [{ type: 'vraag' }, { type: 'slot' }] },
  { id: 's7', game_id: GID, seq: 7, key: 'home', name: 'Thuis', clue: '', lat: 1, lng: 1.002, part: 'hoed', puzzles: [] },
];
let db = {
  game: { id: GID, code: 'hannah10', phase: 'onderweg', stop_order: ['s1', 's2', 's7'], active_index: 0, parts: [], drops: 0, hints: 0, settings: { radius: 20 }, surprise: null, wish_used: false },
  players: [{ id: 'p1', game_id: GID, name: 'Hannah', is_birthday: true, talent: 'sleutelbewaarder', badges: [], last_seen_at: null }, { id: 'p2', game_id: GID, name: 'Bewaker 2', talent: null, badges: [], last_seen_at: null }],
  codes: { '5243': 'p1', '3115': 'p2' },
  puzzle: null, events: [],
};
let offline = false; const handlers = []; let tracked = null; const rpcLog = [];
const q = (rows) => { const r = { data: rows, error: null }; const o = { eq: () => o, order: () => o, limit: () => o, maybeSingle: () => ({ data: Array.isArray(rows) ? rows[0] ?? null : rows, error: null }), then: (f, g) => Promise.resolve(r).then(f, g) }; return o; };
const fake = {
  from: t => ({ select: () => q(t === 'game' ? [db.game] : t === 'player' ? db.players : t === 'stop' ? STOPS : t === 'puzzle_state' ? (db.puzzle ? [db.puzzle] : []) : db.events) }),
  async rpc(name, args) {
    rpcLog.push(name);
    if (offline) return { data: null, error: { message: 'TypeError: fetch failed', code: '' } };
    const pid = db.codes[args.p_code];
    if (['login', 'arrive', 'puzzle_move', 'complete_stop'].includes(name) && !pid) return { data: null, error: { message: 'Onbekende code', code: 'P0001' } };
    if (name === 'login') return { data: { player: db.players.find(p => p.id === pid), mission: 'Zeg stroop', mission_first_time: true }, error: null };
    if (name === 'arrive') { db.puzzle = { id: 'ps1', game_id: GID, stop_id: args.p_stop, variant: 1, seed: 42, moves: [], hints: 0, solved_at: null, updated_at: new Date().toISOString() }; return { data: db.puzzle, error: null }; }
    if (name === 'puzzle_move') { db.puzzle = { ...db.puzzle, moves: [...db.puzzle.moves, { ...args.p_move, by: pid, at: new Date().toISOString() }] }; return { data: db.puzzle, error: null }; }
    if (name === 'complete_stop') { db.game = { ...db.game, active_index: 1, parts: ['lijf'], drops: 15 }; return { data: db.game, error: null }; }
    if (name === 'regie_check') return args.p_key === 'ok' ? { data: { ok: true }, error: null } : { data: null, error: { message: 'Verkeerde regiesleutel', code: 'P0001' } };
    return { data: {}, error: null };
  },
  channel: () => { const ch = { state: 'joined', on(kind, opts, h) { handlers.push({ kind, opts, h }); return ch; }, subscribe(cb) { setTimeout(() => cb('SUBSCRIBED'), 0); return ch; }, async track(m) { tracked = m; }, presenceState: () => ({ devA: [{ players: ['p1'] }], devB: [{ players: ['p2'] }] }) }; return ch; },
  removeChannel: async () => {},
};
const realtime = (table, eventType, row) => handlers.filter(h => h.kind === 'postgres_changes' && h.opts.table === table).forEach(h => h.h({ eventType, table, new: row, old: row }));
const presenceSync = () => handlers.filter(h => h.kind === 'presence').forEach(h => h.h());

const { state, PARTS, TALENTS } = await import('../js/state.js');
const { sync, configure } = await import('../js/sync.js');
configure({ createClient: () => fake });

let fails = 0; const ok = (name, cond, extra = '') => { console.log((cond ? '✓ ' : '✗ ') + name, extra); if (!cond) fails++; };
const got = {}; for (const e of ['change', 'game', 'players', 'stops', 'puzzle', 'event', 'conn', 'pos', 'presence']) { got[e] = 0; state.on(e, () => got[e]++); }

await sync.connect();
ok('connect laadt game/players/stops', state.get().game?.code === 'hannah10' && state.get().players.length === 2 && state.get().stops.length === 3);
ok('conn = online na SUBSCRIBED', state.get().conn === 'online');
ok('activeStop = s1', state.activeStop()?.id === 's1');
ok('route volgt stop_order', state.route().map(s => s.name).join(',') === 'Speeltuin,Boom,Thuis');
ok('partsMissing = alle 7', state.partsMissing().length === 7);
ok('TALENTS → parts kloppen', Object.values(TALENTS).every(t => PARTS[t.part]));

try { await sync.arrive(); ok('arrive zonder login faalt', false); } catch (e) { ok('arrive zonder login faalt', e.code === 'nologin', e.message); }
try { await sync.login('0000'); ok('foute code faalt', false); } catch (e) { ok('foute code faalt', e.code === 'P0001', e.message); }
const r = await sync.login('5243');
ok('login geeft speler + missie', r.player.name === 'Hannah' && r.mission === 'Zeg stroop');
ok('device.players bevat p1', state.get().device.players.includes('p1'));
ok('me()/myTalents()', state.me()[0]?.name === 'Hannah' && state.hasTalent('sleutelbewaarder'));
ok('presence tracked met players', tracked?.players?.includes('p1'), JSON.stringify(tracked));
await sync.login('3115');
ok('twee bewakers op één toestel', state.me().length === 2);

presenceSync();
ok('phones() uit presence: devA (p1) en devB (p2) zijn spook, want p1 en p2 staan ook hier = 1', state.phones() === 1); // één toestel per speler, het laatst verbonden toestel wint
ok('online via presence', state.player('p2')?.online === true);

const ps = await sync.arrive();
ok('arrive → state.puzzle', state.get().puzzle?.stop_id === 's1' && ps.seed === 42);
await sync.move({ t: 'digit', v: 1 });
ok('move → puzzle.moves=1 met by/at', state.get().puzzle.moves.length === 1 && state.get().puzzle.moves[0].by === 'p1' && !!state.get().puzzle.moves[0].at);

// Realtime: andere telefoon doet een zet
realtime('puzzle_state', 'UPDATE', { ...db.puzzle, moves: [...db.puzzle.moves, { t: 'digit', v: 9, by: 'p2', at: 'x' }] });
ok('realtime puzzle-update verwerkt', state.get().puzzle.moves.length === 2);
realtime('event', 'INSERT', { id: 1, game_id: GID, type: 'monster.say', actor: 'regie', payload: { text: 'Hoi' }, at: 'x' });
realtime('event', 'INSERT', { id: 1, game_id: GID, type: 'monster.say', actor: 'regie', payload: { text: 'Hoi' }, at: 'x' });
ok('event insert éénmaal (dedupe)', state.get().events.length === 1 && state.get().events[0].type === 'monster.say');
realtime('player', 'UPDATE', { ...db.players[1], badges: ['Koel Hoofd'] });
ok('player update → badges', state.player('p2').badges[0] === 'Koel Hoofd');
realtime('stop', 'INSERT', { id: 's3', game_id: GID, seq: 3, name: 'Nieuw', lat: 0, lng: 0, puzzles: [] });
ok('stop insert gesorteerd op seq', state.get().stops.map(s => s.id).join() === 's1,s2,s3,s7');
realtime('stop', 'DELETE', { id: 's3' });
ok('stop delete', state.get().stops.length === 3);

const g = await sync.solve(15);
ok('solve → game.active_index=1, parts=[lijf]', g.active_index === 1 && state.get().game.parts[0] === 'lijf');
ok('puzzle van oude stop geleegd na game-update', state.get().puzzle === null);
ok('activeStop nu s2', state.activeStop()?.id === 's2');
realtime('puzzle_state', 'INSERT', { id: 'ps9', game_id: GID, stop_id: 's1', moves: [] });
ok('puzzle_state van niet-actieve stop genegeerd', state.get().puzzle === null);
realtime('puzzle_state', 'INSERT', { id: 'ps2', game_id: GID, stop_id: 's2', moves: [] });
ok('puzzle_state van actieve stop (andere telefoon arriveerde) overgenomen', state.get().puzzle?.id === 'ps2');

// Offline: zet gebufferd, conn offline, daarna geflusht
offline = true;
const res = await sync.move({ t: 'digit', v: 2 });
ok('offline move → null, gebufferd', res === null && sync.outboxSize() === 1 && state.get().conn === 'offline');
try { await sync.arrive(); ok('offline arrive geeft Geen verbinding', false); } catch (e) { ok('offline arrive geeft Geen verbinding', e.code === 'offline', e.message); }
offline = false;
await new Promise(r => setTimeout(r, 5300));
ok('outbox geflusht na herstel', sync.outboxSize() === 0 && state.get().conn === 'online');

sync.setPos({ lat: 1, lng: 1, acc: 5 });
ok('setPos → pos event', state.get().pos?.at && got.pos === 1);
try { await sync.regie.login('fout'); ok('regie foute sleutel', false); } catch (e) { ok('regie foute sleutel faalt', true, e.message); }
await sync.regie.login('ok');
await sync.regie.event('monster.say', { text: 'x' });
ok('regie.event roept regie_event aan', rpcLog.at(-1) === 'regie_event');
sync.logout('p2'); ok('logout één bewaker', state.me().length === 1);
ok('events gevuurd', got.game > 0 && got.players > 0 && got.puzzle > 0 && got.event > 0 && got.conn > 0 && got.change > 10, JSON.stringify(got));

console.log(fails ? `\n${fails} test(s) MISLUKT` : '\nAlles groen');
process.exit(fails ? 1 : 0);
