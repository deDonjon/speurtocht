// node test/node-chat7.mjs — chat 7 zonder browser: zinnen (monster-lines v7), finale-hulpjes (js/finale.js), install zonder deel,
// en de bonus-invoeging (dezelfde regel als regie.js: onderweg vóór de doelstop, bij een puzzel direct erna).
import assert from 'node:assert/strict';
globalThis.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
const { LINES } = await import('../js/monster-lines.js');
const { fillLine, badgeInfo, endCards, createFinale } = await import('../js/finale.js');
const { createInstall } = await import('../js/install.js');
const { TALENTS, PARTS } = await import('../js/state.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('zinnen: wek, loting per talent, kern, bonus, afscheid, teamfoto, eind per talent', () => {
  assert.ok(LINES.wek?.length && LINES.kern?.wacht?.length && LINES.bonus?.gevonden?.length && LINES.afscheid?.length && LINES.teamfoto?.length);
  for (const k of Object.keys(TALENTS)) { assert.ok(LINES.loting[k]?.[0]?.includes('{naam}'), 'loting ' + k); assert.ok(LINES.eind[k]?.[0]?.includes('{naam}'), 'eind ' + k); }
  assert.ok(LINES.walkie.briefing.bonus?.[0]?.trim().endsWith('Over!'));
  for (const k of Object.keys(PARTS)) assert.ok(LINES.installatie[k]?.length, 'installatie ' + k);
  assert.equal(LINES.mega.length, 3);
  const all = JSON.stringify(LINES); assert.ok(!/\bzo'n\b/.test(all));
});
t('fillLine: jarige, naam, hints in woorden', () => {
  assert.equal(fillLine('{naam}... Speurneus!', { naam: 'Elin' }), 'Elin... Speurneus!');
  assert.match(fillLine(LINES.vers[0], { jarige: 'Hannah' }), /want Hannah is vandaag tien/);
  assert.equal(fillLine('{Hints} hints, {hints}.', { hints: 3 }), 'Drie hints, drie.');
});
t('badgeInfo: monteur-<deel> en bijzondere badges', () => {
  assert.equal(badgeInfo('monteur-ogen').label, 'Monteur LED-ogen');
  assert.equal(badgeInfo('vonkenvanger').label, 'Vonkenvanger');
  assert.equal(badgeInfo('iets').label, 'iets');
});
t('endCards: jarige eerst, zin per talent, badges', () => {
  const players = [{ id: 'a', name: 'Elin', talent: 'speurneus', badges: ['monteur-ogen', 'kruimelaar-vanger'] }, { id: 'b', name: 'Hannah', is_birthday: true, talent: 'sleutelbewaarder', badges: ['wensvervuller'] }, { id: 'c', name: 'Isa', talent: null, badges: [] }];
  const html = endCards({ get: () => ({ players }) });
  assert.ok(html.indexOf('Hannah') < html.indexOf('Elin'));
  assert.match(html, /Elin vond mijn LED-ogen/); assert.match(html, /Ving de Kruimelaar/); assert.match(html, /Wensvervuller/); assert.match(html, /Isa hielp overal mee/);
});
{ // async: de volgorde van de finale met een nepmonster
  const said = [], stages = []; let confetti = 0;
  const mon = { say: async t => { said.push(t); return true; }, setParts() {}, setMood(m) { said.push('mood:' + m); } };
  const state = { get: () => ({ game: { hints: 0, started_at: 'x' }, players: [{ name: 'Hannah', is_birthday: true }] }) };
  const fin = createFinale({ mon, state, audio: { play() {} }, confetti: () => confetti++, onStage: s => stages.push(s), key: 'test' });
  const realTimeout = setTimeout; globalThis.setTimeout = (f, ms) => realTimeout(f, 0); // geen echte wachttijd
  await fin.start({ intro: 'Boterknop ingedrukt.' });
  globalThis.setTimeout = realTimeout;
  assert.deepEqual(stages, ['mega', 'vers', 'confetti', 'finale', 'eind']);
  assert.equal(said[0], 'Boterknop ingedrukt.'); assert.equal(said[1], 'mood:compleet');
  assert.match(said[2], /Systeemcontrole/); assert.match(said[4], /MEGA-MECHA-POF/); assert.match(said[5], /Hannah is vandaag tien/);
  assert.ok(confetti >= 1); assert.ok(fin.done);
  n++; console.log('✓ finale: volgorde intro → Mega 1-2-3 → vers → confetti → finale + hints → eind; daarna done');
}
t('install: stop zonder deel = geen ritueel', () => {
  const inst = createInstall({ mon: {}, sync: {}, state: { get: () => ({ game: {}, players: [] }), me: () => [], player: () => null }, PARTS, TALENTS, audio: {}, buzz() {}, confetti() {}, overlay() { throw new Error('geen overlay verwacht'); }, closeOverlay() {}, mslot: () => '', esc: s => s });
  assert.equal(inst.start({ part: null, stop_id: 'b1' }), false); assert.equal(inst.busy, false);
});
t('bonus invoegen: onderweg vóór de doelstop, bij een puzzel direct erna, niet na thuis', () => {
  const slot = g => { if (!['onderweg', 'puzzel', 'finale'].includes(g.phase)) return null; const i = g.phase === 'onderweg' ? g.active_index : g.active_index + 1; return i >= g.stop_order.length ? null : i; };
  const ord = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
  const ins = (g, id) => { const i = slot(g); if (i == null) return null; const o = [...g.stop_order]; o.splice(i, 0, id); return o; };
  assert.deepEqual(ins({ phase: 'onderweg', active_index: 4, stop_order: ord }, 'B3'), ['s1', 's2', 's3', 's4', 'B3', 's5', 's6', 's7']);
  assert.deepEqual(ins({ phase: 'puzzel', active_index: 5, stop_order: ord }, 'B1'), ['s1', 's2', 's3', 's4', 's5', 's6', 'B1', 's7']);
  assert.equal(ins({ phase: 'finale', active_index: 6, stop_order: ord }, 'B2'), null);
  assert.equal(ins({ phase: 'lobby', active_index: 0, stop_order: ord }, 'B2'), null);
});
console.log(`\n${n} tests goed.`);
process.exit(0); // state.js houdt een interval open
