// Unit-test van js/roles.js (rolverdeling) en de pure delen van de puzzels splits, slot en sync:  node test/node-roles-puzzles.mjs
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = mem(); globalThis.sessionStorage = mem(); globalThis.addEventListener = () => {};
let fails = 0; const ok = (name, cond, extra = '') => { console.log((cond ? '✓ ' : '✗ ') + name, extra); if (!cond) fails++; };

const { state } = await import('../js/state.js');
const { ROLES, ownerOf, rolesOf, deviceWithRole, piecesFor } = await import('../js/roles.js');

// ---- rolverdeling
const devs = ['a', 'b', 'c'];
ok('3 toestellen, stop 0: a=radio b=kaart c=werkbank', ['a', 'b', 'c'].map(d => rolesOf(d, 0, devs).join()).join('|') === 'radio|kaart|werkbank');
ok('3 toestellen, stop 1: roteert (a=kaart b=werkbank c=radio)', ['a', 'b', 'c'].map(d => rolesOf(d, 1, devs).join()).join('|') === 'kaart|werkbank|radio');
ok('3 toestellen, stop 2: a=werkbank b=radio c=kaart', ['a', 'b', 'c'].map(d => rolesOf(d, 2, devs).join()).join('|') === 'werkbank|radio|kaart');
ok('stop 3 = stop 0', ['a', 'b', 'c'].map(d => rolesOf(d, 3, devs).join()).join('|') === 'radio|kaart|werkbank');
for (let s = 0; s < 6; s++) for (const n of [1, 2, 3]) {
  const owners = ROLES.map((_, r) => ownerOf(r, s, n));
  ok(`stop ${s}, ${n} toestel(len): elke rol precies één eigenaar binnen bereik`, owners.every(o => o >= 0 && o < n));
  const all = devs.slice(0, n).flatMap(d => rolesOf(d, s, devs.slice(0, n)));
  ok(`stop ${s}, ${n} toestel(len): samen precies alle drie de rollen`, all.length === 3 && new Set(all).size === 3, all.join());
}
ok('1 toestel heeft alles', rolesOf('a', 4, ['a']).length === 3);
ok('deviceWithRole', deviceWithRole('werkbank', 0, devs) === 'c' && deviceWithRole('radio', 1, devs) === 'c');
ok('niet in de lijst → geen rollen', rolesOf('zzz', 0, devs).length === 0);
ok('lege wereld → alle rollen (testpagina zonder spel)', rolesOf('zzz', 0, []).length === 3);
ok('piecesFor 3 stukken over 3 telefoons', [0, 1, 2].map(d => piecesFor(3, d, 3).join()).join('|') === '0|1|2');
ok('piecesFor 3 stukken over 2 telefoons', [0, 1].map(d => piecesFor(3, d, 2).join()).join('|') === '0,2|1');
ok('piecesFor 3 stukken over 1 telefoon', piecesFor(3, 0, 1).join() === '0,1,2');
// state.devices(): presence + online spelers + ikzelf
state.load({ game: { id: 'g', stop_order: [], active_index: 0 }, players: [{ id: 'p1', name: 'A', device_id: 'devB', last_seen_at: new Date().toISOString() }, { id: 'p2', name: 'B', device_id: 'devZ', last_seen_at: '2020-01-01' }], stops: [], puzzle: null, events: [] });
state.presence({ devC: { players: ['p3'] }, devD: { players: [] } });
ok('state.devices(): presence met bewakers + online speler, niet de offline speler en niet het lege toestel', state.devices().join() === 'devB,devC', state.devices().join());
ok('state.phones() = devices().length', state.phones() === 2);

// ---- puzzels
const ctx3 = { seed: 7, variant: 0, phones: 3, players: [{ id: 'p0', device_id: 'd0' }, { id: 'p1', device_id: 'd1' }, { id: 'p2', device_id: 'd2' }], devices: ['d0', 'd1', 'd2'] };
const ctx1 = { ...ctx3, phones: 1, devices: ['d0'] };
const run = (mod, cfg, ctx, moves) => moves.reduce((d, m) => mod.reduce(d, m, ctx), mod.init(cfg, ctx));

const splits = (await import('../js/puzzles/splits.js')).default;
const scfg = { pieces: ['STRO', 'OPME', 'TER'], answer: 'stroopmeter|stroop meter' };
let d = run(splits, scfg, ctx3, [{ t: 'answer', v: 'spatel', by: 'p0' }]);
ok('splits: fout antwoord → niet opgelost, poging bewaard', !splits.isSolved(d) && d.tries.length === 1);
d = run(splits, scfg, ctx3, [{ t: 'answer', v: 'spatel', by: 'p0' }, { t: 'answer', v: 'Stroop-Meter!', by: 'p1' }]);
ok('splits: genormaliseerd goed antwoord → opgelost', splits.isSolved(d));
ok('splits: na oplossen geen extra pogingen', run(splits, scfg, ctx3, [{ t: 'answer', v: 'stroopmeter' }, { t: 'answer', v: 'x' }]).tries.length === 1);
ok('splits: 1 telefoon zelfde data', JSON.stringify(run(splits, scfg, ctx1, [])) === JSON.stringify(run(splits, scfg, ctx3, [])));

const slot = (await import('../js/puzzles/slot.js')).default;
const lcfg = { dials: [{ clue: 'a', answer: '4' }, { clue: 'b', answer: '2' }, { clue: 'c', answer: '2' }] };
d = run(slot, lcfg, ctx3, [{ t: 'turn', i: 0, d: 1 }, { t: 'turn', i: 0, d: 1 }, { t: 'turn', i: 0, d: 1 }, { t: 'turn', i: 0, d: 1 }, { t: 'turn', i: 1, d: -1 }, { t: 'check' }]);
ok('slot: draaien wrapt (0 → 9 via -1), check fout', d.pos.join() === '4,9,0' && !slot.isSolved(d) && d.tries[0].code === '490');
d = run(slot, lcfg, ctx3, [...Array(4).fill({ t: 'turn', i: 0, d: 1 }), { t: 'turn', i: 1, d: 1 }, { t: 'turn', i: 1, d: 1 }, { t: 'turn', i: 2, d: -1 }, ...Array(3).fill({ t: 'turn', i: 2, d: 1 }), { t: 'check' }]);
ok('slot: 4-2-2 → open', slot.isSolved(d) && d.pos.join() === '4,2,2');
ok('slot: geen check = niet opgelost, ook als het klopt', !slot.isSolved(run(slot, lcfg, ctx3, [...Array(4).fill({ t: 'turn', i: 0, d: 1 }), { t: 'turn', i: 1, d: 1 }, { t: 'turn', i: 1, d: 1 }, { t: 'turn', i: 2, d: 1 }, { t: 'turn', i: 2, d: 1 }])));
ok('slot: ongeldige schijf genegeerd', run(slot, lcfg, ctx3, [{ t: 'turn', i: 9, d: 1 }]).pos.join() === '0,0,0');

const sync = (await import('../js/puzzles/sync.js')).default;
const T = ms => new Date(1_700_000_000_000 + ms).toISOString();
const ycfg = { window: 700, rounds: 2 };
d = run(sync, ycfg, ctx3, [{ t: 'press', by: 'p0', at: T(0) }, { t: 'press', by: 'p1', at: T(200) }]);
ok('sync multi: 2 van 3 gedrukt → wachten op 1', d.last?.waiting === 1 && d.hits === 0);
d = run(sync, ycfg, ctx3, [{ t: 'press', by: 'p0', at: T(0) }, { t: 'press', by: 'p1', at: T(200) }, { t: 'press', by: 'p2', at: T(500) }]);
ok('sync multi: alle drie binnen 700 ms → treffer', d.hits === 1 && d.last.ok && d.last.spread === 500);
d = run(sync, ycfg, ctx3, [{ t: 'press', by: 'p0', at: T(0) }, { t: 'press', by: 'p1', at: T(200) }, { t: 'press', by: 'p2', at: T(1500) }]);
ok('sync multi: te ver uit elkaar → misser, drukken gewist', d.hits === 0 && d.misses === 1 && !d.last.ok && Object.keys(d.presses).length === 0);
d = run(sync, ycfg, ctx3, [{ t: 'press', by: 'p0', at: T(0) }, { t: 'press', by: 'p1', at: T(6000) }, { t: 'press', by: 'p2', at: T(6100) }]);
ok('sync multi: druk van > 4 s geleden telt niet meer mee', d.hits === 0 && d.last?.waiting === 1);
d = run(sync, ycfg, ctx3, [{ t: 'press', by: 'p0', at: T(0) }, { t: 'press', by: 'p0', at: T(300) }, { t: 'press', by: 'p1', at: T(400) }, { t: 'press', by: 'p2', at: T(500) }]);
ok('sync multi: dubbel drukken van één toestel telt als laatste druk', d.hits === 1 && d.last.spread === 200);
const two = run(sync, ycfg, ctx3, [...[0, 200, 500].map((ms, i) => ({ t: 'press', by: 'p' + i, at: T(ms) })), ...[10000, 10100, 10200].map((ms, i) => ({ t: 'press', by: 'p' + i, at: T(ms) }))]);
ok('sync multi: twee treffers → opgelost', sync.isSolved(two));
const s1 = sync.init(ycfg, ctx1);
ok('sync solo: zone uit seed, 3 treffers nodig standaard', s1.mode === 'solo' && s1.zone >= 20 && s1.zone <= 80 && sync.init({}, ctx1).need === 3);
d = run(sync, ycfg, ctx1, [{ t: 'press', pos: s1.zone }, { t: 'press', pos: s1.zone + 30 }, { t: 'press', pos: s1.zone - 5 }]);
ok('sync solo: raak/mis op positie', d.hits === 2 && d.misses === 1);
ok('sync solo: zelfde seed → zelfde zone', sync.init(ycfg, ctx1).zone === sync.init(ycfg, { ...ctx1 }).zone && sync.init(ycfg, { ...ctx1, seed: 8 }).zone !== undefined);

// alle drie: puur (twee keer dezelfde zetten = dezelfde data)
for (const [name, mod, cfg, moves] of [['splits', splits, scfg, [{ t: 'answer', v: 'x' }]], ['slot', slot, lcfg, [{ t: 'turn', i: 0, d: 1 }, { t: 'check' }]], ['sync', sync, ycfg, [{ t: 'press', by: 'p0', at: T(0) }]]])
  ok(`${name}: deterministisch`, JSON.stringify(run(mod, cfg, ctx3, moves)) === JSON.stringify(run(mod, cfg, ctx3, moves)));

console.log(fails ? `\n${fails} test(s) mislukt` : '\nalles goed');
process.exit(fails ? 1 : 0);
