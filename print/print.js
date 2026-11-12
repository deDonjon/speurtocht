// print.js — gedeeld voor de printbestanden in print/ (chat 7, claude/ONBOARDING-FINALE.md §D).
// Posters staan op ware grootte (CSS @page in cm); op het scherm wordt de poster verkleind getoond. Afdrukken = ware grootte.
// De PDF's maakt print/make-pdf.mjs (headless Chrome).

/* ---------- pictogrammen per onderdeel (vector, geen emoji: die printen niet overal) — viewBox 0 0 100 100 */
const STEEL = '#C9D1D8', DARK = '#2F3542', GOLD = '#F2BE62', GOLD2 = '#C9792C', LED = '#7FE8FF', RED = '#E0352B', FLAME = '#F59E2E';
export const ICONS = {
  lijf: `<g><path d="M14 66v8a36 9 0 0 0 72 0v-8z" fill="${GOLD2}"/><ellipse cx="50" cy="66" rx="36" ry="9" fill="${GOLD}"/><path d="M18 52v8a32 8 0 0 0 64 0v-8z" fill="${GOLD2}"/><ellipse cx="50" cy="52" rx="32" ry="8" fill="${GOLD}"/><path d="M22 38v8a28 7 0 0 0 56 0v-8z" fill="${GOLD2}"/><ellipse cx="50" cy="38" rx="28" ry="7" fill="${GOLD}"/><g fill="#9AA3AD"><circle cx="30" cy="72" r="2"/><circle cx="50" cy="74" r="2"/><circle cx="70" cy="72" r="2"/><circle cx="34" cy="58" r="2"/><circle cx="66" cy="58" r="2"/></g><rect x="40" y="20" width="20" height="12" rx="3" fill="${DARK}"/><path d="M44 27h12" stroke="${FLAME}" stroke-width="3" stroke-linecap="round"/></g>`,
  ogen: `<g><circle cx="50" cy="50" r="38" fill="${DARK}" stroke="#9AA3AD" stroke-width="3"/><rect x="18" y="38" width="64" height="26" rx="10" fill="#12223A" stroke="${LED}" stroke-width="3"/><ellipse cx="36" cy="51" rx="9" ry="6" fill="${LED}"/><ellipse cx="64" cy="51" rx="9" ry="6" fill="${LED}"/><path d="M31 50h10M59 50h10" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><path d="M50 12V4" stroke="#9AA3AD" stroke-width="3"/><circle cx="50" cy="4" r="3.5" fill="${RED}"/></g>`,
  neus: `<g><circle cx="50" cy="56" r="30" fill="${RED}" stroke="#9AA3AD" stroke-width="4"/><g fill="#FFE98A"><ellipse cx="40" cy="50" rx="2.4" ry="3.4"/><ellipse cx="56" cy="46" rx="2.4" ry="3.4"/><ellipse cx="48" cy="62" rx="2.4" ry="3.4"/><ellipse cx="62" cy="62" rx="2.4" ry="3.4"/><ellipse cx="36" cy="66" rx="2.4" ry="3.4"/></g><path d="M38 28c4-10 20-10 24 0c-6-3-18-3-24 0z" fill="#4ADE80"/><ellipse cx="42" cy="44" rx="7" ry="4" fill="#fff" opacity=".35"/></g>`,
  mond: `<g><rect x="12" y="34" width="76" height="32" rx="16" fill="#0E1B2E" stroke="#9AA3AD" stroke-width="4"/><path d="M26 42v16M36 42v16M46 42v16M56 42v16M66 42v16M76 42v16" stroke="${LED}" stroke-width="4" stroke-linecap="round"/><path d="M90 30q8 20 0 40M96 22q12 28 0 56" stroke="${LED}" stroke-width="3" fill="none" stroke-linecap="round"/></g>`,
  armen: `<g><rect x="16" y="10" width="10" height="44" rx="4" fill="${STEEL}"/><path d="M6 52h30l4 34H2z" fill="#D7DEE4" stroke="#4A5058" stroke-width="2"/><path d="M12 58v22M21 58v22M30 58v22" stroke="#9AA6B4" stroke-width="2"/><rect x="69" y="10" width="10" height="34" rx="4" fill="${STEEL}"/><g fill="none" stroke="#9AA6B4" stroke-width="3"><ellipse cx="74" cy="66" rx="16" ry="24"/><ellipse cx="74" cy="66" rx="8" ry="24"/><path d="M74 42v48"/></g></g>`,
  benen: `<g><rect x="26" y="8" width="14" height="40" rx="4" fill="${STEEL}"/><rect x="60" y="8" width="14" height="40" rx="4" fill="${STEEL}"/><rect x="21" y="30" width="24" height="18" rx="5" fill="${DARK}"/><rect x="55" y="30" width="24" height="18" rx="5" fill="${DARK}"/><path d="M6 70c0-10 12-16 27-16s27 6 27 16v6H6z" fill="${DARK}"/><path d="M40 70c0-10 12-16 27-16s27 6 27 16v6H40z" fill="${DARK}" opacity=".85"/><path d="M6 64L-4 60M94 64l10-4" stroke="#9AA3AD" stroke-width="5" stroke-linecap="round"/></g>`,
  hoed: `<g><g transform="rotate(-14 50 46)"><rect x="34" y="14" width="32" height="58" rx="9" fill="#A24C14"/><rect x="38" y="30" width="24" height="22" rx="3" fill="#FFF4DF"/><rect x="42" y="6" width="16" height="10" rx="3" fill="${RED}"/></g><path d="M42 74c-6 12 0 22 8 26c8-4 14-14 8-26c-3 7-13 7-16 0z" fill="${FLAME}"/><path d="M46 78c-2 8 1 14 4 16c3-2 6-8 4-16z" fill="#FFF1A6"/><rect x="66" y="58" width="26" height="18" rx="4" fill="#FFE98A" stroke="#D9B53E" stroke-width="2"/><circle cx="79" cy="67" r="4" fill="none" stroke="#B9902A" stroke-width="2"/></g>`,
};
export const icon = (part, cls = '') => `<svg class="${cls}" viewBox="-6 -2 112 106" aria-hidden="true">${ICONS[part] || ''}</svg>`;

export const TALENT_INFO = { // zelfde koppeling als js/state.js; vermogen uit claude/STORY.md
  speurneus:        { part: 'ogen',  label: 'Speurneus',        deel: 'de LED-ogen',               vermogen: 'Met zijn ogen kan Mecha-Pof weer zien en zegt hij hoe ver het nog is.', koppel: 'Kaartlezer' },
  kaartlezer:       { part: 'neus',  label: 'Kaartlezer',       deel: 'de aardbei-knop',           vermogen: 'Met zijn neus ruikt Mecha-Pof weer hints. Hints ruiken naar warme stroop.', koppel: 'Speurneus' },
  codekraker:       { part: 'mond',  label: 'Codekraker',       deel: 'het luidsprekerrooster',    vermogen: 'Met zijn mond kan Mecha-Pof alarm slaan. En brutaal doen.', koppel: 'Rekenmeester' },
  rekenmeester:     { part: 'armen', label: 'Rekenmeester',     deel: 'de spatel en de garde',     vermogen: 'Met zijn armen kan Mecha-Pof vastpakken, ook als de Kruimelaar iets pikt.', koppel: 'Codekraker' },
  tijdbewaker:      { part: 'benen', label: 'Tijdbewaker',      deel: 'de zuigerbenen',            vermogen: 'Met zijn benen loopt Mecha-Pof mee op de kaart. Daarna tikt de klok!', koppel: 'Sleutelbewaarder' },
  sleutelbewaarder: { part: 'hoed',  label: 'Sleutelbewaarder', deel: 'de boterknop en de jetpack', vermogen: 'Jij drukt op de boterknop: dan vliegt hij. Alleen jij dient puzzels in, en je hebt één verjaardagswens.', koppel: 'Tijdbewaker' },
};
export const PART_COLOR = { lijf: '#F2BE62', ogen: '#15A4C8', neus: '#E0352B', mond: '#1F8A4C', armen: '#6B7A90', benen: '#8B5CF6', hoed: '#F59E2E' };

/* ---------- Mecha-Pof als vector (js/monster.js monsterImage), zonder achtergrondvlak */
export async function monsterSvg(parts, { keepBg = false } = {}) {
  const m = await import('../js/monster.js?v=26');
  await m.ready;
  const url = m.monsterImage(parts);
  let svg = decodeURIComponent(url.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
  const el = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  if (!keepBg) { el.querySelector('rect[width="400"]')?.setAttribute('fill', 'none'); [...el.querySelectorAll('path')].find(p => p.getAttribute('d')?.startsWith('M-200'))?.remove(); } // geen vlak en geen raster
  el.removeAttribute('width'); el.removeAttribute('height');
  if (!el.getAttribute('viewBox')) el.setAttribute('viewBox', '-150 -150 300 300');
  el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return el.outerHTML;
}

/* ---------- QR als vector (print/vendor/qrcode.js) */
export function qrSvg(text) {
  if (typeof qrcode !== 'function') return '<p>QR-bibliotheek niet geladen</p>';
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

/* ---------- schermweergave: poster verkleind in beeld; afdrukken = ware grootte */
export function preview(sheet, { title, size, hint } = {}) {
  const bar = document.createElement('div'); bar.className = 'pbar';
  bar.innerHTML = `<b>${title}</b><span>${size}${hint ? ' · ' + hint : ''}</span><button onclick="print()">🖨️ Afdrukken (ware grootte)</button>`;
  document.body.prepend(bar);
  const fit = () => {
    const w = sheet.offsetWidth, h = sheet.offsetHeight, k = Math.min((innerWidth - 32) / w, (innerHeight - 90) / h, 1);
    sheet.style.transform = `scale(${k})`; sheet.style.transformOrigin = 'top left';
    sheet.parentElement.style.width = w * k + 'px'; sheet.parentElement.style.height = h * k + 'px';
  };
  addEventListener('resize', fit); fit();
  addEventListener('beforeprint', () => { sheet.style.transform = 'none'; sheet.parentElement.style.width = sheet.parentElement.style.height = ''; });
  addEventListener('afterprint', fit);
  document.fonts?.ready.then(fit);
  return fit;
}
export const BASE_CSS = `
*{box-sizing:border-box}html,body{margin:0}
body{background:#2A3142;font-family:'Nunito',system-ui,sans-serif;font-weight:800;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pbar{position:sticky;top:0;z-index:5;display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding:10px 16px;background:#141A26;color:#EAF2FF;font-size:14px}
.pbar span{color:#93A0B8;flex:1}.pbar button{font:inherit;font-weight:900;border:0;border-radius:10px;padding:8px 14px;background:#F2BE62;color:#3A1C06;cursor:pointer}
.wrap{margin:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.5)}
@media print{body{background:none}.pbar{display:none}.wrap{margin:0;box-shadow:none;overflow:visible}}`;
