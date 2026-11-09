// Browsertest van het 3D-speelbord (js/board.js, bord.html, de 3D-knop in index.html) in headless Chrome met de nep-Supabase.
//   node test/browser-bord.mjs        → screenshots in test/out/bord-*.png
// Overpass wordt onderschept met een verzonnen mini-kaart (huizen langs de route, een straat, een sloot, bomen).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROUTE } from '../js/board-data.js';
const req = createRequire(import.meta.url);
const pwPath = ['playwright', '/opt/npm-tools/node_modules/playwright'].find(c => { try { req.resolve(c); return true; } catch { return false; } });
if (!pwPath) { console.error('playwright niet gevonden'); process.exit(2); }
const { chromium } = req(pwPath);
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.join(ROOT, 'test/out'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((rq, res) => {
  const f = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(fs.readFileSync(f));
}).listen(0);
// Leaflet uit npm (npm pack leaflet@1.9.4) als LEAFLET_DIR gezet is; anders draait de app zonder kaart en slaat de 3D-test over
const LEAFLET = process.env.LEAFLET_DIR || null;
const BASE = `http://127.0.0.1:${server.address().port}`;
let n = 0, failed = 0;
const ok = (name, cond, extra = '') => { if (cond) { n++; console.log('✓', name); } else { failed++; console.log('✗', name, extra); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => new Date().toISOString();

// verzonnen Overpass-antwoord
function fakeOverpass() {
  const el = []; let id = 1; const M = 1 / 111230, ML = 1 / (111320 * Math.cos(51.6143 * Math.PI / 180));
  const sq = (lat, lng, w, h) => [[lat, lng], [lat, lng + w * ML], [lat - h * M, lng + w * ML], [lat - h * M, lng], [lat, lng]].map(([la, lo]) => ({ lat: la, lon: lo }));
  ROUTE.forEach(([, lat, lng], i) => { if (i % 2) return; el.push({ type: 'way', id: id++, tags: { building: 'house' }, geometry: sq(lat + 22 * M, lng - 5 * ML, 10, 9) }); el.push({ type: 'way', id: id++, tags: { building: 'house', 'building:levels': '2' }, geometry: sq(lat - 16 * M, lng + 14 * ML, 9, 11) }); });
  el.push({ type: 'way', id: id++, tags: { highway: 'residential' }, geometry: ROUTE.slice(6, 16).map(([, la, lo]) => ({ lat: la + 30 * M, lon: lo + 30 * ML })) });
  el.push({ type: 'way', id: id++, tags: { waterway: 'ditch' }, geometry: [{ lat: 51.61388, lon: 5.5598 }, { lat: 51.61398, lon: 5.5606 }, { lat: 51.61405, lon: 5.56145 }] });
  el.push({ type: 'way', id: id++, tags: { landuse: 'grass' }, geometry: sq(51.6131, 5.5612, 40, 30) });
  for (let i = 0; i < 25; i++) el.push({ type: 'node', id: id++, lat: 51.6150 + Math.sin(i) * 0.0008, lon: 5.5640 + Math.cos(i * 1.3) * 0.0012, tags: { natural: 'tree' } });
  return { elements: el };
}
function world({ phase = 'onderweg', active = 2, parts = ['lijf', 'ogen'] } = {}) {
  const P = [['p1', 'Hannah', 'sleutelbewaarder', true], ['p2', 'Elin', 'speurneus'], ['p3', 'Isa', 'kaartlezer'], ['p4', 'Evy', 'codekraker'], ['p5', 'Lauren', 'rekenmeester'], ['p6', 'Julia', 'tijdbewaker']];
  const player = P.map(([id, name, talent, b], i) => ({ id, game_id: 'g1', name, is_birthday: !!b, part: null, talent, color: ['#FFE98A', '#7FE8FF', '#FF5A4E', '#4ADE80', '#B794F6', '#F59E2E'][i], badges: [], device_id: 'd' + i, last_seen_at: now(), lat: 51.61395 + i * 0.00002, lng: 5.56185, acc: 8 }));
  const coords = ROUTE.filter(r => r[3]);
  const names = ['De palenrij bij de zaaier', 'Het bord met de sokjes', 'Het veldje aan het pad', 'De Stadsbrink', 'Het groene kastje', 'Het huis met de steen', 'Thuis op het erf'];
  const partsK = ['lijf', 'ogen', 'neus', 'mond', 'armen', 'benen', 'hoed'];
  const stop = coords.map(([, lat, lng, seq]) => ({ id: 's' + seq, game_id: 'g1', seq, key: seq === 1 ? 'start' : seq === 7 ? 'home' : null, name: names[seq - 1], clue: 'Aanwijzing', lat, lng, radius: 20, part: partsK[seq - 1], puzzles: [{ type: 'code', question: '?', answer: '1' }] }));
  return { game: { id: 'g1', code: 'hannah10', title: 'Mecha-Pof', phase, stop_order: stop.map(s => s.id), active_index: active, parts, drops: 20, hints: 0, energy: 2, wish_used: false, surprise: null, settings: { radius: 20, min_gap: 150, any_can_submit: false }, started_at: now(), finished_at: null },
    player, stop, puzzle_state: [], event: [], codes: { 5243: 'p1' } };
}
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(file, init, { width = 390, height = 844, overpass = true, keepCache = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: width < 600 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_FAILED|net::|Failed to load resource|leaflet|tile/i.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(i => { globalThis.__FAKE_INIT = i; try { localStorage.setItem('pkm2_muted', 'true'); } catch {} }, init);
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'test/fake-supabase.mjs'), 'utf8') });
    if (/leaflet\/1\.9\.4\/leaflet\.min\.js/.test(u) && LEAFLET) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(LEAFLET, 'leaflet.js'), 'utf8') });
    if (/leaflet\/1\.9\.4\/leaflet\.min\.css/.test(u) && LEAFLET) return route.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(LEAFLET, 'leaflet.css'), 'utf8') });
    if (/zdog/.test(u)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'test/vendor/zdog.dist.min.js'), 'utf8') });
    if (/overpass/.test(u)) return overpass ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeOverpass()) }) : route.abort();
    if (u.startsWith(BASE)) return route.continue();
    return route.abort();
  });
  await page.goto(BASE + '/' + file);
  const until = async (fn, t = 15000) => { const end = Date.now() + t; while (Date.now() < end) { if (await page.evaluate(fn).catch(() => false)) return true; await sleep(250); } return false; };
  return { page, errors, until };
}

console.log('— bord.html?regie (laptop, live stand, kaart via Overpass)');
{ const { page, errors, until } = await open('bord.html?regie', world(), { width: 1400, height: 900 });
  ok('bord gebouwd', await until(() => window.__board?.info().cells > 300));
  ok('echte kaart live opgehaald', await until(() => window.__board.info().osm === 'live'), JSON.stringify(await page.evaluate(() => window.__board?.info())));
  const inf = await page.evaluate(() => window.__board.info());
  ok('gebouwen uit de kaart', inf.buildings > 10, JSON.stringify(inf));
  ok('volgende stop = 3, lijn > 20 m', inf.targetSeq === 3 && inf.lineMeters > 20, JSON.stringify(inf));
  ok('regie: bonuslabels zichtbaar', await page.evaluate(() => [...document.querySelectorAll('.pkb-tag.bonus')].some(e => !e.hidden)));
  await page.evaluate(() => document.querySelector('.pkb-tag.next')?.click()); await sleep(300);
  ok('kaartje van stop 3 met antwoord', /Driehoek/.test(await page.textContent('.pkb-card')));
  await sleep(1500); await page.screenshot({ path: path.join(OUT, 'bord-regie-laptop.png') });
  ok('geen JS-fouten', !errors.length, errors.join(' | '));
  await page.close(); }

console.log('— bord.html?demo (telefoon, spelers, geen Overpass)');
{ const { page, errors, until } = await open('bord.html?demo', world(), { overpass: false });
  ok('bord gebouwd zonder kaart', await until(() => window.__board?.info().cells > 300 && window.__board.info().osm === 'geen'));
  await page.evaluate(() => { const r = document.querySelector('#prog'); r.value = 3.45; r.dispatchEvent(new Event('input')); });
  await sleep(2500);
  const inf = await page.evaluate(() => window.__board.info());
  ok('demo: 3 delen, volgende = 4', inf.reached === 3 && inf.targetSeq === 4, JSON.stringify(inf));
  ok('spelers: geen regie-labels', await page.evaluate(() => ![...document.querySelectorAll('.pkb-tag.bonus,.pkb-tag.surprise')].some(e => !e.hidden)));
  ok('spelers: stop 6 verborgen', await page.evaluate(() => ![...document.querySelectorAll('.pkb-tag')].some(e => !e.hidden && e.textContent.startsWith('6'))));
  ok('dock: drie delen goud', (await page.$$('#parts span.got')).length === 3);
  await page.screenshot({ path: path.join(OUT, 'bord-demo-telefoon.png') });
  await page.evaluate(() => { const r = document.querySelector('#prog'); r.value = 6.6; r.dispatchEvent(new Event('input')); }); await sleep(2500);
  ok('demo 6.6: schemering', (await page.evaluate(() => window.__board.info().dusk)) > 0.5);
  await page.screenshot({ path: path.join(OUT, 'bord-demo-schemer.png') });
  await page.evaluate(() => { const r = document.querySelector('#prog'); r.value = 7; r.dispatchEvent(new Event('input')); }); await sleep(1500);
  ok('demo 7: finale', await page.evaluate(() => window.__board.info().finished));
  ok('geen JS-fouten', !errors.length, errors.join(' | '));
  await page.close(); }

console.log('— index.html: 3D-knop op de kaarttelefoon');
if (LEAFLET) { const w = world({ active: 1, parts: ['lijf'] }); w.player.forEach(p => Object.assign(p, { device_id: null, last_seen_at: null, lat: null, lng: null }));
  const { page, errors, until } = await open('index.html?test=0', w);
  await page.waitForSelector('input[aria-label="Code"]', { timeout: 10000 }).catch(() => null);
  await page.fill('input[aria-label="Code"]', '5243').catch(() => {});
  ok('navigatiescherm met 3D-knop', await until(() => !!document.querySelector('#b3d'), 15000));
  await page.click('#b3d').catch(() => {});
  ok('3D-bord verschijnt in de kaart', await until(() => !!document.querySelector('#bordslot:not([hidden]) .pkb canvas'), 15000));
  await sleep(2500);
  await page.screenshot({ path: path.join(OUT, 'bord-app.png') });
  await page.click('#b3d'); await sleep(300);
  ok('terug naar de gewone kaart', await page.evaluate(() => !document.querySelector('#mapslot').hidden && document.querySelector('#bordslot').hidden));
  ok('geen JS-fouten', !errors.length, errors.join(' | '));
  await page.close(); } else console.log('(overgeslagen: zet LEAFLET_DIR)');

await browser.close(); server.close();
console.log(`\n${n} goed, ${failed} fout`);
process.exit(failed ? 1 : 0);
