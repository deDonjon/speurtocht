// Browsertest van chat 7 in headless Chrome (Playwright) met de nep-Supabase (test/fake-supabase.mjs) en Zdog uit test/vendor:
//   node test/browser-chat7.mjs [finale|kern|bonus]   (zonder argument: alles)
// finale: stop 4 met LED-overlay → wens namens de jarige via de regie (telt als gebruikt + badge) → thuis indienen → hoed installeren →
//         Mega 1-2-3 → vers → confetti → finale → eindscherm met badges per speurder.
// kern:   kern.html → regiesleutel → slaap → wekknop (monster.say met de wekzin) → loting (roles.shuffle, Hannah vast) → start → deel vliegt in → finale.
// bonus:  regie.html tab Bonus → B3 inzetten als volgende stop → telefoon toont de bonus → opgelost zonder ritueel → terug naar de route.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const pwPath = ['playwright', '/opt/npm-tools/node_modules/playwright'].find(c => { try { req.resolve(c); return true; } catch { return false; } });
if (!pwPath) { console.error('playwright niet gevonden: npm i -D playwright en npx playwright install chromium'); process.exit(2); }
const { chromium } = req(pwPath);

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((rq, res) => {
  const f = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(fs.readFileSync(f));
}).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}`;
const only = process.argv[2];
let n = 0, failed = 0;
const ok = (name, cond, extra = '') => { if (cond) { n++; console.log('✓', name); } else { failed++; console.log('✗', name, extra); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => new Date().toISOString();
const IMG = 'https://lnhliamckstuwiwyzxyl.supabase.co/storage/v1/object/public/monster/scout/x/stadsbrink.jpg';
const PIXEL = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
async function open(file, init, { width = 390, height = 844 } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: width < 600, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error' && !/leaflet|fonts|cdn|ERR_FAILED|net::|elevenlabs|supabase\.co|Failed to load resource|navigator\.vibrate/i.test(m.text())) errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.addInitScript(i => { let saved = null; try { saved = sessionStorage.getItem('__fakedb'); } catch {} globalThis.__FAKE_INIT = saved ? JSON.parse(saved) : i; // herladen: database van vóór het herladen try { localStorage.setItem('pkm2_muted', 'true'); } catch {}
    // alles wat Mecha-Pof in de ballon zegt, bijhouden (reduced motion: de tekst staat er meteen)
    globalThis.__said = []; setInterval(() => { const t = document.querySelector('.pkmon-bubble:not([hidden]) .txt')?.textContent?.trim(); if (t && __said.at(-1) !== t) __said.push(t); }, 30); }, init);
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'test/fake-supabase.mjs'), 'utf8') });
    if (/zdog@1\.1\.3|zdog\/1\.1\.3/.test(u)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'test/vendor/zdog.dist.min.js'), 'utf8') });
    if (u.endsWith('stadsbrink.jpg')) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: PIXEL });
    if (u.startsWith(BASE)) return route.continue();
    return route.abort();
  });
  await page.goto(BASE + '/' + file);
  const txt = async sel => (await page.textContent(sel).catch(() => '')) || '';
  const W = (sel, t = 8000) => page.waitForSelector(sel, { timeout: t }).catch(() => null);
  const until = async (fn, t = 10000, arg) => { const end = Date.now() + t; while (Date.now() < end) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await sleep(250); } return false; };
  return { page, errors, txt, W, until };
}

// ---- gezamenlijke testwereld: zes speurders, zeven stops (zoals route A) plus een bonusstop
function world({ phase = 'lobby', active = 0, parts = [], talents = true } = {}) {
  const P = [['p1', 'Hannah', 'sleutelbewaarder', true], ['p2', 'Elin', 'speurneus'], ['p3', 'Isa', 'kaartlezer'], ['p4', 'Evy', 'codekraker'], ['p5', 'Lauren', 'rekenmeester'], ['p6', 'Julia', 'tijdbewaker']];
  const player = P.map(([id, name, talent, b]) => ({ id, game_id: 'g1', name, is_birthday: !!b, part: null, talent: talents ? talent : null, color: null, badges: [], device_id: null, last_seen_at: null }));
  const S = (id, seq, key, name, part, puzzle, dlat) => ({ id, game_id: 'g1', seq, key, name, clue: 'Aanwijzing van ' + name, lat: 51.6162 + dlat, lng: 5.5615 + dlat, radius: 20, part, puzzles: [puzzle] });
  const stop = [
    S('s1', 1, 'start', 'De palenrij', 'lijf', { type: 'code', question: 'Hoeveel palen?', answer: '23' }, .001),
    S('s2', 2, null, 'Het bord met de sokjes', 'ogen', { type: 'code', question: 'Code?', answer: '6106' }, .002),
    S('s3', 3, null, 'Het veldje', 'neus', { type: 'code', question: 'Code?', answer: '1' }, .003),
    S('s4', 4, null, 'De Stadsbrink', 'mond', { type: 'wachtwoord', question: 'Mijn processor leest DE STROOPBRINK.', password: 'stadsbrink', image: IMG, overlay: 'DE STROOPBRINK' }, .004),
    S('s5', 5, null, 'Het groene kastje', 'armen', { type: 'code', question: 'Code?', answer: '35' }, .005),
    S('s6', 6, null, 'Het huis met de steen', 'benen', { type: 'code', question: 'Code?', answer: '5' }, .006),
    S('s7', 7, 'home', 'Thuis op het erf', 'hoed', { type: 'opdracht', question: 'Druk op BOTER!' }, 0),
  ];
  return { game: { id: 'g1', code: 'hannah10', title: 'Mecha-Pof', phase, stop_order: stop.map(s => s.id), active_index: active, parts, drops: 40, hints: 1, energy: 2, wish_used: false, surprise: null,
    settings: { radius: 20, min_gap: 150, any_can_submit: false }, started_at: phase === 'lobby' ? null : now(), finished_at: null },
    player, stop, puzzle_state: [], event: [], codes: { 5243: 'p1', 3115: 'p2', 9711: 'p3', 8969: 'p4', 8484: 'p5', 5968: 'p6' } };
}
const fake = (page, fn, ...args) => page.evaluate(([f, a]) => (new Function('fake', 'pkm', 'args', 'return (' + f + ')(fake, pkm, ...args)'))(window.__fake, window.pkm, a), [fn.toString(), args]);

// ================================================================ finale op de telefoon
if (!only || only === 'finale') {
  console.log('— finale (index.html)');
  const w = world({ phase: 'puzzel', active: 3, parts: ['lijf', 'ogen', 'neus'] });
  w.puzzle_state = [{ id: 'ps4', game_id: 'g1', stop_id: 's4', variant: 0, seed: 3, moves: [], hints: 0, arrived_at: now(), solved_at: null, updated_at: now() }];
  w.player[1].badges = ['monteur-ogen', 'vonkenvanger'];
  const { page, errors, txt, W, until } = await open('index.html', w);
  await W('input[aria-label="Code"]');
  await page.fill('input[aria-label="Code"]', '5243');
  await W('.ledover');
  ok('stop 4: foto met LED-overlay DE STROOPBRINK', (await txt('.ledover')).includes('STROOPBRINK') && !!(await page.$('.pimgwrap img')));
  // wens namens de jarige vanuit de regie
  await fake(page, f => f.rpc('regie_event', { p_key: 'job', p_type: 'wish.used', p_payload: { for: 'dansje van Mecha-Pof' } }));
  ok('wens via de regie: game.wish_used = true', await until(() => window.pkm.state.get().game.wish_used === true, 4000));
  ok('…badge wensvervuller voor de jarige (haar telefoon)', await until(() => window.pkm.state.player('p1').badges.includes('wensvervuller'), 6000));
  ok('…🎂-knop weg', await until(() => !document.querySelector('#sp-wish'), 3000));
  await page.evaluate(() => { document.querySelector('#sp-ov [data-a=close]')?.click(); });
  await until(() => __said.some(t => /dansje/i.test(t)), 15000); await sleep(4500); // wenszinnen laten uitpraten
  // naar thuis springen: delen 1–6 binnen, actieve stop = thuis, puzzel klaar
  await fake(page, f => { f.db.puzzle_state.push({ id: 'ps7', game_id: 'g1', stop_id: 's7', variant: 0, seed: 1, moves: [{ t: 'done', by: 'p1', at: new Date().toISOString() }], hints: 0, arrived_at: new Date().toISOString(), solved_at: null, updated_at: new Date().toISOString() });
    f.patchGame({ parts: ['lijf', 'ogen', 'neus', 'mond', 'armen', 'benen'], active_index: 6, phase: 'finale' }); f.emit('puzzle_state', f.db.puzzle_state.at(-1), 'UPDATE'); });
  await W('#dosubmit');
  ok('thuis: indienen-knop voor de Sleutelbewaarder', !!(await page.$('#dosubmit')));
  await page.click('#dosubmit');
  await W('#ov .install');
  ok('installatie-overlay voor de hoed', (await txt('#ov')).includes('boterknop'));
  ok('fase klaar na indienen', await until(() => window.pkm.state.get().game.phase === 'klaar', 4000));
  await page.evaluate(() => window.pkm.sync.badge('p1', 'monteur-hoed')); // = geschud
  ok('hoed vastgeklikt', await until(() => document.querySelector('#ov .install')?.textContent.includes('Vastgeklikt'), 5000));
  ok('installatiezin hoed in de ballon', await until(() => __said.some(t => /ontsteking/i.test(t)), 9000));
  ok('finale start: stage mega, installatie dicht', await until(() => window.pkm.finale.stage === 'mega' && !document.querySelector('#ov .install'), 30000));
  ok('Mega-Mecha-Pof: alle zeven delen + compleet', await until(() => window.pkm.mon.mood === 'compleet' && window.pkm.mon.parts.length === 7, 3000));
  ok('mega stukje 1 (systeemcontrole)', await until(() => __said.some(t => /Systeemcontrole/.test(t)), 8000));
  ok('mega stukje 3 (MEGA-MECHA-POF!)', await until(() => __said.some(t => /MEGA-MECHA-POF/.test(t)), 25000));
  ok('Mega-stand actief (galm op de stem)', await page.evaluate(() => window.pkm.mon.status.mega > 0.5));
  ok('vers', await until(() => __said.some(t => /tien jaar oud/.test(t)), 20000));
  ok('confetti', await until(() => ['confetti', 'finale', 'eind'].includes(window.pkm.finale.stage), 40000));
  ok('eindscherm', await until(() => window.pkm.finale.stage === 'eind', 40000));
  console.log('   gezegd:', (await page.evaluate(() => __said)).map(t => t.slice(0, 50)).join(' ¦ '));
  await W('.fin-cards');
  const cards = await txt('.fin-cards');
  ok('eindscherm: zes speurders', (await page.$$('.fin-card')).length === 6, (await page.$$('.fin-card')).length);
  ok('eindscherm: Hannah eerst met Sleutelbewaarder, Wensvervuller en Monteur boterknop', /^.{0,4}Hannah/.test(cards.trim()) && cards.includes('Wensvervuller') && /Monteur boterknop/.test(cards), cards.slice(0, 200));
  ok('eindscherm: Elin met Vonkenvanger en zin over de LED-ogen', cards.includes('Vonkenvanger') && /Elin vond mijn LED-ogen/.test(cards));
  ok('eindscherm: knop afscheid (radio) en teamfoto', !!(await page.$('[data-k=walkie]')) && !!(await page.$('[data-k=foto]')));
  await page.click('[data-k=foto]');
  ok('teamfoto: aftellen', await until(() => document.querySelector('#tf')?.textContent === '4', 3000));
  await page.evaluate(() => sessionStorage.setItem('__fakedb', JSON.stringify({ ...window.__fake.db, codes: window.__fake.codes })));
  await page.reload(); await W('.fin-cards', 8000);
  ok('na herladen: meteen het eindscherm (finale niet opnieuw)', !!(await page.$('.fin-cards')) && (await page.evaluate(() => window.pkm.finale.stage)) === 'idle');
  ok('geen JavaScript-fouten (finale)', !errors.length, errors.join(' | '));
  await page.close();
}

if (globalThis.__chat7_more) await globalThis.__chat7_more({ open, world, fake, ok, sleep, only });
console.log(`\n${n} goed, ${failed} fout.`);
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
