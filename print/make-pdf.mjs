// make-pdf.mjs — maakt de PDF's van de printbestanden op ware grootte (headless Chrome via Playwright).
//   node print/make-pdf.mjs            → print/pdf/*.pdf (+ voorbeeld-PNG's met --png)
// Zdog komt uit test/vendor (geen internet nodig); lettertypes en QR staan in print/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const pw = ['playwright', '/opt/npm-tools/node_modules/playwright'].find(c => { try { req.resolve(c); return true; } catch { return false; } });
if (!pw) { console.error('playwright niet gevonden: npm i -D playwright && npx playwright install chromium'); process.exit(2); }
const { chromium } = req(pw);
const ROOT = path.resolve(new URL('..', import.meta.url).pathname), OUT = path.join(ROOT, 'print/pdf');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((rq, res) => {
  const f = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}`;
const JOBS = [
  { file: 'poster-mega.html', pdf: 'mega-mecha-pof-90x180.pdf', w: '90cm', h: '180cm' },
  { file: 'poster-gebruiksaanwijzing.html', pdf: 'gebruiksaanwijzing-led-ogen-90x150.pdf', w: '90cm', h: '150cm' },
  { file: 'poster-qr.html', pdf: 'qr-poster-groene-kastje-90x120.pdf', w: '90cm', h: '120cm' },
  { file: 'poster-qr-puzzel.html', pdf: 'qr-puzzel-groene-kastje-90x120.pdf', w: '90cm', h: '120cm' },
  { file: 'poster-tankstation.html', pdf: 'stroop-tankstation-90x135.pdf', w: '90cm', h: '135cm' },
  { file: 'monteurspas.html', pdf: 'monteurspassen-A4.pdf', w: '210mm', h: '297mm' },
  { file: 'spelkaart.html', pdf: 'spelkaart-A4.pdf', w: '210mm', h: '297mm' },
  { file: 'draaiboek.html', pdf: 'draaiboek-begeleider-A4.pdf', w: '210mm', h: '297mm' },
  { file: 'diploma.html', pdf: 'monteursdiploma-A4.pdf', w: '297mm', h: '210mm' },
];
const only = process.argv.slice(2).filter(a => !a.startsWith('--')), png = process.argv.includes('--png');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
for (const j of JOBS) {
  if (only.length && !only.some(o => j.file.includes(o))) continue;
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
  page.on('pageerror', e => console.error('  fout', j.file, e.message));
  await page.route('**/*', r => { const u = r.request().url();
    if (/zdog@1\.1\.3|zdog\/1\.1\.3/.test(u)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'test/vendor/zdog.dist.min.js'), 'utf8') });
    return u.startsWith(BASE) ? r.continue() : r.abort(); });
  await page.goto(`${BASE}/print/${j.file}`);
  if (!j.file.startsWith('monteurspas')) await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  if (png) { await page.screenshot({ path: path.join(OUT, j.pdf.replace('.pdf', '.png')), fullPage: false }); }
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(OUT, j.pdf), width: j.w, height: j.h, printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  console.log('✓', j.pdf, Math.round(fs.statSync(path.join(OUT, j.pdf)).size / 1024) + ' kB');
  await page.close();
}
await browser.close(); server.close();
