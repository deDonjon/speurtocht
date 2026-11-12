// Browsertest van chat 7 in headless Chrome (Playwright) met de nep-Supabase (test/fake-supabase.mjs) en Zdog uit test/vendor:
//   node test/browser-chat7.mjs [finale|kern|bonus]   (zonder argument: alles)
// finale: stop 4 met LED-overlay → wens namens de jarige via de regie (telt als gebruikt + badge) → thuis indienen → hoed installeren →
//         check → Mega → vers → confetti → taart → eindscherm met badges per speurder.
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

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }); // nep-microfoon (piepjes) voor de hoera-meter
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
  ok('finale start: stage check, installatie dicht', await until(() => ['check', 'mega'].includes(window.pkm.finale.stage) && !document.querySelector('#ov .install'), 30000));
  ok('Mega-Mecha-Pof: alle zeven delen + compleet', await until(() => window.pkm.mon.mood === 'compleet' && window.pkm.mon.parts.length === 7, 3000));
  ok('mega stukje 1 (systeemcontrole)', await until(() => __said.some(t => /Systeemcontrole/.test(t)), 8000));
  ok('mega stukje 3 (MEGA-MECHA-POF!)', await until(() => __said.some(t => /MEGA-MECHA-POF/.test(t)), 25000));
  ok('Mega-stand actief (galm op de stem)', await page.evaluate(() => window.pkm.mon.status.mega > 0.5));
  ok('vers', await until(() => __said.some(t => /tien jaar oud/.test(t)), 20000));
  ok('confetti', await until(() => ['confetti', 'taart', 'eind'].includes(window.pkm.finale.stage), 40000));
  ok('terugblik: dia\'s op de telefoon', await until(() => !!document.querySelector('.fin-slide'), 40000));
  ok('taart: volgende missie in beeld en gezegd', await until(() => !!document.querySelector('.fin-taart') && __said.some(t => /taart/.test(t)), 30000));
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

// ================================================================ kern.html + regie.html (wekknop, loting)
if (!only || only === 'kern') {
  console.log('— kern (kern.html + regie.html)');
  const w = world({ phase: 'lobby', talents: false });
  w.player[0].talent = 'speurneus'; // zoals nu in de database: de loting moet Hannah vast op Sleutelbewaarder zetten
  const K = await open('kern.html', w, { width: 1280, height: 800 });
  await K.W('#key');
  await K.page.fill('#key', 'job'); await K.page.click('#gateform button');
  ok('kern: ingelogd met de regiesleutel', await K.until(() => document.querySelector('#gate').hidden, 4000));
  ok('kern: slaapstand', await K.until(() => document.body.classList.contains('slaap') && window.pkm.mon.mood === 'slaap', 3000) && (await K.txt('#caption')).includes('STAND-BY'));
  ok('kern meldt zich (settings.kern_at)', await K.until(() => !!window.pkm.state.get().game.settings.kern_at, 4000));
  // regie.html in dezelfde nep-wereld: een tweede pagina heeft een eigen nep-database, dus de regieknoppen testen we via de RPC's van de kern-pagina
  const R = await open('regie.html', w, { width: 1280, height: 800 });
  await R.W('input[type=password]', 8000);
  await R.page.fill('input[type=password]', 'job'); await R.page.keyboard.press('Enter');
  await R.W('[data-a=wake]', 8000);
  ok('regie: paneel Thuis met wekknop en loting (Hannah vast)', !!(await R.page.$('[data-a=wake]')) && (await R.txt('[data-a=loting]')).includes('Hannah vast'));
  ok('regie: startknop zegt "route in volgorde"', (await R.txt('[data-a=start]')).includes('volgorde'));
  await R.page.click('[data-a=wake]');
  const wakeEv = await R.page.evaluate(() => window.__fake.db.event.find(e => e.type === 'monster.say'));
  ok('regie: wekknop stuurt monster.say met wake + kern', wakeEv?.payload?.wake === true && wakeEv.payload.kern === true && /wakker/.test(wakeEv.payload.text), JSON.stringify(wakeEv?.payload));
  await R.page.click('[data-a=loting]');
  const lot = await R.page.evaluate(() => window.__fake.db.event.find(e => e.type === 'roles.shuffle'));
  const tv = Object.values(lot?.payload?.talents || {});
  ok('regie: loting = roles.shuffle met loting:true, Hannah sleutelbewaarder, zes verschillende talenten', lot?.payload?.loting && lot.payload.talents.p1 === 'sleutelbewaarder' && new Set(tv).size === 6, JSON.stringify(lot?.payload));
  // dezelfde events naar de kern
  await fake(K.page, (f, _pkm, pl) => f.rpc('regie_event', { p_key: 'job', p_type: 'monster.say', p_payload: pl }), wakeEv.payload);
  ok('kern: wakker na de wekknop', await K.until(() => !document.body.classList.contains('slaap') && window.pkm.mon.mood !== 'slaap', 4000));
  ok('kern: zegt de wekzin', await K.until(() => __said.some(t => /Wie maakt mij daar wakker/.test(t) && /feest van Hannah/.test(t)), 6000));
  ok('kern: welkom op het feest in beeld', (await K.txt('#side')).includes('Welkom op het feest van Hannah'));
  ok('kern: daarna het verhaal van Mecha-Pof (plaatje 1)', await K.until(() => __said.some(t => /Ik ben Mecha-Pof, een keukenrobot/.test(t)) && !!document.querySelector('#side .story img.pof'), 20000));
  await K.page.screenshot({ path: path.join(ROOT, 'test/out/kern-intro1.png') }).catch(() => {});
  ok('kern: POF: hij vliegt uit elkaar', await K.until(() => !!document.querySelector('#side .svis.boem'), 40000));
  ok('kern: POF met flits, schok en rondvliegende onderdelen', await K.until(() => document.querySelector('#flits').classList.contains('aan') && document.body.classList.contains('schok') && document.querySelectorAll('#side .scherf').length >= 20, 2000));
  await sleep(350); await K.page.screenshot({ path: path.join(ROOT, 'test/out/kern-intro2.png') }).catch(() => {});
  await sleep(500); await K.page.screenshot({ path: path.join(ROOT, 'test/out/kern-intro2b.png') }).catch(() => {});
  ok('kern: zeven stukken in beeld', await K.until(() => document.querySelectorAll('#side .stuk').length === 8, 10000));
  await K.page.screenshot({ path: path.join(ROOT, 'test/out/kern-intro3.png') }).catch(() => {});
  ok('kern: missie (taart en pannenkoeken), daarna terug naar het wachtscherm', await K.until(() => __said.some(t => /Met taart en met pannenkoeken/.test(t)), 30000) && await K.until(() => !document.querySelector('#side .story'), 30000));
  await fake(K.page, (f, _pkm, pl) => f.rpc('regie_event', { p_key: 'job', p_type: 'roles.shuffle', p_payload: pl }), lot.payload);
  ok('kern: talentenrad draait (zes vakken, rad in beweging)', await K.until(() => !!document.querySelector('.slot.spin') && !!document.querySelector('#rad.draai') && document.querySelectorAll('#rad svg path').length === 6, 25000));
  await sleep(1500); await K.page.screenshot({ path: path.join(ROOT, 'test/out/kern-rad1.png') }).catch(() => {});
  ok('kern: eerste naam klikt vast met aankondiging', await K.until(() => __said.some(t => /\.\.\. (Speurneus|Kaartlezer|Codekraker|Rekenmeester|Tijdbewaker)!/.test(t)), 15000));
  ok('kern: Hannah als laatste: Sleutelbewaarder', await K.until(() => __said.some(t => /Hannah\.\.\. Sleutelbewaarder/.test(t)), 110000));
  await K.page.screenshot({ path: path.join(ROOT, 'test/out/kern-rad2.png') }).catch(() => {});
  ok('kern: loting klaar, talenten in beeld', await K.until(() => !document.querySelector('#reel') && document.querySelectorAll('#side .slot.lock').length === 6, 35000));
  ok('kern: voorstelronde-uitleg', (await K.txt('#side')).includes('Voorstelronde'));
  // speluitleg (12 nov avond): zeven stappen met een voorbeeld in beeld, één zin per stap, daarna terug naar het wachtscherm
  await fake(K.page, f => f.rpc('regie_event', { p_key: 'job', p_type: 'monster.say', p_payload: { text: 'Speluitleg!', kern: true, uitleg: true } }));
  ok('kern: speluitleg toont zeven stappen', await K.until(() => document.querySelectorAll('#side .ucard').length === 7 && !!document.querySelector('#side .ucard.on'), 6000));
  ok('kern: stap 2: drie telefoons met de koppels', await K.until(() => document.querySelectorAll('#side .ph.rol').length === 3, 30000) && /Hannah & \w+/.test(await K.txt('#side')), await K.txt('#side'));
  await K.page.screenshot({ path: path.join(ROOT, 'test/out/kern-uitleg2.png') }).catch(() => {});
  ok('kern: stap 3: werkscherm per taak, en de taken schuiven door', await K.until(() => document.querySelectorAll('#side .ph .phr').length === 3, 30000) && await K.until(() => /doorgeschoven/.test(document.querySelector('#side .schuif')?.textContent || ''), 12000));
  await K.page.screenshot({ path: path.join(ROOT, 'test/out/kern-uitleg3.png') }).catch(() => {});
  ok('kern: stap 4: de radio met het gouden vak', await K.until(() => !!document.querySelector('#side .phzeg'), 30000));
  await K.page.screenshot({ path: path.join(ROOT, 'test/out/kern-uitleg4.png') }).catch(() => {});
  ok('kern: stap 5: de werkbank', await K.until(() => /Indienen/.test(document.querySelector('#side .dvis')?.textContent || '') && !!document.querySelector('#side .duo'), 30000));
  await K.page.screenshot({ path: path.join(ROOT, 'test/out/kern-uitleg5.png') }).catch(() => {});
  await K.page.screenshot({ path: path.join(ROOT, 'test/out/kern-uitleg.png') }).catch(() => {});
  ok('kern: speluitleg zegt de wens en de veiligheidsregel en sluit af', await K.until(() => __said.some(t => /Hannah heeft één verjaardagswens/.test(t)) && __said.some(t => /samen met de papa van Hannah/.test(t)) && !document.querySelector('#side .ucard'), 130000));
  await fake(K.page, f => f.rpc('regie_start', { p_key: 'job' }));
  ok('kern: onderweg-scherm', await K.until(() => /0 van 7/.test(document.querySelector('#caption').textContent), 4000));
  ok('kern: zegt dat hij thuis wacht', await K.until(() => __said.some(t => /wachten op mijn onderdelen/.test(t)), 8000));
  await sleep(11000); // "ik blijf hier wachten" laten uitpraten
  await fake(K.page, f => f.rpc('regie_approve_stop', { p_key: 'job', p_drops: 10 }));
  ok('kern: lijf vliegt in (hologram)', await K.until(() => window.pkm.mon.parts.includes('lijf'), 4000));
  ok('kern: installatiezin lijf hardop', await K.until(() => __said.some(t => /Pantser vastgeklikt|Pannenkoekenpantser gemonteerd/.test(t)), 12000));
  ok('kern: 1 van 7', await K.until(() => /1 van 7/.test(document.querySelector('#caption').textContent), 8000));
  // naar thuis: zes delen binnen, thuis goedkeuren → hoed vliegt in → finale op de kern
  await fake(K.page, f => { f.patchGame({ parts: ['lijf', 'ogen', 'neus', 'mond', 'armen', 'benen'], active_index: 6, phase: 'finale' }); return f.rpc('regie_approve_stop', { p_key: 'job', p_drops: 10 }); });
  ok('kern: fase klaar, finale start vanzelf na de hoed', await K.until(() => ['check', 'mega', 'vers', 'confetti', 'taart', 'eind'].includes(window.pkm.finale.stage), 25000));
  ok('kern: check in beeld (zeven onderdelen)', await K.until(() => document.querySelectorAll('#side .fin-check i').length === 7 || window.pkm.finale.stage !== 'check', 8000));
  ok('kern: finale met galm (Mega actief)', await K.until(() => window.pkm.mon.status.mega > 0.5, 15000));
  ok('kern: terugblik met dia\'s', await K.until(() => !!document.querySelector('#side .fin-slide'), 90000));
  await K.page.screenshot({ path: path.join(ROOT, 'test/out/kern-terugblik.png') }).catch(() => {});
  ok('kern: taart-missie in beeld', await K.until(() => !!document.querySelector('#side .fin-taart'), 90000));
  await K.page.screenshot({ path: path.join(ROOT, 'test/out/kern-taart.png') }).catch(() => {});
  ok('kern: eindscherm met zes kaarten', await K.until(() => document.querySelectorAll('.fin-card').length === 6, 90000));
  ok('kern: hardop (voice:true) — vers gezegd', await K.page.evaluate(() => __said.some(t => /tien jaar oud/.test(t))));
  ok('geen JavaScript-fouten (kern)', !K.errors.length, K.errors.join(' | '));
  ok('geen JavaScript-fouten (regie)', !R.errors.length, R.errors.join(' | '));
  await K.page.close(); await R.page.close();
}

// ================================================================ proef: kern.html?proef speelt de finale los van de spelstand
if (!only || only === 'proef') {
  console.log('— proef (kern.html?proef)');
  const K = await open('kern.html?proef', world({ phase: 'lobby' }), { width: 1280, height: 800 });
  await K.W('#key'); await K.page.fill('#key', 'job'); await K.page.click('#gateform button');
  ok('proef: stand klaar terwijl het spel in de lobby staat', await K.until(() => document.body.classList.contains('klaar') && /PROEF/.test(document.querySelector('#eyebrow').textContent), 4000));
  await K.page.click('#side [data-t=finale]');
  ok('proef: finale loopt', await K.until(() => window.pkm.finale.stage === 'check', 6000));
  ok('proef: hoera-meter in beeld na het eerste hiep hiep', await K.until(() => window.pkm.finale.stage === 'hoera' && !!document.querySelector('#side #hoera-b'), 60000));
  ok('proef: hoera-meter luistert (HOERA!!! en de balk beweegt)', await K.until(() => !!document.querySelector('#side .fin-hoera.luister') && parseFloat(document.querySelector('#hoera-b').style.width) > 0, 15000), await K.txt('#side'));
  await K.page.screenshot({ path: path.join(ROOT, 'test/out/kern-hoera.png') }).catch(() => {});
  ok('proef: drie rondes gemeten en een uitslag van Mecha-Pof', await K.until(() => window.pkm.finale.hoera?.scores.length === 3 && __said.some(t => /^Hoera-meter: /.test(t)), 40000), JSON.stringify(await K.page.evaluate(() => window.pkm.finale.hoera)));
  await K.page.screenshot({ path: path.join(ROOT, 'test/out/kern-hoera-uitslag.png') }).catch(() => {});
  console.log('  hoera-scores (nep-microfoon):', JSON.stringify(await K.page.evaluate(() => window.pkm.finale.hoera)));
  ok('proef: terugblik met voorbeeldtijden', await K.until(() => /Snelste klus/.test(document.querySelector('#side')?.textContent || '') || /1 uur en 35 min/.test(document.querySelector('#side')?.textContent || ''), 90000));
  ok('proef: taart en eindscherm', await K.until(() => !!document.querySelector('#side .fin-taart') && window.pkm.finale.stage === 'eind', 90000));
  ok('proef: meldt zich niet als kernscherm, spel blijft in de lobby', await K.page.evaluate(() => !window.pkm.state.get().game.settings?.kern_at && window.pkm.state.get().game.phase === 'lobby'));
  ok('geen JavaScript-fouten (proef)', !K.errors.length, K.errors.join(' | '));
  await K.page.close();
}

// ================================================================ bonus: regie.html tab Bonus → telefoon
if (!only || only === 'bonus') {
  console.log('— bonus (regie.html + index.html)');
  const w = world({ phase: 'onderweg', active: 4, parts: ['lijf', 'ogen', 'neus', 'mond'] }); // onderweg naar stop 5 (groene kastje)
  const R = await open('regie.html', w, { width: 1280, height: 800 });
  await R.W('input[type=password]', 8000);
  await R.page.fill('input[type=password]', 'job'); await R.page.keyboard.press('Enter');
  await R.W('[data-tab=bonus]', 8000);
  await R.page.click('[data-tab=bonus]');
  await R.W('[data-a=bonus-in][data-b=B3]');
  ok('regie: tab Bonus met B1–B3', (await R.page.$$('[data-a=bonus-in]')).length === 3 && (await R.txt('#panel')).includes('Het stalen huis'));
  ok('regie: zegt waar de bonus komt (vóór het groene kastje)', (await R.txt('#panel')).includes('komt vóór Het groene kastje'));
  await R.page.click('[data-a=bonus-in][data-b=B3]');
  ok('regie: B3 als stop zonder deel aangemaakt', await R.until(() => window.__fake.db.stop.some(s => s.name === 'Het stalen huis' && !s.part && !s.key), 4000));
  const ord = await R.page.evaluate(() => { const g = window.__fake.db.game, b = window.__fake.db.stop.find(s => s.name === 'Het stalen huis'); return { idx: g.stop_order.indexOf(b.id), len: g.stop_order.length, next: g.stop_order[g.stop_order.indexOf(b.id) + 1], b }; });
  ok('regie: stop_order: bonus op plek 5, groene kastje erna', ord.idx === 4 && ord.len === 8 && ord.next === 's5', JSON.stringify(ord).slice(0, 160));
  ok('regie: status "NU de actieve stop" + knop weg', await R.until(() => document.querySelector('#panel').textContent.includes('NU de actieve stop'), 4000));
  ok('geen JavaScript-fouten (regie bonus)', !R.errors.length, R.errors.join(' | '));
  const wb = await R.page.evaluate(() => ({ stop: window.__fake.db.stop, game: window.__fake.db.game }));
  await R.page.close();
  // de telefoon in dezelfde stand
  const w2 = { ...w, stop: wb.stop, game: wb.game };
  const T = await open('index.html?test=1', w2);
  await T.W('input[aria-label="Code"]'); await T.page.fill('input[aria-label="Code"]', '5243');
  await T.W('text=Het stalen huis');
  ok('telefoon: onderweg naar de bonus, tab "Bonusopdracht"', (await T.txt('#screen')).includes('Bonusopdracht') && (await T.txt('#screen')).includes('magneet'));
  await T.page.click('[data-n=tele]');
  await T.W('.choices button', 8000);
  ok('telefoon: keuzepuzzel van B3', (await T.txt('#pz')).includes('Stroopwafels'));
  await T.page.click('.choices button:has-text("Staal")');
  await T.W('#dosubmit'); await T.page.click('#dosubmit');
  ok('telefoon: bonus-overlay zonder installatieritueel', await T.until(() => document.querySelector('#ov')?.textContent.includes('Bonus gelukt') && !document.querySelector('#ov .install'), 6000));
  ok('telefoon: vreugdezin van Mecha-Pof', await T.until(() => __said.some(t => /Bonus binnen|Extra klus geklaard/.test(t)), 6000));
  ok('telefoon: geen deel erbij (nog steeds 4)', await T.page.evaluate(() => window.pkm.state.get().game.parts.length === 4));
  await T.page.click('#ov [data-x=close]');
  ok('telefoon: daarna weer naar het groene kastje (plek 5 van 7)', await T.until(() => document.querySelector('#screen')?.textContent.includes('Het groene kastje') && document.querySelector('#screen').textContent.includes('Plek 5 van 7'), 6000));
  ok('geen JavaScript-fouten (telefoon bonus)', !T.errors.length, T.errors.join(' | '));
  await T.page.close();
}

if (globalThis.__chat7_more) await globalThis.__chat7_more({ open, world, fake, ok, sleep, only });
console.log(`\n${n} goed, ${failed} fout.`);
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
