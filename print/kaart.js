// kaart.js — de getekende spelkaart (wiebelige SVG) voor print/spelkaart.html en de achterkant van print/diploma.html.
// Coördinaten in mm; de kaart beslaat het vlak OX..OX+MAPW × OY..OY+MAPH. kaart(gids, souv) geeft de inhoud als SVG-tekst.
import { ROUTE, BRUGGETJE } from '../js/board-data.js';
import { ICONS } from './print.js';

/* ---------- gegevens */
export const STOPS = [ // zelfde plekken als in Supabase (stop.seq)
  { n: 1, lat: 51.61734,  lng: 5.560498, naam: 'De palenrij',        deel: 'lijf',  tijd: '15:36', antw: '138 (23 palen × 6)' },
  { n: 2, lat: 51.614426, lng: 5.560948, naam: 'Bord met de sokjes', deel: 'ogen',  tijd: '15:49', antw: 'slot 6 · 10 · 12' },
  { n: 3, lat: 51.61309,  lng: 5.56152,  naam: 'Het veldje',         deel: 'neus',  tijd: '16:01', antw: 'driehoek, 3 telefoons' },
  { n: 4, lat: 51.613259, lng: 5.564092, naam: 'De Stadsbrink',      deel: 'mond',  tijd: '16:14', antw: 'walkie: “stadsbrink”' },
  { n: 5, lat: 51.614586, lng: 5.56587,  naam: 'Het groene kastje',  deel: 'armen', tijd: '16:25', antw: 'QR · POF-GARDE-35' },
  { n: 6, lat: 51.616365, lng: 5.563619, naam: 'Huis met de steen',  deel: 'benen', tijd: '16:35', antw: 'lichtcode, 6 kleuren' },
  { n: 7, lat: 51.616194, lng: 5.561503, naam: 'Thuis op het erf',   deel: 'hoed',  tijd: '16:46', antw: 'BOTER, 3× tegelijk' },
];
export const DEEL = { lijf: 'Pantser', ogen: 'LED-ogen', neus: 'Aardbei-knop', mond: 'Luidspreker', armen: 'Spatel + garde', benen: 'Zuigerbenen', hoed: 'Boterknop' };
const EXTRA = { tank: [51.61680, 5.56237], bomen: [51.61577, 5.56512], staal: [51.61599, 5.56485], bank: [51.61381, 5.56441], pad: [51.61343, 5.56168], leeuw: [51.61693, 5.56199] };

/* ---------- projectie: meters → mm op het blad (noorden boven) */
const LAT0 = 51.61805, LNG0 = 5.55965, MPLAT = 111320, MPLNG = 111320 * Math.cos(51.614 * Math.PI / 180);
export const SC = 0.283, OX = 11, OY = 40; // mm per meter; linkerbovenhoek van de kaart
const P = (lat, lng) => [OX + (lng - LNG0) * MPLNG * SC, OY + (LAT0 - lat) * MPLAT * SC];
export const MAPW = 142, MAPH = 228;

/* ---------- handgetekend: vaste "willekeur" zodat elke afdruk hetzelfde is */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let R = rng(13);
export const seed = n => { R = rng(n); };
const j = a => (R() - .5) * 2 * a;
export const f = n => n.toFixed(2);
// wiebelige lijn door een rij punten: opknippen in stukjes van ±step mm, elk punt een beetje verschuiven, vloeiend verbinden
export function wobble(pts, { amp = .45, step = 3.2, close = false } = {}) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], d = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.round(d / step));
    for (let k = 0; k < n; k++) out.push([x1 + (x2 - x1) * k / n + (i || k ? j(amp) : 0), y1 + (y2 - y1) * k / n + (i || k ? j(amp) : 0)]);
  }
  out.push(pts.at(-1));
  let d = `M${f(out[0][0])} ${f(out[0][1])}`;
  for (let i = 1; i < out.length - 1; i++) { const mx = (out[i][0] + out[i + 1][0]) / 2, my = (out[i][1] + out[i + 1][1]) / 2; d += `Q${f(out[i][0])} ${f(out[i][1])} ${f(mx)} ${f(my)}`; }
  d += `L${f(out.at(-1)[0])} ${f(out.at(-1)[1])}`; return d + (close ? 'Z' : '');
}
export const circ = (x, y, r, amp = .25) => { const pts = []; for (let a = 0; a <= 12; a++) pts.push([x + Math.cos(a / 12 * 2 * Math.PI) * (r + j(amp)), y + Math.sin(a / 12 * 2 * Math.PI) * (r + j(amp))]); pts[12] = pts[0]; return wobble(pts, { amp: 0, step: 99 }) + 'Z'; };
export const INK = '#3B2A1A';
export const pen = (w = .45, c = INK) => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

/* ---------- krabbels */
const tree = (x, y, s = 1) => `<g><path d="M${f(x)} ${f(y)}v${f(-2.2 * s)}" ${pen(.5)}/><path d="${circ(x - 1.1 * s, y - 3.2 * s, 1.5 * s)}" fill="#9CC27A" stroke="${INK}" stroke-width=".35"/><path d="${circ(x + 1.1 * s, y - 3.3 * s, 1.5 * s)}" fill="#9CC27A" stroke="${INK}" stroke-width=".35"/><path d="${circ(x, y - 4.6 * s, 1.7 * s)}" fill="#B3D48C" stroke="${INK}" stroke-width=".35"/></g>`;
const house = (x, y, s = 1, c = '#E8B98A', roof = '#C2573A') => `<g><path d="${wobble([[x - 3 * s, y], [x - 3 * s, y - 4 * s], [x + 3 * s, y - 4 * s], [x + 3 * s, y], [x - 3 * s, y]], { amp: .15, step: 9 })}" fill="${c}" stroke="${INK}" stroke-width=".4"/><path d="${wobble([[x - 3.8 * s, y - 4 * s], [x, y - 7.4 * s], [x + 3.8 * s, y - 4 * s], [x - 3.8 * s, y - 4 * s]], { amp: .15, step: 9 })}" fill="${roof}" stroke="${INK}" stroke-width=".4"/><rect x="${f(x - .8 * s)}" y="${f(y - 2.2 * s)}" width="${f(1.6 * s)}" height="${f(2.2 * s)}" fill="#7A4A2A" stroke="${INK}" stroke-width=".25"/></g>`;
const grass = (x, y) => `<path d="M${f(x)} ${f(y)}l-.8 -1.8M${f(x + .3)} ${f(y)}l.1 -2.3M${f(x + .6)} ${f(y)}l.9 -1.7" ${pen(.3, '#5E8A3A')}/>`;
const posts = (x, y) => { let s = ''; for (let i = 0; i < 9; i++) { const h = 2.2 + ((i * 7) % 5) * .55; s += `<rect x="${f(x + i * 1.25)}" y="${f(y - h)}" width=".8" height="${f(h)}" fill="#B98B5A" stroke="${INK}" stroke-width=".25"/>`; } return s; };
const socks = (x, y) => `<g><path d="M${f(x)} ${f(y)}v-7" ${pen(.5)}/><rect x="${f(x - 4)}" y="${f(y - 11)}" width="8" height="4.4" rx=".6" fill="#FFF7E2" stroke="${INK}" stroke-width=".4"/><path d="M${f(x - 3.4)} ${f(y - 6.2)}h6.8" ${pen(.25)}/>${[0, 1, 2, 3, 4, 5].map(i => `<path d="M${f(x - 3.2 + i * 1.25)} ${f(y - 6.2)}v1.5h.8" ${pen(.45, ['#E0352B', '#15A4C8', '#F59E2E'][i % 3])}/>`).join('')}</g>`;
const bridge = (x, y) => `<g><path d="M${f(x - 4)} ${f(y)}q4 -4.4 8 0" ${pen(.9, '#8A5A2B')}/><path d="M${f(x - 4)} ${f(y - 1.6)}q4 -4.4 8 0" ${pen(.35)}/><path d="M${f(x - 2.4)} ${f(y - 2.9)}v1.6M${f(x)} ${f(y - 3.8)}v1.7M${f(x + 2.4)} ${f(y - 2.9)}v1.6" ${pen(.3)}/></g>`;
const wallsign = (x, y) => `<g><rect x="${f(x - 5)}" y="${f(y - 5)}" width="10" height="5" fill="#C98A68" stroke="${INK}" stroke-width=".4"/><path d="M${f(x - 5)} ${f(y - 3.3)}h10M${f(x - 5)} ${f(y - 1.6)}h10M${f(x - 2.5)} ${f(y - 5)}v1.7M${f(x + 2.5)} ${f(y - 5)}v1.7M${f(x)} ${f(y - 3.3)}v1.7M${f(x - 3.6)} ${f(y - 1.6)}v1.6M${f(x + 3.6)} ${f(y - 1.6)}v1.6" ${pen(.2, '#7A4A2A')}/><path d="M${f(x - 3)} ${f(y - 6)}q3 -3.4 6 0z" fill="#3A3A3A" stroke="${INK}" stroke-width=".3"/></g>`;
const kastje = (x, y) => `<g><rect x="${f(x - 2.2)}" y="${f(y - 4.6)}" width="4.4" height="4.6" rx=".4" fill="#4E9A5A" stroke="${INK}" stroke-width=".4"/><path d="M${f(x)} ${f(y - 4.6)}v4.6" ${pen(.25)}/><circle cx="${f(x + .7)}" cy="${f(y - 2.3)}" r=".3" fill="${INK}"/></g>`;
const pump = (x, y) => `<g><rect x="${f(x - 1.8)}" y="${f(y - 5.4)}" width="3.6" height="5.4" rx=".5" fill="#E0352B" stroke="${INK}" stroke-width=".4"/><rect x="${f(x - 1.1)}" y="${f(y - 4.6)}" width="2.2" height="1.5" fill="#FFF7E2" stroke="${INK}" stroke-width=".25"/><path d="M${f(x + 1.8)} ${f(y - 4)}q2.2 .4 1.6 3.2" ${pen(.4)}/></g>`;
const bench = (x, y) => `<path d="M${f(x - 2.4)} ${f(y - 1.4)}h4.8M${f(x - 2.4)} ${f(y - 2.6)}h4.8M${f(x - 1.8)} ${f(y)}v-2.6M${f(x + 1.8)} ${f(y)}v-2.6" ${pen(.45, '#7A4A2A')}/>`;
const crumb = (x, y) => `<g><path d="${circ(x, y, 2.3, .35)}" fill="#D9A45B" stroke="${INK}" stroke-width=".4"/><circle cx="${f(x - .8)}" cy="${f(y - .5)}" r=".4" fill="${INK}"/><circle cx="${f(x + .8)}" cy="${f(y - .5)}" r=".4" fill="${INK}"/><path d="M${f(x - .9)} ${f(y + .8)}q.9 .8 1.8 0" ${pen(.3)}/><path d="M${f(x - 1.6)} ${f(y + 2.1)}l-.9 1.5M${f(x + 1.6)} ${f(y + 2.1)}l.9 1.5M${f(x)} ${f(y - 2.3)}v-1.6" ${pen(.35)}/><circle cx="${f(x)}" cy="${f(y - 4.1)}" r=".45" fill="#E0352B"/></g>`;
const kern = (x, y) => `<g>${house(x, y, 1.35, '#F2D9A6', '#2F3542')}<path d="M${f(x + 2.6)} ${f(y - 8.4)}v-5" ${pen(.45)}/><path d="M${f(x + 1)} ${f(y - 12.2)}q1.6 -2.2 3.2 0M${f(x - .2)} ${f(y - 13.4)}q2.8 -3.8 5.6 0" ${pen(.35, '#15A4C8')}/><circle cx="${f(x + 2.6)}" cy="${f(y - 13.6)}" r=".55" fill="#E0352B"/></g>`;
export const signal = (x, y) => `<g>${[3.4, 5.6, 7.8].map((r, i) => `<path d="${circ(x, y, r, .3)}" fill="${i ? 'none' : 'rgba(21,164,200,.18)'}" stroke="#15A4C8" stroke-width="${.55 - i * .12}" stroke-dasharray="${i ? '1.6 1.3' : ''}"/>`).join('')}<text x="${f(x)}" y="${f(y + 1.7)}" text-anchor="middle" font-family="Lilita One" font-size="4.8" fill="#0E6F8A">?</text></g>`;
export const badge = (x, y, n) => `<g><circle cx="${f(x)}" cy="${f(y)}" r="3.9" fill="#F2BE62" stroke="${INK}" stroke-width=".6"/><text x="${f(x)}" y="${f(y + 1.75)}" text-anchor="middle" font-family="Lilita One" font-size="5" fill="${INK}">${n}</text></g>`;
export const label = (x, y, t, { size = 3, anchor = 'middle', fill = INK, font = 'Nunito', weight = 900, rot = 0, bg = true } = {}) => `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" font-family="${font}" font-weight="${weight}" font-size="${size}" fill="${fill}" ${bg ? 'stroke="#F6E7C4" stroke-width="1.1" paint-order="stroke"' : ''} ${rot ? `transform="rotate(${rot} ${f(x)} ${f(y)})"` : ''}>${t}</text>`;
export const ico = (part, x, y, s) => `<svg x="${f(x)}" y="${f(y)}" width="${s}" height="${s}" viewBox="-6 -2 112 106">${ICONS[part]}</svg>`;

/* ---------- de kaart (voor beide bladen dezelfde tekening; `gids` = met nummers en antwoorden) */
export function kaart(gids, souv = false) { // souv = aandenken (achterkant diploma): route en nummers, zonder tijden, antwoorden of regie-labels
  if (souv) gids = true;
  R = rng(13);
  const line = ROUTE.map(([, lat, lng]) => P(lat, lng));
  const road = wobble(line, { amp: .5, step: 3 });
  // zijpaadjes en straten voor de sfeer (los getekend, geen echte kaart)
  const side = [
    [P(51.6176, 5.5612), P(51.6181, 5.5628), P(51.61795, 5.5660)],
    [P(51.6143, 5.56095), P(51.6146, 5.5599)],
    [P(51.61125, 5.56300), P(51.6108, 5.5625)],
    [P(51.61325, 5.56409), P(51.61305, 5.5662)],
    [P(51.61458, 5.56587), P(51.6149, 5.5668)],
    [P(51.61636, 5.56362), P(51.6170, 5.5651), P(51.6179, 5.5660)],
    [P(51.61472, 5.56080), P(51.6153, 5.5623), P(51.61605, 5.56150)],
  ].map(s => wobble(s, { amp: .5, step: 3 }));
  // slootje onder het bruggetje
  const [bx, by] = P(BRUGGETJE.lat, BRUGGETJE.lng);
  const water = wobble([[OX + 1, by - 9], [bx - 9, by - 4], [bx, by - .5], [bx + 7, by + 5], [bx + 3, by + 16], [bx - 6, by + 30], [OX + 4, by + 46]], { amp: .9, step: 4 });
  // bomen: verspreid, niet op de weg; extra bij de hoge bomen
  const near = (x, y, d) => line.some(([lx, ly]) => Math.hypot(lx - x, ly - y) < d) || STOPS.some(s => { const [sx, sy] = P(s.lat, s.lng); return Math.hypot(sx - x, sy - y) < 12; });
  let trees = '';
  for (let i = 0, n = 0; i < 400 && n < 46; i++) { const x = OX + 5 + R() * (MAPW - 10), y = OY + 9 + R() * (MAPH - 14); if (near(x, y, 6.5) || Math.hypot(x - bx, y - by) < 9) continue; if (x > OX + MAPW - 42 && y > OY + MAPH - 46) continue; trees += tree(x, y, .8 + R() * .5); n++; }
  const [hx, hy] = P(...EXTRA.bomen); for (const [dx, dy, s] of [[7, 2, 1.6], [11, -3, 1.9], [8, -8, 1.5], [13, 4, 1.7]]) trees += tree(hx + dx, hy + dy, s);
  let tufts = ''; const [vx, vy] = P(STOPS[2].lat, STOPS[2].lng); for (let i = 0; i < 16; i++) tufts += grass(vx - 12 + R() * 9, vy - 5 + R() * 11);
  // huisjes langs de route
  const hs = [[51.6170, 5.5609, '#E8B98A'], [51.6166, 5.5630, '#E3C79A'], [51.6159, 5.5639, '#D9B38C'], [51.6150, 5.5647, '#E8B98A'], [51.6129, 5.5651, '#E3C79A'], [51.6120, 5.5628, '#D9B38C'], [51.6151, 5.5601, '#E3C79A'], [51.6174, 5.5632, '#E8B98A'], [51.6138, 5.5632, '#D9B38C']]
    .map(([la, ln, c]) => { const [x, y] = P(la, ln); return house(x, y, .85, c); }).join('');
  const S = n => P(STOPS[n - 1].lat, STOPS[n - 1].lng);
  const [s1x, s1y] = S(1), [s2x, s2y] = S(2), [s4x, s4y] = S(4), [s5x, s5y] = S(5), [s6x, s6y] = S(6), [s7x, s7y] = S(7);
  const [tx, ty] = P(...EXTRA.tank), [stx, sty] = P(...EXTRA.staal), [bkx, bky] = P(...EXTRA.bank), [px, py] = P(...EXTRA.pad);
  const marks = STOPS.map(s => { const [x, y] = P(s.lat, s.lng); return s.n === 7 ? '' : gids ? badge(x, y, s.n) : signal(x, y); }).join('');
  const LBL = { 1: [6, -4.5, 'start'], 2: [5.5, 6.4, 'start'], 3: [5.5, 6.4, 'start'], 4: [6, 6.6, 'start'], 5: [-5.5, 6.4, 'end'], 6: [5.5, 7, 'start'] };
  const names = gids ? STOPS.map(s => { const [x, y] = P(s.lat, s.lng); const [dx, dy, anchor] = LBL[s.n] || []; return s.n === 7 ? badge(x - 9.5, y + 1, 7) : label(x + dx, y + dy, souv ? s.naam : `${s.naam} · ${s.tijd}`, { size: souv ? 3.3 : 2.9, anchor }); }).join('')
    + (souv ? '' : label(tx, ty - 7.5, '⚡ Kortsluiting', { size: 2.6, fill: '#B3261E' }) + label(px + 4, py + 1, '🍪 Kruimelaar', { size: 2.6, anchor: 'start', fill: '#B3261E' }) + label(bkx + 4, bky + 1, 'B2 bankje', { size: 2.5, anchor: 'start', fill: '#0E6F8A' }) + label(stx + 9, sty - 9.5, 'B3 stalen huis', { size: 2.5, fill: '#0E6F8A' }) + label(s6x + 5, s6y - 5.2, 'B1 steen 1935', { size: 2.5, anchor: 'start', fill: '#0E6F8A' }))
    : label(px + 15, py + 18, 'Hier zwerft de Kruimelaar…', { size: 2.7, font: 'Nunito', fill: '#7A4A2A', rot: -8 }) + label(OX + 21, OY + MAPH - 9, 'onbekend gebied', { size: 2.7, fill: '#7A4A2A', rot: 6 });
  const arrows = !gids ? '' : line.map((p, i) => { if (i % 4 !== 2 || i > line.length - 3) return ''; const [x1, y1] = p, [x2, y2] = line[i + 1], a = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI, mx = (x1 + x2) / 2, my = (y1 + y2) / 2; return `<path d="M-1.5 -1.3L1.5 0L-1.5 1.3z" fill="#B3261E" transform="translate(${f(mx)} ${f(my)}) rotate(${f(a)})"/>`; }).join('');
  return `
    <path d="${water}" ${pen(2.6, '#8CC8DC')}/><path d="${water}" ${pen(.35, '#4C93AB')} stroke-dasharray="3 2.2"/>
    ${side.map(d => `<path d="${d}" ${pen(3.4, '#8A6A45')}/><path d="${d}" ${pen(2.5, '#EAD9B0')}/>`).join('')}
    <path d="${road}" ${pen(5.4, '#6B4A2B')}/><path d="${road}" ${pen(4.2, '#FBF1D8')}/>${gids ? `<path d="${road}" ${pen(.7, '#B3261E')} stroke-dasharray="2.4 1.8"/>` : `<path d="${road}" ${pen(.35, '#B79B6C')} stroke-dasharray="1.8 2.2"/>`}
    ${arrows}${tufts}${trees}${hs}
    ${posts(s1x - 13, s1y + 1)}${socks(s2x - 8, s2y + 3)}${bridge(bx - 3, by + 1.5)}${wallsign(s4x + 8.5, s4y - 1)}${kastje(s5x + 6.5, s5y + 1)}${house(s6x + 1, s6y - 5.5, 1.15, '#F4EBD8', '#8A5A3A')}<circle cx="${f(s6x + 1)}" cy="${f(s6y - 9.2)}" r=".6" fill="#fff" stroke="${INK}" stroke-width=".2"/>
    ${house(stx + 9, sty - 3, 1.05, '#B9C4CF', '#6B7A90')}${bench(bkx - 5, bky + 1)}${pump(tx, ty - 1.2)}${crumb(px + 14, py + 9)}
    ${kern(s7x - 1, s7y + 3.5)}${label(s7x - 1, s7y + 8.2, souv ? '7 · Thuis: taart!' : gids ? `7 · Thuis · ${STOPS[6].tijd}` : 'DE KERN (thuis)', { size: 3.1, font: 'Lilita One', weight: 400 })}
    ${marks}${names}
    ${gids ? '' : label(...((p => [p[0] - 9, p[1] - 6])(P(51.6170444, 5.5617725))), 'De Haag', { size: 2.8, fill: '#7A4A2A', rot: -4 })}`;
}

