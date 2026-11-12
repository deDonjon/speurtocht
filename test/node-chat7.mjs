// node test/node-chat7.mjs — chat 7 zonder browser: zinnen (monster-lines v7), finale-hulpjes (js/finale.js), install zonder deel,
// en de bonus-invoeging (dezelfde regel als regie.js: onderweg vóór de doelstop, bij een puzzel direct erna).
import assert from 'node:assert/strict';
globalThis.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
const { LINES } = await import('../js/monster-lines.js');
const { fillLine, badgeInfo, endCards, createFinale, buildHighlights } = await import('../js/finale.js');
const { createInstall } = await import('../js/install.js');
const { TALENTS, PARTS } = await import('../js/state.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('zinnen: wek, loting per talent, kern, bonus, afscheid, teamfoto, eind per talent', () => {
  assert.ok(LINES.wek?.length && LINES.kern?.wacht?.length && LINES.bonus?.gevonden?.length && LINES.afscheid?.length && LINES.teamfoto?.length);
  for (const k of Object.keys(TALENTS)) { assert.ok(LINES.loting[k]?.[0]?.includes('{naam}'), 'loting ' + k); assert.ok(LINES.eind[k]?.[0]?.includes('{naam}'), 'eind ' + k); }
  assert.ok(LINES.walkie.briefing.bonus?.[0]?.trim()); // het slot ("… over en sluiten. Over!") komt uit walkie.briefingSlot
  for (const k of ['werkbank', 'wachtwoord', 'hoed']) assert.ok(LINES.walkie.briefingSlot[k].tekst.endsWith('Over!') && LINES.walkie.briefingSlot[k].zeg.includes('over en sluiten'));
  for (const k of Object.keys(PARTS)) assert.ok(LINES.installatie[k]?.length, 'installatie ' + k);
  assert.ok(LINES.mega.check?.length && LINES.mega.onthul?.length && LINES.taart?.[0]?.includes('taart') && LINES.walkie.afscheid?.[0]?.endsWith('Over!'));
  const all = JSON.stringify(LINES); assert.ok(!/\bzo'n\b/.test(all));
});
t('fillLine: jarige, naam, hints in woorden', () => {
  assert.equal(fillLine('{naam}... Speurneus!', { naam: 'Elin' }), 'Elin... Speurneus!');
  assert.match(fillLine(LINES.vers[0][0], { jarige: 'Hannah' }), /want Hannah is vandaag tien/);
  assert.ok(LINES.dj?.[0] && LINES.hiep?.length === 3 && LINES.dans?.[0]);
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
t('terugblik: hoogtepunten uit spelstand en puzzeltijden', () => {
  const t = m => new Date(Date.UTC(2026, 10, 13, 14, 30) + m * 60000).toISOString();
  const d = { game: { started_at: t(0), finished_at: t(95), drops: 86, hints: 2, parts: ['lijf'] }, players: [{ id: 'a', name: 'Elin', badges: ['kruimelaar-vanger', 'vonkenvanger'] }, { id: 'b', name: 'Hannah', is_birthday: true, badges: ['wensvervuller'] }],
    stops: [{ id: 's1', name: 'De palenrij', part: 'lijf' }, { id: 's2', name: 'Het bruggetje', part: 'ogen' }, { id: 's3', name: 'Het kastje', part: 'neus' }, { id: 'h', key: 'home', name: 'Thuis', part: 'hoed' }],
    puzzle_states: [{ stop_id: 's1', arrived_at: t(5), solved_at: t(9) }, { stop_id: 's2', arrived_at: t(20), solved_at: t(21.2), solved_by: 'a' }, { stop_id: 's3', arrived_at: t(40), solved_at: t(47) }, { stop_id: 'h', arrived_at: t(90), solved_at: t(90.5) }],
    events: [{ type: 'storm.end', payload: { total: 37 } }] };
  const h = buildHighlights(d), txt = JSON.stringify(h);
  assert.match(h[0].title, /1 uur en 35 min op pad/); assert.match(txt, /Snelste klus: 1:12/); assert.match(txt, /opgelost door Elin/); assert.match(txt, /Taaiste klus: 7:00/);
  assert.match(txt, /Kruimelaar gevangen/); assert.match(txt, /37 vonken/); assert.match(txt, /Hannah deed haar wens/); assert.match(txt, /86 stroopdruppels/); assert.ok(h.length <= 8);
  assert.ok(buildHighlights({ game: { started_at: 'x' }, players: [] }).length >= 2, 'werkt ook zonder tijden');
});
{ // async: de volgorde van de finale met een nepmonster
  const said = [], stages = []; let confetti = 0;
  const mon = { say: async t => { said.push(t); return true; }, setParts() {}, setMood(m) { said.push('mood:' + m); } };
  const state = { get: () => ({ game: { hints: 0, started_at: 'x' }, players: [{ name: 'Hannah', is_birthday: true }] }) };
  const fin = createFinale({ mon, state, audio: { play() {} }, confetti: () => confetti++, onStage: s => stages.push(s), key: 'test' });
  const realTimeout = setTimeout; globalThis.setTimeout = (f, ms) => realTimeout(f, 0); // geen echte wachttijd
  await fin.start({ intro: 'Boterknop ingedrukt.' });
  globalThis.setTimeout = realTimeout;
  assert.deepEqual(stages.filter((x, i) => x !== stages[i - 1]), ['check', 'mega', 'vers', 'confetti', 'terugblik', 'taart', 'eind']);
  assert.ok(stages.filter(x => x === 'terugblik').length >= 2, 'een paar dia\'s');
  const zin = said.filter(x => !x.startsWith('mood:'));
  assert.equal(zin[0], 'Boterknop ingedrukt.'); assert.ok(said.indexOf('mood:compleet') > said.findIndex(x => /Systeemcontrole/.test(x)));
  assert.match(zin[1], /Systeemcontrole/); assert.match(zin[2], /MEGA-MECHA-POF/); assert.match(zin[3], /DJ Mecha-Pof/); assert.match(zin[4], /Hannah is vandaag tien/); assert.ok(said.some(x => /Hiep hiep/.test(x)) && said.some(x => /Robotdans/.test(x)));
  assert.ok(zin.findIndex(x => /taart/.test(x)) > zin.findIndex(x => /Robotdans/.test(x))); assert.match(zin.at(-1), /taart/i); assert.ok(!zin.some(x => /over en sluiten/i.test(x)), 'geen walkie-afscheid meer');
  assert.ok(zin.every(x => x.split(/\s+/).length <= 18), 'elke zin kort (max 18 woorden)');
  assert.ok(confetti >= 1); assert.ok(fin.done);
  n++; console.log('✓ finale: volgorde intro → check → Mega → DJ → rapje → hiep → dans → confetti → taart → afscheid; korte zinnen; daarna done');
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
{ // hoera-meter: met een open microfoon drie rondes 'hoera' met de beste score en een uitslagzin; daarna gewoon verder
  const { pct, hoeraTier, hoeraLabel } = await import('../js/hoera.js');
  const { hoeraHTML } = await import('../js/finale.js');
  assert.equal(pct(-46), 0); assert.equal(pct(-14), 100); assert.equal(pct(-30), 50); assert.equal(pct(0), 100); assert.equal(pct(-90), 0);
  assert.equal(hoeraTier(95), 'mega'); assert.equal(hoeraTier(70), 'hard'); assert.equal(hoeraTier(10), 'zacht'); assert.match(hoeraLabel(95), /MEGA/);
  for (const k of ['mega', 'hard', 'zacht']) assert.ok(LINES.hoera[k][0].split(/\s+/).length <= 15, 'korte uitslagzin');
  const said = [], stages = [], seen = []; const rounds = [40, 95, 70]; let r = 0, closed = 0, levels = 0;
  const mon = { say: async t => { said.push(t); return true; }, setParts() {}, setMood() {} };
  const state = { get: () => ({ game: { hints: 0, started_at: 'h' }, players: [{ name: 'Hannah', is_birthday: true }] }) };
  const meter = { ok: false, async open() { this.ok = true; return true; }, async listen(ms, cb) { cb(10, rounds[r]); return rounds[r++]; }, close() { closed++; this.ok = false; } };
  let fin; fin = createFinale({ mon, state, audio: { play() {} }, confetti() {}, hoera: meter, onHoera: () => levels++, key: 'testh', onStage: s => { stages.push(s); if (s === 'hoera') seen.push(JSON.stringify(fin.hoera)); } });
  const realTimeout = setTimeout; globalThis.setTimeout = (f, ms) => realTimeout(f, 0);
  await fin.start();
  globalThis.setTimeout = realTimeout;
  assert.deepEqual(stages.filter((x, i) => x !== stages[i - 1]), ['check', 'mega', 'vers', 'hoera', 'vers', 'confetti', 'terugblik', 'taart', 'eind']);
  assert.deepEqual(fin.hoera.scores, [40, 95, 70]); assert.equal(fin.hoera.best, 95); assert.equal(levels, 3); assert.ok(closed >= 1, 'microfoon weer los');
  assert.ok(seen.some(x => /"luister":true/.test(x)));
  const i3 = said.findIndex(x => /laatste! Hiep/.test(x)); assert.match(said[i3 + 1], /Hoera-meter: MEGA/); assert.match(said[i3 + 2], /Robotdans/);
  assert.match(hoeraHTML(fin.hoera), /MEGA-HOERA/); assert.match(hoeraHTML({ ronde: 1, n: 3, scores: [40], luister: true, best: 40 }), /HOERA!!!/);
  // microfoon geweigerd: geen stap 'hoera', de finale loopt zoals altijd
  const st2 = []; const fin2 = createFinale({ mon, state, audio: { play() {} }, confetti() {}, hoera: { ok: false, async open() { return false; }, close() {} }, key: 'testh2', onStage: s => st2.push(s) });
  globalThis.setTimeout = (f, ms) => realTimeout(f, 0); await fin2.start(); globalThis.setTimeout = realTimeout;
  assert.ok(st2.includes('hoera') && fin2.hoera.mic === false && !fin2.hoera.scores.length, 'zonder microfoon: wel HOERA in beeld, geen scores'); assert.ok(fin2.done);
  assert.match(hoeraHTML(fin2.hoera), /geen microfoon/);
  n++; console.log('✓ hoera-meter: drie rondes, beste telt, uitslagzin; zonder microfoon gewoon de oude finale');
  // tien kaarsjes (kern.html: kaarsjes: true): na de hoera-meter, uitblazen via de microfoon; te zacht = Mecha-Pof helpt; zonder microfoon vanzelf
  const { kaarsHTML, KAARS_N } = await import('../js/finale.js');
  const run = async (meter, key) => { const said = [], stages = [], uit = []; let fin; fin = createFinale({ mon: { say: async t => { said.push(t); return true; }, setParts() {}, setMood() {} }, state, audio: { play() {} }, confetti() {}, hoera: meter, kaarsjes: true, key, onStage: s => { stages.push(s); if (s === 'kaarsjes') uit.push(fin.kaars.uit); } });
    globalThis.setTimeout = (f, ms) => realTimeout(f, 0); await fin.start(); globalThis.setTimeout = realTimeout; return { said, stages: stages.filter((x, i) => x !== stages[i - 1]), uit, fin }; };
  const hard = await run({ ok: false, async open() { this.ok = true; return true; }, async listen(ms, cb) { for (let i = 0; i < 500; i++) if (cb(100, 100) === true) return 100; return 100; }, close() { this.ok = false; } }, 'testk1');
  assert.deepEqual(hard.stages, ['check', 'mega', 'vers', 'hoera', 'vers', 'kaarsjes', 'vers', 'confetti', 'terugblik', 'taart', 'eind']);
  assert.equal(hard.fin.kaars.uit, KAARS_N); assert.ok(hard.fin.kaars.klaar && !hard.fin.kaars.hulp); assert.deepEqual([...new Set(hard.uit)], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const ik = hard.said.findIndex(x => /tien kaarsjes! Hannah/.test(x)); assert.ok(ik > hard.said.findIndex(x => /^Hoera-meter/.test(x))); assert.match(hard.said[ik + 1], /Alle tien uit! Je wens staat/); assert.match(hard.said[ik + 2], /Robotdans/);
  const zacht = await run({ ok: false, async open() { this.ok = true; return true; }, async listen(ms, cb) { for (let i = 0; i < 50; i++) cb(10, 10); return 10; }, close() { this.ok = false; } }, 'testk2');
  assert.equal(zacht.fin.kaars.uit, KAARS_N); assert.ok(zacht.fin.kaars.hulp); assert.ok(zacht.said.some(x => /ventilator/.test(x)));
  const geen = await run({ ok: false, async open() { return false; }, close() {} }, 'testk3');
  assert.ok(geen.stages.includes('kaarsjes')); assert.equal(geen.fin.kaars.uit, KAARS_N); assert.ok(!geen.fin.kaars.hulp && geen.fin.done);
  assert.equal((kaarsHTML({ n: 10, uit: 4, luister: true }).match(/class="k uit"/g) || []).length, 4); assert.match(kaarsHTML({ n: 10, uit: 4, luister: true }), /BLAZEN/); assert.match(kaarsHTML(hard.fin.kaars), /Alle tien uit/);
  for (const k of ['start', 'uit', 'hulp']) assert.ok(LINES.kaars[k][0].length < 400);
  n++; console.log('✓ kaarsjes: tien uitblazen via de microfoon, hulp als het te zacht is, zonder microfoon vanzelf; daarna de robotdans');
  // vierde verjaardagswens: papa moet het doen
  assert.match(LINES.wens.papa[0], /Papa van \{jarige\}/); assert.ok(LINES.wens.papa[0].length < 400); assert.match(LINES.loting.sleutelbewaarder[0], /papa/); assert.match(LINES.uitleg[5], /heeft één verjaardagswens.*papa/);
  n++; console.log('✓ wens: papa moet het doen staat in de zinnen (wens, loting, uitleg)');
}
console.log(`\n${n} tests goed.`);
process.exit(0); // state.js houdt een interval open
