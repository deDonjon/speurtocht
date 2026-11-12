// Browsertest van de tekeningen (12 nov) in headless Chrome met de nep-Supabase en een nagebootste Edge Function monster-foto.
//   node test/browser-tekening.mjs [regie|kern]
// regie: tab 📸 Tekeningen → teamfoto kiezen → groep tekenen (bezig → klaar) → goedkeuren → portret Hannah → zip downloaden (PNG + JPEG).
// kern:  kern.html?proef met goedgekeurde groep, feestplaat en portret → terugblik-dia met de groepstekening → eindscherm met feestplaat en portret.
// Zonder goedgekeurde tekeningen blijft de finale zoals hij was (dat dekt test/browser-chat7.mjs).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const pwPath = ['playwright', '/opt/npm-tools/node_modules/playwright'].find(c => { try { req.resolve(c); return true; } catch { return false; } });
if (!pwPath) { console.error('playwright niet gevonden'); process.exit(2); }
const { chromium } = req(pwPath);

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.join(ROOT, 'test/out'); fs.mkdirSync(OUT, { recursive: true });
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
// "tekening": het stijlvoorbeeld, als ondertekende link van de privé-bucket
const wacht = async (fn, t = 5000) => { const end = Date.now() + t; while (Date.now() < end) { if (fn()) return true; await sleep(100); } return false; };
const BEELD = id => `${BASE}/test/mecha-pof-stijl.png?token=${id}`;

// ---- nagebootste monster-foto (zelfde contract als supabase/functions/monster-foto)
const db = { rijen: [], starts: [] };
let nr = 0;
function functie(route) {
  const r = route.request(), body = r.postDataBuffer() || Buffer.alloc(0), txt = body.toString('latin1'), key = r.headers()['x-regie-key'];
  const send = (j, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(j) });
  if (r.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: 'ok' });
  if (key !== 'job') return send({ ok: false, error: 'verkeerde regiesleutel' }, 401);
  if (/name="actie"\r\n\r\nstart/.test(txt)) {
    const f = k => (new RegExp(`name="${k}"\\r\\n\\r\\n([^\\r]*)`).exec(txt) || [])[1] || null;
    const id = `00000000-0000-4000-8000-${String(++nr).padStart(12, '0')}`;
    db.starts.push({ soort: f('soort'), stijl: f('stijl_naam'), size: f('size'), speler: f('speler'), foto: /name="foto"; filename=/.test(txt), stijlpng: /name="stijl"; filename="mecha-pof.png"/.test(txt) });
    const rij = { id, soort: f('soort'), stijl: f('stijl_naam'), player_id: f('speler'), naam: f('speler') === 'p1' ? 'Hannah' : null, status: 'bezig', fout: null, url: null, goedgekeurd: false, ms: null, kosten_usd: null, created_at: now() };
    db.rijen.unshift(rij);
    setTimeout(() => Object.assign(rij, { status: 'klaar', url: BEELD(id), ms: 41000, kosten_usd: 0.07 }), 2500);
    return send({ ok: true, id });
  }
  const b = JSON.parse(body.toString() || '{}');
  const isOrig = r.url().includes('monster-origineel');
  if (b.actie === 'lijst' && !isOrig) return send({ ok: true, rijen: db.rijen });
  if (b.actie === 'upload' && isOrig) { const pad = `g1/origineel/${b.slot}-${Date.now()}.${{ 'image/png': 'png', 'image/jpeg': 'jpg' }[b.type] || 'x'}`; (db.uploads ||= []).push({ slot: b.slot, type: b.type, pad }); return send({ ok: true, pad, url: 'https://opslag.test/upload/' + pad }); }
  if (b.actie === 'lijst' && isOrig) return send({ ok: true, rijen: (db.orig || []).map(o => ({ bestand: o.pad.split('/').pop(), slot: o.slot, naam: o.slot === 'p1' ? 'Hannah' : null, kb: Math.round(o.bytes / 1024), created_at: now(), url: 'https://opslag.test/lees/' + o.pad })) });
  const rij = db.rijen.find(x => x.id === b.id); if (!rij) return send({ ok: false, error: 'tekening niet gevonden' }, 404);
  if (b.actie === 'keur') { if (b.ok) db.rijen.filter(x => x.soort === rij.soort && x.player_id === rij.player_id).forEach(x => x.goedgekeurd = false); rij.goedgekeurd = !!b.ok; return send({ ok: true }); }
  if (b.actie === 'weg') { db.rijen = db.rijen.filter(x => x !== rij); return send({ ok: true }); }
  return send({ ok: false, error: 'onbekende actie' }, 400);
}

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
async function open(file, init, { width = 390, height = 844 } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: width < 600, reducedMotion: 'reduce', acceptDownloads: true });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error' && !/leaflet|fonts|cdn|ERR_FAILED|net::|elevenlabs|supabase\.co|Failed to load resource|navigator\.vibrate/i.test(m.text())) errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.addInitScript(i => { globalThis.__FAKE_INIT = i; try { localStorage.setItem('pkm2_muted', 'true'); } catch {} }, init);
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.includes('/functions/v1/monster-foto') || u.includes('/functions/v1/monster-origineel')) return functie(route);
    if (u.startsWith('https://opslag.test/upload/')) { const rq = route.request(); if (rq.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'PUT' }, body: 'ok' });
      const pad = u.split('/upload/')[1], buf = rq.postDataBuffer() || Buffer.alloc(0), up = (db.uploads || []).find(x => x.pad === pad);
      (db.orig ||= []).push({ pad, slot: up?.slot, bytes: buf.length, method: rq.method(), type: rq.headers()['content-type'], data: buf });
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{"Key":"ok"}' }); }
    if (u.startsWith('https://opslag.test/lees/')) { const o = (db.orig || []).find(x => u.endsWith(x.pad)); return route.fulfill({ status: o ? 200 : 404, headers: { 'access-control-allow-origin': '*' }, contentType: o?.type || 'image/png', body: o?.data || '' }); }
    if (u.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'test/fake-supabase.mjs'), 'utf8') });
    if (/zdog@1\.1\.3|zdog\/1\.1\.3/.test(u)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'test/vendor/zdog.dist.min.js'), 'utf8') });
    if (u.startsWith('https://cdn.jsdelivr.net/npm/jszip')) { // JSZip uit npm (JSZIP_DIST of node_modules), als ES-module verpakt
      const f = [process.env.JSZIP_DIST, 'node_modules/jszip/dist/jszip.min.js'].filter(Boolean).find(x => fs.existsSync(x));
      return f ? route.fulfill({ status: 200, contentType: 'text/javascript', body: `const module={exports:{}};const exports=module.exports;${fs.readFileSync(f, 'utf8')}\nexport default module.exports;` }) : route.continue();
    }
    if (u.startsWith(BASE)) return route.continue();
    return route.abort();
  });
  await page.goto(BASE + '/' + file);
  const W = (sel, t = 8000) => page.waitForSelector(sel, { timeout: t }).catch(() => null);
  const until = async (fn, t = 10000, arg) => { const end = Date.now() + t; while (Date.now() < end) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await sleep(250); } return false; };
  return { page, errors, W, until };
}
function world({ phase = 'lobby' } = {}) {
  const P = [['p1', 'Hannah', 'sleutelbewaarder', true], ['p2', 'Elin', 'speurneus'], ['p3', 'Isa', 'kaartlezer'], ['p4', 'Evy', 'codekraker'], ['p5', 'Lauren', 'rekenmeester'], ['p6', 'Julia', 'tijdbewaker']];
  const player = P.map(([id, name, talent, b]) => ({ id, game_id: 'g1', name, is_birthday: !!b, part: null, talent, color: null, badges: [], device_id: null, last_seen_at: null }));
  const S = (id, seq, key, name, part, dlat) => ({ id, game_id: 'g1', seq, key, name, clue: 'Aanwijzing', lat: 51.6162 + dlat, lng: 5.5615 + dlat, radius: 20, part, puzzles: [{ type: 'code', question: 'Code?', answer: '1' }] });
  const stop = [S('s1', 1, 'start', 'De palenrij', 'lijf', .001), S('s2', 2, null, 'Het bord', 'ogen', .002), S('s3', 3, null, 'Het veldje', 'neus', .003), S('s4', 4, null, 'De Stadsbrink', 'mond', .004),
    S('s5', 5, null, 'Het groene kastje', 'armen', .005), S('s6', 6, null, 'Het huis', 'benen', .006), S('s7', 7, 'home', 'Thuis', 'hoed', 0)];
  return { game: { id: 'g1', code: 'hannah10', title: 'Mecha-Pof', phase, stop_order: stop.map(s => s.id), active_index: 0, parts: [], drops: 40, hints: 1, energy: 2, wish_used: false, surprise: null,
    settings: { radius: 20, min_gap: 150, any_can_submit: false }, started_at: null, finished_at: null }, player, stop, puzzle_state: [], event: [], codes: { 5243: 'p1' } };
}

// ================================================================ regie
if (!only || only === 'regie') {
  console.log('— regie (tab 📸 Tekeningen)');
  const R = await open('regie.html', world(), { width: 390, height: 844 });
  await R.W('input[type=password]', 8000);
  await R.page.fill('input[type=password]', 'job'); await R.page.keyboard.press('Enter');
  ok('regie: tab Tekeningen', !!(await R.W('[data-tab=foto]', 8000)));
  await R.page.click('[data-tab=foto]');
  ok('regie: zes portretblokken, jarige eerst', await R.until(() => document.querySelectorAll('.tk-meid').length === 6 && document.querySelector('.tk-meid h3').textContent.includes('Hannah'), 4000));
  ok('regie: teken-knoppen uit zonder foto', await R.page.evaluate(() => document.querySelector('[data-tk=teken][data-soort=groep]').disabled));
  const foto = path.join(OUT, 'tekening-testfoto.png');
  await R.page.screenshot({ path: foto, clip: { x: 0, y: 0, width: 390, height: 300 } }); // willekeurig plaatje zonder mensen
  let [fc] = await Promise.all([R.page.waitForEvent('filechooser'), R.page.click('[data-tk=kies][data-slot=groep]')]);
  await fc.setFiles(foto);
  ok('regie: teamfoto in beeld, knoppen aan', await R.until(() => !!document.querySelector('.tk-foto img') && !document.querySelector('[data-tk=teken][data-soort=groep]').disabled, 4000));
  const origBytes = fs.statSync(foto).size;
  ok('regie: origineel direct bewaard, onverkleind (zelfde bytes als het bestand)', await wacht(() => (db.orig || []).length >= 1) && db.orig[0].slot === 'groep' && db.orig[0].method === 'PUT' && db.orig[0].bytes === origBytes && db.orig[0].type === 'image/png', JSON.stringify((db.orig || []).map(o => [o.slot, o.bytes, o.type])) + ' ' + origBytes);
  ok('regie: melding "Origineel bewaard" bij de foto', await R.until(() => /Origineel bewaard/.test(document.querySelector('.tk-foto').textContent), 4000));
  await R.page.click('[data-tk=teken][data-soort=groep]');
  ok('regie: start met foto + stijlvoorbeeld, soort groep, liggend', await wacht(() => db.starts.length >= 1) && db.starts[0]?.soort === 'groep' && db.starts[0].foto && db.starts[0].stijlpng && db.starts[0].size === '1536x1024', JSON.stringify(db.starts[0]));
  ok('regie: kaart "Mecha-Pof tekent…" met lopende seconden', await R.until(() => /tekent/.test(document.querySelector('.tk-kaart')?.textContent || '') && /\d+ s/.test(document.querySelector('[data-tk-sec]')?.textContent || ''), 4000));
  ok('regie: na ± 5 s klaar met beeld en melding', await R.until(() => !!document.querySelector('.tk-kaart img') && /Tekening klaar/.test(document.querySelector('#toast')?.textContent || ''), 12000));
  await R.page.click('[data-tk=keur]');
  ok('regie: goedgekeurd ("in het spel")', await R.until(() => /in het spel/.test(document.querySelector('.tk-kaart')?.textContent || ''), 5000) && db.rijen[0].goedgekeurd);
  // feestplaat met dezelfde foto, andere stijl
  await R.page.selectOption('[data-tk-stijl=groep]', 'prent');
  await R.page.click('[data-tk=teken][data-soort=feest]');
  ok('regie: feestplaat in prentenboek-stijl gestart', await wacht(() => db.starts.length >= 2) && db.starts.at(-1).soort === 'feest' && db.starts.at(-1).stijl === 'prent', JSON.stringify(db.starts.at(-1)));
  // portret van Hannah
  [fc] = await Promise.all([R.page.waitForEvent('filechooser'), R.page.click('[data-tk=kies][data-slot=p1]')]);
  await fc.setFiles(foto);
  await R.until(() => !document.querySelector('[data-tk=teken][data-speler=p1]').disabled, 4000);
  await R.page.click('[data-tk=teken][data-speler=p1]');
  ok('regie: portret Hannah gestart, staand formaat', await wacht(() => db.starts.length >= 3) && db.starts.at(-1).soort === 'portret' && db.starts.at(-1).speler === 'p1' && db.starts.at(-1).size === '1024x1536', JSON.stringify(db.starts.at(-1)));
  ok('regie: portret klaar onder Hannah', await R.until(() => !!document.querySelector('.tk-meid .tk-kaart img'), 12000));
  await R.page.click('.tk-meid [data-tk=keur]');
  await R.until(() => db.rijen.some(r => r.soort === 'portret' && r.goedgekeurd), 4000);
  await R.until(() => db.rijen.every(r => r.status === 'klaar'), 8000);
  // zip
  const [dl] = await Promise.all([R.page.waitForEvent('download', { timeout: 30000 }).catch(() => null), R.page.click('[data-tk=zip]')]);
  let namen = [];
  if (dl) { const p = path.join(OUT, 'tekeningen.zip'); await dl.saveAs(p); namen = execFileSync('python3', ['-c', 'import zipfile,sys;print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', p]).toString().trim().split('\n'); }
  ok('regie: zip met per beeld PNG + JPEG, map per meid en Reparatieteam', namen.filter(x => x.endsWith('.png') && !x.includes('Originele')).length === 3 && namen.filter(x => x.endsWith('.jpg')).length === 3
    && namen.some(x => x.includes('/Hannah/hannah-portret-') === false && x.includes('/Hannah/')) && namen.some(x => x.includes('/Reparatieteam/groep-strip-') && x.includes('-gekozen.png')), namen.join(', '));
  ok("regie: zip bevat de originele foto's (Reparatieteam-1 en Hannah-1)", namen.some(x => x.endsWith("Originele foto's/Reparatieteam-1.png")) && namen.some(x => x.endsWith("Originele foto's/Hannah-1.png")), namen.filter(x => x.includes('Originele')).join(', '));
  await R.page.screenshot({ path: path.join(OUT, 'tekening-regie.png'), fullPage: true });
  ok('geen JavaScript-fouten (regie)', !R.errors.length, R.errors.join(' | '));
  await R.page.close();
}

// ================================================================ kern: finale met de goedgekeurde tekeningen
if (!only || only === 'kern') {
  console.log('— kern (kern.html?proef met tekeningen)');
  const t = now();
  db.rijen = [
    { id: '10000000-0000-4000-8000-000000000001', soort: 'groep', stijl: 'strip', player_id: null, naam: null, status: 'klaar', url: BEELD('g'), goedgekeurd: true, created_at: t },
    { id: '10000000-0000-4000-8000-000000000002', soort: 'feest', stijl: 'prent', player_id: null, naam: null, status: 'klaar', url: BEELD('f'), goedgekeurd: true, created_at: t },
    { id: '10000000-0000-4000-8000-000000000003', soort: 'portret', stijl: 'strip', player_id: 'p1', naam: 'Hannah', status: 'klaar', url: BEELD('p'), goedgekeurd: true, created_at: t },
    { id: '10000000-0000-4000-8000-000000000004', soort: 'portret', stijl: 'prent', player_id: 'p2', naam: 'Elin', status: 'klaar', url: BEELD('x'), goedgekeurd: false, created_at: t },
  ];
  const K = await open('kern.html?proef', world(), { width: 1280, height: 800 });
  await K.W('#key'); await K.page.fill('#key', 'job'); await K.page.click('#gateform button');
  await K.until(() => document.body.classList.contains('klaar'), 4000);
  await sleep(1500);
  await K.page.click('#side [data-t=finale]');
  ok('kern: terugblik eindigt met de groepstekening', await K.until(() => !!document.querySelector('#side .fin-slide-img') && /Het Reparatieteam/.test(document.querySelector('#side').textContent), 120000));
  await K.page.screenshot({ path: path.join(OUT, 'tekening-kern-dia.png') });
  ok('kern: eindscherm', await K.until(() => window.pkm.finale.stage === 'eind' && !!document.querySelector('#side .fin-taart'), 90000));
  ok('kern: feestplaat bovenaan het eindscherm', await K.until(() => !!document.querySelector('#side .fin-feest'), 4000));
  ok('kern: portret alleen bij Hannah (goedgekeurd), niet bij Elin', await K.page.evaluate(() => document.querySelectorAll('.fin-portret').length === 1 && document.querySelector('.fin-card .fin-portret')?.closest('.fin-card').textContent.includes('Hannah')));
  await K.page.click('#side .fin-feest');
  ok('kern: klik op de feestplaat = groot', await K.until(() => !!document.querySelector('.groot img'), 2000));
  await K.page.screenshot({ path: path.join(OUT, 'tekening-kern-groot.png') });
  await K.page.click('.groot');
  await K.page.screenshot({ path: path.join(OUT, 'tekening-kern-eind.png') });
  ok('geen JavaScript-fouten (kern)', !K.errors.length, K.errors.join(' | '));
  await K.page.close();
}

await browser.close(); server.close();
console.log(`\n${n} goed, ${failed} fout.`);
process.exit(failed ? 1 : 0);
