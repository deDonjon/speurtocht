// monster.js — het levende Pannenkoekenmonster (Zdog, pseudo-3D op een canvas).
//
// Contract (zie index.html, blok "monster"):
//   createMonster() → { el, setParts(parts, { land }), setMood(mood), setSize('sm'|'md'|'lg'),
//                       say(text, { ms, voice }) → Promise, react('start'|'goed'|'fout'|'hint'|'tik'), destroy() }
//   monsterImage(parts?) → data-URL (stilstaand, voor de schuifpuzzel)
// Extra (niet nodig voor de app): mon.line(situatie) zegt een zin uit monster-lines.js; `ready` is een Promise voor Zdog.
//
// - Eén exemplaar dat de app tussen schermen verhuist; animeert alleen als het in beeld is.
// - prefers-reduced-motion: geen ademen, wiebelen of vallen; alleen wat het kind zelf doet beweegt.
// - Praten: ballon met tikmachinetekst, stem via Web Speech (nl-NL, laag) met een brom eronder.
//   Hardop alleen op de telefoon met het laagste device-id dat online is; de rest toont alleen de ballon.
// - Luistert zelf naar pkm.router / pkm.state (als die er zijn): aankomst, hints, foute antwoorden, stilte.
// ?v=… tegen oude bestanden in de cache (GitHub Pages/Safari). Ophogen bij een wijziging, ook in index.html en test/monster.html.
import { audio } from './audio.js?v=2';
import { LINES, NAAM_JARIGE } from './monster-lines.js?v=2';

const ZDOG_SRC = [
  'https://cdn.jsdelivr.net/npm/zdog@1.1.3/dist/zdog.dist.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/zdog/1.1.3/zdog.dist.min.js',
];
export const PART_KEYS = ['lijf', 'ogen', 'neus', 'mond', 'armen', 'benen', 'hoed'];
export const MOODS = ['slaap', 'wakker', 'nieuwsgierig', 'brutaal', 'compleet'];
const VIEW = 250;            // modelruimte: het monster past in een vak van 250 × 250
const SILENCE_MS = 90_000;
const BG = '#FFF4DF';

// ---------------------------------------------------------------- Zdog laden (van de CDN, met reserve)
let Z = globalThis.Zdog || null;
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    const to = setTimeout(() => { s.remove(); rej(new Error('timeout')); }, 8000);
    s.onload = () => { clearTimeout(to); globalThis.Zdog ? res(globalThis.Zdog) : rej(new Error('geen Zdog')); };
    s.onerror = () => { clearTimeout(to); s.remove(); rej(new Error('laden mislukt')); };
    document.head.appendChild(s);
  });
}
export const ready = Z ? Promise.resolve(Z) : (async () => {
  for (const src of ZDOG_SRC) { try { Z = await loadScript(src); return Z; } catch {} }
  console.warn('[monster] Zdog niet geladen; plat reservemonster');
  return null;
})();

const reduceMQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const RM = () => reduceMQ.matches;
const now = () => performance.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerpK = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
const ease = u => u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.random() * arr.length | 0];

// ---------------------------------------------------------------- kleuren en spook
function hexMix(hex, to, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const a = p(hex), b = p(to);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const ghostOf = c => hexMix(c, '#EFE2C8', 0.8);
function walk(node, fn) { fn(node); for (const c of node.children || []) walk(c, fn); }
function setGhost(anchor, on) {
  if (!anchor._orig) {
    anchor._orig = new Map();
    walk(anchor, n => { if (typeof n.color === 'string') anchor._orig.set(n, { color: n.color, backface: n.backface }); });
  }
  for (const [n, o] of anchor._orig) {
    n.color = on ? ghostOf(o.color) : o.color;
    if (typeof o.backface === 'string') n.backface = on ? ghostOf(o.backface) : o.backface;
  }
}

// ---------------------------------------------------------------- het model
function buildModel(illo) {
  const TAU = Z.TAU;
  const m = { parts: {}, base: {} };
  m.world = new Z.Anchor({ addTo: illo, translate: { y: -10 } });
  m.shadow = new Z.Ellipse({ addTo: m.world, diameter: 150, rotate: { x: TAU / 4 }, translate: { y: 104 }, stroke: false, fill: true, color: 'rgba(120,80,30,0.16)' });
  m.yaw = new Z.Anchor({ addTo: m.world, translate: { y: 100 } });      // draaipunt op de grond
  m.squash = new Z.Anchor({ addTo: m.yaw });
  const body = new Z.Anchor({ addTo: m.squash, translate: { y: -100 } });
  const part = (key, t, to = body) => { const a = new Z.Anchor({ addTo: to, translate: t }); m.parts[key] = a; m.base[key] = { x: 0, y: 0, z: 0, ...t }; return a; };
  // Benen en stapel in één Group: die tekent in vaste volgorde (benen eerst, dan de pannenkoeken van onder naar boven),
  // zodat de stapel de bovenkant van de benen altijd afdekt, uit elke hoek.
  const stackG = new Z.Group({ addTo: body });

  // --- bananenbenen
  const benen = part('benen', { y: 64 }, stackG);
  m.legs = [-1, 1].map(s => {
    const hip = new Z.Anchor({ addTo: benen, translate: { x: 30 * s, z: 8 } });
    const g = new Z.Group({ addTo: hip });
    const end = { x: -2 * s, y: 39, z: 14 };
    new Z.Shape({ addTo: g, path: [{ x: 0, y: 0 }, { bezier: [{ x: 12 * s, y: 14 }, { x: 10 * s, y: 31 }, end] }], closed: false, stroke: 14, color: '#F3D34A' });
    new Z.Shape({ addTo: g, path: [{ x: 4 * s, y: 5, z: 5 }, { x: 8 * s, y: 18, z: 6 }], closed: false, stroke: 3, color: '#FBEA9A' });
    new Z.Shape({ addTo: g, translate: end, stroke: 7, color: '#6B4A1A' });
    return hip;
  });

  // --- de stapel van vijf pannenkoeken (lijf) met stroop erop.
  // Elke pannenkoek = twee platte schijven met een dikke rand (onder donker, boven goud). Geen Zdog.Cylinder:
  // die vervormt verkeerd bij squash-and-stretch.
  const lijf = part('lijf', {}, stackG);
  const D = [138, 142, 134, 128, 116], Y = [56, 38, 20, 2, -16];
  const FACE = ['#F3BE55', '#F8CC6B', '#EDB44A', '#F6C35B', '#F9D27A'];
  const RIM = ['#C4842A', '#D09030', '#BB7C26', '#CB8C2E', '#D49835'];
  m.cakes = D.map((d, i) => {
    const c = new Z.Anchor({ addTo: lijf, translate: { y: Y[i] } });
    new Z.Ellipse({ addTo: c, diameter: d, rotate: { x: TAU / 4 }, translate: { y: 4 }, fill: true, stroke: 10, color: RIM[i] });
    new Z.Ellipse({ addTo: c, diameter: d - 2, rotate: { x: TAU / 4 }, translate: { y: -3.5 }, fill: true, stroke: 9, color: FACE[i] });
    return c;
  });
  const TOP = -25.6, RT = 116 / 2 + 4;
  const blob = []; for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, r = 30 + [6, -3, 4, -5, 2, 5, -4, 3, -2][k]; blob.push({ x: Math.cos(a) * r, y: Math.sin(a) * r + 6 }); }
  new Z.Shape({ addTo: lijf, path: blob, fill: true, stroke: 5, color: '#8A4A1C', rotate: { x: TAU / 4 }, translate: { y: TOP } });
  new Z.Shape({ addTo: lijf, path: [{ x: -10, y: 8 }, { x: 4, y: 18 }], stroke: 4, color: '#B0672E', rotate: { x: TAU / 4 }, translate: { y: TOP - 0.5 } }); // glans
  m.syrupDrips = [[-0.95, 13], [0.88, 18]].map(([a, L]) => {
    const x = Math.sin(a) * RT, z = Math.cos(a) * RT;
    const d = new Z.Group({ addTo: lijf, translate: { x, y: TOP, z } });
    new Z.Shape({ addTo: d, path: [{ y: 0 }, { y: L }], stroke: 6, color: '#8A4A1C' });
    new Z.Shape({ addTo: d, translate: { y: L + 1, z: 1 }, stroke: 9, color: '#8A4A1C' });
    return { d, a };
  });

  // --- bosbesogen met oogleden, glimlichtje en wenkbrauwen van stroop
  const ogen = part('ogen', { y: -5, z: 64 });
  m.eyes = [-1, 1].map(s => {
    const a = new Z.Anchor({ addTo: ogen, translate: { x: 24 * s, z: 4 }, rotate: { y: s * 0.34 } });
    const g = new Z.Group({ addTo: a });
    const ball = new Z.Group({ addTo: g });
    new Z.Shape({ addTo: ball, stroke: 30, color: '#FFFDF6' });
    new Z.Ellipse({ addTo: ball, diameter: 29, stroke: 2.5, color: '#C4842A', translate: { z: 0.5 } });
    const pupil = new Z.Anchor({ addTo: ball, translate: { z: 8 } });
    new Z.Shape({ addTo: pupil, stroke: 15, color: '#3D2470' });
    new Z.Shape({ addTo: pupil, translate: { x: -2.5, y: 2.5, z: 2 }, stroke: 6, color: '#5A3C9C' });
    new Z.Shape({ addTo: pupil, path: [{ x: -2, y: -5.5 }, { x: 2, y: -5.5 }], translate: { z: 3 }, stroke: 2.5, color: '#22123F' }); // kroontje van de bes
    const glint = new Z.Shape({ addTo: pupil, translate: { x: 3, y: -3, z: 5 }, stroke: 5, color: '#FFFFFF' });
    const lid = new Z.Group({ addTo: g, translate: { y: -15.5, z: 14 }, scale: { y: 0.001 }, visible: false });
    new Z.Ellipse({ addTo: lid, diameter: 31, quarters: 2, rotate: { z: -TAU / 4 }, translate: { y: 15.5 }, fill: true, stroke: 2, color: '#F2BE57' });
    new Z.Shape({ addTo: lid, path: [{ x: -15, y: 15.5 }, { x: 15, y: 15.5 }], stroke: 3.5, color: '#5A2E12' });
    const arc = new Z.Ellipse({ addTo: g, diameter: 20, quarters: 2, rotate: { z: TAU / 4 }, stroke: 4.5, color: '#5A2E12', translate: { z: 14 }, visible: false });
    const brow = new Z.Group({ addTo: g, translate: { y: -23, z: 6 } });
    new Z.Shape({ addTo: brow, path: [{ x: -11, y: 3 }, { bezier: [{ x: -5, y: -3 }, { x: 5, y: -3 }, { x: 11, y: 3 }] }], closed: false, stroke: 6, color: '#7A3E14' });
    return { s, a, ball, pupil, glint, lid, arc, brow };
  });

  // --- aardbeienneus
  const neus = part('neus', { y: 18, z: 75 });
  m.noseIn = new Z.Anchor({ addTo: neus });
  const ng = new Z.Group({ addTo: m.noseIn });
  [-1, 0, 1].forEach(k => new Z.Shape({ addTo: ng, path: [{ y: -9, z: -2 }, { x: k * 7, y: -14 + Math.abs(k) * 2, z: -1 }], stroke: 4.5, color: '#3C8F5A' }));
  new Z.Shape({ addTo: ng, path: [{ y: -3 }, { y: 2 }], stroke: 19, color: '#E0473C' });
  new Z.Shape({ addTo: ng, translate: { y: 8 }, stroke: 11, color: '#E0473C' });
  new Z.Shape({ addTo: ng, translate: { x: -4, y: -5, z: 8 }, stroke: 4, color: '#F58A7E' });
  [[-4, 1], [3, -2], [4, 5], [-2, 7], [0, -5], [-5, -3], [2, 10]].forEach(([x, y]) => new Z.Shape({ addTo: ng, translate: { x, y, z: 9 }, stroke: 2.4, color: '#FFE7A0' }));

  // --- stroopmond (één vorm die van glimlach naar wijd open gaat)
  const mond = part('mond', { y: 39, z: 76 });
  m.mouthA = new Z.Anchor({ addTo: mond });
  const mg = new Z.Group({ addTo: m.mouthA });
  m.mouth = new Z.Shape({ addTo: mg, path: mouthPath(0, 0), fill: true, stroke: 4.5, color: '#4A1F0B' });
  m.tongue = new Z.Shape({ addTo: mg, translate: { y: 8, z: 1 }, stroke: 8, color: '#E88AA0', visible: false });
  m.mouthDrip = new Z.Anchor({ addTo: mg, translate: { x: 19, y: -2 } });
  new Z.Shape({ addTo: m.mouthDrip, path: [{ y: 1 }, { y: 7 }], stroke: 3.5, color: '#8A4A1C' });
  new Z.Shape({ addTo: m.mouthDrip, translate: { y: 8.5 }, stroke: 6, color: '#8A4A1C' });

  // --- spekarmen
  const armen = part('armen', { y: 20 });
  m.arms = [-1, 1].map(s => {
    const sh = new Z.Anchor({ addTo: armen, translate: { x: 68 * s, y: -2, z: 4 } });
    const g = new Z.Group({ addTo: sh });
    const path = [{ x: 0, y: -2 }, { bezier: [{ x: 10 * s, y: 10 }, { x: -9 * s, y: 22 }, { x: 1 * s, y: 34 }] }, { bezier: [{ x: 7 * s, y: 41 }, { x: 13 * s, y: 45 }, { x: 8 * s, y: 52 }] }];
    new Z.Shape({ addTo: g, path, closed: false, stroke: 12, color: '#C94C5A' });
    new Z.Shape({ addTo: g, path, closed: false, stroke: 3.5, color: '#F7D5C9', translate: { x: -2.6 * s, z: 3 } });
    new Z.Shape({ addTo: g, path, closed: false, stroke: 2.5, color: '#9E3341', translate: { x: 3 * s, z: 3 } });
    return { s, sh };
  });

  // --- boterhoedje (smelt)
  const hoed = part('hoed', { y: TOP });
  m.puddle = new Z.Ellipse({ addTo: hoed, diameter: 26, rotate: { x: TAU / 4 }, translate: { y: -0.8 }, fill: true, stroke: 3, color: '#FFE98A' });
  m.butterDrips = [-0.42, 0.38].map(a => {
    const d = new Z.Group({ addTo: hoed, translate: { x: Math.sin(a) * (RT - 1), z: Math.cos(a) * (RT - 1) }, scale: { y: 0.001 }, visible: false });
    new Z.Shape({ addTo: d, path: [{ y: 0 }, { y: 10 }], stroke: 5, color: '#FFE98A' });
    new Z.Shape({ addTo: d, translate: { y: 11 }, stroke: 7.5, color: '#FFE98A' });
    return d;
  });
  m.hatTilt = new Z.Anchor({ addTo: hoed, translate: { x: -4 }, rotate: { y: 0.55, z: -0.12 } });
  m.hatScale = new Z.Anchor({ addTo: m.hatTilt });
  new Z.Box({ addTo: m.hatScale, width: 34, height: 18, depth: 26, stroke: 5, translate: { y: -11.5 }, color: '#FFE98A', topFace: '#FFF6C6', leftFace: '#F2D35E', rightFace: '#F2D35E', frontFace: '#FFE98A', rearFace: '#F7DE74', bottomFace: false });

  // --- stroopspetters (voor de landing)
  m.drops = Array.from({ length: 10 }, () => ({ s: new Z.Shape({ addTo: m.world, stroke: 6, color: '#8A4A1C', visible: false }), vx: 0, vy: 0, vz: 0, life: 0 }));
  return m;
}
function mouthPath(open, smirk) {
  const yl = -2 + 3 * smirk, yr = -2 - 5 * smirk, w = 19 - 2 * open;
  const d = 8 + 15 * open, u = (d - 3.5) * (1 - open) + 1 * open;
  return [
    { x: -w, y: yl },
    { bezier: [{ x: -w * 0.6, y: yl + d }, { x: w * 0.6, y: yr + d }, { x: w, y: yr }] },
    { bezier: [{ x: w * 0.6, y: yr + u }, { x: -w * 0.6, y: yl + u }, { x: -w, y: yl }] },
  ];
}

// ---------------------------------------------------------------- pose → model (gedeeld door live monster en stilstaand plaatje)
function neutralPose() {
  return { yaw: 0, lean: 0, hop: 0, sqY: 0, eyeClose: 0, arcHappy: false, lid: 0, gx: 0, gy: 0, mouth: 0.1, smirk: 0,
    browL: 0, browR: 0, cross: 0, armUp: [0, 0], sniff: 0, melt: 0, wobble: 0, t: 0, breath: 0, legKick: 0 };
}
function applyPose(m, P, parts) {
  const TAU = Z.TAU;
  m.yaw.rotate.y = P.yaw;
  m.yaw.rotate.x = P.lean;
  m.yaw.translate.y = 100 + P.hop;
  const sy = 1 + P.breath + P.sqY, sx = 1 - (P.breath + P.sqY) * 0.5;
  m.squash.scale.set({ x: sx, y: sy, z: sx });
  const shadowS = clamp(1 + P.hop / 140, 0.6, 1.1);
  m.shadow.scale.set({ x: shadowS, y: shadowS, z: shadowS });
  for (const d of m.syrupDrips) d.d.visible = Math.cos(d.a - P.yaw) > 0.05;
  // wiebelende pannenkoeken
  m.cakes.forEach((c, i) => { c.translate.x = Math.sin(P.t * 1.7 + i * 0.9) * P.wobble; c.translate.z = Math.cos(P.t * 1.3 + i * 1.4) * P.wobble * 0.6; });
  // ogen
  const sides = { [-1]: P.browL, 1: P.browR };
  for (const e of m.eyes) {
    const closed = P.eyeClose > 0.72;
    e.ball.visible = !closed;
    e.ball.scale.set({ x: 1, y: Math.max(0.06, 1 - 0.94 * P.eyeClose), z: 1 });
    e.pupil.translate.x = P.gx * 5; e.pupil.translate.y = P.gy * 4;
    e.arc.visible = closed;
    e.arc.rotate.z = P.arcHappy ? -TAU / 4 : TAU / 4;
    e.arc.translate.y = P.arcHappy ? 3 : -2;
    e.lid.visible = P.lid > 0.03 && !closed;
    e.lid.scale.y = Math.max(0.001, P.lid);
    e.brow.visible = Math.cos(P.yaw - e.s * 0.34) > -0.15; // van achteren steken de wenkbrauwen niet boven de stapel uit
    const r = sides[e.s];
    e.brow.translate.y = -23 - 5 * Math.max(0, r) + 2 * Math.max(0, -r);
    e.brow.rotate.z = r < 0 ? -e.s * 0.38 * -r : e.s * 0.12 * r;
  }
  // neus
  const sn = 1 + P.sniff * 0.13 * Math.sin(P.t * 38);
  m.noseIn.scale.set({ x: 1 + P.sniff * 0.05, y: sn, z: 1 });
  m.noseIn.translate.y = P.sniff * Math.sin(P.t * 19) * 1.2;
  // mond
  const open = clamp(P.mouth, 0, 1);
  m.mouth.path = mouthPath(open, P.smirk); m.mouth.updatePath();
  m.mouthA.rotate.z = -0.18 * P.smirk; m.mouthA.translate.x = 3 * P.smirk;
  m.tongue.visible = open > 0.35;
  m.tongue.translate.y = -2 + (8 + 15 * open) * 0.7 - 4; m.tongue.stroke = 5 + 7 * open;
  m.mouthDrip.translate.x = 19 - 2 * open; m.mouthDrip.translate.y = -2 - 5 * P.smirk;
  // armen: rust ↔ over elkaar, plus omhoog (zwaaien)
  for (const a of m.arms) {
    const s = a.s, c = P.cross, up = P.armUp[s < 0 ? 0 : 1];
    const sway = Math.sin(P.t * 2 + s) * 0.08 * (1 - c);
    a.sh.translate.x = (68 - 12 * c) * s; a.sh.translate.y = -2 + 32 * c; a.sh.translate.z = 4 + 46 * c;
    a.sh.rotate.z = s * (-0.35 + 1.75 * c - 2.4 * up) + s * sway;
    a.sh.rotate.x = 0.95 * c;
  }
  // benen
  m.legs.forEach((h, i) => { const s = i ? 1 : -1; h.rotate.z = s * P.legKick * Math.sin(P.t * 9 + i * Math.PI) * 0.35; });
  // smeltend hoedje
  const mt = clamp(P.melt, 0, 1);
  m.hatScale.scale.set({ x: 1 + 0.18 * mt, y: 1 - 0.5 * mt, z: 1 + 0.18 * mt });
  m.puddle.scale = 1 + 0.9 * mt;
  m.butterDrips.forEach((d, i) => { const v = clamp(mt * 1.6 - i * 0.3, 0, 1.4); d.visible = v > 0.02 && parts.has('hoed'); d.scale.y = Math.max(0.001, v); });
}

// ---------------------------------------------------------------- stilstaand plaatje (schuifpuzzel)
const imgCache = new Map();
export function monsterImage(parts = PART_KEYS) {
  const set = new Set(parts), key = PART_KEYS.filter(p => set.has(p)).join(',') + (Z ? ':z' : ':f');
  if (imgCache.has(key)) return imgCache.get(key);
  let url;
  if (Z) {
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', 300); svg.setAttribute('height', 300);
      const illo = new Z.Illustration({ element: svg, zoom: 300 / 218, rotate: { x: -0.25 } }); // iets ingezoomd: minder lege tegels
      const m = buildModel(illo);
      for (const k of PART_KEYS) setGhost(m.parts[k], !set.has(k));
      const P = neutralPose(); P.mouth = 0.25; P.yaw = 0.12;
      applyPose(m, P, set);
      illo.updateRenderGraph();
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', -200); r.setAttribute('y', -200); r.setAttribute('width', 400); r.setAttribute('height', 400); r.setAttribute('fill', BG);
      svg.insertBefore(r, svg.firstChild);
      url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    } catch (e) { console.warn('[monster] plaatje', e); }
  }
  url = url || 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(flatSvg(set, true));
  imgCache.set(key, url);
  return url;
}
// Plat reservemonster (als Zdog niet laadt): hetzelfde idee in gewone SVG.
function flatSvg(set, bg) {
  const o = p => set.has(p) ? '' : ' opacity=".15"';
  const cakes = [[228, 98], [208, 100], [188, 96], [168, 92], [148, 86]].map(([y, rx], i) => `<ellipse cx="150" cy="${y + 8}" rx="${rx}" ry="20" fill="#C9892C"/><ellipse cx="150" cy="${y}" rx="${rx}" ry="20" fill="${['#F3BE55', '#F8CC6B', '#EDB44A', '#F6C35B', '#F9D27A'][i]}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">${bg ? `<rect width="300" height="300" fill="${BG}"/>` : ''}
<ellipse cx="150" cy="284" rx="100" ry="10" fill="#E6D3AE"/>
<g${o('benen')} fill="none" stroke="#F3D34A" stroke-width="15" stroke-linecap="round"><path d="M118 240c12 14 10 30-2 40"/><path d="M182 240c-12 14-10 30 2 40"/></g>
<g${o('lijf')}>${cakes}<path d="M120 140c10-8 50-8 60 0 4 8-10 14-30 14s-34-6-30-14z" fill="#8A4A1C"/></g>
<g${o('armen')} fill="none" stroke="#C94C5A" stroke-width="12" stroke-linecap="round"><path d="M56 190c-16 10-14 28-24 40"/><path d="M244 190c16 10 14 28 24 40"/></g>
<g${o('ogen')}><circle cx="124" cy="176" r="15" fill="#FFFDF6" stroke="#C4842A" stroke-width="2.5"/><circle cx="176" cy="176" r="15" fill="#FFFDF6" stroke="#C4842A" stroke-width="2.5"/><circle cx="126" cy="178" r="7.5" fill="#3D2470"/><circle cx="178" cy="178" r="7.5" fill="#3D2470"/><circle cx="129" cy="175" r="2.5" fill="#fff"/><circle cx="181" cy="175" r="2.5" fill="#fff"/><path d="M112 154q12-7 24 0M164 154q12-7 24 0" fill="none" stroke="#7A3E14" stroke-width="5" stroke-linecap="round"/></g>
<g${o('neus')}><circle cx="150" cy="196" r="10" fill="#E0473C"/><circle cx="150" cy="204" r="6" fill="#E0473C"/><path d="M144 186l6 3 6-3" fill="none" stroke="#3C8F5A" stroke-width="4" stroke-linecap="round"/></g>
<g${o('mond')}><path d="M131 214q19 18 38 0q-19 8-38 0z" fill="#4A1F0B" stroke="#4A1F0B" stroke-width="4" stroke-linejoin="round"/></g>
<g${o('hoed')}><rect x="132" y="104" width="34" height="20" rx="5" fill="#FFE98A" transform="rotate(-8 150 114)"/><rect x="132" y="104" width="34" height="7" rx="4" fill="#FFF6C6" transform="rotate(-8 150 114)"/></g>
</svg>`;
}

// ---------------------------------------------------------------- stijl (één keer)
function injectCss() {
  if (document.getElementById('pkmon-css')) return;
  const s = document.createElement('style'); s.id = 'pkmon-css';
  s.textContent = `
.pkmon{position:relative;margin:0 auto;aspect-ratio:1/1;width:min(62vw,240px);-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.pkmon.sm{width:110px}.pkmon.md{width:min(62vw,240px)}.pkmon.lg{width:min(80vw,320px)}
.pkmon canvas,.pkmon img{display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab}
.pkmon canvas:active{cursor:grabbing}
.pkmon .zzz{position:absolute;right:14%;top:6%;pointer-events:none;display:none;font-family:var(--display,'Lilita One',system-ui,sans-serif);color:#5A2E12}
.pkmon.slaap .zzz{display:block}
.pkmon .zzz b{position:absolute;right:0;top:0;opacity:0;font-weight:400;animation:pkmon-z 3.6s linear infinite}
.pkmon .zzz b:nth-child(2){animation-delay:1.2s;font-size:1.25em}.pkmon .zzz b:nth-child(3){animation-delay:2.4s;font-size:1.5em}
.pkmon.sm .zzz{font-size:11px}.pkmon.md .zzz{font-size:18px}.pkmon.lg .zzz{font-size:22px}
@keyframes pkmon-z{0%{transform:translate(0,10px) rotate(-8deg);opacity:0}15%{opacity:.85}100%{transform:translate(22px,-46px) rotate(10deg);opacity:0}}
.pkmon-bubble{position:fixed;left:12px;top:12px;z-index:60;max-width:min(88vw,380px);background:#FFFCF5;color:#3B2410;border:3px solid #5A2E12;border-radius:20px;
  padding:12px 16px;font:800 1.05rem/1.35 var(--body,'Nunito',system-ui,sans-serif);box-shadow:0 6px 0 rgba(90,46,18,.25),0 10px 30px rgba(0,0,0,.18);
  opacity:0;transform:scale(.85);transform-origin:var(--ox,50%) var(--oy,100%);transition:opacity .18s,transform .22s cubic-bezier(.3,1.6,.5,1);cursor:pointer}
.pkmon-bubble.show{opacity:1;transform:none}
.pkmon-bubble .tail{position:absolute;width:18px;height:18px;background:#FFFCF5;border:3px solid #5A2E12;border-top:0;border-left:0;left:var(--tx,50%);margin-left:-9px}
.pkmon-bubble.up .tail{bottom:-11px;transform:rotate(45deg)}
.pkmon-bubble.down .tail{top:-11px;transform:rotate(-135deg)}
.pkmon-bubble.free .tail{display:none}
.pkmon-bubble .cur{display:inline-block;width:.5em;animation:pkmon-blink .7s steps(1) infinite}
@keyframes pkmon-blink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){.pkmon .zzz b{animation:none;opacity:.8;position:static;display:inline}.pkmon-bubble{transition:none}.pkmon-bubble .cur{animation:none}}
`;
  document.head.appendChild(s);
}

// ---------------------------------------------------------------- spraak (Web Speech)
const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
let nlVoice = null, speechUnlocked = false;
function pickVoice() {
  if (!synth) return null;
  const vs = synth.getVoices().filter(v => /^nl([-_]|$)/i.test(v.lang));
  const nl = vs.filter(v => /nl[-_]NL/i.test(v.lang));
  const pool = nl.length ? nl : vs;
  nlVoice = pool.find(v => /xander|frank|daan|willem|maarten|male|man/i.test(v.name)) || pool.find(v => v.localService) || pool[0] || null;
  return nlVoice;
}
if (synth) {
  pickVoice();
  try { synth.addEventListener?.('voiceschanged', pickVoice); } catch {}
  const unlockSpeech = () => {
    if (speechUnlocked) return; speechUnlocked = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'nl-NL'; synth.speak(u); } catch {}
    removeEventListener('touchend', unlockSpeech, true); removeEventListener('pointerup', unlockSpeech, true); removeEventListener('click', unlockSpeech, true);
  };
  addEventListener('touchend', unlockSpeech, true); addEventListener('pointerup', unlockSpeech, true); addEventListener('click', unlockSpeech, true);
}
/** Voor de geluidscheck op test/monster.html. */
export function speechStatus() {
  return { stem: synth ? 'ja' : 'nee (browser kan niet praten)', ontgrendeld: speechUnlocked, nlStem: (nlVoice || pickVoice())?.name || 'geen', praatHardop: isSpeakerPhone(), bezig: !!synth?.speaking };
}
// Schatting van de woordmomenten (in seconden) als boundary-events niet komen.
function wordTimes(text, rate) {
  const out = []; let t = 0.05;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    out.push(t);
    const letters = w.replace(/[^\p{L}\p{N}]/gu, '').length;
    t += (0.13 + 0.062 * letters) / rate + (/[.!?]$/.test(w) ? 0.35 : /[,;:]$/.test(w) ? 0.18 : 0);
  }
  return { times: out, total: t };
}

// Wie praat hardop? De telefoon met het laagste device-id dat online is.
function isSpeakerPhone() {
  const s = globalThis.pkm?.state?.get?.();
  if (!s) return true;
  const me = s.device?.id, mine = (s.device?.players || []).length > 0;
  const ids = new Set((s.players || []).filter(p => p.online && p.device_id).map(p => p.device_id));
  if (mine && me) ids.add(me);
  if (!ids.size) return true;
  if (!mine || !me) return false;
  return [...ids].sort()[0] === me;
}
function jarigeNaam() { return globalThis.pkm?.state?.get?.().players?.find(p => p.is_birthday)?.name || NAAM_JARIGE; }
function isJarige(playerId) { return !!playerId && !!globalThis.pkm?.state?.get?.().players?.find(p => p.id === playerId && p.is_birthday); }
const WORDS = ['nul', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien', 'elf', 'twaalf', 'dertien', 'veertien', 'vijftien', 'zestien', 'zeventien', 'achttien', 'negentien', 'twintig'];
function fill(text, vars = {}) {
  const n = vars.hints ?? 0, w = WORDS[n] || String(n);
  return String(text)
    .replace(/\{jarige\}/g, jarigeNaam())
    .replace(/\{naam\}/g, vars.naam || '')
    .replace(/\{Hints\}/g, w.charAt(0).toUpperCase() + w.slice(1))
    .replace(/\{hints\}/g, w);
}
const lastLine = {};
function pickLine(sit, { mood, sub, naam } = {}) {
  let src = LINES[sit]; if (sub != null) src = src?.[sub];
  if (!src) return null;
  let list = Array.isArray(src) ? src.slice() : [...(src.alle || []), ...(src[mood] || [])];
  if (!naam) list = list.filter(l => !l.includes('{naam}'));
  if (!list.length) return null;
  const k = sit + '/' + (sub ?? '');
  const fresh = list.length > 1 ? list.filter(l => l !== lastLine[k]) : list;
  const line = pick(fresh); lastLine[k] = line;
  return line;
}

// ---------------------------------------------------------------- de tekstballon (één voor de hele app)
let bubbleEl = null, bubbleRaf = 0, bubbleOwner = null;
function bubble() {
  if (bubbleEl) return bubbleEl;
  bubbleEl = document.createElement('div'); bubbleEl.className = 'pkmon-bubble'; bubbleEl.setAttribute('role', 'status'); bubbleEl.setAttribute('aria-live', 'polite');
  bubbleEl.innerHTML = '<span class="txt"></span><span class="cur" aria-hidden="true">▍</span><i class="tail" aria-hidden="true"></i>';
  bubbleEl.hidden = true;
  return bubbleEl;
}
function placeBubble() {
  bubbleRaf = 0;
  if (!bubbleEl || bubbleEl.hidden) return;
  const owner = bubbleOwner, vw = innerWidth, vh = innerHeight;
  const bw = bubbleEl.offsetWidth, bh = bubbleEl.offsetHeight;
  const r = owner?.isConnected ? owner.getBoundingClientRect() : null;
  const onScreen = r && r.width > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  let x, y, cls = 'free', tx = bw / 2;
  if (onScreen) {
    const cx = r.left + r.width / 2;
    x = clamp(cx - bw / 2, 10, vw - bw - 10);
    tx = clamp(cx - x, 22, bw - 22);
    const top = r.top + r.height * 0.08 - bh - 14;
    if (top > 8) { y = top; cls = 'up'; }
    else if (r.bottom + bh + 14 < vh - 8) { y = r.bottom - r.height * 0.04 + 14; cls = 'down'; }
  }
  if (cls === 'free') { x = (vw - bw) / 2; y = Math.max(12, (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0) + 70); }
  bubbleEl.className = 'pkmon-bubble show ' + cls;
  bubbleEl.style.left = Math.round(x) + 'px'; bubbleEl.style.top = Math.round(y) + 'px';
  bubbleEl.style.setProperty('--tx', Math.round(tx) + 'px');
  bubbleEl.style.setProperty('--ox', Math.round(tx) + 'px'); bubbleEl.style.setProperty('--oy', cls === 'down' ? '0%' : '100%');
  bubbleRaf = requestAnimationFrame(placeBubble);
}

// ---------------------------------------------------------------- createMonster
export function createMonster() {
  injectCss();
  const el = document.createElement('div');
  el.className = 'pkmon md slaap';
  el.innerHTML = '<div class="zzz" aria-hidden="true"><b>z</b><b>z</b><b>Z</b></div>';
  el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Het Pannenkoekenmonster');
  let canvas = null, img = null, illo = null, m = null, built = false, destroyed = false;
  const parts = new Set();
  let mood = 'slaap', size = 'md';
  const P = neutralPose();
  // animatiestatus
  const S = {
    yaw: 0, yawVel: 0, yawHome: 0, homeK: 2.5, dragging: false, lastDrag: -1e9,
    landing: null, landed: {}, hop: null, shake: null, expr: null, sq: 0, sqV: 0,
    nextBlink: 0, blinkT: -1, nextLook: 0, gazeT: { x: 0, y: 0 }, nextSniff: 0, sniffUntil: 0,
    bru: { phase: 'snap', until: 0, dir: 1 }, spin0: -1e9, nextSpin: 0,
    talk: 0, busyUntil: 0, lastT: 0, melt: 0,
  };
  let visible = false, docVisible = document.visibilityState !== 'hidden', raf = 0;
  let pointer = { x: 0, y: 0, t: -1e9 };

  // ---- canvas of reserveplaatje
  function showFallback() {
    if (!img) { img = document.createElement('img'); img.alt = ''; img.draggable = false; el.prepend(img); img.addEventListener('click', () => api.react('tik')); }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(flatSvg(parts, false));
  }
  function build() {
    if (destroyed || built || !Z) return;
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    img?.remove(); img = null;
    el.prepend(canvas);
    illo = new Z.Illustration({ element: canvas, zoom: 1, rotate: { x: -0.25 } });
    canvas.style.width = canvas.style.height = ''; // Zdog zet hier pixelmaten; de CSS bepaalt de maat
    m = buildModel(illo);
    built = true;
    applyParts();
    sizeCanvas();
    bindPointer();
    kick(400);
  }
  function sizeCanvas() {
    if (!illo) return;
    const w = el.clientWidth || { sm: 110, md: 240, lg: 320 }[size];
    const pr = Math.min(window.devicePixelRatio || 1, 2.5);
    illo.width = w; illo.height = w; illo.pixelRatio = pr;
    canvas.width = illo.canvasWidth = Math.round(w * pr);
    canvas.height = illo.canvasHeight = Math.round(w * pr);
    illo.zoom = w / VIEW;
    drawOnce();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => sizeCanvas()) : null;
  ro?.observe(el);
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; if (visible) { sizeCanvas(); loop(); } }) : null;
  if (io) io.observe(el); else visible = true;
  const onVis = () => { docVisible = document.visibilityState !== 'hidden'; if (docVisible) loop(); };
  document.addEventListener('visibilitychange', onVis);
  const onMQ = () => kick(300);
  try { reduceMQ.addEventListener?.('change', onMQ); } catch {}

  function applyParts() {
    if (!built) { showFallback(); return; }
    for (const k of PART_KEYS) setGhost(m.parts[k], !parts.has(k));
    if (!parts.has('hoed')) S.melt = 0;
    drawOnce();
  }

  // ---- de lus: alleen als het monster in beeld is
  function wantLoop() { return built && !destroyed && visible && docVisible && el.isConnected && (!RM() || S.busyUntil > now()); }
  function kick(ms = 600) { S.busyUntil = Math.max(S.busyUntil, now() + ms); loop(); }
  function loop() { if (!raf && wantLoop()) { S.lastT = now(); raf = requestAnimationFrame(frame); } }
  function drawOnce() { if (built && !raf) { step(now(), 0); illo.updateRenderGraph(); } }
  function frame(ts) {
    raf = 0;
    if (!wantLoop()) { drawOnce(); return; }
    const t = now(), dt = Math.min(0.05, (t - S.lastT) / 1000); S.lastT = t;
    step(t, dt);
    illo.updateRenderGraph();
    raf = requestAnimationFrame(frame);
  }

  // ---- alle beweging per beeldje
  function step(t, dt) {
    const sec = t / 1000, rm = RM(), mv = rm ? 0 : 1;
    P.t = sec;
    // doelen per stemming
    let T = { lean: 0, eyeClose: 0, lid: 0, mouth: 0.1, smirk: 0, browL: 0, browR: 0, cross: 0, breathA: 0.018, breathW: 2.2, wobble: 1.1, legKick: 0, arcHappy: false };
    let gazeMode = 'wander';
    S.homeK = 2.5;
    if (mood === 'slaap') { Object.assign(T, { eyeClose: 1, lean: 0.08, mouth: 0.18, breathA: 0.03, breathW: 1.25, wobble: 0.5 }); S.yawHome = 0; gazeMode = 'none'; }
    else if (mood === 'wakker') { S.yawHome = S.gazeT.x * 0.18; }
    else if (mood === 'nieuwsgierig') {
      Object.assign(T, { lean: -0.14, browL: 0.5, browR: 0.5, mouth: 0.22 });
      gazeMode = t - pointer.t < 3000 ? 'pointer' : 'wander';
      if (t > S.nextSniff) { S.sniffUntil = t + 900; S.nextSniff = t + rnd(1800, 4200); }
      S.yawHome = S.gazeT.x * 0.32;
    } else if (mood === 'brutaal') {
      Object.assign(T, { browL: 1, browR: -0.6, smirk: 1, cross: 1, lid: 0.32, mouth: 0.05 });
      if (t > S.bru.until && !S.dragging) {
        if (S.bru.phase === 'snap') { S.bru = { phase: 'away', until: t + rnd(3500, 6500), dir: Math.random() < .5 ? -1 : 1 }; }
        else { S.bru = { phase: 'snap', until: t + 1500, dir: S.bru.dir }; if (!rm) kick(1500); }
      }
      if (S.bru.phase === 'away') { S.yawHome = 0.6 * S.bru.dir; S.gazeT = { x: -0.8 * S.bru.dir, y: -0.2 }; T.lean = 0.05; gazeMode = 'fixed'; }
      else { S.yawHome = 0; S.homeK = 16; T.lid = 0.62; S.gazeT = { x: 0, y: 0.1 }; gazeMode = 'fixed'; }
    } else if (mood === 'compleet') {
      Object.assign(T, { eyeClose: 1, arcHappy: true, mouth: 0.7, legKick: 1, wobble: 1.6 });
      S.yawHome = 0; gazeMode = 'none';
      if (parts.has('hoed')) S.melt = rm ? 1 : Math.min(1, S.melt + dt / 7);
      if (t > S.nextSpin) { S.spin0 = t; S.nextSpin = t + rnd(4500, 6500); }
    }
    // tijdelijke uitdrukking (react)
    const ex = S.expr && t < S.expr.until ? S.expr : null;
    let armUp = [0, 0];
    if (ex) {
      if (ex.kind === 'fout') Object.assign(T, { browL: -0.8, browR: -0.8, lid: 0.45, mouth: 0.05, smirk: 0.4, eyeClose: 0 });
      if (ex.kind === 'tik' || ex.kind === 'goed') Object.assign(T, { eyeClose: 1, arcHappy: true, mouth: 0.6, lid: 0 });
      if (ex.kind === 'hint') { Object.assign(T, { browL: 0.9, browR: 0.3, mouth: 0.3, cross: 0, lid: 0 }); S.gazeT = { x: 0.5, y: -0.9 }; gazeMode = 'fixed'; armUp = [0, 0.75 + 0.1 * Math.sin(sec * 10)]; }
      if (ex.kind === 'start') { Object.assign(T, { eyeClose: 0.85, arcHappy: false, mouth: 0.95, cross: 0, lid: 0 }); armUp = [0.85, 0.85]; }
    }
    // knipperen (wakker, nieuwsgierig)
    if ((mood === 'wakker' || mood === 'nieuwsgierig') && !ex && mv) {
      if (t > S.nextBlink) { S.blinkT = t; S.nextBlink = t + rnd(2200, 5200); }
      const b = (t - S.blinkT) / 160; if (b >= 0 && b < 1) T.eyeClose = Math.max(T.eyeClose, Math.sin(b * Math.PI));
    }
    // kijkrichting
    if (gazeMode === 'pointer' && canvas) {
      const r = canvas.getBoundingClientRect();
      S.gazeT = { x: clamp((pointer.x - (r.left + r.width / 2)) / (r.width * 0.9), -1, 1), y: clamp((pointer.y - (r.top + r.height * 0.45)) / (r.height * 0.9), -1, 1) };
    } else if (gazeMode === 'wander' && mv) {
      if (t > S.nextLook) { S.gazeT = Math.random() < .3 ? { x: 0, y: 0 } : { x: rnd(-1, 1), y: rnd(-0.6, 0.5) }; S.nextLook = t + rnd(1200, 3200); }
    } else if (gazeMode === 'none') S.gazeT = { x: 0, y: 0 };
    const kk = rm ? 60 : 1;
    P.gx = lerpK(P.gx, S.gazeT.x, 12 * kk, dt); P.gy = lerpK(P.gy, S.gazeT.y, 12 * kk, dt);
    for (const k of ['lean', 'lid', 'smirk', 'browL', 'browR', 'cross', 'legKick']) P[k] = lerpK(P[k], T[k], (k === 'lid' && mood === 'brutaal' ? 14 : 7) * kk, dt);
    P.eyeClose = T.eyeClose > P.eyeClose ? lerpK(P.eyeClose, T.eyeClose, 30, dt) : lerpK(P.eyeClose, T.eyeClose, (mood === 'slaap' ? 3 : 18) * kk, dt);
    if (rm) P.eyeClose = T.eyeClose;
    P.arcHappy = T.arcHappy;
    P.armUp = [lerpK(P.armUp[0], armUp[0], 8 * kk, dt), lerpK(P.armUp[1], armUp[1], 8 * kk, dt)];
    P.sniff = lerpK(P.sniff, t < S.sniffUntil && mv ? 1 : 0, 10, dt);
    P.wobble = T.wobble * mv; P.breath = Math.sin(sec * T.breathW) * T.breathA * mv;
    P.melt = S.melt;
    // praten: mond per woord
    S.talk = Math.max(0, S.talk - dt * 4.5);
    const talkOpen = S.talk > 0 ? S.talk * (0.55 + 0.45 * Math.abs(Math.sin(sec * 17))) : 0;
    const snore = mood === 'slaap' ? 0.12 * (1 + Math.sin(sec * T.breathW)) * mv : 0;
    P.mouth = lerpK(P.mouth, Math.max(T.mouth + snore, talkOpen), 22, dt);
    // draaien: slepen, uitrollen, terug naar huis
    if (!S.dragging) {
      if (Math.abs(S.yawVel) > 0.01) { S.yaw += S.yawVel * dt; S.yawVel *= Math.exp(-dt * 3.2); }
      if (t - S.lastDrag > 1400) {
        const TAU = Math.PI * 2; let d = S.yaw - S.yawHome; d -= Math.round(d / TAU) * TAU; S.yaw = S.yawHome + d;
        S.yaw = lerpK(S.yaw, S.yawHome, (rm ? 30 : S.homeK), dt);
      }
    }
    let yaw = S.yaw;
    const su = (t - S.spin0) / 1300; if (su >= 0 && su < 1 && mv) yaw += Math.PI * 2 * ease(su);
    if (S.shake) { const u = (t - S.shake) / 1000; if (u < 0.8 && mv) yaw += 0.22 * Math.sin(u * 32) * Math.exp(-4 * u); else S.shake = null; }
    P.yaw = yaw;
    // hupjes, stuiteren, veren
    let hop = 0;
    if (S.hop) { const u = (t - S.hop.t0) / 450; if (u < 1 && mv) hop = -S.hop.h * Math.sin(Math.PI * u); else S.hop = null; }
    let bounceSq = 0;
    if (mood === 'compleet' && mv) { const b = Math.abs(Math.sin(sec * 4.2)); hop += -16 * b; if (b < 0.3) bounceSq = -0.09 * (1 - b / 0.3); }
    P.hop = hop;
    // veer: S.sq is de afwijking van de schaal, S.sqV de snelheid
    S.sqV += (-170 * S.sq - 11 * S.sqV) * dt; S.sq += S.sqV * dt; if (rm) { S.sq = 0; S.sqV = 0; }
    P.sqY = S.sq + bounceSq;
    applyPose(m, P, parts);
    landStep(t, dt);
    dropsStep(dt);
  }

  // ---- landen: vallen, squash-and-stretch, stroopspetter, vastklikken, zin
  function landStep(t) {
    const L = S.landing; if (!L) return;
    const a = m.parts[L.key], b = m.base[L.key];
    const FALL = 520, u = t - L.t0;
    if (RM()) {
      if (!L.hit) { L.hit = true; impact(L, a, b, true); }
      if (u > 300) finishLanding(L);
      return;
    }
    if (u < FALL) {
      const f = u / FALL;
      a.translate.y = b.y - 250 * (1 - f * f);
      a.scale.set({ x: 0.86, y: 1.22, z: 0.86 });
      a.rotate.z = (1 - f) * 0.5 * L.spinDir;
      return;
    }
    if (!L.hit) { L.hit = true; impact(L, a, b, false); }
    const v = (u - FALL) / 1000, damp = Math.exp(-6 * v), osc = Math.cos(17 * v);
    a.translate.y = b.y; a.rotate.z = 0;
    a.scale.set({ x: 1 + 0.34 * damp * osc, y: 1 - 0.42 * damp * osc, z: 1 + 0.34 * damp * osc });
    if (!L.click && v > 0.2) { L.click = true; audio.play('klik'); }
    if (v > 0.9) finishLanding(L);
  }
  function impact(L, a, b, quiet) {
    setGhost(a, false);
    audio.play('spetter');
    audio.buzz([30, 30, 60]);
    if (quiet) return;
    S.sqV -= 2.2;     // het hele monster zakt even in
    const TAU = Math.PI * 2;
    m.drops.forEach((d, i) => {
      const ang = (i / m.drops.length) * TAU + rnd(-0.3, 0.3), sp = rnd(70, 140);
      const y0 = L.key === 'lijf' ? 62 : L.key === 'benen' ? 98 : L.key === 'armen' ? 50 : b.y + 4;
      d.s.translate.set({ x: b.x + Math.cos(ang) * 6, y: y0, z: b.z + Math.sin(ang) * 6 });
      d.vx = Math.cos(ang) * sp; d.vz = Math.sin(ang) * sp; d.vy = -rnd(90, 170); d.life = rnd(0.45, 0.7);
      d.s.stroke = rnd(4, 8); d.s.visible = true;
    });
  }
  function dropsStep(dt) {
    for (const d of m.drops) {
      if (!d.s.visible) continue;
      d.life -= dt; if (d.life <= 0) { d.s.visible = false; continue; }
      d.vy += 520 * dt; const p = d.s.translate; p.x += d.vx * dt; p.y += d.vy * dt; p.z += d.vz * dt;
      d.s.stroke = Math.max(1, d.s.stroke - dt * 6);
    }
  }
  function finishLanding(L) {
    const a = m.parts[L.key], b = m.base[L.key];
    a.translate.set(b); a.scale.set({ x: 1, y: 1, z: 1 }); a.rotate.z = 0;
    S.landing = null; S.landed[L.key] = now();
    S.hop = { t0: now(), h: 14 }; S.expr = { kind: 'goed', until: now() + 900 };
    kick(1200);
    afterLanding(L.key);
  }
  async function afterLanding(key) {
    const naam = isJarige(inner.lastBy) ? jarigeNaam() : null;
    const line = pickLine('deel', { sub: key, naam });
    const complete = PART_KEYS.every(k => parts.has(k));
    if (line) { const ok = await say(fill(line, { naam }), { auto: true, force: true }); if (!ok) return; }
    if (complete) {
      const f = pickLine('finale', { naam: jarigeNaam() });
      if (f && !(await say(fill(f), { auto: true, force: true }))) return;
      const h = hintCount(), sub = h === 0 ? 'nul' : h === 1 ? 'een' : 'meer';
      const ht = pickLine('finaleHints', { sub });
      if (ht) say(fill(ht, { hints: h }), { auto: true, force: true });
    }
  }
  const startLanding = key => {
    if (S.landing) finishLanding(S.landing);
    if (S.landed[key] && now() - S.landed[key] < 3000) return; // dezelfde landing niet twee keer
    S.landing = { key, t0: now() + (RM() ? 0 : 120), hit: false, click: false, spinDir: Math.random() < .5 ? -1 : 1 };
    if (built) {
      setGhost(m.parts[key], false);
      if (!RM()) { const b = m.base[key]; m.parts[key].translate.y = b.y - 250; audio.play('val'); }
    }
    kick(2200);
  };

  // ---- vinger: draaien en tikken
  function bindPointer() {
    let d = null;
    canvas.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      d = { id: e.pointerId, x0: e.clientX, y0: e.clientY, yaw0: S.yaw, t0: now(), lx: e.clientX, lt: now(), moved: false };
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      kick(1500);
    });
    canvas.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x0;
      if (!d.moved && Math.abs(dx) > 7) { d.moved = true; S.dragging = true; }
      if (d.moved) {
        const w = canvas.clientWidth || 200, tt = now();
        S.yaw = d.yaw0 + dx / w * Math.PI * 1.8;
        const v = (e.clientX - d.lx) / Math.max(1, tt - d.lt) * 1000;
        S.yawVel = v / w * Math.PI * 1.8; d.lx = e.clientX; d.lt = tt;
        kick(1500);
      }
    });
    const end = (e, cancel) => {
      if (!d || e.pointerId !== d.id) return;
      const tap = !d.moved && !cancel && now() - d.t0 < 450;
      S.dragging = false; S.lastDrag = now();
      if (d.moved && now() - d.lt > 80) S.yawVel = 0;
      d = null;
      if (tap) api.react('tik');
      kick(2000);
    };
    canvas.addEventListener('pointerup', e => end(e, false));
    canvas.addEventListener('pointercancel', e => end(e, true));
  }
  const onPointer = e => { pointer = { x: e.clientX, y: e.clientY, t: now() }; inner.activity(); if (mood === 'nieuwsgierig') kick(800); };
  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('pointerdown', onPointer, { passive: true });

  // ---- praten
  let talking = null; // { id, resolve, timers:[], utt, hum }
  let talkSeq = 0;
  function stopTalking(result = false) {
    const c = talking; if (!c) return;
    talking = null;
    c.timers.forEach(clearTimeout); clearInterval(c.typer);
    c.hum?.stop();
    if (c.utt && synth) { c.utt.onend = c.utt.onerror = c.utt.onboundary = c.utt.onstart = null; try { synth.cancel(); } catch {} }
    if (bubbleOwner === el && bubbleEl) { bubbleEl.classList.remove('show'); bubbleEl.hidden = true; cancelAnimationFrame(bubbleRaf); bubbleRaf = 0; }
    c.resolve(result);
  }
  function say(text, opts = {}) {
    if (typeof opts === 'number') opts = { ms: opts };
    text = String(text ?? '').trim();
    if (!text || destroyed) return Promise.resolve(false);
    if (opts.auto && talking && !opts.force) return Promise.resolve(false);
    if (opts.auto && talking && opts.force && !talking.auto) return Promise.resolve(false);
    stopTalking(false);
    const id = ++talkSeq;
    const muteNow = audio.muted();
    const wantVoice = opts.voice === true ? true : opts.voice === false ? false : isSpeakerPhone();
    const voice = wantVoice && !muteNow && !!synth;
    const minMs = opts.ms ?? clamp(text.length * 60 + 1800, 3200, 12000);
    return new Promise(resolve => {
      const c = talking = { id, resolve, timers: [], typer: 0, utt: null, hum: null, auto: !!opts.auto, typed: false, spoken: !voice, shownAt: now() };
      // ballon
      const b = bubble(); if (!b.isConnected) document.body.appendChild(b);
      b.onclick = () => { if (talking === c) stopTalking(true); };
      const txt = b.querySelector('.txt'), cur = b.querySelector('.cur');
      txt.textContent = ''; cur.style.display = '';
      b.hidden = false; bubbleOwner = el;
      cancelAnimationFrame(bubbleRaf); bubbleRaf = requestAnimationFrame(placeBubble);
      const words = [...text.matchAll(/\S+/g)].map(x => x.index);
      const cps = RM() ? 1e6 : voice ? 19 : 30;
      let i = 0, w = 0;
      const typeTick = () => {
        if (talking !== c) return;
        i = Math.min(text.length, i + Math.max(1, Math.round(cps / 30)));
        txt.textContent = text.slice(0, i);
        if (!voice) while (w < words.length && words[w] < i) { w++; mouthPulse(0.8); }
        if (i >= text.length) { clearInterval(c.typer); c.typed = true; cur.style.display = 'none'; maybeDone(); }
      };
      c.typer = setInterval(typeTick, 1000 / 30); typeTick();
      if (!voice && wantVoice && !muteNow) audio.play('brom'); // wel spreker, maar geen stem op dit toestel
      // stem
      if (voice) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'nl-NL'; if (nlVoice || pickVoice()) u.voice = nlVoice; u.pitch = 0.6; u.rate = 0.9; u.volume = 1;
        c.utt = u; let boundary = false, started = false;
        const est = () => { if (boundary || talking !== c) return; const { times } = wordTimes(text, 0.9); times.forEach(s => c.timers.push(setTimeout(() => { if (!boundary && talking === c) { mouthPulse(1); c.hum?.pulse(0.8); } }, s * 1000))); };
        u.onstart = () => { started = true; c.hum = audio.hum(); c.timers.push(setTimeout(est, 450)); };
        u.onboundary = e => { if (e.name && e.name !== 'word') return; boundary = true; mouthPulse(1); c.hum?.pulse(1); };
        u.onend = u.onerror = () => { if (talking !== c) return; c.hum?.stop(); c.hum = null; c.spoken = true; maybeDone(); };
        // iOS: soms komt onstart nooit (spraak niet ontgrendeld) → val terug op een stille mond.
        c.timers.push(setTimeout(() => { if (!started && talking === c) { c.utt.onend = c.utt.onerror = c.utt.onboundary = c.utt.onstart = null; try { synth.cancel(); } catch {} c.spoken = true; const { times } = wordTimes(text, 1.1); times.forEach(s => c.timers.push(setTimeout(() => talking === c && mouthPulse(0.8), s * 1000))); maybeDone(); } }, 1600));
        const go = () => { if (talking === c) { try { synth.speak(u); } catch { c.spoken = true; } } };
        if (synth.speaking || synth.pending) { try { synth.cancel(); } catch {} c.timers.push(setTimeout(go, 80)); } else go();
        c.timers.push(setTimeout(() => { if (talking === c) { c.spoken = true; maybeDone(); } }, 20000)); // vangnet
      }
      function maybeDone() {
        if (talking !== c || !c.typed || !c.spoken || c.closing) return;
        c.closing = true;
        const left = Math.max(1400, minMs - (now() - c.shownAt));
        c.timers.push(setTimeout(() => { if (talking === c) stopTalking(true); }, left));
      }
      kick(minMs + 600);
    });
  }
  function mouthPulse(s = 1) { S.talk = Math.max(S.talk, s); kick(500); }

  // ---- reacties
  const lastSaid = {};
  function lineFor(kind, extra = {}) {
    const k = kind;
    const gap = { tik: 6000, fout: 15000, stilte: 0, hint: 4000, goed: 3000, start: 0, aankomst: 0 }[k] ?? 0;
    if (lastSaid[k] && now() - lastSaid[k] < gap) return null;
    const naam = extra.naam ?? (isJarige(inner.lastBy) ? jarigeNaam() : null);
    const l = pickLine(k, { mood, naam });
    if (!l) return null;
    lastSaid[k] = now();
    return fill(l, { naam, hints: hintCount() });
  }
  function react(kind, { line = true } = {}) {
    const t = now();
    if (kind === 'tik') {
      audio.play('giggle'); audio.buzz(15);
      S.hop = { t0: t, h: 10 }; S.sqV += 1.6; S.expr = { kind: 'tik', until: t + 900 };
      if (mood === 'slaap') S.expr = null;
    } else if (kind === 'fout') {
      audio.play('fout'); S.shake = t; S.expr = { kind: 'fout', until: t + 1600 };
    } else if (kind === 'goed') {
      S.hop = { t0: t + (S.landing ? 1500 : 0), h: 18 }; S.expr = { kind: 'goed', until: t + 1300 };
      if (S.landing) line = false; // de landing zegt zelf iets
    } else if (kind === 'hint') {
      S.expr = { kind: 'hint', until: t + 2200 };
    } else if (kind === 'start') {
      S.expr = { kind: 'start', until: t + 1500 }; S.hop = { t0: t + 900, h: 20 }; S.sqV -= 1.2;
    } else return;
    kick(2600);
    if (line && (kind !== 'tik' || !talking)) {
      const l = lineFor(kind);
      if (l) setTimeout(() => say(l, { auto: true }), kind === 'start' ? 700 : 250);
    }
  }

  // ---- koppeling met het spel (pkm.router / pkm.state), als die er is
  let lastActivity = now(), silentCount = 0;
  const inner = {
    lastBy: null,
    activity() { lastActivity = now(); silentCount = 0; },
  };
  function hintCount() { const g = globalThis.pkm?.state?.get?.().game; return g?.hints ?? inner.localHints ?? 0; }
  const offs = [];
  const seenMoves = new Map();
  async function checkWrong(ps) {
    try {
      if (!ps?.stop_id) return;
      const n = ps.moves?.length || 0, prev = seenMoves.get(ps.stop_id); seenMoves.set(ps.stop_id, n);
      if (prev == null || n <= prev) return;
      const last = ps.moves[n - 1]; if (!['answer', 'choose'].includes(last?.t)) return;
      const st = globalThis.pkm.state.stop(ps.stop_id);
      const cfg = st?.puzzles?.[ps.variant] ?? st?.puzzles?.[0]; if (!cfg || !['vraag', 'code', 'keuze'].includes(cfg.type)) return;
      const mod = (await import(new URL(`./puzzles/${cfg.type}.js`, import.meta.url).href)).default;
      const ctx = { seed: ps.seed, variant: ps.variant, players: globalThis.pkm.state.get().players, phones: globalThis.pkm.state.phones?.() || 1 };
      const data = ps.moves.reduce((d, mv) => mod.reduce(d, mv, ctx), mod.init(cfg, ctx));
      if (!mod.isSolved(data, cfg, ctx)) react('fout');
    } catch (e) { console.warn('[monster] fout-check', e); }
  }
  let hookTries = 0;
  const hookTimer = setInterval(() => {
    const pk = globalThis.pkm;
    if (!pk?.router || !pk?.state) { if (++hookTries > 240) clearInterval(hookTimer); return; }
    clearInterval(hookTimer);
    if (pk.mon && pk.mon.el !== el) return; // alleen het monster van de app luistert mee
    const r = pk.router, s = pk.state;
    offs.push(r.on('*', () => inner.activity()));
    offs.push(r.on('stop.arrived', () => { const l = lineFor('aankomst'); if (l) setTimeout(() => say(l, { auto: true }), 600); }));
    offs.push(r.on('stop.solved', p => { inner.lastBy = p?.by || null; }));
    offs.push(r.on('hint.given', p => { inner.localHints = (inner.localHints || 0) + 1; react('hint', { line: !p?.text }); }));
    offs.push(s.on('puzzle', ps => checkWrong(ps)));
    seenMoves.set(s.get().puzzle?.stop_id, s.get().puzzle?.moves?.length || 0);
  }, 500);
  const onKey = () => inner.activity();
  addEventListener('keydown', onKey, true);
  const silenceTimer = setInterval(() => {
    const g = globalThis.pkm?.state?.get?.().game;
    if (!g || !['onderweg', 'puzzel', 'finale'].includes(g.phase)) { lastActivity = now(); return; }
    if (document.visibilityState === 'hidden' || !el.isConnected || talking) return;
    if (now() - lastActivity > SILENCE_MS && silentCount < 3) {
      silentCount++; lastActivity = now();
      const l = lineFor('stilte'); if (l) say(l, { auto: true });
    }
  }, 5000);

  // ---- publieke API
  const api = {
    el,
    setParts(list, { land } = {}) {
      const next = new Set((list || []).filter(p => PART_KEYS.includes(p)));
      if (land && PART_KEYS.includes(land)) next.add(land);
      const same = next.size === parts.size && [...next].every(p => parts.has(p));
      if (!same) { parts.clear(); next.forEach(p => parts.add(p)); applyParts(); }
      if (land && PART_KEYS.includes(land)) startLanding(land);
      kick(400);
    },
    setMood(md) {
      if (!MOODS.includes(md) || md === mood) return;
      mood = md;
      el.classList.remove(...MOODS); el.classList.add(mood);
      S.bru = { phase: 'snap', until: now() + 1200, dir: 1 }; S.nextSpin = now() + 1500;
      if (mood === 'wakker') S.nextBlink = now() + 300;
      kick(1500);
    },
    setSize(z) {
      if (!['sm', 'md', 'lg'].includes(z) || z === size) return;
      el.classList.remove(size); size = z; el.classList.add(size);
      requestAnimationFrame(sizeCanvas);
    },
    say(text, opts) { return say(text, opts); },
    react(kind) { react(kind); },
    /** Extra: zeg een zin uit monster-lines.js ('start', 'stilte', 'deel', …). Voor de testpagina. */
    line(sit, sub) {
      const naam = jarigeNaam();
      const l = sit === 'deel' || sit === 'finaleHints' ? pickLine(sit, { sub, naam }) : pickLine(sit, { mood, naam });
      return l ? say(fill(l, { naam, hints: hintCount() })) : Promise.resolve(false);
    },
    get mood() { return mood; },
    get parts() { return [...parts]; },
    destroy() {
      destroyed = true; stopTalking(false);
      cancelAnimationFrame(raf); raf = 0; clearInterval(hookTimer); clearInterval(silenceTimer);
      offs.forEach(f => { try { f?.(); } catch {} });
      ro?.disconnect(); io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('pointermove', onPointer); removeEventListener('pointerdown', onPointer); removeEventListener('keydown', onKey, true);
      try { reduceMQ.removeEventListener?.('change', onMQ); } catch {}
      el.remove();
    },
  };
  if (Z) build(); else { showFallback(); ready.then(z => { if (z) build(); }); }
  return api;
}

export default createMonster;
