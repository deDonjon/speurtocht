// End-to-end-test van sync.js tegen het echte Supabase-project, zonder browser.
// Gebruik:  node test/node-e2e.mjs B &   (tab B: luistert)      node test/node-e2e.mjs A   (tab A: speelt de regie en een stop)
// Vereist: npm install @supabase/supabase-js  en  REGIE_KEY, CODE_A, CODE_B in de omgeving.
const role = process.argv[2] || 'A';
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = mem(); globalThis.sessionStorage = mem();
globalThis.addEventListener = () => {};

const { createClient } = await import('@supabase/supabase-js');
const { state } = await import('../js/state.js');
const { sync, configure } = await import('../js/sync.js');
configure({ createClient });

const t0 = Date.now();
const log = (...a) => console.log(`[${role} +${String(Date.now() - t0).padStart(5)}ms]`, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const REGIE_KEY = process.env.REGIE_KEY, CODE_A = process.env.CODE_A, CODE_B = process.env.CODE_B;

state.on('event', e => e && log('event', e.type, e.actor, JSON.stringify(e.payload).slice(0, 80), 'latency', Date.now() - Date.parse(e.at), 'ms'));
state.on('puzzle', p => p && log('puzzle', p.stop_id.slice(0, 8), 'moves', p.moves.length, p.solved_at ? 'SOLVED' : '', 'latency', Date.now() - Date.parse(p.updated_at), 'ms'));
state.on('game', g => g && log('game', g.phase, 'active', g.active_index, 'parts', g.parts.join(','), 'drops', g.drops));
state.on('presence', n => log('presence: phones', n));
state.on('conn', c => log('conn', c));

await sync.connect();
log('connected; players', state.get().players.length, 'stops', state.get().stops.length);

if (role === 'B') {
  const r = await sync.login(CODE_B); log('login B →', r.player.name, 'first time', r.mission_first_time);
  await sleep(25_000); // luisteren
  log('B klaar; events gezien:', state.get().events.length);
  process.exit(0);
}

// ---- tab A
const r = await sync.login(CODE_A); log('login A →', r.player.name, 'first time', r.mission_first_time);
try { await sync.login('0000'); } catch (e) { log('foute code geeft:', e.message); }

await sync.regie.login(REGIE_KEY); log('regie ingelogd');
await sync.regie.reset(); log('reset');
const me = r.player;
await sync.regie.setPlayer({ id: me.id, name: me.name, is_birthday: me.is_birthday, part: 'hoed', talent: 'sleutelbewaarder', color: '#FFE98A' });
log('A is nu sleutelbewaarder');
await sleep(500);
const g = await sync.regie.start();
log('start; volgorde', g.stop_order.map(id => state.stop(id)?.name).join(' → '));
await sleep(800);

const active = state.activeStop(); log('actieve stop:', active.name, active.part);
const ps = await sync.arrive(); log('arrive → variant', ps.variant, 'seed', ps.seed);
await sleep(300);
await sync.move({ t: 'digit', pos: 0, v: 1 });
await sync.move({ t: 'digit', pos: 1, v: 9 });
await sleep(300);
try { await sync.move({ nope: true }); } catch (e) { log('zet zonder t geeft:', e.message); }
await sync.hint(); log('hint gevraagd');
const g2 = await sync.solve(15); log('solve → phase', g2.phase, 'parts', g2.parts, 'drops', g2.drops);
await sleep(300);
try { await sync.arrive(active.id); } catch (e) { log('oude stop opnieuw arrive geeft:', e.message); }
const g3 = await sync.regie.approveStop(5); log('regie approve → active', g3.active_index, 'parts', g3.parts);
await sync.regie.event('monster.say', { text: 'Dat duurde lang.' });
await sync.regie.event('thief.start', { part: 'ogen', points: [{ lat: 1, lng: 2 }] });
await sleep(500);
log('game.surprise na thief.start:', JSON.stringify(state.get().game.surprise)?.slice(0, 60));
await sync.regie.event('thief.end');
await sleep(300);
log('game.surprise na thief.end:', state.get().game.surprise);
const rs = await sync.regie.state();
log('regie_state: players met code', rs.players.filter(p => p.code).length, '| stops met geheim', rs.stops.filter(s => 'geheim' in s).length, '| events', rs.events.length);

// Anon mag geheimen niet zien
const c = createClient('https://lnhliamckstuwiwyzxyl.supabase.co', 'sb_publishable_hoQWFp1gmy-qfG6IICNckw_ewEXmm_3');
const sec = await c.from('player_secret').select('*'); log('anon select player_secret →', sec.error ? sec.error.message : `${sec.data.length} rijen (FOUT: moet geweigerd worden)`);
const ins = await c.from('event').insert({ game_id: state.get().game.id, type: 'x', actor: 'player' }); log('anon insert event →', ins.error ? ins.error.message : 'GELUKT (FOUT)');
const stops = await c.from('stop').select('*'); log('anon select stop →', stops.error ? stops.error.message : `${stops.data.length} rijen`);

await sync.regie.reset(); log('reset voor de volgende test');
await sleep(1500);
process.exit(0);
