// qr-puzzel.js — gedeeld door de printbestanden van de QR-puzzel bij stop 5 (groene kastje):
//   poster-qr-puzzel.html (rol 90 × 120: overplakvel + strook + stukken), puzzelbord-qr.html (A1-bord om op te hangen),
//   qr-stukken-a4.html (de 9 stukken los, één per A4).
// QR versie 1 (21 × 21), alfanumeriek, foutcorrectie Q (getest 12 nov met jsQR, zoals de app op de iPhone):
// alle 9 stukken goed → scant; een hoekstuk weg → scant nooit; per stuk ±3 mm scheef → scant nog;
// een middenstuk verkeerd gedraaid → scant meestal toch. Stuk = 7 × 7 blokjes van 1,5 cm = 10,5 cm; overal dezelfde maat,
// zodat stukken van elk printbestand in elk raster passen.

// Sommen voor de Rekenmeester (rij voor rij, links → rechts). Alle uitkomsten verschillen.
export const SUMS = [['6 × 7', 42], ['50 − 13', 37], ['3 × 9', 27], ['100 : 4', 25], ['19 + 19', 38], ['8 × 8', 64], ['4 × 9', 36], ['90 − 45', 45], ['11 × 5', 55]];
// Volgorde op papier, zodat de volgorde niets verklapt.
export const ORDER = [4, 8, 0, 6, 1, 3, 7, 2, 5];

export const PUZZEL_CSS = `
:root{--m:1.5cm;--p:calc(var(--m) * 7)}
.qbox{position:relative;width:41.2cm;height:42.1cm}
.qbox .box{position:absolute;inset:0 0 .9cm 0;background:#fff;border:.6cm solid #141A26;border-radius:2.4cm;box-shadow:0 .9cm 0 #141A26}
.grid{position:absolute;left:calc((41.2cm - var(--p) * 3) / 2);top:calc((41.2cm - var(--p) * 3) / 2);width:calc(var(--p) * 3);height:calc(var(--p) * 3);display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr)}
.grid i{font-style:normal;border:.06cm dashed #CFC8BC;display:flex;align-items:center;justify-content:center;font-family:'Lilita One',sans-serif;font-size:4.2cm;color:#E6E0D6}
.pair{position:relative;display:flex;width:calc(var(--p) * 2);height:var(--p);outline:.04cm dashed #B9B2A6;outline-offset:.5cm}
.front,.back{width:var(--p);height:var(--p);position:relative}
.front svg{width:100%;height:100%;display:block;shape-rendering:crispEdges}
.back{background:#FFF4DF;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border-left:.05cm dashed #9A5419}
.back .sum{font-family:'Lilita One',sans-serif;font-size:2.7cm;line-height:1;color:#2B1606;white-space:nowrap}
.back .q{font-family:'Chakra Petch',monospace;font-weight:700;font-size:.62cm;letter-spacing:.12em;color:#9A5419;margin-top:.45cm}
.back .up{position:absolute;top:.35cm;left:50%;transform:translateX(-50%);font-size:.55cm;font-weight:800;color:#15A4C8;letter-spacing:.1em}
.back .gear{position:absolute;bottom:.35cm;font-size:.5cm;color:#B9A88E;font-weight:700}
.fold{position:absolute;left:var(--p);top:-1.3cm;transform:translateX(-50%);font-size:.55cm;font-weight:800;color:#9A5419;white-space:nowrap}
.pnr{position:absolute;left:-1.6cm;top:0;font-family:'Chakra Petch',monospace;font-weight:700;font-size:.6cm;color:#B9B2A6;writing-mode:vertical-rl}`;

export function puzzel({ code, ec } = {}) {
  const qs = new URLSearchParams(location.search);
  code = (code || qs.get('code') || 'POF-GARDE-35').toUpperCase();
  ec = (ec || qs.get('ec') || 'Q').toUpperCase();
  if (typeof qrcode !== 'function') throw new Error('QR-bibliotheek niet geladen');
  const q = qrcode(1, ec); q.addData(code, /^[0-9A-Z $%*+\-./:]+$/.test(code) ? 'Alphanumeric' : 'Byte'); q.make();
  const N = q.getModuleCount(); if (N !== 21) throw new Error('QR is geen 21 × 21 maar ' + N);
  if (new Set(SUMS.map(s => s[1])).size !== 9) throw new Error('dubbele uitkomst');
  const dark = (r, c) => q.isDark(r, c);

  // Pijltje "boven" in een licht blokje zo hoog en zo midden mogelijk in elk stuk (licht blauw: scanners zien het als wit).
  const arrowSpot = (r0, c0) => {
    for (let r = 0; r < 7; r++) { const cols = [3, 2, 4, 1, 5, 0, 6].filter(c => !dark(r0 + r, c0 + c)); if (cols.length) return [r, cols[0]]; }
    return null;
  };
  const pieceSvg = (r0, c0) => {
    let p = '';
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (dark(r0 + r, c0 + c)) p += `M${c} ${r}h1v1h-1z`;
    const a = arrowSpot(r0, c0);
    const arrow = a ? `<path d="M${a[1] + .5} ${a[0] + .16}L${a[1] + .8} ${a[0] + .62}H${a[1] + .62}V${a[0] + .84}H${a[1] + .38}V${a[0] + .62}H${a[1] + .2}Z" fill="#8FE6FF"/>` : '';
    return `<svg viewBox="0 0 7 7"><rect width="7" height="7" fill="#fff"/><path d="${p}" fill="#000"/>${arrow}</svg>`;
  };
  const pieces = Array.from({ length: 9 }, (_, i) => ({ i, r0: (i / 3 | 0) * 7, c0: (i % 3) * 7, sum: SUMS[i][0], uitkomst: SUMS[i][1] }));
  const gridHtml = () => `<div class="box"></div><div class="grid">${SUMS.map(s => `<i>${s[1]}</i>`).join('')}</div>`;
  const pairHtml = (k, label) => { const p = pieces[k];
    return `<div class="pair" data-k="${k}">${label ? `<span class="pnr">${label}</span>` : ''}<span class="fold">vouwlijn ↓</span><div class="front">${pieceSvg(p.r0, p.c0)}</div>
      <div class="back"><span class="up">▲ BOVEN</span><div class="sum">${p.sum}</div><div class="q">IN WELK VAK HOOR IK?</div><span class="gear">⚙ Mecha-Pof</span></div></div>`; };
  window.__pieces = pieces;
  return { code, ec, pieces, gridHtml, pairHtml };
}

// Spatel en garde (zelfde tekening als poster-qr.html), viewBox 0 0 100 300.
export const SPATEL = `<svg viewBox="0 0 100 300"><rect x="38" y="6" width="24" height="96" rx="12" fill="#2F3542"/><rect x="42" y="16" width="16" height="70" rx="8" fill="#4A5058"/>
  <circle cx="50" cy="20" r="5" fill="#9AA3AD"/><rect x="44" y="100" width="12" height="70" rx="4" fill="#C9D1D8"/><rect x="40" y="96" width="20" height="10" rx="3" fill="#8E979F"/>
  <path d="M16 170h68l8 118H8z" fill="#D7DEE4" stroke="#4A5058" stroke-width="3"/><path d="M30 186v86M44 186v86M58 186v86M72 186v86" stroke="#9AA6B4" stroke-width="5" stroke-linecap="round"/><path d="M18 176h64" stroke="#fff" stroke-width="3" opacity=".7"/></svg>`;
export const GARDE = `<svg viewBox="0 0 100 300"><rect x="38" y="6" width="24" height="96" rx="12" fill="#2F3542"/><rect x="42" y="16" width="16" height="70" rx="8" fill="#4A5058"/>
  <circle cx="50" cy="20" r="5" fill="#9AA3AD"/><rect x="40" y="96" width="20" height="14" rx="4" fill="#8E979F"/>
  <g fill="none" stroke="#8E9AA8" stroke-width="3.2"><path d="M50 108C6 150 6 270 50 290C94 270 94 150 50 108Z"/><path d="M50 108C22 150 22 270 50 290C78 270 78 150 50 108Z"/><path d="M50 108V290"/><path d="M50 108C36 150 34 270 50 290C66 270 64 150 50 108Z" stroke="#C9D1D8"/></g></svg>`;
