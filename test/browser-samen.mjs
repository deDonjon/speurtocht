// Browsertest 'samen blijven' (13 nov): belt Mecha-Pof op een andere telefoon, dan toont deze telefoon de gouden balk #samen.
// Oorspronkelijke kop (browsertest van chat 5) in headless Chrome (Playwright), met de nep-Supabase uit test/fake-supabase.mjs:
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
await sleep(1500);
const banner = async () => (await page.$('#samen')) ? (await txt('#samen')) : '';

// ---- andere telefoon met Elin erop
await fake(f => { f.db.game.phase = 'puzzel'; f.patchGame({}); f.presence('zzzB', ['p2']); });
await sleep(900);
await page.click('#wk-ring [data-a=later]').catch(() => {}); // de oproep op deze telefoon zelf (als die radio is) eerst wegdrukken
await sleep(900);
ok('twee telefoons, geen balk zolang niemand belt', (await page.evaluate(() => window.pkm.state.devices().length)) === 2 && !(await banner()));

await fake(f => f.presence('zzzB', ['p2'], { k: 'ring' }));
await sleep(900);
let b = await banner();
ok('oproep elders → groot scherm "Mecha-Pof belt! Kijk bij Elin"', /belt! Kijk bij/.test(b) && b.includes('Elin') && /allemaal bij staan/.test(b), b);
ok('…schermvullend', (await page.evaluate(() => { const r = document.querySelector('#samen').getBoundingClientRect(); return r.width >= innerWidth - 1 && r.height >= innerHeight - 1; })));
await page.screenshot({ path: path.join(ROOT, 'test/out/samen.png') }).catch(() => {});
ok('balk ligt boven overlays (z-index)', (await page.evaluate(() => +getComputedStyle(document.querySelector('#samen')).zIndex)) >= 50);

await fake(f => f.presence('zzzB', ['p2'], { k: 'ring', voor: 'p1' }));
await sleep(900);
b = await banner();
ok('oproep voor Hannah op de andere telefoon → "belt voor jou, Hannah"', b.includes('voor jou, Hannah') && b.includes('Elin'), b);

await fake(f => f.presence('zzzB', ['p2'], { k: 'walkie' }));
await sleep(900);
b = await banner();
ok('walkie open elders → "Mecha-Pof praat! Kijk bij Elin"', /praat! Kijk bij/.test(b) && b.includes('Elin') && /luisteren/.test(b), b);
await page.click('#samen');
await sleep(300);
ok('tik → klein balkje bovenin', await page.evaluate(() => { const e = document.querySelector('#samen'); return e.classList.contains('klein') && e.getBoundingClientRect().height < 200; }));
await page.screenshot({ path: path.join(ROOT, 'test/out/samen-klein.png') }).catch(() => {});
await fake(f => f.presence('zzzB', ['p2'], { k: 'ring' }));
await sleep(900);
ok('nieuwe oproep → weer groot', await page.evaluate(() => !document.querySelector('#samen').classList.contains('klein')));

await fake(f => f.presence('zzzB', ['p2']));
await sleep(900);
ok('klaar met bellen → balk weg', !(await banner()));

await fake(f => f.presence('zzzB', ['p2'], { k: 'ring' }));
await sleep(900);
await fake(f => f.presence('zzzB', null));
await sleep(900);
ok('telefoon valt weg tijdens bellen → balk weg', !(await banner()));

// ---- deze telefoon meldt zelf dat hij belt (alleen nog één toestel = radio)
const before = await fake(f => f.tracks.length);
const atBefore = await fake(f => f.tracks[f.tracks.length - 1]?.at);
await page.evaluate(() => window.pkm.ringCall({ greeting: 'Bzzzt, test. Over!' }));
await sleep(1000);
let last = await fake(f => f.tracks[f.tracks.length - 1]);
ok('eigen oproep → presence busy ring', last?.busy?.k === 'ring', JSON.stringify(last));
ok('…met dezelfde `at` (rolverdeling verspringt niet)', last?.at === atBefore, `${last?.at} vs ${atBefore}`);
ok('eigen telefoon toont geen balk', !(await banner()));
await page.click('#wk-ring [data-a=answer]');
await sleep(1000);
last = await fake(f => f.tracks[f.tracks.length - 1]);
ok('opgenomen → busy walkie', last?.busy?.k === 'walkie', JSON.stringify(last));
await page.click('#walkie [data-a=close]').catch(() => {});
await sleep(1000);
last = await fake(f => f.tracks[f.tracks.length - 1]);
ok('opgehangen → busy weg', !last?.busy, JSON.stringify(last));
const n1 = await fake(f => f.tracks.length); await sleep(1500);
ok('geen extra presence-berichten zonder verandering', (await fake(f => f.tracks.length)) === n1);

ok('geen JS-fouten', !errors.length, errors.join(' | '));
await browser.close(); server.close();
console.log(`\n${n} goed, ${failed} fout`);
process.exit(failed ? 1 : 0);
