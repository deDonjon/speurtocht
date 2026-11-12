// tekening.js — foto wordt Mecha-Pof-tekening (12 nov 2026). Gebruikt door regie.html (tab 📸 Tekeningen) en kern.html (finale).
// Praat met de Edge Function monster-foto (regiesleutel verplicht). De tekeningen staan als PNG in de PRIVÉ-bucket monster-prive;
// deze module krijgt alleen ondertekende links (3 uur geldig). De foto zelf blijft alleen in het geheugen van de regie-telefoon.
//
//   Regie:  tk.init({ onChange, toast, players })   één keer na het inloggen; ververst zelf zolang er tekeningen bezig zijn
//           tk.tabHTML()                            inhoud van de tab (regie.js zet hem in het paneel)
//           tk.badge()                              getal op de tab: tekeningen die klaar zijn en nog niet bekeken
//   Kern:   const t = kernTekeningen(); t.start()   haalt elke minuut de goedgekeurde tekeningen op en laadt ze alvast
//           t.get() → { groep, feest, portret:{ [player_id]: url } }   t.sig() → verandert als er iets anders goedgekeurd is
import { sync, SUPABASE_URL, SUPABASE_KEY, IS_TEST, GAME_CODE } from './sync.js';
import { PARTS, TALENTS } from './state.js';

const FUNCTIE = SUPABASE_URL + '/functions/v1/monster-foto';
const STIJL_PNG = new URL('../test/mecha-pof-stijl.png', import.meta.url).href;
const MAX_ZIJDE = 1600;
const NAAM = { groep: 'Groep', feest: 'Feestplaat', portret: 'Portret' }, STIJLEN = { strip: 'Stripboek', prent: 'Prentenboek' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// sync.regie.sleutel() (nieuw); valt terug op de sessie-opslag van sync.js als een oudere sync.js nog in de cache zit
const sleutel = () => { try { return sync.regie.sleutel?.() || sessionStorage.getItem('pkm2_regie' + (IS_TEST ? '_' + GAME_CODE : '')) || ''; } catch { return ''; } };

/* ================================================================ verbinding met de functie */
async function post(body, isForm = false) {
  const r = await fetch(FUNCTIE, { method: 'POST', body: isForm ? body : JSON.stringify(body),
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'x-regie-key': sleutel(), ...(isForm ? {} : { 'content-type': 'application/json' }) } });
  const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
  if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
export const lijst = () => post({ actie: 'lijst' }).then(j => j.rijen || []);
export const keur = (id, ok) => post({ actie: 'keur', id, ok });
export const weg = id => post({ actie: 'weg', id });
let stijlBlob = null;
async function stijlvoorbeeld() { if (!stijlBlob) { const r = await fetch(STIJL_PNG); if (!r.ok) throw new Error('stijlvoorbeeld niet gevonden'); stijlBlob = await r.blob(); } return stijlBlob; }
const formaat = ({ w, h }) => { const r = w / h; return r > 1.2 ? '1536x1024' : r < 0.83 ? '1024x1536' : '1024x1024'; };
export async function start({ soort, stijl, foto, speler = null }) {
  const fd = new FormData();
  fd.append('actie', 'start'); fd.append('soort', soort); fd.append('stijl_naam', stijl);
  fd.append('foto', foto.blob, 'foto.jpg'); fd.append('stijl', await stijlvoorbeeld(), 'mecha-pof.png');
  fd.append('size', soort === 'portret' ? '1024x1536' : formaat(foto));
  if (speler) fd.append('speler', speler);
  return post(fd, true);
}
/** Foto inlezen en verkleinen tot max 1600 px lange zijde, met de juiste draaiing van de camera. */
export async function verklein(file) {
  let bron;
  try { bron = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bron = await new Promise((ok, nee) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => nee(new Error('geen leesbare foto')); i.src = URL.createObjectURL(file); }); }
  const k = Math.min(1, MAX_ZIJDE / Math.max(bron.width, bron.height)), w = Math.round(bron.width * k), h = Math.round(bron.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bron, 0, 0, w, h);
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.9));
  return { blob, w, h, url: URL.createObjectURL(blob) };
}

/* ================================================================ regie: tab 📸 Tekeningen */
const R = { rijen: [], geladen: false, fotos: new Map(), stijl: { groep: 'strip' }, gezien: new Set(), start: new Map(), bezigStart: 0, laatste: 0 };
let opts = { onChange: () => {}, toast: () => {}, players: () => [] }, pollTimer = null, inited = false, kiesVoor = null, zipBezig = false;

export function init(o) {
  opts = { ...opts, ...o };
  if (inited) return; inited = true;
  injectCss();
  // Eén verborgen bestandskiezer buiten het paneel: het paneel wordt vaak opnieuw getekend, de kiezer mag dan niet verdwijnen.
  const mk = (id, capture) => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.id = id; i.hidden = true; if (capture) i.setAttribute('capture', capture); document.body.appendChild(i); i.addEventListener('change', kiesGekozen); return i; };
  mk('tk-kies'); mk('tk-maak', 'environment');
  document.addEventListener('click', klik);
  document.addEventListener('change', e => { const s = e.target.closest?.('[data-tk-stijl]'); if (s) R.stijl[s.dataset.tkStijl] = s.value; });
  setInterval(tik, 1000);
  ververs();
}
async function ververs() {
  if (!sleutel()) return;
  try {
    const rijen = await lijst();
    const was = new Map(R.rijen.map(r => [r.id, r.status]));
    for (const r of rijen) if (was.get(r.id) === 'bezig' && r.status !== 'bezig') opts.toast(r.status === 'klaar' ? `🎨 Tekening klaar: ${titel(r)}` : `⚠️ Tekening mislukt: ${titel(r)}`, 4500, r.status !== 'klaar');
    R.rijen = rijen; R.geladen = true; R.laatste = Date.now();
    opts.onChange();
  } catch (e) { console.warn('[tekening] lijst', e.message); }
  clearTimeout(pollTimer);
  const bezig = R.rijen.some(r => r.status === 'bezig');
  pollTimer = setTimeout(ververs, bezig ? 5000 : 60_000);
}
function tik() { // seconden bij tekeningen die bezig zijn, zonder het paneel opnieuw te tekenen
  for (const el of document.querySelectorAll('[data-tk-sec]')) el.textContent = Math.max(0, Math.round((Date.now() - Date.parse(el.dataset.tkSec)) / 1000)) + ' s';
}
const titel = r => r.soort === 'portret' ? `${r.naam || 'portret'} (${STIJLEN[r.stijl]})` : `${NAAM[r.soort]} (${STIJLEN[r.stijl]})`;
export function badge() { return R.rijen.filter(r => r.status === 'klaar' && !R.gezien.has(r.id)).length || ''; }

async function kiesGekozen(e) {
  const f = e.target.files?.[0]; e.target.value = ''; if (!f || !kiesVoor) return;
  const slot = kiesVoor; kiesVoor = null;
  try { const oud = R.fotos.get(slot); if (oud) URL.revokeObjectURL(oud.url); R.fotos.set(slot, await verklein(f)); opts.onChange(); }
  catch (err) { opts.toast('⚠️ ' + (err.message || err), 4000, true); }
}
async function teken(soort, slot, stijl, speler = null) {
  const foto = R.fotos.get(slot);
  if (!foto) return opts.toast('Maak of kies eerst een foto.', 3500, true);
  try { await start({ soort, stijl, foto, speler }); opts.toast('🎨 Mecha-Pof tekent… (± 1 minuut)', 3000); await ververs(); }
  catch (e) { opts.toast('⚠️ ' + (e.message || e), 5000, true); }
}
async function klik(e) {
  const b = e.target.closest?.('[data-tk]'); if (!b) return;
  const a = b.dataset.tk, id = b.dataset.id, rij = R.rijen.find(r => r.id === id);
  if (a === 'kies' || a === 'maak') { kiesVoor = b.dataset.slot; document.getElementById(a === 'kies' ? 'tk-kies' : 'tk-maak').click(); return; }
  if (a === 'teken') return teken(b.dataset.soort, b.dataset.slot, R.stijl[b.dataset.slot] || 'strip', b.dataset.speler || null);
  if (a === 'groot') { R.gezien.add(id); return groot(b.dataset.url || rij?.url); }
  if (a === 'zip') return downloadAlles();
  if (!rij) return;
  b.disabled = true;
  try {
    if (a === 'keur' || a === 'intrek') { await keur(id, a === 'keur'); opts.toast(a === 'keur' ? '✅ Goedgekeurd: komt terug in de finale' : 'Goedkeuring ingetrokken', 2500); R.gezien.add(id); }
    if (a === 'opnieuw' || a === 'ander') {
      const stijl = a === 'ander' ? (rij.stijl === 'strip' ? 'prent' : 'strip') : rij.stijl;
      const slot = rij.soort === 'portret' ? rij.player_id : 'groep';
      await teken(rij.soort, slot, stijl, rij.player_id); return;
    }
    if (a === 'deel') { await deel(rij); return; }
    if (a === 'weg') { if (!confirm(`Tekening "${titel(rij)}" weggooien? Dat kan niet terug.`)) return; await weg(id); opts.toast('Weggegooid', 2000); }
    await ververs();
  } catch (err) { opts.toast('⚠️ ' + (err.message || err), 5000, true); }
  finally { b.disabled = false; }
}
function groot(url) {
  if (!url) return;
  const o = document.createElement('div'); o.className = 'tk-groot'; o.innerHTML = `<img src="${esc(url)}" alt=""><p>Tik om te sluiten</p>`;
  o.onclick = () => o.remove(); document.body.appendChild(o);
}
const bestandsnaam = (r, ext) => `${(r.soort === 'portret' ? r.naam || 'portret' : NAAM[r.soort]).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${r.stijl}-${r.id.slice(0, 4)}${r.goedgekeurd ? '-gekozen' : ''}.${ext}`;
async function deel(r) {
  const blob = await (await fetch(r.url)).blob(), file = new File([blob], bestandsnaam(r, 'png'), { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file.name }); document.body.append(a); a.click(); a.remove();
}
async function naarJpeg(blob) {
  const bm = await createImageBitmap(blob), c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
  c.getContext('2d').drawImage(bm, 0, 0); return new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.9));
}
/** Alle klare tekeningen als zip: per meid een map, plus Reparatieteam; elk beeld als PNG (printen) en JPEG (versturen). */
async function downloadAlles() {
  if (zipBezig) return; zipBezig = true; opts.onChange();
  try {
    await ververs();
    const klaar = R.rijen.filter(r => r.status === 'klaar' && r.url);
    if (!klaar.length) { opts.toast('Nog geen klare tekeningen.', 3000, true); return; }
    const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
    const zip = new JSZip(), root = 'Mecha-Pof tekeningen';
    let n = 0;
    for (const r of klaar) {
      const map = `${root}/${r.soort === 'portret' ? r.naam || 'Portretten' : 'Reparatieteam'}`;
      const png = await (await fetch(r.url)).blob();
      zip.file(`${map}/${bestandsnaam(r, 'png')}`, png);
      zip.file(`${map}/klein/${bestandsnaam(r, 'jpg')}`, await naarJpeg(png));
      opts.toast(`📦 ${++n} van ${klaar.length}…`, 1200);
    }
    zip.file(`${root}/LEESMIJ.txt`, 'Tekeningen van het verjaardagsfeest (Operatie Mecha-Pof, 13 november 2026).\nPNG = beste kwaliteit (printen). Map "klein" = JPEG om te versturen.\n"-gekozen" = de tekening die in het spel is gebruikt.\n');
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const naam = 'mecha-pof-tekeningen.zip', file = new File([blob], naam, { type: 'application/zip' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: naam }); document.body.append(a); a.click(); a.remove();
  } catch (e) { opts.toast('⚠️ Downloaden mislukt: ' + (e.message || e), 6000, true); }
  finally { zipBezig = false; opts.onChange(); }
}

function kaart(r) {
  const fout = r.fout ? [r.fout.error, r.fout.code && `code: ${r.fout.code}`, r.fout.details && `details: ${JSON.stringify(r.fout.details)}`].filter(Boolean).join('\n') : '';
  const beeld = r.status === 'klaar' && r.url ? `<img src="${esc(r.url)}" alt="" loading="lazy" data-tk="groot" data-id="${r.id}">`
    : r.status === 'bezig' ? `<div class="tk-wacht">⏳ Mecha-Pof tekent… <b data-tk-sec="${esc(r.created_at)}"></b></div>`
    : `<div class="tk-wacht bad">Geen tekening</div>`;
  return `<div class="tk-kaart ${r.goedgekeurd ? 'ok' : ''} ${r.status}">
    ${beeld}
    <div class="tk-meta"><b>${esc(STIJLEN[r.stijl])}${r.goedgekeurd ? ' · ✅ in het spel' : ''}</b>${r.ms ? `<small>${Math.round(r.ms / 1000)} s${r.kosten_usd ? ` · $${(+r.kosten_usd).toFixed(2)}` : ''}</small>` : ''}</div>
    ${fout ? `<pre class="tk-fout">${esc(fout)}</pre>` : ''}
    <div class="row">${r.status === 'klaar' ? (r.goedgekeurd ? `<button class="sm plain" data-tk="intrek" data-id="${r.id}">Intrekken</button>` : `<button class="sm ok" data-tk="keur" data-id="${r.id}">✅ Goedkeuren</button>`) : ''}
      ${r.status !== 'bezig' ? `<button class="sm plain" data-tk="opnieuw" data-id="${r.id}" title="Zelfde stijl, nieuwe poging">🔁</button><button class="sm plain" data-tk="ander" data-id="${r.id}" title="Andere stijl">🔀 ${r.stijl === 'strip' ? 'prent' : 'strip'}</button>` : ''}
      ${r.status === 'klaar' ? `<button class="sm plain" data-tk="deel" data-id="${r.id}" title="Opslaan of delen">💾</button>` : ''}
      ${r.status !== 'bezig' ? `<button class="sm danger" data-tk="weg" data-id="${r.id}" title="Weggooien">🗑️</button>` : ''}</div>
  </div>`;
}
function fotoBlok(slot, label) {
  const f = R.fotos.get(slot);
  return `<div class="tk-foto">${f ? `<img src="${esc(f.url)}" alt="">` : '<div class="tk-leeg">📷</div>'}
    <div class="row"><button class="sm plain" data-tk="maak" data-slot="${esc(slot)}">📷 Maak</button><button class="sm plain" data-tk="kies" data-slot="${esc(slot)}">🖼️ Kies</button>
    <select data-tk-stijl="${esc(slot)}">${Object.entries(STIJLEN).map(([k, l]) => `<option value="${k}" ${(R.stijl[slot] || 'strip') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${f ? '' : `<p class="note">${esc(label)}</p>`}</div>`;
}
export function tabHTML() {
  for (const r of R.rijen) if (r.status === 'klaar') R.gezien.add(r.id); // de tab is open: alles wat klaar is, is gezien
  const rij = filter => R.rijen.filter(filter), heeft = s => R.fotos.has(s);
  const ps = opts.players().slice().sort((a, b) => (!!b.is_birthday - !!a.is_birthday) || a.name.localeCompare(b.name));
  const kosten = R.rijen.reduce((t, r) => t + (+r.kosten_usd || 0), 0);
  const html = `
  <div class="page"><span class="tab">Reparatieteam en feestplaat</span>
    <p class="note">Teamfoto (iedereen, eventueel met jou erbij). Mecha-Pof tekent op de achtergrond (± 1 minuut); je kunt intussen gewoon verder. Goedgekeurd komt terug in de finale: groep = dia in de terugblik, feestplaat (OPERATIE MECHA-POF · 10 jaar · 13 november 2026) = eindscherm.</p>
    ${fotoBlok('groep', 'Nog geen foto.')}
    <div class="row"><button class="led" data-tk="teken" data-soort="groep" data-slot="groep" ${heeft('groep') ? '' : 'disabled'}>🎨 Teken groep</button>
      <button class="led" data-tk="teken" data-soort="feest" data-slot="groep" ${heeft('groep') ? '' : 'disabled'}>🎉 Teken feestplaat</button></div>
    <div class="tk-lijst">${rij(r => r.soort === 'groep' || r.soort === 'feest').map(r => `<div><small class="tk-soort">${NAAM[r.soort]}</small>${kaart(r)}</div>`).join('') || ''}</div>
  </div>
  <div class="page"><span class="tab">Portretten</span>
    <p class="note">Per meid een foto (alleen zij, van het middel omhoog). Haar talent en onderdeel gaan automatisch mee. Goedgekeurd = haar kaart op het eindscherm.</p>
    ${ps.map(p => { const t = TALENTS[p.talent], part = PARTS[t?.part];
      return `<div class="tk-meid"><h3>${part?.icon || '⭐'} ${esc(p.name)}${p.is_birthday ? ' 🎂' : ''} <small>${esc(t?.label || '')}</small></h3>
        ${fotoBlok(p.id, 'Nog geen foto.')}
        <button class="led sm" data-tk="teken" data-soort="portret" data-slot="${p.id}" data-speler="${p.id}" ${heeft(p.id) ? '' : 'disabled'}>🎨 Teken ${esc(p.name)}</button>
        <div class="tk-lijst">${rij(r => r.player_id === p.id).map(kaart).join('')}</div></div>`; }).join('')}
  </div>
  <div class="page"><span class="tab">Bewaren en versturen</span>
    <p class="note">Alle klare tekeningen staan privé opgeslagen (niet openbaar). De zip heeft per meid een map, plus "Reparatieteam"; elk beeld als PNG (printen) en als kleine JPEG (versturen).${kosten ? ` Tot nu toe ± $${kosten.toFixed(2)}.` : ''}</p>
    <button class="plain wide" data-tk="zip" ${zipBezig ? 'disabled' : ''}>${zipBezig ? '📦 Bezig met inpakken…' : '📦 Alles downloaden (zip)'}</button>
    ${R.geladen ? '' : '<p class="note">Laden…</p>'}
  </div>`;
  setTimeout(tik, 0);
  return html;
}
function injectCss() {
  if (document.getElementById('tk-css')) return;
  const s = document.createElement('style'); s.id = 'tk-css';
  s.textContent = `.tk-foto{display:flex;flex-direction:column;gap:8px}.tk-foto img{max-width:100%;max-height:220px;object-fit:contain;border-radius:10px;border:2px solid var(--line2);align-self:flex-start}
.tk-foto select{min-height:36px;border-radius:10px;background:var(--panel2);color:var(--ink);border:2px solid var(--line2);font:inherit;padding:4px 8px}
.tk-leeg{width:120px;height:80px;border-radius:10px;border:2px dashed var(--line2);display:grid;place-items:center;font-size:1.6rem;opacity:.6}
.tk-lijst{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.tk-soort{display:block;color:var(--gold);font-weight:900;margin-bottom:4px;text-transform:uppercase;letter-spacing:.1em;font-size:.72rem}
.tk-kaart{background:var(--visor);border:2px solid var(--line);border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:6px}
.tk-kaart.ok{border-color:var(--ok);box-shadow:0 0 12px rgba(74,222,128,.25)}.tk-kaart.fout{border-color:#7A2A26}
.tk-kaart img{width:100%;border-radius:8px;cursor:zoom-in;display:block;background:#000}
.tk-wacht{display:grid;place-items:center;min-height:120px;border-radius:8px;background:#0A1424;color:var(--led);font-weight:900;text-align:center}.tk-wacht.bad{color:var(--straw)}
.tk-meta{display:flex;justify-content:space-between;gap:6px;align-items:baseline}.tk-meta small{color:var(--muted)}
.tk-fout{margin:0;white-space:pre-wrap;word-break:break-word;font:700 .78rem/1.35 var(--body);color:var(--straw);background:#1A0E10;border-radius:8px;padding:6px}
.tk-meid{border-top:1px dashed var(--line);padding-top:10px;display:flex;flex-direction:column;gap:8px}.tk-meid h3 small{color:var(--muted);font-weight:800}
.tk-groot{position:fixed;inset:0;z-index:60;background:rgba(5,8,14,.95);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
.tk-groot img{max-width:100vw;max-height:88vh;object-fit:contain}.tk-groot p{color:var(--muted);margin:0}`;
  document.head.appendChild(s);
}

/* ================================================================ kern: goedgekeurde tekeningen voor de finale */
export function kernTekeningen() {
  let gekozen = { groep: null, feest: null, portret: {} }, ids = '', timer = null;
  const cache = new Map(); // id → { url, at }: dezelfde link houden zolang hij geldig is (anders laadt het beeld steeds opnieuw)
  async function laad() {
    if (!sleutel()) return;
    try {
      const rijen = (await lijst()).filter(r => r.goedgekeurd && r.status === 'klaar' && r.url);
      const nu = Date.now(), url = r => { const c = cache.get(r.id); if (c && nu - c.at < 2 * 3600_000) return c.url; cache.set(r.id, { url: r.url, at: nu }); const i = new Image(); i.src = r.url; return r.url; };
      const g = { groep: null, feest: null, portret: {} };
      for (const r of rijen) { if (r.soort === 'portret' && r.player_id) g.portret[r.player_id] = url(r); else if (!g[r.soort]) g[r.soort] = url(r); }
      gekozen = g; ids = rijen.map(r => r.id).sort().join(',');
    } catch (e) { console.warn('[tekening] kern', e.message); }
  }
  return {
    async start() { await laad(); clearInterval(timer); timer = setInterval(laad, 60_000); },
    laad,
    get: () => gekozen,
    sig: () => ids,
  };
}
