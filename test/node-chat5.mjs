// Unit-test van chat 5 zonder browser:  node test/node-chat5.mjs
// - navvoice.js: alleen met ogen, alleen radio, hooguit eens per 20 s, warmer/kouder
// - puzzles/wachtwoord.js: unlock via de walkie en de getypte reserve
// - surprises.js (reducers): stemmen tellen, vonken optellen, Kruimelaar-afstand
import assert from 'node:assert/strict';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('✓', name); };
const run = (mod, cfg, ctx, moves) => moves.reduce((d, m) => mod.reduce(d, m, ctx), mod.init(cfg, ctx));

// ---------------------------------------------------------------- navvoice
const { createNavVoice, roundDist } = await import('../js/navvoice.js');
const STOP = { id: 's2', lat: 51.6168, lng: 5.5622 };
const north = m => ({ lat: STOP.lat + m / 110_540, lng: STOP.lng, acc: 8 });
function fakeState({ parts = ['lijf', 'ogen'], phase = 'onderweg', pos = north(150), me = 1 } = {}) {
  const s = { game: { id: 'g', phase, parts, active_index: 1 }, pos };
  return { get: () => s, activeStop: () => STOP, me: () => me ? [{ id: 'p' }] : [], on: () => () => {}, set pos(p) { s.pos = p; }, set parts(p) { s.game.parts = p; } };
}
ok('roundDist: 10 / 25 / 50 m-stappen', () => { assert.equal(roundDist(3), 10); assert.equal(roundDist(84), 80); assert.equal(roundDist(137), 125); assert.equal(roundDist(430), 450); });
ok('navvoice: zonder ogen zwijgt hij', () => {
  const st = fakeState({ parts: ['lijf'] }); let said = 0; let t = 100_000;
  const nav = createNavVoice({ mon: { say: () => said++ }, state: st, hasRole: () => true, lineText: () => 'x', now: () => t });
  nav.tick(t); t += 10_000; assert.equal(nav.tick(t), null); assert.equal(said, 0);
});
ok('navvoice: eerste zin na 6 s, daarna hooguit eens per 20 s, warmer en kouder', () => {
  const st = fakeState(); const said = []; let t = 100_000;
  const nav = createNavVoice({ mon: { say: x => said.push(x) }, state: st, hasRole: () => true, lineText: (sit, o) => `${o.sub}:${o.vars.afstand}`, now: () => t });
  assert.equal(nav.tick(t), null, 'direct na de start nog niets');
  t += 7_000; let r = nav.tick(t); assert.equal(r.sit, 'gelijk'); assert.equal(r.text, 'gelijk:150');
  st.pos = north(120); t += 5_000; assert.equal(nav.tick(t), null, 'binnen 20 s niets');
  t += 16_000; r = nav.tick(t); assert.equal(r.sit, 'warmer'); assert.equal(r.d > 100 && r.d < 140, true);
  st.pos = north(135); t += 21_000; r = nav.tick(t); assert.equal(r.sit, 'kouder');
  st.pos = north(133); t += 21_000; r = nav.tick(t); assert.equal(r.sit, 'gelijk', 'na 45 s mag "gelijk" weer');
  st.pos = north(131); t += 21_000; assert.equal(nav.tick(t), null, 'gelijk niet opnieuw binnen 45 s');
  st.pos = north(20); t += 21_000; r = nav.tick(t); assert.equal(r.sit, 'dichtbij');
  assert.equal(said.length, 5);
});
ok('navvoice: niet op een andere rol, niet bij een puzzel, niet met slechte GPS', () => {
  let t = 100_000;
  const a = createNavVoice({ mon: { say() {} }, state: fakeState(), hasRole: () => false, lineText: () => 'x', now: () => t }); a.tick(t); assert.equal(a.tick(t + 9_000), null);
  const b = createNavVoice({ mon: { say() {} }, state: fakeState({ phase: 'puzzel' }), hasRole: () => true, lineText: () => 'x', now: () => t }); b.tick(t); assert.equal(b.tick(t + 9_000), null);
  const c = createNavVoice({ mon: { say() {} }, state: fakeState({ pos: { ...north(100), acc: 60 } }), hasRole: () => true, lineText: () => 'x', now: () => t }); c.tick(t); assert.equal(c.tick(t + 9_000), null);
});

// ---------------------------------------------------------------- wachtwoord
const { default: ww } = await import('../js/puzzles/wachtwoord.js');
ok('wachtwoord: unlock via de walkie, hoofdletters en accenten maken niet uit', () => {
  const cfg = { password: 'stroopwafel|Stroop Wafel', answer: '1234' };
  assert.equal(run(ww, cfg, {}, [{ t: 'unlock', v: 'Stróópwafel!' }]).solved, true);
  const d = run(ww, cfg, {}, [{ t: 'unlock', v: 'pannenkoek' }]); assert.equal(d.solved, false); assert.equal(d.tries.length, 1);
  assert.equal(run(ww, cfg, {}, [{ t: 'answer', v: '1234' }]).how, 'code');
  assert.equal(run(ww, cfg, {}, [{ t: 'answer', v: 'stroopwafel' }]).solved, false, 'getypt telt alleen de code');
});
ok('wachtwoord: zonder password in de config vertrouwt de app de agent; zonder answer is de code het wachtwoord', () => {
  assert.equal(run(ww, {}, {}, [{ t: 'unlock', v: 'wat dan ook' }]).solved, true);
  assert.equal(run(ww, { password: 'garde' }, {}, [{ t: 'answer', v: 'GARDE' }]).solved, true);
});

// ---------------------------------------------------------------- surprises (pure hulpjes)
const { tally, roundSecondsLeft, BADGES } = await import('../js/surprises.js');
ok('surprises: stemmen tellen, laatste stem per speler telt', () => {
  const started = '2026-11-13T15:00:00Z';
  const ev = (type, player_id, payload, s) => ({ type, player_id, payload, at: `2026-11-13T15:00:${String(s).padStart(2, '0')}Z` });
  const events = [ev('fork.vote', 'p1', { choice: 'a' }, 5), ev('fork.vote', 'p2', { choice: 'b' }, 6), ev('fork.vote', 'p1', { choice: 'b' }, 7), ev('fork.vote', 'p3', { choice: 'a' }, 1), ev('storm.score', 'p1', { n: 4 }, 8), ev('storm.score', 'p2', { n: 7 }, 9), ev('storm.score', 'p9', { n: 99 }, 0)];
  // nieuwste eerst, zoals state.events
  const sorted = events.slice().sort((x, y) => y.at.localeCompare(x.at));
  assert.deepEqual(tally(sorted, 'fork.vote', started), { a: 1, b: 2, by: { p1: 'b', p2: 'b', p3: 'a' } });
  assert.equal(tally(sorted, 'storm.score', started).total, 11);
  assert.equal(roundSecondsLeft(started, 30, Date.parse('2026-11-13T15:00:12Z')), 18);
  assert.ok(BADGES.kruimelaar && BADGES.vonkenvanger && BADGES.jetpack && BADGES.wens);
});

console.log(`\n${n} tests goed.`);
