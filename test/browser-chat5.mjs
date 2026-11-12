// Browsertest van chat 5 in headless Chrome (Playwright), met de nep-Supabase uit test/fake-supabase.mjs:
//   node test/browser-chat5.mjs          (vereist: playwright + Chrome; bij Job: npx playwright install chromium)
// Loopt door: inloggen → stop.arrived laat de radiotelefoon overgaan → Opnemen opent de walkie → monster.call → Later →
// wachtwoordpuzzel op het scherm + unlock_stop-tool → gesproken navigatie met ogen → Kruimelaar → Kortsluiting (tikken) →
// Dubbel signaal (stem) → Jetpack oververhit → Verjaardagswens. Externe CDN's (Leaflet, fonts, ElevenLabs) zijn geblokkeerd.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
// playwright lokaal (npm i -D playwright) of globaal (npm i -g playwright; dan via NODE_PATH-achtige zoekplekken)
const req = createRequire(import.meta.url);
const pwPath = ['playwright', ...(process.env.NODE_PATH || '').split(':').filter(Boolean).map(d => path.join(d, 'playwright')), '/opt/npm-tools/node_modules/playwright'].find(c => { try { req.resolve(c); return true; } catch { return false; } });
if (!pwPath) { console.error('playwright niet gevonden: npm i -D playwright (of globaal) en npx playwright install chromium'); process.exit(2); }
const { chromium } = req(pwPath);

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(fs.readFileSync(f));
}).listen(0);
const PORT = server.address().port, BASE = `http://127.0.0.1:${PORT}`;

let n = 0, failed = 0;
const ok = (name, cond, extra = '') => { if (cond) { n++; console.log('✓', name); } else { failed++; console.log('✗', name, extra); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'reduce' }); // zonder animaties: de rinkelende knop wiebelt anders te veel om te klikken
const errors = [];
page.on('pageerror', e => errors.push(String(e.message || e)));
page.on('console', m => { if (m.type() === 'error' && !/leaflet|fonts|cdn|ERR_FAILED|net::|elevenlabs|supabase\.co|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
await page.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'test/fake-supabase.mjs'), 'utf8') });
  if (u.startsWith(BASE)) return route.continue();
  return route.abort(); // geen CDN's (Leaflet, Zdog, fonts, ElevenLabs): de app moet dan nog steeds werken
});
page.on('dialog', d => d.accept());
await page.goto(BASE + '/index.html');
const W = (sel, t = 6000) => page.waitForSelector(sel, { timeout: t });
const txt = async sel => (await page.textContent(sel).catch(() => '')) || '';
const fake = (fn, ...args) => page.evaluate(([f, a]) => { const r = (new Function('fake', 'pkm', 'args', 'return (' + f + ')(fake, pkm, ...args)'))(window.__fake, window.pkm, a); return r; }, [fn.toString(), args]);

// ---- inloggen
await W('input[aria-label="Code"]');
await page.fill('input[aria-label="Code"]', '1111');
await W('text=De grote boom', 8000).catch(() => {});
ok('ingelogd en onderweg naar de eerste plek', (await txt('#screen')).includes('De speeltuin'));
ok('rollen in de balk (1 toestel = alles)', (await txt('#bar')).includes('Radio'));

// ---- stop.arrived → de radiotelefoon gaat over
await fake((fake) => { fake.db.game.phase = 'puzzel'; fake.patchGame({}); const ps = { id: 'ps1', game_id: 'g1', stop_id: 's1', variant: 0, seed: 7, moves: [], hints: 0, arrived_at: new Date().toISOString(), solved_at: null, updated_at: new Date().toISOString() }; fake.db.puzzle_state.push(ps); fake.emit('puzzle_state', ps); fake.emit('event', { id: 'e-arr', game_id: 'g1', at: new Date().toISOString(), type: 'stop.arrived', actor: 'player', player_id: 'p1', payload: { stop_id: 's1' } }); });
await W('#wk-ring', 4000).catch(() => {});
ok('inkomende oproep bij stop.arrived', !!(await page.$('#wk-ring')) && (await txt('#wk-ring')).includes('Opnemen'));
ok('aankomst: monster zwijgt (geen ballon)', !(await page.$('.pkmon-bubble.show')));
await page.click('#wk-ring [data-a=answer]');
await W('#walkie', 4000).catch(() => {});
ok('Opnemen opent de walkie', !!(await page.$('#walkie')) && !(await page.$('#wk-ring')));
await sleep(1200);
ok('walkie zonder internet: geen verbinding, knop Opnieuw', (await txt('#walkie')).includes('Opnieuw proberen'));
await page.click('#walkie [data-a=close]');
await sleep(300);
ok('walkie dicht', !(await page.$('#walkie')));

// ---- wachtwoordpuzzel op het scherm + unlock_stop-tool
ok('wachtwoordpuzzel getekend met radio-uitleg', (await txt('#pz')).includes('wachtwoord') && (await txt('#pz')).includes('walkietalkie'));
const toolRes = await page.evaluate(async () => { const t = window.pkm.walkieTools(); return [await t.unlock_stop({ wachtwoord: 'pannenkoek' }), await t.unlock_stop({ wachtwoord: 'Stroop!' })]; });
ok('unlock_stop: fout wachtwoord → melding, goed → ingediend', /Fout/.test(toolRes[0]) && /binnen/.test(toolRes[1]), JSON.stringify(toolRes));
const rpcs = await fake(f => f.rpcLog.map(x => x.name + (x.args.p_move ? ':' + x.args.p_move.t : '')));
ok('server: puzzle_move unlock ×2 en complete_stop', rpcs.filter(x => x === 'puzzle_move:unlock').length === 2 && rpcs.includes('complete_stop'), rpcs.join(','));
await sleep(600);
ok('deel lijf binnen, installatie-overlay', (await txt('#ov')).includes('Deel gevonden'));
await page.evaluate(() => window.pkm.install.onBadge('monteur-lijf'));
await sleep(400);
await page.click('#ov button.ok').catch(() => {});
await sleep(300);

// ---- monster.call → Later
await fake(f => f.regie('monster.call', { player_id: 'p2', message_id: 'm1', text: 'Bzzzt, {naam}! Even een vraagje tussendoor. Over!' }));
await W('#wk-ring', 4000).catch(() => {});
ok('monster.call laat de radiotelefoon overgaan, met naam', (await txt('#wk-ring')).includes('Elin'));
await page.click('#wk-ring [data-a=later]');
await sleep(200);
ok('Later sluit de oproep', !(await page.$('#wk-ring')));
await fake(f => f.regie('monster.call', { player_id: 'p2', message_id: 'm1' }));
await sleep(300);
ok('zelfde message_id belt niet nog eens', !(await page.$('#wk-ring')));

// ---- gesproken navigatie met ogen
await fake(f => f.patchGame({ parts: ['lijf', 'ogen'], phase: 'onderweg', active_index: 1 }));
await sleep(300);
const navRes = await page.evaluate(() => { const st = window.pkm.state.activeStop(); window.pkm.sync.setPos({ lat: st.lat + 0.0012, lng: st.lng, acc: 8 }); const t = Date.now() + 10_000; return window.pkm.nav.tick(t); });
ok('navigatie zegt een afstand (ogen gevonden)', navRes && /meter/.test(navRes.text) && navRes.d > 100, JSON.stringify(navRes));
const navRes2 = await page.evaluate(() => { const st = window.pkm.state.activeStop(); window.pkm.sync.setPos({ lat: st.lat + 0.0008, lng: st.lng, acc: 8 }); return window.pkm.nav.tick(Date.now() + 31_000); });
ok('…en daarna warmer', navRes2?.sit === 'warmer', JSON.stringify(navRes2));
await fake(f => f.patchGame({ parts: ['lijf'] }));
ok('zonder ogen zwijgt hij', (await page.evaluate(() => window.pkm.nav.tick(Date.now() + 60_000))) === null);
await fake(f => f.patchGame({ parts: ['lijf', 'ogen'] }));

// ---- Kruimelaar
await fake(f => { const st = f.db.stop[1]; f.regie('thief.start', { part: 'lijf', points: [0, 1, 2, 3].map(i => ({ lat: st.lat + 0.0008 * Math.cos(i), lng: st.lng + 0.0008 * Math.sin(i) })) }); });
await W('#sp-ov', 3000).catch(() => {});
ok('Kruimelaar: overlay en banner', (await txt('#sp-ov')).includes('Kruimelaar') && (await txt('#sp-banner')).includes('Kruimelaar'));
await fake(f => f.regie('thief.jump', { i: 2 }));
await sleep(300);
ok('Kruimelaar springt naar punt 3', (await txt('#sp-ov')).includes('3 van 4'));
await fake(f => f.regie('thief.caught', {}));
await sleep(300);
ok('gevangen zonder armen = reservelaatje', (await txt('#sp-ov')).includes('reservelaatje'));
await sleep(5300);
ok('Kruimelaar-overlay vanzelf dicht', !(await page.$('#sp-ov')) && !(await page.$('#sp-banner')));

// ---- Kortsluiting
await fake(f => f.regie('storm.start', { seconds: 4 }));
await W('#sp-arena', 3000).catch(() => {});
await sleep(1200);
let hits = 0;
for (let k = 0; k < 12; k++) { const s = await page.$('#sp-ov .sp-spark:not(.hit)'); if (s) { await s.dispatchEvent('pointerdown'); hits++; } await sleep(120); }
ok('Kortsluiting: vonken verschijnen en tellen', hits >= 3 && +(await txt('#sp-taps')) === hits, `hits ${hits} taps ${await txt('#sp-taps')}`);
await sleep(3500);
ok('tijd om: wachten op de telling, scores verstuurd', (await txt('#sp-ov')).includes('telt'), await txt('#sp-ov'));
const scoreN = await fake(f => f.rpcLog.filter(x => x.name === 'log_event' && x.args.p_type === 'storm.score').reduce((n, x) => n + x.args.p_payload.n, 0));
ok('storm.score opgeteld = tikken', scoreN === hits, `${scoreN} vs ${hits}`);
await fake((f, pkm, total) => f.regie('storm.end', { total }), hits + 7);
await sleep(400);
ok('storm.end toont het totaal', (await txt('#sp-ov')).includes(String(hits + 7)));
ok('badge vonkenvanger bij ≥10 tikken (hier dus ' + (hits >= 10 ? 'wel' : 'niet') + ')', (await fake(f => f.rpcLog.some(x => x.name === 'award_badge' && x.args.p_badge === 'vonkenvanger'))) === (hits >= 10));
await page.click('#sp-ov [data-a=close]');

// ---- Dubbel signaal
await fake(f => f.regie('fork.open', { a: 'Linksaf langs het water', b: 'Rechtsaf door het steegje' }));
await W('#sp-ov .sp-fork', 3000).catch(() => {});
await page.click('#sp-ov .sp-fork [data-c=b]');
await sleep(400);
const vote = await fake(f => f.rpcLog.filter(x => x.name === 'log_event' && x.args.p_type === 'fork.vote').pop()?.args.p_payload);
ok('stem B verstuurd als fork.vote', vote?.choice === 'b' && vote?.player_id === 'p1', JSON.stringify(vote));
ok('eigen stem gemarkeerd, telling 1', (await page.$('#sp-ov .sp-fork [data-c=b].mine')) && (await txt('#sp-ov')).includes('1 stem'));
await fake(f => f.regie('fork.result', { choice: 'b' }));
await sleep(400);
ok('uitslag B', (await txt('#sp-ov')).includes('steegje') && !!(await page.$('#sp-ov .won[data-c=b]')));
await sleep(6200);

// ---- Poffertjespan (schuifpuzzel als verrassing; de regie zet game.surprise via patchGame)
await sleep(6500); // de uitslag van het dubbele signaal sluit vanzelf
await fake((f, pkm, image) => f.patchGame({ surprise: { kind: 'pan', started_at: new Date().toISOString(), data: { seed: 42, nums: !image, ...(image ? { image } : {}) } } }), process.env.PAN_IMG || ''); // PAN_IMG=test/mecha-pof-stijl.png: met een eigen plaatje
await W('#sp-pan', 3000).catch(() => {});
ok('Poffertjespan: overlay met 8 poffertjes en banner', (await page.$$('#sp-pan .pof')).length === 8 && (await txt('#sp-banner')).includes('Poffertjes'));
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '-pan1.png' });
const route = await fake((f, pkm) => { // kortste oplossing zoeken (breedte-eerst), als rij tegelnummers om te tikken
  const c = pkm.surprises.current, adj = (a, b) => Math.abs((a / 3 | 0) - (b / 3 | 0)) + Math.abs(a % 3 - b % 3) === 1;
  const seen = new Set([c.tiles.join('')]); let q = [{ t: c.tiles, e: c.empty, path: [] }];
  while (q.length) { const nx = []; for (const d of q) { if (d.t.every((x, k) => x === k)) return d.path; for (let i = 0; i < 9; i++) if (adj(i, d.e)) { const t = d.t.slice(); const tile = t[i]; [t[i], t[d.e]] = [t[d.e], t[i]]; const k = t.join(''); if (!seen.has(k)) { seen.add(k); nx.push({ t, e: i, path: [...d.path, tile] }); } } } q = nx; }
  return null; });
ok('Poffertjespan: oplosbaar', Array.isArray(route) && route.length > 0, String(route));
await page.click('#sp-pan .pof:not(.can)').catch(() => {});
ok('tik op een poffertje dat niet kan = geen zet', (await fake((f, pkm) => pkm.surprises.current.moves)) === 0);
for (const t of route || []) { await page.click(`#sp-pan [data-pof="${t}"]`); await sleep(30); }
await sleep(300);
ok('Poffertjespan opgelost: negende poffertje, zetten geteld, badge', (await page.$$('#sp-pan.done .pof')).length === 9 && (await txt('#sp-ov')).includes(`${route.length}`) && (await fake(f => f.rpcLog.some(x => x.name === 'award_badge' && x.args.p_badge === 'poffertjesbakker'))));
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '-pan2.png' });
await fake(f => f.patchGame({ surprise: null }));
await sleep(600);
// stand Makkelijk: weinig geschud, cijfers in de kuiltjes, groen randje, voorbeeld; na een minuut de hulpknop (hier: start 61 s geleden)
await fake(f => f.patchGame({ surprise: { kind: 'pan', started_at: new Date(Date.now() - 61000).toISOString(), data: { seed: 7, mode: 'makkelijk' } } }));
await W('#sp-pan', 3000).catch(() => {});
ok('Makkelijk: cijfers in de kuiltjes, voorbeeldplaatje en hulpknop', (await txt('#sp-pan [data-dimple="0"]')).trim() === '1' && !!(await page.$('.sp-panhelp figure img')) && !!(await page.$('#sp-pan-help:not([hidden])')));
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '-pan3.png' });
let helpN = 0;
for (; helpN < 12 && !(await page.$('#sp-pan.done')); helpN++) { await page.click('#sp-pan-help'); await page.click('#sp-pan .pof.hint'); await sleep(40); }
ok('Makkelijk: de hulp volgen lost hem in hooguit 10 zetten op', !!(await page.$('#sp-pan.done')) && helpN >= 6 && helpN <= 10, 'zetten ' + helpN);
await fake(f => f.patchGame({ surprise: null }));
await sleep(600);
// stand Wisselen: negen poffertjes, twee aantikken = ruilen
await fake(f => f.patchGame({ surprise: { kind: 'pan', started_at: new Date(Date.now() - 61000).toISOString(), data: { seed: 7, mode: 'wissel' } } }));
await W('#sp-pan', 3000).catch(() => {});
ok('Wisselen: negen poffertjes, geen leeg kuiltje', (await page.$$('#sp-pan .pof')).length === 9 && (await txt('#sp-banner')).includes('wisselen'));
await page.click('#sp-pan-help'); await sleep(60);
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '-pan4.png' });
ok('Wisselen: hulp laat de twee poffertjes oplichten die moeten ruilen', (await page.$$('#sp-pan .pof.hint')).length === 2);
for (let k = 0; k < 9 && !(await page.$('#sp-pan.done')); k++) {
  const [tile, at] = await fake((f, pkm) => { const t = pkm.surprises.current.tiles, i = t.findIndex((x, j) => x !== j); return [t[i], t[i]]; }); // poffertje `tile` hoort in kuiltje `tile`; daar ligt nu…
  const other = await fake((f, pkm, at) => pkm.surprises.current.tiles[at], at);
  await page.click(`#sp-pan [data-pof="${tile}"]`); await page.click(`#sp-pan [data-pof="${other}"]`); await sleep(40);
}
ok('Wisselen opgelost in hooguit 8 wissels', !!(await page.$('#sp-pan.done')) && (await fake((f, pkm) => pkm.surprises.current.moves)) <= 8);
await fake(f => f.patchGame({ surprise: null }));
await sleep(600);
ok('regie haalt de pan weg: overlay en banner dicht', !(await page.$('#sp-ov')) && !(await page.$('#sp-banner')));

// ---- Jetpack oververhit
await fake(f => f.regie('finale.timer', { seconds: 3 }));
await sleep(500);
ok('finaletimer in de banner', (await txt('#sp-banner')).includes('Jetpack'));
await sleep(3500);
ok('tijd om: jetpack sist, niet eng', (await txt('#sp-banner')).includes('sist'));
await fake(f => { f.db.game.stop_order = ['s1', 's2', 's3']; f.patchGame({ active_index: 2 }); f.emit('event', { id: 'e-home', game_id: 'g1', at: new Date().toISOString(), type: 'stop.arrived', actor: 'player', player_id: 'p1', payload: { stop_id: 's3' } }); });
await sleep(500);
ok('thuis = gered', (await txt('#sp-ov')).includes('Gered'));
ok('…en thuis belt Mecha-Pof met de hoed-briefing', (await txt('#wk-ring')).includes('Thuis'));
await page.click('#wk-ring [data-a=later]');
await sleep(6500);

// ---- Verjaardagswens (knop voor de jarige + event)
await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('pkm2_wenstip')).forEach(k => localStorage.removeItem(k))); // de start-herinnering kwam al langs tijdens de poffertjespan
await fake(f => f.patchGame({ phase: 'puzzel', active_index: 0, wish_used: false }));
await sleep(300);
ok('🎂-knop zichtbaar voor de jarige', !!(await page.$('#sp-wish')));
const tipOk = await page.waitForFunction(() => document.getElementById('sp-wish-tip')?.textContent.includes('verjaardagswens'), null, { timeout: 8000 }).then(() => true).catch(() => false);
ok('herinnering: ballonnetje naast de 🎂-knop', tipOk);
await page.screenshot({ path: path.join(ROOT, 'test/out/wens-tip.png') }).catch(() => {});
if (tipOk) await page.evaluate(() => document.getElementById('sp-wish-tip').click()); // tik op het ballonnetje = keuzeblad
else await page.evaluate(() => document.getElementById('sp-wish').click()); // de knop wiebelt (animatie), dus niet via de muis
await W('#sp-ov [data-w=hint]', 3000).catch(() => {});
await page.click('#sp-ov [data-w=hint]');
await sleep(500);
const wishEv = await fake(f => f.db.event.find(e => e.type === 'wish.used')?.payload);
ok('wish.used verstuurd (gratis hint)', wishEv?.for === 'gratis hint', JSON.stringify(wishEv));
ok('wens-overlay toont de hint uit de puzzelconfig', (await txt('#sp-ov')).includes('plakkerig'));
ok('🎂-knop weg na gebruik', !(await page.$('#sp-wish')));
ok('…en het ballonnetje ook', !(await page.$('#sp-wish-tip')));
ok('badge wensvervuller', await fake(f => f.rpcLog.some(x => x.name === 'award_badge' && x.args.p_badge === 'wensvervuller')));

ok('geen JavaScript-fouten', errors.length === 0, errors.join(' | '));
await page.screenshot({ path: '/tmp/claude-0/-home-claude/67c7fc26-2e4d-56b2-9e21-baafd7d0c527/scratchpad/chat5-wens.png' }).catch(() => {});
await browser.close(); server.close();
console.log(`\n${n} goed, ${failed} fout.`);
process.exit(failed ? 1 : 0);
