// node test/node-planning.mjs — schema, verwachte eindtijd en seintjes voor de regie (js/planning.js)
import assert from 'node:assert/strict';
import { stand, seintjes, lagText, PLAN, PLAN_TOTAL } from '../js/planning.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const T0 = Date.parse('2026-11-13T15:30:00+01:00'), min = m => T0 + m * 60000;
const ids = a => a.map(x => x.id);

t('vóór de start: geen stand', () => { assert.equal(stand({ phase: 'lobby', startedAt: null }), null); assert.equal(stand({ phase: 'onderweg' }), null); });
t('net gestart, onderweg naar plek 1: op schema, klaar om 16:56', () => {
  const s = stand({ phase: 'onderweg', parts: [], activePart: 'lijf', startedAt: T0, now: min(3) });
  assert.equal(Math.round(s.lag), 0); assert.equal(Math.round(s.rest), PLAN_TOTAL - 3); assert.equal(s.eta, min(86)); assert.equal(s.done, 0);
});
t('te lang onderweg naar plek 1: achterstand loopt op', () => {
  const s = stand({ phase: 'onderweg', parts: [], startedAt: T0, now: min(11) });
  assert.equal(Math.round(s.lag), 5); assert.equal(lagText(s.lag), '5 min achter'); assert.equal(s.eta, min(91));
});
t('vroeg aangekomen bij plek 2: voor op schema', () => {
  const s = stand({ phase: 'puzzel', parts: ['lijf'], activePart: 'ogen', startedAt: T0, arrivedAt: min(14), lastSolvedAt: min(10), now: min(15) });
  assert.equal(Math.round(s.lag), -5); assert.equal(lagText(s.lag), '5 min voor'); assert.equal(s.waar, 'puzzel'); assert.equal(s.traag, 0);
});
t('puzzel duurt te lang: traag + achterstand', () => {
  const s = stand({ phase: 'puzzel', parts: ['lijf'], activePart: 'ogen', startedAt: T0, arrivedAt: min(19), lastSolvedAt: min(13), now: min(34) });
  assert.equal(s.traag, 15); assert.equal(Math.round(s.lag), 6);
});
t('onderweg na plek 3, precies op schema', () => {
  const s = stand({ phase: 'onderweg', parts: ['lijf', 'ogen', 'neus'], activePart: 'mond', startedAt: T0, lastSolvedAt: min(40), now: min(42) });
  assert.equal(Math.round(s.lag), 0); assert.equal(s.done, 3); assert.equal(lagText(s.lag), 'op schema'); assert.equal(s.eta, min(86));
});
t('bonus (plek zonder deel) telt als onderweg; oude solved_at van een vorig spel telt niet', () => {
  const s = stand({ phase: 'puzzel', parts: ['lijf', 'ogen', 'neus'], activePart: '', startedAt: T0, lastSolvedAt: min(40), now: min(50) });
  assert.equal(s.waar, 'bonus'); assert.equal(Math.round(s.planNow), PLAN.mond.aan); assert.equal(Math.round(s.lag), 6);
  const o = stand({ phase: 'onderweg', parts: ['lijf'], startedAt: T0, lastSolvedAt: T0 - 3600e3, now: min(13) });
  assert.equal(Math.round(o.planNow), PLAN.lijf.klaar);
});
t('klaar: duur en verschil met het schema', () => {
  const s = stand({ phase: 'klaar', parts: Object.keys(PLAN), startedAt: T0, lastSolvedAt: min(90), now: min(120) });
  assert.equal(s.klaar, true); assert.equal(Math.round(s.duur), 90); assert.equal(Math.round(s.lag), 4); assert.deepEqual(seintjes({ st: s, phase: 'klaar' }), []);
});
const st = (phase, parts, extra = {}) => stand({ phase, parts, startedAt: T0, lastSolvedAt: min(PLAN[parts.at(-1)]?.klaar ?? 0), now: min((PLAN[parts.at(-1)]?.klaar ?? 0) + 1), ...extra });
t('Dubbel signaal: alleen onderweg van plek 3 naar 4, één keer', () => {
  const p = ['lijf', 'ogen', 'neus'];
  assert.deepEqual(ids(seintjes({ st: st('onderweg', p), phase: 'onderweg', parts: p })), ['fork']);
  assert.deepEqual(ids(seintjes({ st: st('onderweg', p), phase: 'onderweg', parts: p, used: { fork: 1 } })), []);
  assert.deepEqual(ids(seintjes({ st: st('onderweg', ['lijf', 'ogen']), phase: 'onderweg', parts: ['lijf', 'ogen'] })), []);
});
t('Kruimelaar: pas als de armen vastzitten (na plek 5), niet na plek 3', () => {
  const p3 = ['lijf', 'ogen', 'neus'], p5 = ['lijf', 'ogen', 'neus', 'mond', 'armen'];
  assert.ok(!ids(seintjes({ st: st('onderweg', p3), phase: 'onderweg', parts: p3 })).includes('thief'));
  const s = seintjes({ st: st('onderweg', p5), phase: 'onderweg', parts: p5, monteur: { armen: 'Lauren' } });
  assert.deepEqual(ids(s), ['thief']); assert.match(s[0].tekst, /Lauren/);
  assert.deepEqual(ids(seintjes({ st: st('onderweg', p5), phase: 'onderweg', parts: p5, surprise: 'pan' })), []); // één tegelijk
});
t('na de benen: timer; Kortsluiting bij het tankstation, ook terwijl de timer loopt', () => {
  const p = ['lijf', 'ogen', 'neus', 'mond', 'armen', 'benen'], s0 = st('onderweg', p);
  assert.deepEqual(ids(seintjes({ st: s0, phase: 'onderweg', parts: p, nearTank: false })), ['finale']);
  assert.deepEqual(ids(seintjes({ st: s0, phase: 'onderweg', parts: p, nearTank: null })), ['finale', 'storm']); // geen GPS: meteen melden
  assert.deepEqual(ids(seintjes({ st: s0, phase: 'onderweg', parts: p, nearTank: true, surprise: 'finale', used: { finale: 1 } })), ['storm']);
  assert.deepEqual(ids(seintjes({ st: s0, phase: 'onderweg', parts: p, nearTank: true, used: { finale: 1, storm: 1 } })), []);
});
t('voor op schema: bonus; trage puzzel: hint (niet als er al een hint is)', () => {
  const p = ['lijf', 'ogen', 'neus'];
  const voor = stand({ phase: 'onderweg', parts: p, startedAt: T0, lastSolvedAt: min(33), now: min(34) });
  assert.ok(ids(seintjes({ st: voor, phase: 'onderweg', parts: p, used: { fork: 1 } })).includes('bonus-3'));
  const traag = stand({ phase: 'puzzel', parts: ['lijf'], activePart: 'ogen', startedAt: T0, arrivedAt: min(19), now: min(33) });
  assert.deepEqual(ids(seintjes({ st: traag, phase: 'puzzel', parts: ['lijf'] })), ['traag-1']);
  assert.deepEqual(ids(seintjes({ st: traag, phase: 'puzzel', parts: ['lijf'], hints: 1 })), []);
});
console.log(`\n${n} tests goed.`);
