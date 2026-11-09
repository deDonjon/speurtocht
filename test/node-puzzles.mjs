// Unit-test van de puzzels licht, formatie en qr (alleen init/reduce/isSolved, geen DOM):  node test/node-puzzles.mjs
import assert from 'node:assert/strict';
const { default: licht, COLORS } = await import('../js/puzzles/licht.js');
const { default: formatie, toXY, fitPolygon } = await import('../js/puzzles/formatie.js');
const { default: qr, normCode, extractCode } = await import('../js/puzzles/qr.js');
const run = (mod, cfg, ctx, moves) => moves.reduce((d, m) => mod.reduce(d, m, ctx), mod.init(cfg, ctx));
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('✓', name); };

// ---------------------------------------------------------------- licht
const ctx3 = { seed: 1234, phones: 3, devices: ['devC', 'devA', 'devB'], players: [{ name: 'Hannah', device_id: 'devA' }, { name: 'Elin', device_id: 'devB' }, { name: 'Isa', device_id: 'devC' }] };
ok('licht: zelfde seed = zelfde code, lengte en kleuren binnen grenzen', () => {
  const a = licht.init({ length: 6, colors: 5 }, ctx3), b = licht.init({ length: 6, colors: 5 }, ctx3);
  assert.deepEqual(a.seq, b.seq); assert.equal(a.seq.length, 6);
  for (let i = 1; i < a.seq.length; i++) assert.notEqual(a.seq[i], a.seq[i - 1]);
  assert.equal(licht.init({ length: 9 }, ctx3).seq.length, 6); assert.equal(licht.init({ length: 2 }, ctx3).seq.length, 4);
  assert.equal(licht.init({}, ctx3).seq.length, 5); assert.equal(licht.init({ colors: 3 }, ctx3).palette.length, 3);
  assert.ok(['devA', 'devB', 'devC'].includes(a.zender)); assert.equal(a.solo, false); assert.ok(a.zenderNames);
});
ok('licht: 1 telefoon = solo, geen zender', () => { const d = licht.init({}, { seed: 5, phones: 1, devices: ['x'] }); assert.equal(d.solo, true); assert.equal(d.zender, null); });
ok('licht: goed nabouwen lost op; fout = poging en opnieuw', () => {
  const d0 = licht.init({}, ctx3), seq = d0.seq, wrongC = d0.palette.find(k => k !== seq[seq.length - 1]);
  let d = run(licht, {}, ctx3, [{ t: 'play' }, ...seq.slice(0, -1).map(c => ({ t: 'tap', c })), { t: 'tap', c: wrongC }]);
  assert.equal(d.solved, false); assert.equal(d.tries, 1); assert.deepEqual(d.input, []); assert.equal(d.lastWrong.length, seq.length); assert.equal(d.plays, 1);
  d = seq.reduce((x, c) => licht.reduce(x, { t: 'tap', c }), d);
  assert.equal(licht.isSolved(d), true);
  assert.equal(licht.reduce(d, { t: 'tap', c: seq[0] }), d, 'na oplossen verandert niets');
  assert.equal(licht.reduce(d0, { t: 'tap', c: 'zz' }), d0, 'onbekende kleur doet niets');
  const u = run(licht, {}, ctx3, [{ t: 'tap', c: seq[0] }, { t: 'tap', c: seq[1] }, { t: 'undo' }]); assert.deepEqual(u.input, [seq[0]]);
  assert.deepEqual(licht.reduce(u, { t: 'clear' }).input, []);
  assert.equal(COLORS.length, 5);
});

// ---------------------------------------------------------------- formatie
const P = { lat: 51.6168188, lng: 5.5622347 };
const at = (R, deg) => { const a = deg * Math.PI / 180, x = R * Math.cos(a), y = R * Math.sin(a); return { lat: P.lat + y / 110_540, lng: P.lng + x / (Math.cos(P.lat * Math.PI / 180) * 111_320) }; };
const pos = (d, R, deg, ts, acc = 6) => ({ t: 'pos', d, ...at(R, deg), acc, ts });
ok('formatie: projectie en driehoek-fit', () => {
  const q = toXY(P, at(10, 90).lat, at(10, 90).lng); assert.ok(Math.abs(q.x) < 0.01 && Math.abs(q.y - 10) < 0.01);
  const f = fitPolygon([{ d: 'a', x: 10, y: 0 }, { d: 'b', x: -5, y: 8.66 }, { d: 'c', x: -5, y: -8.66 }], 10); assert.ok(f.worst < 0.01);
});
ok('formatie: 3 telefoons in een driehoek = opgelost; op één kluitje niet', () => {
  const cfg = { ...P, ring: 10, margin: 8 }, d0 = formatie.init(cfg, ctx3); assert.equal(d0.mode, 'driehoek'); assert.equal(d0.n, 3);
  const bunch = run(formatie, cfg, ctx3, [pos('devA', 3, 0, 1000), pos('devB', 3, 20, 1000), pos('devC', 2, 40, 1000)]);
  assert.equal(bunch.solved, false); assert.ok(bunch.fit);
  const line = run(formatie, cfg, ctx3, [pos('devA', 10, 0, 1000), pos('devB', 10, 30, 1000), pos('devC', 10, 60, 1000)]); assert.equal(line.solved, false);
  const tight = run(formatie, { ...P, ring: 6, margin: 8 }, ctx3, [pos('devA', 3, 0, 1000), pos('devB', 3, 120, 1000), pos('devC', 3, 240, 1000)]);
  assert.equal(tight.solved, false, 'kluitje: minder dan ring m uit elkaar');
  const tri = run(formatie, cfg, ctx3, [pos('devA', 12, 10, 1000), pos('devB', 9, 140, 2000), pos('devC', 11, 245, 3000)]); assert.equal(tri.solved, true);
});
ok('formatie: oude posities (>20 s) en wiebelige GPS tellen niet', () => {
  const cfg = { ...P, ring: 10 }, old = run(formatie, cfg, ctx3, [pos('devA', 10, 0, 1000), pos('devB', 10, 120, 30_000), pos('devC', 10, 240, 30_000)]);
  assert.equal(old.solved, false);
  const wob = run(formatie, cfg, ctx3, [pos('devA', 10, 0, 1000, 60), pos('devB', 10, 120, 1000), pos('devC', 10, 240, 1000)]); assert.equal(wob.solved, false);
});
ok('formatie: done zet vast, ook als de modus verandert', () => {
  const ctx1 = { seed: 1, phones: 1, devices: ['devA'] };
  const d = run(formatie, { ...P }, ctx1, [pos('devA', 10, 0, 1000), { t: 'done' }]); assert.equal(d.mode, 'rondje'); assert.equal(d.solved, true);
});
ok('formatie: 2 telefoons = lijn door het punt', () => {
  const ctx2 = { seed: 1, phones: 2, devices: ['devA', 'devB'] };
  assert.equal(run(formatie, { ...P, ring: 10 }, ctx2, [pos('devA', 10, 30, 1000), pos('devB', 10, 210, 1000)]).solved, true);
  assert.equal(run(formatie, { ...P, ring: 10 }, ctx2, [pos('devA', 10, 30, 1000), pos('devB', 10, 100, 1000)]).solved, false);
});
ok('formatie: 1 telefoon loopt een rondje van 20 m', () => {
  const ctx1 = { seed: 1, phones: 1, devices: ['devA'] }, cfg = { ...P, loop: 20, margin: 8 };
  const half = Array.from({ length: 10 }, (_, i) => pos('devA', 20, i * 20, i * 4000));
  assert.equal(run(formatie, cfg, ctx1, half).solved, false);
  const full = Array.from({ length: 21 }, (_, i) => pos('devA', 20 + (i % 3) - 1, i * 18, i * 4000));
  assert.equal(run(formatie, cfg, ctx1, full).solved, true);
  const back = [...half, ...half.slice().reverse()]; assert.equal(run(formatie, cfg, ctx1, back).solved, false, 'heen en terug is geen rondje');
  const close = Array.from({ length: 21 }, (_, i) => pos('devA', 3, i * 18, i * 4000)); assert.equal(run(formatie, cfg, ctx1, close).solved, false, 'te dicht bij het punt');
  const jumpy = Array.from({ length: 6 }, (_, i) => pos('devA', 20, i * 90, i * 4000)); assert.equal(run(formatie, cfg, ctx1, jumpy).solved, false, 'GPS-sprongen tellen niet');
});

// ---------------------------------------------------------------- qr
ok('qr: normalisatie en code uit URL', () => {
  assert.equal(normCode('Pof-Garde 27!'), 'pofgarde27'); assert.equal(extractCode('https://x.nl/?code=POF-ab#y'), 'POF-ab'); assert.equal(extractCode('  POF-X  '), 'POF-X');
});
ok('qr: server-ok beslist; zonder ok = controleren; ok:null valt terug op config.answer', () => {
  let d = run(qr, {}, {}, [{ t: 'scan', v: 'fout', ok: false }, { t: 'scan', v: 'nog' }]);
  assert.equal(d.tries.length, 1); assert.equal(d.checking, true); assert.equal(d.solved, false);
  d = qr.reduce(d, { t: 'scan', ok: true }); assert.equal(d.solved, true); assert.equal(d.checking, false);
  assert.equal(run(qr, { answer: 'POF-GARDE-27' }, {}, [{ t: 'scan', v: 'pof garde 27', ok: null }]).solved, true);
  const u = run(qr, {}, {}, [{ t: 'scan', v: 'x', ok: null }]); assert.equal(u.solved, false); assert.equal(u.tries[0].unknown, true);
  assert.equal(run(qr, { answer: 'A' }, {}, [{ t: 'scan', v: 'A', ok: false }]).solved, false, 'server-nee gaat voor config');
});
ok('qr: oude server zonder ok-veld valt terug op config.answer', () => {
  assert.equal(run(qr, { answer: 'X1' }, {}, [{ t: 'scan', v: 'x-1', at: '2026-11-09T10:00:00Z' }]).solved, true);
});
console.log(`\n${n} tests geslaagd`);
