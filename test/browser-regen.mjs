// Regie: 🌧 Regenplan (13 nov). Headless Chrome + nep-Supabase.
//   node test/browser-regen.mjs      (vereist: playwright + Chrome)
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
const vis = (R, sel) => R.page.evaluate(q => { const e = document.querySelector(q); return !!e && e.getClientRects().length > 0 && !e.closest('details:not([open])'); }, sel);

console.log('— regenplan: halverwege (neus vast, onderweg naar de Stadsbrink, bonus B2 gepland)');
{ const w = world({ phase: 'onderweg', active: 3, parts: ['lijf', 'ogen', 'neus'], startedMin: 42, solved: [['s3', 1]] });
  w.stop.push({ id: 'b2', game_id: 'g1', seq: 4, key: '', name: 'Het bankje met de pijlen', clue: 'x', lat: 51.6138, lng: 5.5644, radius: 25, part: '', puzzles: [{ type: 'opdracht', bonus: 'B2', question: 'dans' }] });
  w.game.stop_order = ['s1', 's2', 's3', 's4', 'b2', 's5', 's6', 's7'];
  const R = await regie(w);
  await R.page.waitForSelector('[data-a=approve]');
  ok('bestaande knoppen in beeld: GPS overslaan, hint, goedkeuren, Plan B', await vis(R, '[data-a=skip]') && await vis(R, '[data-a=hint]') && await vis(R, '[data-a=approve]') && await vis(R, '[data-a=planb]'));
  ok('knop Regenplan starten in beeld, onder de stop', await vis(R, '[data-a=regen-on]') && await R.page.evaluate(() => { const a = document.querySelector('[data-a=approve]'), b = document.querySelector('[data-a=regen-on]'); return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  ok('zonder regen: seintje Dubbel signaal', /Dubbel signaal/.test(await R.txt('#stand')));
  await R.page.click('[data-a=regen-on]');
  ok('regen staat in settings, voor dit spel', await R.until(() => window.__fake.db.game.settings.regen?.game === window.__fake.db.game.started_at, 4000));
  ok('andere settings blijven staan', await R.page.evaluate(() => window.__fake.db.game.settings.radius === 20 && window.__fake.db.game.settings.min_gap === 150));
  ok('geplande bonus uit de route, rest ongewijzigd', await R.page.evaluate(() => window.__fake.db.game.stop_order.join() === 's1,s2,s3,s4,s5,s6,s7' && window.__fake.db.game.active_index === 3));
  ok('Mecha-Pof zegt het op alle telefoons', await R.until(() => window.__fake.db.event.some(e => e.type === 'monster.say' && /Plan Paraplu/.test(e.payload?.text || '')), 4000));
  ok('paneel bovenaan: regenplan staat aan, met tip voor de Stadsbrink', await R.until(() => { const p = document.querySelector('#tabbody > .page'); return /Regenplan staat aan/.test(p?.textContent) && /foto van het bord/.test(p.textContent); }, 4000));
  ok('geen seintje meer voor Dubbel signaal', await R.until(() => !/Dubbel signaal/.test(document.querySelector('#stand').textContent), 4000));
  ok('bestaande knoppen nog steeds in beeld', await vis(R, '[data-a=skip]') && await vis(R, '[data-a=approve]') && await vis(R, '[data-a=planb]'));
  await R.page.click('[data-a=regen-next]');
  ok('Volgende puzzel openen = gps.skip voor de Stadsbrink', await R.until(() => window.__fake.db.event.some(e => e.type === 'gps.skip' && e.payload?.stop_id === 's4'), 4000));
  await R.page.evaluate(() => scrollTo(0, 0)); await R.page.screenshot({ path: '/tmp/regen-aan.png', fullPage: true });
  await R.page.evaluate(() => window.__fake.rpc('regie_patch_game', { p_key: 'job', p_patch: { phase: 'puzzel' } })); await R.page.evaluate(() => window.regie.loadRegie());
  ok('bij een open puzzel is de knop uit', await R.until(() => document.querySelector('[data-a=regen-next]')?.disabled === true, 4000));
  await R.page.click('[data-a=regen-off]');
  ok('regenplan uit', await R.until(() => window.__fake.db.game.settings.regen == null && !!document.querySelector('[data-a=regen-on]'), 4000));
  ok('geen horizontale scroll', await R.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok('geen scriptfouten', R.errors.length === 0, R.errors.join(' | '));
  await R.page.close(); }

console.log('— regenplan na de benen: Kortsluiting zonder GPS, geen Kruimelaar');
{ const w = world({ phase: 'onderweg', active: 6, parts: ['lijf', 'ogen', 'neus', 'mond', 'armen', 'benen'], startedMin: 78, solved: [['s6', 1]] });
  w.game.settings.regen = { game: w.game.started_at, at: ago(5) };
  const R = await regie(w);
  const t = await R.txt('#stand');
  ok('seintjes Jetpack-timer en Kortsluiting', /Jetpack-timer starten/.test(t) && /Kortsluiting/.test(t), t);
  ok('tip thuis: boterknop', /boterknop/.test(await R.txt('#tabbody')));
  ok('geen scriptfouten', R.errors.length === 0, R.errors.join(' | '));
  await R.page.close(); }

console.log('— regen van een vorig spel telt niet');
{ const w = world({ phase: 'onderweg', active: 3, parts: ['lijf', 'ogen', 'neus'], startedMin: 42 });
  w.game.settings.regen = { game: ago(500), at: ago(500) };
  const R = await regie(w); await R.page.waitForSelector('[data-a=approve]');
  ok('startknop, geen actief regenplan', await vis(R, '[data-a=regen-on]') && !(await R.page.$('[data-a=regen-next]')));
  await R.page.close(); }

console.log('— telefoon met regen in settings');
{ const w = world({ phase: 'onderweg', active: 3, parts: ['lijf', 'ogen', 'neus'], startedMin: 42 });
  w.game.settings.regen = { game: w.game.started_at, at: ago(2) };
  const T = await open('index.html?test=1', w);
  await T.page.waitForSelector('input[aria-label="Code"]', { timeout: 10000 }); await T.page.fill('input[aria-label="Code"]', '5243'); await T.page.keyboard.press('Enter');
  ok('telefoon logt in en speelt gewoon', await T.until(() => !!window.pkm?.state && window.pkm.state.me().length === 1, 8000));
  await T.page.evaluate(() => window.__fake.regie('gps.skip', { stop_id: 's4' }));
  ok('gps.skip laat de telefoon aankomen (puzzel)', await T.until(() => window.__fake.db.game.phase === 'puzzel', 6000), await T.page.evaluate(() => window.__fake.db.game.phase));
  ok('geen scriptfouten', T.errors.length === 0, T.errors.join(' | '));
  await T.page.close(); }

await browser.close(); server.close();
console.log(failed ? `\n${failed} MISLUKT, ${n} goed.` : `\n${n} checks goed.`); process.exit(failed ? 1 : 0);
