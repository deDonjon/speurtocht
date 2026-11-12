// Regie: blok Stand (schema, eindtijd, seintjes) en de Jetpack-timer die een Kortsluiting overleeft. Headless Chrome + nep-Supabase.
//   node test/browser-regie-stand.mjs      (vereist: playwright + Chrome)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const pwPath = ['playwright', '/opt/npm-tools/node_modules/playwright'].find(c => { try { req.resolve(c); return true; } catch { return false; } });
if (!pwPath) { console.error('playwright niet gevonden'); process.exit(2); }
const { chromium } = req(pwPath);
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((rq, res) => { const f = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(fs.readFileSync(f)); }).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}`;
let n = 0, failed = 0;
const ok = (name, cond, extra = '') => { if (cond) { n++; console.log('✓', name); } else { failed++; console.log('✗', name, extra); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ago = m => new Date(Date.now() - m * 60000).toISOString();
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
async function open(file, init, { width = 390, height = 844 } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 600, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(String(e.message || e))); page.on('dialog', d => d.accept());
  await page.addInitScript(i => { globalThis.__FAKE_INIT = i; try { localStorage.setItem('pkm2_muted', 'true'); } catch {} }, init);
  await page.route('**/*', route => { const u = route.request().url();
    if (u.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'test/fake-supabase.mjs'), 'utf8') });
    if (/zdog@1\.1\.3|zdog\/1\.1\.3/.test(u)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'test/vendor/zdog.dist.min.js'), 'utf8') });
    return u.startsWith(BASE) ? route.continue() : route.abort(); });
  await page.goto(BASE + '/' + file);
  const until = async (fn, t = 10000, arg) => { const end = Date.now() + t; while (Date.now() < end) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await sleep(250); } return false; };
  return { page, errors, until, txt: async s => (await page.textContent(s).catch(() => '')) || '' };
}
function world({ phase, active, parts, startedMin, solved = [] }) {
  const P = [['p1', 'Hannah', 'sleutelbewaarder', true], ['p2', 'Evy', 'speurneus'], ['p3', 'Isa', 'kaartlezer'], ['p4', 'Julia', 'codekraker'], ['p5', 'Lauren', 'rekenmeester'], ['p6', 'Elin', 'tijdbewaker']];
  const player = P.map(([id, name, talent, b]) => ({ id, game_id: 'g1', name, is_birthday: !!b, part: null, talent, color: null, badges: [], device_id: null, last_seen_at: null }));
  const S = (id, seq, key, name, part, d) => ({ id, game_id: 'g1', seq, key, name, clue: 'Aanwijzing', lat: 51.6162 + d, lng: 5.5615 + d, radius: 20, part, puzzles: [{ type: 'code', question: 'Code?', answer: '1' }] });
  const stop = [S('s1', 1, 'start', 'De palenrij', 'lijf', .001), S('s2', 2, null, 'Het bord met de sokjes', 'ogen', .002), S('s3', 3, null, 'Het veldje', 'neus', .003), S('s4', 4, null, 'De Stadsbrink', 'mond', .004),
    S('s5', 5, null, 'Het groene kastje', 'armen', .005), S('s6', 6, null, 'Het huis met de steen', 'benen', .006), S('s7', 7, 'home', 'Thuis op het erf', 'hoed', 0)];
  return { game: { id: 'g1', code: 'hannah10', title: 'Mecha-Pof', phase, stop_order: stop.map(s => s.id), active_index: active, parts, drops: 40, hints: 0, energy: 2, wish_used: false, surprise: null,
    settings: { radius: 20, min_gap: 150, any_can_submit: false }, started_at: ago(startedMin), finished_at: null }, player, stop,
    puzzle_state: solved.map(([stop_id, m]) => ({ id: 'z' + stop_id, game_id: 'g1', stop_id, variant: 0, seed: 1, moves: [], hints: 0, arrived_at: ago(m + 5), solved_at: ago(m), solved_by: 'p1' })), event: [],
    codes: { 5243: 'p1', 3115: 'p2', 9711: 'p3', 8969: 'p4', 8484: 'p5', 5968: 'p6' } };
}
async function regie(w, size) { const R = await open('regie.html', w, size);
  await R.page.waitForSelector('input[type=password]'); await R.page.fill('input[type=password]', 'job'); await R.page.keyboard.press('Enter');
  await R.page.waitForSelector('#stand .stand', { timeout: 8000 }).catch(() => null); return R; }

console.log('— stand en seintje (telefoon)');
{ // na plek 5, 72 minuten op pad (schema: 65 klaar + 2 onderweg = 67) → 5 min achter; Kruimelaar kan
  const R = await regie(world({ phase: 'onderweg', active: 5, parts: ['lijf', 'ogen', 'neus', 'mond', 'armen'], startedMin: 72, solved: [['s5', 2]] }));
  const t = await R.txt('#stand');
  ok('blok Stand: 5 van 7, onderweg naar het huis met de steen', /5 van 7/.test(t) && /onderweg naar/.test(t) && /Het huis met de steen/.test(t), t);
  ok('achterstand en eindtijd', /5 min achter/.test(t) && /klaar ±\d\d:\d\d/.test(t) && /nog ±19 min/.test(t), t);
  ok('seintje Kruimelaar met de naam van de Rekenmeester', /Nu kan: de Kruimelaar/.test(t) && /Lauren/.test(t));
  ok('geen seintje voor Dubbel signaal of timer', !/Dubbel signaal|Jetpack/.test(t));
  ok('melding (toast) bij het nieuwe seintje', await R.until(() => /Kruimelaar/.test(document.querySelector('#toast').textContent), 4000));
  ok('balk toont de stand', /\+5 min/.test(await R.txt('#standchip')), await R.txt('#standchip'));
  await R.page.click('.sein button');
  ok('Open springt naar tab Verrassingen', await R.until(() => document.querySelector('nav.tabs button.on')?.dataset.tab === 'verras', 3000));
  ok('geen horizontale scroll op de telefoon', await R.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await R.page.evaluate(() => scrollTo(0, 0)); await R.page.screenshot({ path: '/tmp/regie-stand.png' });
  await R.page.reload(); await R.page.waitForSelector('#stand .stand');
  await sleep(1500);
  ok('na herladen geen tweede melding voor hetzelfde seintje', !/Kruimelaar/.test(await R.txt('#toast')));
  ok('geen scriptfouten', R.errors.length === 0, R.errors.join(' | '));
  await R.page.close(); }

console.log('— timer overleeft de Kortsluiting (regie)');
{ const R = await regie(world({ phase: 'onderweg', active: 6, parts: ['lijf', 'ogen', 'neus', 'mond', 'armen', 'benen'], startedMin: 78, solved: [['s6', 1]] }), { width: 1280, height: 900 });
  const t = await R.txt('#stand');
  ok('na de benen: seintje Jetpack-timer en Kortsluiting (geen GPS)', /Jetpack-timer starten/.test(t) && /Kortsluiting/.test(t), t);
  await R.page.click('[data-tab=verras]'); await R.page.waitForSelector('[data-a="finale.timer"]');
  await R.page.click('[data-a="finale.timer"]');
  ok('timer loopt', await R.until(() => window.__fake.db.game.surprise?.kind === 'finale', 4000));
  const start = await R.page.evaluate(() => window.__fake.db.game.surprise.started_at);
  await R.until(() => !!document.querySelector('[data-a="storm.start"]'), 4000);
  ok('seintje Kortsluiting blijft staan terwijl de timer loopt', await R.until(() => { const x = document.querySelector('#stand').textContent; return /Kortsluiting/.test(x) && !/Jetpack-timer starten/.test(x); }, 4000), await R.txt('#stand'));
  await R.page.click('[data-a="storm.start"]');
  ok('Kortsluiting loopt; regie meldt dat de timer doorloopt', await R.until(() => window.__fake.db.game.surprise?.kind === 'storm' && /loopt op de achtergrond door/.test(document.querySelector('#surprise').textContent), 5000));
  await R.until(() => !!document.querySelector('[data-a="storm.end"]'), 4000); await R.page.click('[data-a="storm.end"]');
  ok('Kortsluiting voorbij', await R.until(() => window.__fake.db.game.surprise == null, 4000));
  const t1 = Date.now();
  ok('timer komt vanzelf terug met de oude starttijd', await R.until(s => window.__fake.db.game.surprise?.kind === 'finale' && window.__fake.db.game.surprise.started_at === s && window.__fake.db.game.surprise.data.seconds === 300, 16000, start));
  ok('…pas na ±9 s (de telefoons tonen eerst de uitslag)', Date.now() - t1 > 8000, String(Date.now() - t1));
  ok('geen scriptfouten', R.errors.length === 0, R.errors.join(' | '));
  await R.page.close(); }

console.log('— telefoon: timer → Kortsluiting → timer terug');
{ const w = world({ phase: 'onderweg', active: 6, parts: ['lijf', 'ogen', 'neus', 'mond', 'armen', 'benen'], startedMin: 78 });
  const T = await open('index.html?test=1', w);
  await T.page.waitForSelector('input[aria-label="Code"]', { timeout: 10000 }); await T.page.fill('input[aria-label="Code"]', '5243'); await T.page.keyboard.press('Enter');
  ok('telefoon ingelogd', await T.until(() => !!window.pkm?.surprises && window.pkm.state.me().length === 1, 8000));
  const cur = () => T.page.evaluate(() => window.pkm.surprises.current?.kind || null);
  await T.page.evaluate(() => window.__fake.regie('finale.timer', { seconds: 300 }));
  ok('timer op de telefoon', await T.until(() => window.pkm.surprises.current?.kind === 'finale', 4000));
  const start = await T.page.evaluate(() => window.__fake.db.game.surprise.started_at);
  await T.page.evaluate(() => window.__fake.regie('storm.start', { seconds: 30 }));
  ok('Kortsluiting neemt het over', await T.until(() => window.pkm.surprises.current?.kind === 'storm', 4000));
  await T.page.evaluate(() => window.__fake.regie('storm.end', { total: 12 }));
  await sleep(9200); // zo lang wacht de regie
  ok('uitslag van de Kortsluiting is weg', (await cur()) === null, String(await cur()));
  await T.page.evaluate(s => window.__fake.rpc('regie_patch_game', { p_key: 'job', p_patch: { surprise: { kind: 'finale', started_at: s, data: { seconds: 300 } } } }), start);
  ok('timer staat weer op de telefoon', await T.until(() => window.pkm.surprises.current?.kind === 'finale', 4000));
  const klok = await T.page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => !e.children.length && /^\s*\d?\d:\d\d\s*$/.test(e.textContent)).map(e => e.textContent.trim()).join(',') || document.querySelector('[class*=banner]')?.textContent || '');
  ok('…en telt door vanaf de oude starttijd (ruim 9 s kwijt, niet 5:00)', (() => { const m = klok.match(/(\d?\d):(\d\d)/); return !!m && +m[1] * 60 + +m[2] <= 294 && +m[1] * 60 + +m[2] > 270; })(), klok);
  ok('geen scriptfouten', T.errors.length === 0, T.errors.join(' | '));
  await T.page.close(); }

await browser.close(); server.close();
console.log(failed ? `\n${failed} MISLUKT, ${n} goed.` : `\n${n} checks goed.`); process.exit(failed ? 1 : 0);
