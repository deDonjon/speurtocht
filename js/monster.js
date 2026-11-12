// monster.js — het levende monster: Mecha-Pof, de keukenrobot (Zdog, pseudo-3D op een canvas). Zie MECHA-POF.md.
//
// Contract (zie index.html, blok "monster"):
//   createMonster() → { el, setParts(parts, { land }), setMood(mood), setSize('sm'|'md'|'lg'),
//                       say(text, { ms, voice }) → Promise, react('start'|'goed'|'fout'|'hint'|'tik'), destroy() }
//   monsterImage(parts?) → data-URL (stilstaand, voor de schuifpuzzel); monsterImage('mega') → Mega-Mecha-Pof (kaartje, taart)
// Extra (niet nodig voor de app): mon.line(situatie) zegt een zin uit monster-lines.js; lineText(sit, { sub }) geeft alleen de tekst; `ready` is een Promise voor Zdog.
// Standen die uit parts + mood volgen (geen extra API nodig):
//   - hologram: alleen 'lijf' gevonden → het pantser is half doorzichtig cyaan met scanlijnen en een lichtring op de grond
//   - installatie: setParts(parts, { land: deel }) → het deel vliegt van buiten beeld naar zijn plek en klikt vast (vonkjes, 'vast')
//   - Mega-Mecha-Pof: mood 'compleet' + alle zeven delen → groter, jetpack vol, stroopmeter op MEGA, stem met galm (voice.js { galm })
//
// - Eén exemplaar dat de app tussen schermen verhuist; animeert alleen als het in beeld is.
// - prefers-reduced-motion: geen ademen, wiebelen of vallen; alleen wat het kind zelf doet beweegt.
// - Praten: ballon met tikmachinetekst en de echte stem van Mecha-Pof (ElevenLabs, js/voice.js). Lukt dat niet (geen internet),
//   dan de stem van de telefoon (Web Speech, nl-NL, zingerig) met een funky baslijn eronder.
//   Hardop alleen op de telefoon met het laagste device-id dat online is; de rest toont alleen de ballon.
// - Luistert zelf naar pkm.router / pkm.state (als die er zijn): aankomst, hints, foute antwoorden, stilte.
// ?v=… tegen oude bestanden in de cache (GitHub Pages/Safari). Ophogen bij een wijziging, ook in index.html en test/monster.html.
import { hasRole } from './roles.js?v=1';
import { audio } from './audio.js?v=11';
import { LINES, NAAM_JARIGE } from './monster-lines.js?v=13';
import { voice as monsterVoice, uitspraak } from './voice.js?v=7';

const ZDOG_SRC = [
  'https://cdn.jsdelivr.net/npm/zdog@1.1.3/dist/zdog.dist.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/zdog/1.1.3/zdog.dist.min.js',
];
export const PART_KEYS = ['lijf', 'ogen', 'neus', 'mond', 'armen', 'benen', 'hoed'];
export const MOODS = ['slaap', 'wakker', 'nieuwsgierig', 'brutaal', 'compleet'];
const VIEW = 250;            // modelruimte: het monster past in een vak van 250 × 250
const SILENCE_MS = 90_000;
const BG = '#FFF4DF', BG_DARK = '#1C2433';

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
  const b = p(to), mix = a => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(hex || '');
  if (rgba) { const c = mix(rgba.slice(1, 4).map(Number)); return `rgba(${c.join(',')},${rgba[4] ?? 1})`; } // gloed van LED's en vlam
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return '#' + mix(p(hex)).map(v => v.toString(16).padStart(2, '0')).join('');
}
// Donker thema (werkplaats) of licht (crème)? Bepaalt de spookkleur van ontbrekende delen, de schaduw en de achtergrond van het plaatje.
function isDark() {
  try {
    const c = getComputedStyle(document.documentElement).backgroundColor.match(/\d+(\.\d+)?/g);
    if (!c || (c[3] != null && +c[3] === 0)) return false;
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) < 110;
  } catch { return false; }
}
const ghostOf = c => isDark() ? hexMix(c, '#3A4458', 0.78) : hexMix(c, '#EFE2C8', 0.8);
function walk(node, fn) { fn(node); for (const c of node.children || []) walk(c, fn); }
function countShapes(root) { let n = 0; walk(root, x => { if (typeof x.color === 'string') n++; }); return n; }
function setGhost(anchor, on) {
  if (!anchor._orig) {
    anchor._orig = new Map();
    walk(anchor, n => { if (typeof n.color === 'string') anchor._orig.set(n, { color: n.color, backface: n.backface }); });
  }
  anchor._ghost = !!on;
  for (const [n, o] of anchor._orig) {
    n.color = on ? ghostOf(o.color) : o.color;
    if (typeof o.backface === 'string') n.backface = on ? ghostOf(o.backface) : o.backface;
  }
}

// ---------------------------------------------------------------- het model: Mecha-Pof (zie MECHA-POF.md)
// Een keukenrobot: koekenpanhelm met vizier en LED-ogen, pantser van vier pannenkoeken met een stroopmeter,
// spatel- en garde-arm, zuigerbenen in pannetjes en een stroopfles-jetpack met vlam. Hij zweeft.
// Modelruimte zoals altijd: het lichaam staat met de voeten rond y = 100 (grond), z wijst naar de kijker.
// Afwerking (chat 8): klinknagels met glimmertje, glans op staal en pannenkoeken, gloed om de LED's, stoom uit de steel,
// hologram-stand (alleen het pantser gevonden), vlieg-in-installatie per deel en Mega-Mecha-Pof (fase klaar).
const IRON = '#2F3542', IRON_D = '#20252F', IRON_L = '#4A5262', STEEL = '#C9D1D8', STEEL_L = '#EEF2F5', STEEL_D = '#8E979F';
const VISOR = '#12223A', LED = '#7FE8FF', LED_GLOW = 'rgba(127,232,255,0.32)';
const LED_DIM = '#1E4858';          // LED-kleur in de slaapstand (stand-by)
const GLINT = '#F6F8FB';            // glimmertje op staal
const HOLO = [127, 232, 255];       // hologram-cyaan
function buildModel(illo) {
  const TAU = Z.TAU;
  const m = { parts: {}, base: {}, leds2: [], glows: [], holoApplied: -1 };
  // world iets kleiner: Mecha-Pof is langer dan het oude monster (antenne) en zweeft; Mega wordt groter (applyPose)
  m.world = new Z.Anchor({ addTo: illo, translate: { y: -4 }, scale: 0.86 });
  m.shadow = new Z.Ellipse({ addTo: m.world, diameter: 136, rotate: { x: TAU / 4 }, translate: { y: 104 }, stroke: false, fill: true, color: isDark() ? 'rgba(127,232,255,0.13)' : 'rgba(40,40,60,0.16)' });
  // hologram-projector: lichtring op de grond, alleen in de hologram-stand
  m.holoRing = new Z.Ellipse({ addTo: m.world, diameter: 118, rotate: { x: TAU / 4 }, translate: { y: 103 }, stroke: 3, color: 'rgba(127,232,255,0.55)', visible: false });
  m.holoRing2 = new Z.Ellipse({ addTo: m.world, diameter: 90, rotate: { x: TAU / 4 }, translate: { y: 102.5 }, stroke: 1.5, color: 'rgba(127,232,255,0.3)', visible: false });
  m.yaw = new Z.Anchor({ addTo: m.world, translate: { y: 100 } });      // draaipunt op de grond
  m.squash = new Z.Anchor({ addTo: m.yaw });
  const body = new Z.Anchor({ addTo: m.squash, translate: { y: -100 } });
  const part = (key, t, to = body, Kind = Z.Anchor, extra = {}) => { const a = new Kind({ addTo: to, translate: t, ...extra }); m.parts[key] = a; m.base[key] = { x: 0, y: 0, z: 0, ...t }; return a; };
  // LED-kleuren die in de slaapstand dimmen: (shape, aan, uit)
  const led = (shape, lit = LED, dim = LED_DIM) => { m.leds2.push({ s: shape, lit, dim }); return shape; };
  // gloed (rgba) die met de stroom (power) mee ademt: (shape, basisalpha)
  const glow = (shape, alpha, rgb = HOLO) => { m.glows.push({ s: shape, alpha, rgb }); return shape; };
  // Benen en pantser in één Group: vaste tekenvolgorde (benen eerst, dan de platen van onder naar boven),
  // zodat het pantser de bovenkant van de zuigers altijd afdekt.
  const stackG = new Z.Group({ addTo: body });
  // Diepte van de hele stapel = het midden van het lijf (niet het gemiddelde van alle onderdelen, dat schuift door
  // het borstpaneel naar voren). Zo tekenen gezicht en armen vóór het pantser en de jetpack erachter.
  stackG.updateSortValue = function () { Z.Group.prototype.updateSortValue.call(this); this.sortValue = this.renderOrigin.z; };

  // --- zuigerbenen met pannetjes als voeten (eigen Group die op diepte sorteert: het verste been eerst)
  const benen = part('benen', { y: 64 }, stackG, Z.Group, { updateSort: true });
  m.rods = [];
  m.legs = [-1, 1].map(s => {
    const hip = new Z.Anchor({ addTo: benen, translate: { x: 21 * s, z: 2 } });
    const g = new Z.Group({ addTo: hip });
    // pannetje: gietijzer, met een pannenkoek erin en een steeltje naar buiten
    new Z.Ellipse({ addTo: g, diameter: 30, rotate: { x: TAU / 4 }, translate: { y: 29 }, fill: true, stroke: 7, color: IRON_D });
    new Z.Ellipse({ addTo: g, diameter: 31, rotate: { x: TAU / 4 }, translate: { y: 25.6 }, fill: false, stroke: 1.6, color: STEEL_D });
    new Z.Ellipse({ addTo: g, diameter: 21, rotate: { x: TAU / 4 }, translate: { y: 25 }, fill: true, stroke: 3, color: '#F2BE62' });
    new Z.Ellipse({ addTo: g, diameter: 13, rotate: { x: TAU / 4 }, translate: { x: -2, y: 23.4, z: 2 }, fill: true, stroke: 2, color: '#FAD58A' }); // lichte vlek op de pannenkoek
    new Z.Shape({ addTo: g, path: [{ x: 15 * s, y: 26 }, { x: 29 * s, y: 21 }], stroke: 4.5, color: STEEL_D });
    new Z.Shape({ addTo: g, path: [{ x: 16 * s, y: 24.2, z: 1.6 }, { x: 28 * s, y: 19.6, z: 1.6 }], stroke: 1.1, color: GLINT }); // glans op het steeltje
    // stalen zuigerstang (pompt op en neer) in een gietijzeren huls
    const rod = new Z.Anchor({ addTo: g });
    new Z.Shape({ addTo: rod, path: [{ y: -6 }, { y: 16 }], stroke: 9, color: STEEL });
    new Z.Shape({ addTo: rod, path: [{ x: -1.8, y: -4, z: 3.6 }, { x: -1.8, y: 14, z: 3.6 }], stroke: 2.2, color: STEEL_L });
    m.rods.push(rod);
    new Z.Box({ addTo: g, width: 14, height: 11, depth: 14, stroke: 3, translate: { y: 18 }, color: IRON, topFace: IRON_L, leftFace: IRON_D, rightFace: IRON_D, rearFace: IRON_D, bottomFace: false });
    new Z.Shape({ addTo: g, translate: { x: -4, y: 16.5, z: 8.6 }, stroke: 2.2, color: STEEL_D }); // boutje op de huls
    return hip;
  });

  // --- het lijf: nek van gietijzer, pantser van vier pannenkoeken met klinknagels, borstpaneel met stroopmeter
  const lijf = part('lijf', {}, stackG);
  new Z.Box({ addTo: lijf, width: 34, height: 16, depth: 28, stroke: 3, translate: { y: -12 }, color: IRON, topFace: IRON_L, leftFace: IRON_D, rightFace: IRON_D, rearFace: IRON_D, bottomFace: false });
  new Z.Shape({ addTo: lijf, path: [{ x: -13, y: -17 }, { x: 13, y: -17 }], translate: { z: 15.5 }, stroke: 1.3, color: STEEL_D }); // randje op de nek
  const D = [124, 118, 112, 104], Y = [52, 34, 16, -2];          // van onder naar boven
  const FACE = ['#F3BE55', '#F7CC6E', '#EDB44A', '#F9D27A'];
  const RIM = ['#B96E24', '#C9792C', '#B46A22', '#D0842F'];
  const RIM_L = ['#D9924A', '#E39E55', '#D68E46', '#E8A85E'];
  const SHEEN = ['#F8D27E', '#FADC92', '#F4C86F', '#FCE3A0'];
  m.rivets = [];
  m.cakes = D.map((d, i) => {
    const c = new Z.Anchor({ addTo: lijf, translate: { y: Y[i] } });
    new Z.Ellipse({ addTo: c, diameter: d, rotate: { x: TAU / 4 }, translate: { y: 4 }, fill: true, stroke: 10, color: RIM[i] });
    new Z.Ellipse({ addTo: c, diameter: d - 2, rotate: { x: TAU / 4 }, translate: { y: -3.5 }, fill: true, stroke: 9, color: FACE[i] });
    // glans: lichte boog op de bovenrand (linksvoor) en een zachte vlek op het blad
    new Z.Ellipse({ addTo: c, diameter: d + 4, quarters: 1, rotate: { x: TAU / 4, z: TAU / 2 + 0.35 }, translate: { y: -4.6 }, stroke: 2.4, color: RIM_L[i] });
    new Z.Ellipse({ addTo: c, diameter: d * 0.4, rotate: { x: TAU / 4 }, translate: { x: -d * 0.12, y: -8.2, z: d * 0.18 }, fill: true, stroke: 2, color: SHEEN[i] }); // dekkend: goedkoper dan rgba
    const R = d / 2 + 5;
    for (let k = 0; k < 8; k++) {
      const a = (k + (i % 2) * 0.5) / 8 * TAU;
      const p = { x: Math.sin(a) * R, y: 1.5, z: Math.cos(a) * R };
      const s = new Z.Shape({ addTo: c, translate: p, stroke: 4.6, color: '#A9B2BB' });
      const g = new Z.Shape({ addTo: c, translate: { x: p.x - Math.cos(a) * 0.9 - 0.4, y: 0.3, z: p.z + Math.sin(a) * 0.9 + 1.2 }, stroke: 1.5, color: GLINT });
      m.rivets.push({ a, s, g });
    }
    return c;
  });
  // borstpaneel (alleen van voren te zien; zie applyPose)
  m.panel = new Z.Group({ addTo: lijf, translate: { y: 25, z: 61 } });
  new Z.Box({ addTo: m.panel, width: 32, height: 28, depth: 5, stroke: 3, color: IRON, frontFace: '#394050', leftFace: IRON_D, rightFace: IRON_D, topFace: IRON_L, bottomFace: IRON_D, rearFace: false });
  new Z.Rect({ addTo: m.panel, width: 33, height: 29, translate: { z: 4.2 }, stroke: 1.3, color: STEEL_D });
  new Z.Shape({ addTo: m.panel, path: [{ x: -15, y: -13.2 }, { x: 9, y: -13.2 }], translate: { z: 4.6 }, stroke: 1, color: GLINT }); // glans op de bovenrand
  [[-13.5, -11.5], [13.5, -11.5], [-13.5, 11.5], [13.5, 11.5]].forEach(([x, y]) => new Z.Shape({ addTo: m.panel, translate: { x, y, z: 4.6 }, stroke: 2.2, color: '#A9B2BB' })); // schroefjes
  new Z.Ellipse({ addTo: m.panel, diameter: 17, translate: { y: 1, z: 4.4 }, fill: true, stroke: 1.8, color: '#0E1B2E' });
  new Z.Ellipse({ addTo: m.panel, diameter: 18.5, translate: { y: 1, z: 4.6 }, stroke: 1.2, color: STEEL_D });
  // wijzerplaat: oranje boog van 9 over 12 naar 3 uur, rood van 1 tot 3 uur (Zdog: quarters tellen vanaf 12 uur met de klok mee)
  m.gaugeArc = new Z.Ellipse({ addTo: m.panel, diameter: 12, quarters: 2, rotate: { z: -TAU / 4 }, translate: { y: 1, z: 5 }, stroke: 2.2, color: '#F59E2E' });
  m.gaugeRed = new Z.Ellipse({ addTo: m.panel, diameter: 12, quarters: 1, rotate: { z: 0.5 }, translate: { y: 1, z: 5.2 }, stroke: 2.2, color: '#E0473C' });
  m.gauge = new Z.Anchor({ addTo: m.panel, translate: { y: 1, z: 5.6 } });
  led(new Z.Shape({ addTo: m.gauge, path: [{ y: 0 }, { y: -6.5 }], stroke: 1.6, color: LED }));
  led(new Z.Shape({ addTo: m.panel, translate: { y: 1, z: 5.8 }, stroke: 3, color: LED }));
  m.stroopLine = led(new Z.Shape({ addTo: m.panel, path: [{ x: -6, y: 9.5 }, { x: 6, y: 9.5 }], translate: { z: 4.6 }, stroke: 1.6, color: '#5FC9E0' }), '#5FC9E0', '#1E4858');
  // MEGA in LED-letters (alleen bij Mega-Mecha-Pof, op de plek van het STROOP-streepje)
  m.megaText = new Z.Group({ addTo: m.panel, translate: { y: 9.6, z: 4.8 }, visible: false });
  const L = (pts, dx) => new Z.Shape({ addTo: m.megaText, path: pts.map(p => ({ x: p[0] + dx, y: p[1] })), closed: false, stroke: 0.9, color: '#FF5A4E' });
  L([[0, 2], [0, -2], [1.4, 0.2], [2.8, -2], [2.8, 2]], -8.4);                       // M
  L([[2.6, -2], [0, -2], [0, 2], [2.6, 2]], -4.2); L([[0, 0], [1.8, 0]], -4.2);      // E
  L([[2.6, -2], [0, -2], [0, 2], [2.6, 2], [2.6, 0], [1.4, 0]], 0.2);                // G
  L([[0, 2], [1.4, -2], [2.8, 2]], 4.6); L([[0.6, 0.6], [2.2, 0.6]], 4.6);           // A
  m.leds = [[-11, '#2B5C3D', '#4ADE80'], [11, '#5C2320', '#FF5A4E']].map(([x, dim, lit]) => {
    new Z.Shape({ addTo: m.panel, translate: { x, y: -9.5, z: 4.6 }, stroke: 3.6, color: dim });
    return new Z.Shape({ addTo: m.panel, translate: { x, y: -9.5, z: 5 }, stroke: 3.6, color: lit });
  });
  m.syrupDrips = []; // (het oude monster had stroopdruppels; Mecha-Pof niet)
  // hologram-scanlijnen: drie cyaan lijnen die over het pantser omlaag lopen (alleen in de hologram-stand)
  m.scan = [0, 1, 2].map(i => ({ i, s: new Z.Shape({ addTo: lijf, path: [{ x: -58 }, { x: 58 }], translate: { z: 58 }, stroke: 1.2, color: 'rgba(200,250,255,0.55)', visible: false }) }));

  // --- het hoofd: ogen (helm), neus en mond hangen aan één anker dat kan knikken (headTilt)
  const HY = -50;
  m.head = new Z.Anchor({ addTo: body, translate: { y: HY } });
  // --- de koekenpanhelm met vizier, LED-ogen, steel en antenne (= de ogen)
  const ogen = part('ogen', {}, m.head);
  new Z.Hemisphere({ addTo: ogen, diameter: 82, rotate: { y: TAU / 2 }, translate: { z: 1 }, color: '#262B36', backface: IRON_L, stroke: 2 });
  // De voorkant van de pan telt voor de diepte iets verder naar achter: anders schuiven neus en rooster
  // (onderaan het gezicht, door de kijkhoek net iets dieper) er bij sommige houdingen achter.
  const sink = (sh, dz = 6) => { const f = sh.updateSortValue; sh.updateSortValue = function () { f.call(this); this.sortValue -= dz; }; return sh; };
  sink(new Z.Ellipse({ addTo: ogen, diameter: 82, translate: { z: 4 }, fill: true, stroke: 8, color: IRON }));
  sink(new Z.Ellipse({ addTo: ogen, diameter: 89, translate: { z: 4 }, stroke: 3.2, color: STEEL_D }));
  sink(new Z.Ellipse({ addTo: ogen, diameter: 70, translate: { z: 8.4 }, stroke: 1.4, color: '#4A5058' }));
  new Z.Ellipse({ addTo: ogen, diameter: 80, quarters: 1, rotate: { z: TAU / 2 + 0.25 }, translate: { z: 8.8 }, stroke: 2.2, color: '#8A929E' }); // glans linksboven op de pan
  new Z.Ellipse({ addTo: ogen, diameter: 88, quarters: 1, rotate: { z: TAU / 2 + 0.3 }, translate: { z: 5.2 }, stroke: 1.4, color: GLINT });     // glimmer op de stalen rand
  new Z.Ellipse({ addTo: ogen, width: 22, height: 9, rotate: { z: 0.5 }, translate: { x: -20, y: -24, z: 8.6 }, fill: true, stroke: 1, color: '#3B4250' }); // zachte lichtvlek
  // steel van de pan, schuin naar rechtsboven en een beetje naar achter
  const tip = { x: 76, y: -32, z: -10 };
  new Z.Shape({ addTo: ogen, path: [{ x: 36, y: -14, z: -1 }, tip], stroke: 10, color: IRON });
  new Z.Shape({ addTo: ogen, path: [{ x: 40, y: -18, z: 2.5 }, { x: 73, y: -35.5, z: -6 }], stroke: 2.2, color: STEEL_D });
  new Z.Shape({ addTo: ogen, path: [{ x: 44, y: -20.5, z: 3.6 }, { x: 62, y: -29.5, z: -0.5 }], stroke: 0.9, color: GLINT });
  new Z.Shape({ addTo: ogen, translate: tip, stroke: 11, color: IRON_L });                          // knop aan het eind van de steel
  new Z.Shape({ addTo: ogen, translate: { x: 75, y: -33.5, z: -6.5 }, stroke: 3, color: STEEL_D });
  m.steam = [0, 1, 2, 3].map(i => ({ i, s: new Z.Shape({ addTo: ogen, translate: tip, stroke: 4, color: 'rgba(222,230,240,0.6)' }) }));
  // vizier met gloed eromheen
  m.visorGlow = glow(new Z.RoundedRect({ addTo: ogen, width: 70, height: 29, cornerRadius: 13, translate: { y: -4, z: 9.1 }, stroke: 6, color: 'rgba(127,232,255,0.16)' }), 0.16);
  new Z.RoundedRect({ addTo: ogen, width: 66, height: 25, cornerRadius: 11, translate: { y: -4, z: 9.4 }, fill: true, stroke: 2, color: VISOR });
  led(new Z.RoundedRect({ addTo: ogen, width: 67, height: 26, cornerRadius: 11.5, translate: { y: -4, z: 9.9 }, stroke: 2, color: LED }));
  new Z.Shape({ addTo: ogen, path: [{ x: -24, y: -12.5 }, { x: 16, y: -12.5 }], translate: { z: 10.1 }, stroke: 1.6, color: '#2A3F5E' });
  m.eyes = [-1, 1].map(s => {
    const a = new Z.Anchor({ addTo: ogen, translate: { x: 15 * s, y: -4, z: 11 } });
    const g = new Z.Group({ addTo: a });
    const ball = new Z.Group({ addTo: g });
    const pupil = new Z.Anchor({ addTo: ball });
    const halo = glow(new Z.Shape({ addTo: pupil, path: [{ x: -3 }, { x: 3 }], translate: { z: -0.2 }, stroke: 24, color: 'rgba(127,232,255,0.13)' }), 0.13);
    glow(new Z.Shape({ addTo: pupil, path: [{ x: -4 }, { x: 4 }], stroke: 14, color: LED_GLOW }), 0.32);
    led(new Z.Shape({ addTo: pupil, path: [{ x: -4.5 }, { x: 4.5 }], translate: { z: 0.4 }, stroke: 7, color: LED }));
    const glint = new Z.Shape({ addTo: pupil, path: [{ x: -2.5 }, { x: 2.5 }], translate: { y: -0.6, z: 0.8 }, stroke: 2.6, color: '#FFFFFF' });
    // stand-by-lampje (vizier uit: slapen of knipperen)
    const sb = new Z.Shape({ addTo: g, translate: { z: 0.5 }, stroke: 3, color: LED, visible: false });
    const sbGlow = new Z.Shape({ addTo: g, translate: { z: 0.3 }, stroke: 9, color: 'rgba(127,232,255,0.18)', visible: false });
    // lamel die als ooglid omlaag schuift
    const lid = new Z.Group({ addTo: g, translate: { y: -11.5, z: 1.6 }, scale: { y: 0.001 }, visible: false });
    new Z.Rect({ addTo: lid, width: 29, height: 23, translate: { y: 11.5 }, fill: true, stroke: 1, color: '#0B1626' });
    new Z.Shape({ addTo: lid, path: [{ x: -14.5, y: 23 }, { x: 14.5, y: 23 }], stroke: 2, color: STEEL_D });
    // blije LED-boogjes ^ ^
    const arcGlow = glow(new Z.Shape({ addTo: g, path: [{ x: -6, y: 2.5 }, { bezier: [{ x: -3.5, y: -4.5 }, { x: 3.5, y: -4.5 }, { x: 6, y: 2.5 }] }], closed: false, translate: { y: 1, z: 0.4 }, stroke: 9, color: 'rgba(127,232,255,0.22)', visible: false }), 0.22);
    const arc = new Z.Shape({ addTo: g, path: [{ x: -6, y: 2.5 }, { bezier: [{ x: -3.5, y: -4.5 }, { x: 3.5, y: -4.5 }, { x: 6, y: 2.5 }] }], closed: false, translate: { y: 1, z: 0.6 }, stroke: 3.4, color: LED, visible: false });
    // stalen wenkbrauw-lamel boven het vizier
    const brow = new Z.Group({ addTo: g, translate: { y: -18, z: -0.5 } });
    new Z.Shape({ addTo: brow, path: [{ x: -10 }, { x: 10 }], stroke: 3.6, color: STEEL_D });
    new Z.Shape({ addTo: brow, path: [{ x: -9, y: -0.8, z: 1 }, { x: 9, y: -0.8, z: 1 }], stroke: 1.2, color: STEEL_L });
    return { s, a, ball, pupil, glint, lid, arc, arcGlow, brow, sb, sbGlow, halo };
  });
  // antenne met knipperlampje
  new Z.Shape({ addTo: ogen, path: [{ x: 9, y: -40, z: -2 }, { x: 9, y: -57, z: -2 }], stroke: 3, color: STEEL_D });
  new Z.Shape({ addTo: ogen, path: [{ x: 8.2, y: -41, z: -1 }, { x: 8.2, y: -55, z: -1 }], stroke: 0.9, color: GLINT });
  new Z.Shape({ addTo: ogen, translate: { x: 9, y: -61, z: -2 }, stroke: 7, color: '#8E2A22' });
  m.lamp = new Z.Group({ addTo: ogen, translate: { x: 9, y: -61, z: -1.5 } });
  new Z.Shape({ addTo: m.lamp, stroke: 15, color: 'rgba(224,71,60,0.3)' });
  new Z.Shape({ addTo: m.lamp, stroke: 7, color: '#FF5A4E' });
  new Z.Shape({ addTo: m.lamp, translate: { x: -1, y: -1, z: 2 }, stroke: 2, color: '#FFC4BC' });

  // --- aardbei-knop (neus)
  const neus = part('neus', { y: 16, z: 10 }, m.head);
  m.noseIn = new Z.Anchor({ addTo: neus });
  m.noseGlow = new Z.Shape({ addTo: m.noseIn, translate: { z: 1 }, stroke: 18, color: 'rgba(255,90,78,0.35)', visible: false });
  new Z.Ellipse({ addTo: m.noseIn, diameter: 12.5, translate: { z: 1 }, stroke: 2.4, color: STEEL_D });
  new Z.Ellipse({ addTo: m.noseIn, diameter: 12.5, quarters: 1, rotate: { z: TAU / 2 + 0.3 }, translate: { z: 1.6 }, stroke: 1, color: GLINT });
  new Z.Shape({ addTo: m.noseIn, path: [{ y: -0.5 }, { y: 1 }], translate: { z: 3 }, stroke: 10, color: '#E0352B' });
  new Z.Shape({ addTo: m.noseIn, path: [{ x: -2.6, y: -5 }, { x: 0, y: -6.6 }, { x: 2.6, y: -5 }], closed: false, translate: { z: 5 }, stroke: 2, color: '#3C8F5A' });
  new Z.Shape({ addTo: m.noseIn, translate: { x: -2, y: -1.8, z: 7.5 }, stroke: 2.8, color: '#FF9C8C' });
  [[2, 1], [-1, 3], [1.5, -1.5]].forEach(([x, y]) => new Z.Shape({ addTo: m.noseIn, translate: { x, y, z: 7.8 }, stroke: 1.1, color: '#FFE7A0' }));

  // --- luidsprekerrooster (mond): plaatje + 7 LED-streepjes die als VU-meter meebewegen
  const mond = part('mond', { y: 27, z: 10.5 }, m.head);
  m.mouthA = new Z.Anchor({ addTo: mond });
  const mg = new Z.Group({ addTo: m.mouthA });
  m.tongue = new Z.Shape({ addTo: mg, path: [{ x: -10 }, { x: 10 }], translate: { y: 3, z: -0.5 }, stroke: 12, color: 'rgba(127,232,255,0.22)', visible: false });
  m.mouth = new Z.Shape({ addTo: mg, path: mouthPath(0, 0), fill: true, stroke: 3, color: '#0E1B2E' });
  m.mouthRim = new Z.Shape({ addTo: mg, path: mouthPath(0, 0), translate: { z: 0.4 }, stroke: 1.2, color: STEEL_D });
  m.bars = Array.from({ length: 7 }, (_, i) => led(new Z.Shape({ addTo: mg, path: [{ x: -9 + i * 3, y: 0 }, { x: -9 + i * 3, y: 1 }], translate: { z: 1 }, stroke: 1.5, color: LED })));
  m.mouthDrip = new Z.Anchor({ addTo: mg }); // stalen glimlachlijn eronder
  new Z.Shape({ addTo: m.mouthDrip, path: [{ x: -17, y: 5 }, { bezier: [{ x: -10, y: 12 }, { x: 10, y: 12 }, { x: 17, y: 5 }] }], closed: false, translate: { z: -0.6 }, stroke: 1.6, color: STEEL_D });

  // --- armen: links een spatel, rechts een garde
  const armen = part('armen', { y: 8 });
  m.arms = [-1, 1].map(s => {
    const sh = new Z.Anchor({ addTo: armen, translate: { x: 62 * s, z: 2 } });
    const g = new Z.Group({ addTo: sh });
    new Z.Shape({ addTo: g, path: [{ x: 1 * s, y: 4 }, { x: 3 * s, y: 27 }], stroke: 7.5, color: STEEL });
    new Z.Shape({ addTo: g, path: [{ x: 0, y: 6, z: 3 }, { x: 2 * s, y: 25, z: 3 }], stroke: 1.8, color: STEEL_L });
    new Z.Shape({ addTo: g, translate: { x: 3 * s, y: 28 }, stroke: 9, color: IRON });
    new Z.Shape({ addTo: g, translate: { x: 3 * s - 1.5, y: 26.8, z: 3.2 }, stroke: 1.6, color: STEEL_D });
    new Z.Box({ addTo: g, width: 17, height: 13, depth: 17, stroke: 3, color: IRON, topFace: IRON_L, leftFace: IRON_D, rightFace: IRON_D, rearFace: IRON_D, bottomFace: IRON_D });
    new Z.Shape({ addTo: g, path: [{ x: -6, y: -5.2 }, { x: 6, y: -5.2 }], translate: { z: 9.6 }, stroke: 1, color: STEEL_D }); // randje op het schouderblok
    new Z.Shape({ addTo: g, translate: { z: 10 }, stroke: 4, color: '#9AA3AD' });
    new Z.Shape({ addTo: g, translate: { x: -0.8, y: -0.8, z: 10.8 }, stroke: 1.3, color: GLINT });
    const wrist = new Z.Anchor({ addTo: g, translate: { x: 3 * s, y: 28 } });
    if (s < 0) { // spatel
      new Z.Shape({ addTo: wrist, path: [{ y: 2 }, { y: 13 }], stroke: 4, color: STEEL });
      const blade = new Z.Anchor({ addTo: wrist, translate: { y: 13 } });
      new Z.Shape({ addTo: blade, path: [{ x: -6.5, y: 0 }, { x: 6.5, y: 0 }, { x: 9, y: 17 }, { x: -9, y: 17 }], fill: true, stroke: 2.5, color: '#D7DEE4' });
      new Z.Shape({ addTo: blade, path: [{ x: -6.5, y: 1.5 }, { x: -8.2, y: 15 }], translate: { z: 1.3 }, stroke: 1, color: GLINT });
      [-4.5, -1.5, 1.5, 4.5].forEach(x => new Z.Shape({ addTo: blade, path: [{ x, y: 4 }, { x: x * 1.15, y: 14 }], translate: { z: 1.4 }, stroke: 1.3, color: '#6E7780' }));
      m.spatula = wrist;
    } else {     // garde: drie draadlussen die rondjes draaien
      new Z.Shape({ addTo: wrist, path: [{ y: 2 }, { y: 11 }], stroke: 4.5, color: STEEL });
      m.whisk = new Z.Anchor({ addTo: wrist, translate: { y: 24 } });
      for (let k = 0; k < 3; k++) new Z.Ellipse({ addTo: m.whisk, width: 17, height: 27, rotate: { y: k * TAU / 6 }, stroke: 1.5, color: '#B9C3CF' });
      new Z.Shape({ addTo: m.whisk, translate: { y: -13 }, stroke: 5, color: STEEL_D });
    }
    return { s, sh };
  });

  // --- boterknop op de helm + stroopfles-jetpack met vlam (= het hoedje)
  const hoed = part('hoed', { y: HY });
  m.butterPivot = new Z.Anchor({ addTo: hoed }); // knikt mee met het hoofd (headTilt)
  m.hatTilt = new Z.Anchor({ addTo: m.butterPivot, translate: { x: -14, y: -41, z: -4 }, rotate: { y: 0.45, z: -0.14 } });
  m.hatScale = new Z.Anchor({ addTo: m.hatTilt });
  new Z.Box({ addTo: m.hatScale, width: 17, height: 10, depth: 14, stroke: 3, translate: { y: -5 }, color: '#FFE98A', topFace: '#FFF6C6', leftFace: '#F2D35E', rightFace: '#F2D35E', frontFace: '#FFE98A', rearFace: '#F7DE74', bottomFace: false });
  new Z.Ellipse({ addTo: m.hatScale, diameter: 6, quarters: 3, rotate: { z: -TAU / 4 * 1.5 }, translate: { y: -5, z: 8.6 }, stroke: 1.3, color: '#B9902A' });
  new Z.Shape({ addTo: m.hatScale, path: [{ y: -9 }, { y: -5.5 }], translate: { z: 8.8 }, stroke: 1.3, color: '#B9902A' });
  m.butterGlow = new Z.Shape({ addTo: m.hatScale, translate: { y: -5, z: 9 }, stroke: 16, color: 'rgba(255,233,138,0.35)', visible: false }); // knop licht op bij Mega
  // jetpack: schuin op de rug
  const jet = new Z.Anchor({ addTo: hoed, translate: { x: 34, y: 70, z: -52 }, rotate: { z: -0.3 } });
  new Z.Shape({ addTo: jet, path: [{ x: -6, y: -6, z: 10 }, { x: -12, y: -6, z: 22 }], stroke: 4, color: STEEL_D }); // beugel naar het pantser
  new Z.Box({ addTo: jet, width: 20, height: 42, depth: 18, stroke: 5, color: '#A24C14', frontFace: '#7A3410', rearFace: '#B9581A', leftFace: '#6A2C0C', rightFace: '#8A3E12', topFace: '#8A3E12', bottomFace: '#4A1C06' });
  new Z.Shape({ addTo: jet, path: [{ x: -8, y: -18 }, { x: -8, y: 16 }], translate: { z: -11.6 }, stroke: 2.4, color: 'rgba(255,255,255,0.22)' }); // glans op de fles
  new Z.Rect({ addTo: jet, width: 16, height: 15, translate: { y: 2, z: -12 }, fill: true, stroke: 1, color: '#FFF4DF' });
  new Z.Shape({ addTo: jet, path: [{ x: -5, y: 1 }, { x: 5, y: 1 }], translate: { z: -12.6 }, stroke: 2.2, color: '#5A2E12' });
  new Z.Shape({ addTo: jet, path: [{ x: -4, y: 5 }, { x: 4, y: 5 }], translate: { z: -12.6 }, stroke: 1.4, color: '#8A6A4A' });
  new Z.Box({ addTo: jet, width: 12, height: 7, depth: 12, stroke: 2, translate: { y: -26 }, color: '#E0473C', topFace: '#F0645A' });
  new Z.Shape({ addTo: jet, path: [{ y: 24 }, { y: 28 }], stroke: 10, color: STEEL_D });
  new Z.Shape({ addTo: jet, path: [{ x: -3, y: 23.5, z: 3.6 }, { x: -3, y: 28, z: 3.6 }], stroke: 1.2, color: GLINT });
  m.flame = new Z.Anchor({ addTo: jet, translate: { y: 30 } });
  m.puddle = new Z.Shape({ addTo: m.flame, path: [{ y: 4 }, { y: 14 }], stroke: 22, color: 'rgba(245,158,46,0.28)' }); // gloed
  new Z.Cone({ addTo: m.flame, diameter: 13, length: 26, rotate: { x: -TAU / 4 }, stroke: 2, color: '#F59E2E', backface: '#FFB347' });
  new Z.Cone({ addTo: m.flame, diameter: 7, length: 16, rotate: { x: -TAU / 4 }, translate: { z: 0 }, stroke: 1.5, color: '#FFF1A6', backface: '#FFF8D0' });
  // Mega: tweede, bredere vlamkrans en een gloedring onder de robot
  m.megaFlame = new Z.Group({ addTo: m.flame, visible: false });
  new Z.Cone({ addTo: m.megaFlame, diameter: 17, length: 34, rotate: { x: -TAU / 4 }, translate: { y: 2 }, stroke: 1.5, color: 'rgba(245,158,46,0.42)', backface: 'rgba(255,200,90,0.42)' });
  m.megaRing = new Z.Ellipse({ addTo: m.world, diameter: 134, rotate: { x: TAU / 4 }, translate: { y: 103 }, stroke: 3, color: 'rgba(255,200,90,0.3)', visible: false });
  m.butterDrips = [];

  // --- vonkjes en de flits bij het vastklikken
  m.drops = Array.from({ length: 14 }, (_, i) => ({ s: new Z.Shape({ addTo: m.world, stroke: 5, color: i % 3 === 0 ? '#FFFFFF' : i % 2 ? LED : '#FFD25A', visible: false }), vx: 0, vy: 0, vz: 0, life: 0 }));
  m.flash = new Z.Ellipse({ addTo: m.world, diameter: 20, stroke: 3, color: 'rgba(255,255,255,0.8)', visible: false });
  return m;
}
// Het luidsprekerrooster: een afgerond plaatje dat bij `open` dieper wordt (de onderkaak zakt), scheef bij `smirk`.
function mouthPath(open, smirk) {
  const w = 14, yl = -3 + 1.5 * smirk, yr = -3 - 2.5 * smirk, h = 6 + 7 * open;
  return [{ x: -w, y: yl }, { x: w, y: yr }, { x: w, y: yr + h }, { x: -w, y: yl + h }];
}
// Hologram-kleur voor een pantserdeel: cyaan, doorzichtig; lichte vlakken iets feller.
function holoColor(c) {
  let lum = 0.6;
  if (/^#[0-9a-f]{6}$/i.test(c)) { const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16); lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
  const a = 0.18 + 0.42 * lum;
  const t = 0.35 + 0.65 * lum;
  return `rgba(${Math.round(HOLO[0] * t + 20)},${Math.round(HOLO[1] * t + 40)},${Math.round(HOLO[2] * t)},${a.toFixed(2)})`;
}
function setHolo(anchor, on) {
  if (!on) { setGhost(anchor, !!anchor._ghost); return; } // terug naar echt (of spook, als het deel niet gevonden is)
  if (!anchor._orig) setGhost(anchor, false); // vult _orig
  for (const [n, o] of anchor._orig) {
    n.color = holoColor(o.color);
    if (typeof o.backface === 'string') n.backface = holoColor(o.backface);
  }
}

// ---------------------------------------------------------------- pose → model (gedeeld door live monster en stilstaand plaatje)
function neutralPose() {
  return { yaw: 0, lean: 0, hop: 0, sqY: 0, eyeClose: 0, arcHappy: false, lid: 0, gx: 0, gy: 0, mouth: 0.1, smirk: 0,
    browL: 0, browR: 0, cross: 0, armUp: [0, 0], sniff: 0, melt: 0, wobble: 0, t: 0, breath: 0, legKick: 0,
    hover: 0, thrust: 1,        // Mecha-Pof: hover = hoogte boven de grond (negatief = omhoog), thrust = kracht van de vlam
    power: 1, holo: 0, mega: 0, headTilt: 0 }; // power = stroom op de LED's (slaap ≈ 0), holo = hologram, mega = Mega-Mecha-Pof, headTilt = hoofd knikt opzij
}
function applyPose(m, P, parts) {
  const TAU = Z.TAU;
  const mega = clamp(P.mega, 0, 1), power = clamp(P.power, 0, 1), holo = clamp(P.holo, 0, 1);
  m.yaw.rotate.y = P.yaw;
  m.yaw.rotate.x = P.lean;
  m.yaw.translate.y = 100 + P.hop + P.hover;
  const ws = 0.86 + 0.09 * mega;  // Mega is groter
  m.world.scale.set({ x: ws, y: ws, z: ws });
  const sy = 1 + P.breath + P.sqY, sx = 1 - (P.breath + P.sqY) * 0.5;
  m.squash.scale.set({ x: sx, y: sy, z: sx });
  const shadowS = clamp(1 + (P.hop + P.hover) / 140, 0.6, 1.1);
  m.shadow.scale.set({ x: shadowS, y: shadowS, z: shadowS });
  m.head.rotate.z = P.headTilt; m.butterPivot.rotate.z = P.headTilt;
  // klinknagels en borstpaneel alleen aan de kant die je ziet (de platen tekenen in vaste volgorde)
  for (const r of m.rivets) { const v = Math.cos(r.a - P.yaw) > 0.12; r.s.visible = v; r.g.visible = v && Math.cos(r.a - P.yaw + 0.5) > 0.3 && holo < 0.5; }
  m.panel.visible = Math.cos(P.yaw) > 0.18;
  // wiebelende pantserplaten
  m.cakes.forEach((c, i) => { c.translate.x = Math.sin(P.t * 1.7 + i * 0.9) * P.wobble; c.translate.z = Math.cos(P.t * 1.3 + i * 1.4) * P.wobble * 0.6; });
  // stroopmeter en LED'jes: slapen = wijzer in rust, Mega = wijzer trillend in het rood en MEGA in letters
  const rest = -1.35;                                                     // stroom uit: wijzer ligt links
  const swing = Math.sin(P.t * 2.6) * 0.75 + (P.melt > 0 ? 0.45 * P.melt : 0);
  m.gauge.rotate.z = (rest + (swing - rest) * power) * (1 - mega) + mega * (1.3 + 0.1 * Math.sin(P.t * 23)); // Mega: trillend in het rood
  m.gaugeRed.stroke = 2.2 + 1.6 * mega * (0.5 + 0.5 * Math.sin(P.t * 9));
  m.gaugeArc.color = mega > 0.5 ? '#FF8A5A' : '#F59E2E';
  m.megaText.visible = mega > 0.6 && (P.t * 3) % 1 < 0.8;
  m.stroopLine.visible = mega <= 0.6;
  const blink = Math.floor(P.t * (2 + 6 * mega)) % 2;
  m.leds[0].visible = power > 0.5 ? !!blink : (P.t * 0.5) % 1 < 0.12; // slapen: groene LED knippert heel traag
  m.leds[1].visible = power > 0.5 && !blink;
  // LED-kleuren dimmen met de stroom (alleen bijwerken als het merkbaar verandert: geen tekstwerk per beeldje)
  if (Math.abs(power - (m.powerApplied ?? -1)) > 0.015) {
    m.powerApplied = power;
    for (const l of m.leds2) l.s.color = hexMix(l.dim, l.lit, power);
  }
  const breathe = 0.85 + 0.15 * Math.sin(P.t * 1.6);
  const gl = power * breathe * (1 + 0.5 * mega);
  if (Math.abs(gl - (m.glowApplied ?? -1)) > 0.03) {
    m.glowApplied = gl;
    for (const g of m.glows) g.s.color = `rgba(${g.rgb[0]},${g.rgb[1]},${g.rgb[2]},${(g.alpha * gl).toFixed(3)})`;
  }
  // ogen: LED's in het vizier
  const sides = { [-1]: P.browL, 1: P.browR };
  const asleep = P.eyeClose > 0.72;
  for (const e of m.eyes) {
    e.ball.visible = !asleep;
    e.ball.scale.set({ x: 1, y: Math.max(0.06, 1 - 0.94 * P.eyeClose), z: 1 });
    e.pupil.translate.x = P.gx * 8; e.pupil.translate.y = P.gy * 3;
    e.halo.visible = power > 0.3;
    e.arc.visible = asleep && P.arcHappy; e.arcGlow.visible = e.arc.visible;
    e.sb.visible = asleep && !P.arcHappy; e.sbGlow.visible = e.sb.visible;
    const pulse = 0.5 + 0.5 * Math.sin(P.t * 1.6);
    e.sb.stroke = 2.4 + 1.6 * pulse; e.sbGlow.stroke = 7 + 5 * pulse;
    e.lid.visible = P.lid > 0.03 && !asleep;
    e.lid.scale.y = Math.max(0.001, P.lid);
    const r = sides[e.s];
    e.brow.translate.y = -18 - 3.5 * Math.max(0, r) + 2 * Math.max(0, -r);
    e.brow.rotate.z = r < 0 ? -e.s * 0.38 * -r : e.s * 0.12 * r;
  }
  // antennelampje knippert (slapen: uit), stoom uit de steel (meer stoom bij Mega)
  m.lamp.visible = power < 0.4 ? false : (P.t * (1.25 + 2 * mega)) % 1 < 0.55;
  const ogenOn = parts.has('ogen');
  const steamRate = power < 0.4 ? 0.18 : 0.45 + 0.5 * mega;
  for (const st of m.steam) {
    const u = (P.t * steamRate + st.i / 4) % 1;
    st.s.visible = ogenOn && u > 0.06 && (power > 0.4 || st.i === 0);
    if (!st.s.visible) continue;
    const drift = Math.sin(P.t * 1.1 + st.i * 2.1) * 3;
    st.s.translate.set({ x: 76 + u * 9 + drift * u, y: -32 - u * (34 + 10 * mega), z: -10 });
    st.s.stroke = 2 + 8 * u * (1 - u * 0.55) * 2.2 * (1 + 0.3 * mega);
    if (st.i === 0 || Math.floor(P.t * 20) % 4 === st.i) st.s.color = `rgba(222,230,240,${(0.62 * (1 - u) * (0.4 + 0.6 * Math.min(1, u * 5))).toFixed(2)})`;
  }
  // aardbei-knop: wordt ingedrukt en licht op
  const pr = P.sniff * (0.5 + 0.5 * Math.sin(P.t * 19));
  m.noseIn.translate.z = -2.2 * pr;
  m.noseIn.scale.set({ x: 1 + P.sniff * 0.06, y: 1 - 0.08 * pr, z: 1 });
  m.noseGlow.visible = P.sniff > 0.3 && parts.has('neus');
  // rooster: onderkaak zakt en de streepjes worden een VU-meter
  const open = clamp(P.mouth, 0, 1);
  const mp = mouthPath(open, P.smirk);
  m.mouth.path = mp; m.mouth.updatePath();
  m.mouthRim.path = mp; m.mouthRim.updatePath();
  m.mouthA.rotate.z = -0.18 * P.smirk; m.mouthA.translate.x = 3 * P.smirk;
  const h = 6 + 7 * open;
  m.bars.forEach((b, i) => {
    const x = -9 + i * 3, f = (x + 14) / 28, top = (-3 + 1.5 * P.smirk) * (1 - f) + (-3 - 2.5 * P.smirk) * f;
    const lvl = open > 0.15 ? 0.45 + 0.55 * Math.abs(Math.sin(P.t * 21 + i * 1.9)) * (0.6 + 0.4 * open) : power < 0.4 ? 0.25 : 0.55;
    const half = Math.max(0.5, (h / 2 - 2) * lvl), cy = top + h / 2;
    b.path[0].x = b.path[1].x = x; b.path[0].y = cy - half; b.path[1].y = cy + half; b.updatePath();
  });
  m.tongue.visible = open > 0.35 && parts.has('mond');
  m.tongue.translate.y = -3 + h / 2;
  m.mouthDrip.translate.y = 7 * open;
  // armen: rust ↔ over elkaar, plus omhoog (zwaaien); de garde draait, de spatel zwaait; slapen = armen hangen stil
  for (const a of m.arms) {
    const s = a.s, c = P.cross, up = P.armUp[s < 0 ? 0 : 1];
    const sway = (Math.sin(P.t * 2 + s) * 0.08 * (1 - c) + (s < 0 ? Math.sin(P.t * Math.PI) * 0.12 * (1 - c) : 0)) * power;
    a.sh.translate.x = (62 - 20 * c) * s; a.sh.translate.y = 26 * c; a.sh.translate.z = 2 + 50 * c;
    a.sh.rotate.z = s * (-0.35 + 0.3 * (1 - power) + 1.75 * c - 2.4 * up) + s * sway;
    a.sh.rotate.x = 0.95 * c;
  }
  if (m.whisk) m.whisk.rotate.y = P.t * (2 + 8 * power + 10 * mega);
  if (m.spatula) m.spatula.rotate.z = Math.sin(P.t * 3.1) * 0.18 * power;
  // benen: zuigers pompen (sneller bij legKick), heupen schoppen een beetje
  m.legs.forEach((hp, i) => { const s = i ? 1 : -1; hp.rotate.z = s * P.legKick * Math.sin(P.t * 9 + i * Math.PI) * 0.3; });
  m.rods.forEach((r, i) => { r.translate.y = 2 + 2.2 * power * Math.sin(P.t * (3.2 + 9 * P.legKick) + i * Math.PI); });
  // boterknop wordt ingedrukt bij melt (= compleet: jetpack vol aan); vlam flakkert; Mega: knop gloeit en de vlam wordt een krans
  const mt = clamp(P.melt, 0, 1);
  m.hatScale.scale.set({ x: 1 + 0.08 * mt, y: 1 - 0.35 * mt, z: 1 + 0.08 * mt });
  m.butterGlow.visible = mega > 0.3 && (P.t * 4) % 1 < 0.7;
  const fl = (0.86 + 0.14 * Math.sin(P.t * 25) + 0.07 * Math.sin(P.t * 61)) * P.thrust * (1 + 0.7 * mt + 0.6 * mega) * (parts.has('hoed') ? 1 : 0.45);
  m.flame.scale.set({ x: 0.8 + 0.25 * fl, y: Math.max(0.05, fl), z: 0.8 + 0.25 * fl });
  m.megaFlame.visible = mega > 0.2;
  m.megaFlame.scale.set({ x: 0.6 + 0.4 * mega, y: 0.3 + 0.7 * mega * (0.9 + 0.1 * Math.sin(P.t * 31)), z: 0.6 + 0.4 * mega });
  m.megaRing.visible = mega > 0.2;
  const mr = 0.9 + 0.1 * Math.sin(P.t * 5);
  m.megaRing.scale.set({ x: mr * mega, y: 1, z: mr * mega });
  // hologram-stand: pantser doorzichtig cyaan, scanlijnen lopen omlaag, lichtring op de grond, lichte flikker
  const lijfOn = parts.has('lijf');
  const holoOn = holo > 0.02 && lijfOn;
  if (holoOn !== (m.holoApplied === 1) || (holoOn && m.holoForce)) { m.holoForce = false; setHolo(m.parts.lijf, holoOn); m.holoApplied = holoOn ? 1 : 0; }
  m.holoRing.visible = m.holoRing2.visible = holoOn;
  if (holoOn) {
    const flick = 0.75 + 0.25 * Math.sin(P.t * 37) * Math.sin(P.t * 11);
    m.holoRing.scale.set({ x: holo, y: 1, z: holo }); m.holoRing2.scale.set({ x: holo * (0.9 + 0.1 * Math.sin(P.t * 3)), y: 1, z: holo * (0.9 + 0.1 * Math.sin(P.t * 3)) });
    m.holoRing.stroke = 2 + 2 * flick;
    m.parts.lijf.scale.y = 0.97 + 0.03 * Math.sin(P.t * 7) * holo;
    for (const sc of m.scan) {
      const u = (P.t * 0.6 + sc.i / 3) % 1;
      sc.s.visible = true;
      sc.s.translate.set({ x: Math.sin(P.yaw) * 0, y: -12 + u * 72, z: 60 - u * 4 });
      sc.s.stroke = 0.8 + 1.2 * (1 - Math.abs(u - 0.5) * 2) * holo;
    }
  } else { for (const sc of m.scan) sc.s.visible = false; m.parts.lijf.scale.y = 1; }
}

// ---------------------------------------------------------------- stilstaand plaatje (schuifpuzzel)
const imgCache = new Map();
export function monsterImage(parts = PART_KEYS) {
  // monsterImage('mega') → Mega-Mecha-Pof als stilstaand plaatje (kaartje, taart): alle delen, groter, jetpack vol, stroopmeter op MEGA.
  const mega = parts === 'mega';
  const set = new Set(mega ? PART_KEYS : parts), dark = isDark(), key = (mega ? 'MEGA:' : '') + PART_KEYS.filter(p => set.has(p)).join(',') + (Z ? ':z' : ':f') + (dark ? ':d' : '');
  if (imgCache.has(key)) return imgCache.get(key);
  let url;
  if (Z) {
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', 300); svg.setAttribute('height', 300);
      const illo = new Z.Illustration({ element: svg, zoom: 300 / (mega ? 262 : 218), translate: mega ? { y: 8 } : undefined, rotate: { x: -0.25 } }); // iets ingezoomd: minder lege tegels; Mega past net
      const m = buildModel(illo);
      for (const k of PART_KEYS) setGhost(m.parts[k], !set.has(k));
      const P = neutralPose(); P.mouth = 0.25; P.yaw = 0.12; P.hover = -6; P.t = 0.3;
      if (mega) Object.assign(P, { mega: 1, melt: 1, thrust: 1.3, hover: -16, hop: 0, eyeClose: 1, arcHappy: true, mouth: 0.55, legKick: 1, headTilt: 0.06, yaw: 0.18, t: 0.52, armUp: [0.5, 0.65] });
      applyPose(m, P, set);
      illo.updateRenderGraph();
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', -200); r.setAttribute('y', -200); r.setAttribute('width', 400); r.setAttribute('height', 400); r.setAttribute('fill', dark ? BG_DARK : BG);
      svg.insertBefore(r, svg.firstChild);
      if (mega) { // werkplaats-raster achter Mega-Mecha-Pof
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let d = ''; for (let i = -150; i <= 150; i += 50) d += `M-200 ${i}H200M${i} -200V200`;
        g.setAttribute('d', d); g.setAttribute('stroke', dark ? 'rgba(127,232,255,0.14)' : 'rgba(74,37,14,0.12)'); g.setAttribute('fill', 'none');
        svg.insertBefore(g, r.nextSibling);
      }
      url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    } catch (e) { console.warn('[monster] plaatje', e); }
  }
  url = url || 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(flatSvg(set, true, dark));
  imgCache.set(key, url);
  return url;
}
// Plat reservemonster (als Zdog niet laadt): een vereenvoudigde, stilstaande versie van mecha-pof-reference.svg.
function flatSvg(set, bg, dark = isDark()) {
  const o = p => set.has(p) ? '' : ' opacity=".15"';
  const plate = (y, k) => `<g transform="translate(200 ${y}) scale(${k} 1)"><path d="M-96 0V16A96 18 0 0 0 96 16V0Z" fill="#C9792C"/><ellipse rx="96" ry="18" fill="#F2BE62"/><g fill="#9AA3AD"><circle cx="-70" cy="9" r="2.6"/><circle cx="-24" cy="12" r="2.6"/><circle cx="24" cy="12" r="2.6"/><circle cx="70" cy="9" r="2.6"/></g></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">${bg ? `<rect width="300" height="300" fill="${dark ? BG_DARK : BG}"/>` : ''}
<ellipse cx="150" cy="286" rx="78" ry="7" fill="${dark ? '#2A3550' : '#E6D3AE'}"/>
<g transform="translate(26 6) scale(.62)">
<g${o('hoed')}><g transform="rotate(-14 266 332)"><rect x="246" y="300" width="42" height="80" rx="10" fill="#A24C14"/><rect x="251" y="324" width="32" height="30" rx="4" fill="#FFF4DF"/><rect x="256" y="288" width="22" height="14" rx="3" fill="#E0473C"/></g>
<path d="M300 382C292 400 300 424 310 436C320 424 328 400 320 382C316 392 304 392 300 382Z" fill="#F59E2E"/><path d="M305 388C302 400 306 414 310 420C314 414 318 400 315 388Z" fill="#FFF1A6"/>
<rect x="184" y="140" width="26" height="18" rx="4" fill="#FFE98A" stroke="#D9B53E" stroke-width="1.5"/><circle cx="197" cy="150" r="4" fill="none" stroke="#B9902A" stroke-width="1.5"/></g>
<g${o('lijf')}><rect x="150" y="226" width="100" height="22" fill="#2F3542"/>${plate(352, 1.04)}${plate(322, 1)}${plate(292, .96)}${plate(262, .9)}
<rect x="174" y="296" width="52" height="46" rx="8" fill="#2F3542" stroke="#9AA3AD" stroke-width="1.5"/><circle cx="200" cy="318" r="16" fill="#0E1B2E" stroke="#9AA3AD" stroke-width="1.5"/><path d="M188 318A12 12 0 0 1 212 318" fill="none" stroke="#F59E2E" stroke-width="3"/><path d="M200 318L208 310" stroke="#7FE8FF" stroke-width="2" stroke-linecap="round"/><circle cx="182" cy="302" r="2.2" fill="#4ADE80"/><circle cx="218" cy="302" r="2.2" fill="#E0473C"/></g>
<g${o('armen')}><rect x="70" y="262" width="34" height="14" rx="7" fill="#C9D1D8"/><rect x="46" y="256" width="40" height="22" rx="6" fill="#2F3542"/><rect x="40" y="276" width="14" height="60" rx="5" fill="#C9D1D8"/><path d="M22 334H68L72 372H18Z" fill="#D7DEE4" stroke="#4A5058"/><path d="M30 340V366M40 340V366M50 340V366M60 340V366" stroke="#5A636B" stroke-width="1.2"/>
<rect x="296" y="262" width="34" height="14" rx="7" fill="#C9D1D8"/><rect x="314" y="256" width="40" height="22" rx="6" fill="#2F3542"/><rect x="346" y="276" width="14" height="40" rx="5" fill="#C9D1D8"/><g fill="none" stroke="#9AA6B4" stroke-width="2.4"><ellipse cx="353" cy="346" rx="20" ry="30"/><ellipse cx="353" cy="346" rx="12" ry="30"/><ellipse cx="353" cy="346" rx="4" ry="30"/></g></g>
<g${o('benen')}><rect x="160" y="366" width="18" height="36" rx="5" fill="#C9D1D8"/><rect x="222" y="366" width="18" height="36" rx="5" fill="#C9D1D8"/><rect x="154" y="384" width="30" height="22" rx="6" fill="#2F3542"/><rect x="216" y="384" width="30" height="22" rx="6" fill="#2F3542"/>
<path d="M136 420C136 408 150 402 169 402S202 408 202 420V428H136Z" fill="#2F3542"/><path d="M198 420C198 408 212 402 231 402S264 408 264 420V428H198Z" fill="#2F3542"/><path d="M136 410L116 404M264 410L284 404" stroke="#9AA3AD" stroke-width="5" stroke-linecap="round"/><ellipse cx="169" cy="416" rx="20" ry="6" fill="#F2BE62"/><ellipse cx="231" cy="416" rx="20" ry="6" fill="#F2BE62"/></g>
<g${o('ogen')}><path d="M258 178L318 160" stroke="#2F3542" stroke-width="14" stroke-linecap="round"/><circle cx="200" cy="190" r="62" fill="#2F3542" stroke="#9AA3AD" stroke-width="2"/><circle cx="200" cy="190" r="52" fill="none" stroke="#4A5058" stroke-width="2"/>
<rect x="138" y="178" width="124" height="40" rx="14" fill="#12223A" stroke="#7FE8FF" stroke-width="2"/><ellipse cx="172" cy="198" rx="14" ry="8" fill="#7FE8FF"/><ellipse cx="228" cy="198" rx="14" ry="8" fill="#7FE8FF"/><path d="M164 197H180M220 197H236" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
<path d="M200 128V110" stroke="#9AA3AD" stroke-width="3" stroke-linecap="round"/><circle cx="200" cy="106" r="6" fill="#E0473C"/></g>
<g${o('neus')}><circle cx="200" cy="226" r="7" fill="#E0352B" stroke="#9AA3AD" stroke-width="1.5"/></g>
<g${o('mond')}><rect x="168" y="236" width="64" height="12" rx="6" fill="#0E1B2E" stroke="#9AA3AD" stroke-width="1.5"/><path d="M176 239V245M184 239V245M192 239V245M200 239V245M208 239V245M216 239V245M224 239V245" stroke="#7FE8FF" stroke-width="2" stroke-linecap="round"/></g>
</g></svg>`;
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
.pkmon .zzz{position:absolute;right:14%;top:6%;pointer-events:none;display:none;font-family:var(--display,'Lilita One',system-ui,sans-serif);color:#7FE8FF;text-shadow:0 0 8px rgba(127,232,255,.7)}
.pkmon.slaap .zzz{display:block}
.pkmon .zzz b{position:absolute;right:0;top:0;opacity:0;font-weight:400;animation:pkmon-z 3.6s linear infinite}
.pkmon .zzz b:nth-child(2){animation-delay:1.2s;font-size:1.25em}.pkmon .zzz b:nth-child(3){animation-delay:2.4s;font-size:1.5em}
.pkmon.sm .zzz{font-size:11px}.pkmon.md .zzz{font-size:18px}.pkmon.lg .zzz{font-size:22px}
@keyframes pkmon-z{0%{transform:translate(0,10px) rotate(-8deg);opacity:0}15%{opacity:.85}100%{transform:translate(22px,-46px) rotate(10deg);opacity:0}}
.pkmon-bubble{position:fixed;left:12px;top:12px;z-index:60;max-width:min(88vw,380px);background:linear-gradient(180deg,#0E1B2E,#16263F);color:#EAF2FF;border:3px solid #7FE8FF;border-radius:20px;
  padding:12px 16px;font:800 1.05rem/1.35 var(--body,'Nunito',system-ui,sans-serif);box-shadow:0 0 18px rgba(127,232,255,.35),0 10px 30px rgba(0,0,0,.4);
  opacity:0;transform:scale(.85);transform-origin:var(--ox,50%) var(--oy,100%);transition:opacity .18s,transform .22s cubic-bezier(.3,1.6,.5,1);cursor:pointer}
.pkmon-bubble.show{opacity:1;transform:none}
.pkmon-bubble .tail{position:absolute;width:18px;height:18px;background:#16263F;border:3px solid #7FE8FF;border-top:0;border-left:0;left:var(--tx,50%);margin-left:-9px}
.pkmon-bubble.up .tail{bottom:-11px;transform:rotate(45deg)}
.pkmon-bubble.down .tail{top:-11px;transform:rotate(-135deg)}
.pkmon-bubble.free .tail{display:none}
.pkmon-bubble .cur{display:inline-block;width:.5em;color:#7FE8FF;animation:pkmon-blink .7s steps(1) infinite}
@keyframes pkmon-blink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){.pkmon .zzz b{animation:none;opacity:.8;position:static;display:inline}.pkmon-bubble{transition:none}.pkmon-bubble .cur{animation:none}}
`;
  document.head.appendChild(s);
}

// ---------------------------------------------------------------- spraak (Web Speech)
// Stem: het midden tussen man en vrouw. Een vrouwenstem iets omlaag (of een mannenstem iets omhoog) klinkt
// genderneutraal; "funky" komt van een zingerige melodie per zinsdeel en een wah-baslijn eronder (audio.hum).
// Op test/monster.html kies je per toestel een stem en toonhoogte; die keuze staat in localStorage (pkm2_voice).
const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
const VOICE_KEY = 'pkm2_voice';
const FEM = /claire|fenna|colette|ellen|lotte|femke|flo|sandy|shelley|grandma|google|female|vrouw/i;
const MAN = /xander|frank|daan|willem|maarten|arnaud|eddy|reed|rocko|grandpa|male|\bman\b/i;
export const VOICE_DEFAULT = { rate: 1.02, swing: 0.16 }; // swing: hoeveel de toon per zinsdeel op en neer gaat
let nlVoice = null, speechUnlocked = false;
function voicePref() { try { return JSON.parse(localStorage.getItem(VOICE_KEY)) || null; } catch { return null; } }
/** Alle Nederlandse stemmen op dit toestel, beste eerst. */
export function dutchVoices() {
  if (!synth) return [];
  const score = v => (/nl[-_]NL/i.test(v.lang) ? 4 : 0) + (/premium|enhanced|verbeterd|natural|neural|online/i.test(v.name) ? 3 : 0) + (FEM.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0);
  return synth.getVoices().filter(v => /^nl([-_]|$)/i.test(v.lang)).sort((a, b) => score(b) - score(a));
}
/** Basistoon die een stem naar het midden tussen man en vrouw duwt. */
export function middlePitch(v) { return !v ? 1 : FEM.test(v.name) ? 0.8 : MAN.test(v.name) ? 1.25 : 1; }
function pickVoice() {
  if (!synth) return null;
  const pref = voicePref(), vs = dutchVoices();
  nlVoice = (pref?.uri && vs.find(v => v.voiceURI === pref.uri)) || vs[0] || null;
  return nlVoice;
}
function voiceSettings() {
  const v = nlVoice || pickVoice(), pref = voicePref() || {};
  const own = pref.uri && v && pref.uri === v.voiceURI;
  return { voice: v, pitch: own && pref.pitch != null ? +pref.pitch : middlePitch(v), rate: pref.rate != null ? +pref.rate : VOICE_DEFAULT.rate, swing: pref.swing != null ? +pref.swing : VOICE_DEFAULT.swing };
}
/** Bewaar de stemkeuze voor dit toestel (test/monster.html). null = terug naar automatisch. */
export function setVoicePref(p) { try { p ? localStorage.setItem(VOICE_KEY, JSON.stringify(p)) : localStorage.removeItem(VOICE_KEY); } catch {} pickVoice(); }
export function getVoicePref() { return voicePref(); }
// Zin in zinsdelen, elk met een eigen toon: zo klinkt het monster zingerig in plaats van vlak.
function phrases(text) {
  const raw = (text.match(/[^.!?…,;:]+[.!?…,;:]*/g) || [text]).map(t => t.trim()).filter(Boolean);
  const out = [];
  for (const r of raw) { if (out.length && out[out.length - 1].split(/\s+/).length < 3) out[out.length - 1] += ' ' + r; else out.push(r); }
  return out.length ? out : [text];
}
const MELODY = [0, 1, -0.6, 0.7, -0.2, 1.2];
function phraseTone(t, i, base, swing, rate) {
  let p = base + MELODY[i % MELODY.length] * swing, r = rate;
  if (/\?$/.test(t)) p += swing * 1.3;
  if (/!$/.test(t)) { p += swing * 0.8; r *= 1.06; }
  return { pitch: clamp(p, 0.3, 1.9), rate: clamp(r, 0.6, 1.5) };
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
  return { stem: synth ? 'ja' : 'nee (browser kan niet praten)', ontgrendeld: speechUnlocked, nlStem: (nlVoice || pickVoice())?.name || 'geen', toon: +voiceSettings().pitch.toFixed(2), praatHardop: isSpeakerPhone(), bezig: !!synth?.speaking };
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

// Wie praat hardop? De telefoon met de rol `radio` (js/roles.js; roteert per stop). Oude naam blijft bestaan voor test/monster.html.
export function isSpeakerPhone() { return hasRole('radio'); }
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
/** Tekst van een zin uit monster-lines.js zonder hem te zeggen (voor surprises.js, navvoice.js, index.html):
    lineText('kruimelaar', { sub: 'start' }) → ingevulde zin of null. extra: { mood, sub, naam, hints, vars:{afstand:…} }. */
export function lineText(sit, { mood, sub, naam, hints, vars = {} } = {}) {
  const l = pickLine(sit, { mood, sub, naam });
  if (!l) return null;
  return Object.entries(vars).reduce((t, [k, v]) => t.replace(new RegExp('\\{' + k + '\\}', 'g'), String(v)), fill(l, { naam, hints: hints ?? globalThis.pkm?.state?.get?.().game?.hints ?? 0 }));
}
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
  el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Mecha-Pof, de keukenrobot');
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
    live: null, liveOut: 0, liveIn: 0, livePeak: 0, // walkietalkie: fase + volumes (0..1)
    power: 1, holo: 0, holoOn: false, mega: 0, megaOn: false, megaAt: -1e9, flash: null, wakeAt: -1e9, frameMs: 0, // afwerking: stroom, hologram, Mega, flits
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
    const pr = Math.min(window.devicePixelRatio || 1, 2); // 2 is scherp genoeg; 3 (nieuwere iPhones) kost ruim twee keer zoveel pixels
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
    m.holoForce = true; // setGhost zet de echte kleuren terug; de hologram-stand kleurt ze zo nodig opnieuw
    drawOnce();
  }
  const allParts = () => PART_KEYS.every(k => parts.has(k));
  const megaActive = () => S.mega > 0.5;

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
    S.frameMs = lerpK(S.frameMs, now() - t, 3, dt); // gemiddelde rekentijd per beeldje (testpagina)
    raf = requestAnimationFrame(frame);
  }

  // ---- alle beweging per beeldje
  function step(t, dt) {
    const sec = t / 1000, rm = RM(), mv = rm ? 0 : 1;
    P.t = sec;
    // doelen per stemming
    let T = { lean: 0, eyeClose: 0, lid: 0, mouth: 0.1, smirk: 0, browL: 0, browR: 0, cross: 0, breathA: 0.018, breathW: 2.2, wobble: 1.1, legKick: 0, arcHappy: false };
    let gazeMode = 'wander', headTilt = 0;
    S.homeK = 2.5;
    // Vijf stemmingen, elk met een eigen houding:
    //   slaap        op de grond, stroom uit (LED's gedimd, stand-by-lampje pulseert), hoofd zakt opzij, armen hangen, snurkt zachtjes
    //   wakker       rechtop, kijkt rond, knippert, zweeft rustig
    //   nieuwsgierig buigt naar voren, wenkbrauwen omhoog, hoofd schuin, volgt je vinger, drukt op de aardbei-knop
    //   brutaal      armen over elkaar, lamel half dicht, grijns, kijkt weg en dan ineens strak naar je, zweeft iets hoger
    //   compleet     blije ^ ^, stuitert, zuigers pompen, boterknop in; met alle zeven delen → Mega-Mecha-Pof
    if (mood === 'slaap') { Object.assign(T, { eyeClose: 1, lean: 0.08, mouth: 0.18, breathA: 0.03, breathW: 1.25, wobble: 0.5 }); S.yawHome = 0; gazeMode = 'none'; headTilt = 0.11; }
    else if (mood === 'wakker') { S.yawHome = S.gazeT.x * 0.18; headTilt = S.gazeT.x * 0.03; }
    else if (mood === 'nieuwsgierig') {
      Object.assign(T, { lean: -0.14, browL: 0.5, browR: 0.5, mouth: 0.22 });
      gazeMode = t - pointer.t < 3000 ? 'pointer' : 'wander';
      if (t > S.nextSniff) { S.sniffUntil = t + 900; S.nextSniff = t + rnd(1800, 4200); }
      S.yawHome = S.gazeT.x * 0.32;
      headTilt = -0.13 * (S.gazeT.x || Math.sin(sec * 0.7)) - 0.05;
    } else if (mood === 'brutaal') {
      Object.assign(T, { browL: 1, browR: -0.6, smirk: 1, cross: 1, lid: 0.32, mouth: 0.05 });
      if (t > S.bru.until && !S.dragging) {
        if (S.bru.phase === 'snap') { S.bru = { phase: 'away', until: t + rnd(3500, 6500), dir: Math.random() < .5 ? -1 : 1 }; }
        else { S.bru = { phase: 'snap', until: t + 1500, dir: S.bru.dir }; if (!rm) kick(1500); }
      }
      if (S.bru.phase === 'away') { S.yawHome = 0.6 * S.bru.dir; S.gazeT = { x: -0.8 * S.bru.dir, y: -0.2 }; T.lean = 0.05; gazeMode = 'fixed'; headTilt = 0.09 * S.bru.dir; }
      else { S.yawHome = 0; S.homeK = 16; T.lid = 0.62; S.gazeT = { x: 0, y: 0.1 }; gazeMode = 'fixed'; headTilt = -0.06; }
    } else if (mood === 'compleet') {
      Object.assign(T, { eyeClose: 1, arcHappy: true, mouth: 0.7, legKick: 1, wobble: 1.6 });
      S.yawHome = 0; gazeMode = 'none'; headTilt = 0.07 * Math.sin(sec * 4.2) * mv;
      if (parts.has('hoed')) S.melt = rm ? 1 : Math.min(1, S.melt + dt / 7);
      if (t > S.nextSpin) { S.spin0 = t; S.nextSpin = t + rnd(4500, 6500); }
    }
    // stroom (LED's): uit in de slaapstand; bij het wakker worden flikkeren ze even, als een tl-buis
    const powerT = mood === 'slaap' ? 0.06 : 1;
    if (powerT > S.power + 0.3 && S.wakeAt < t - 5000) S.wakeAt = t;
    S.power = rm ? powerT : lerpK(S.power, powerT, mood === 'slaap' ? 1.4 : 4.5, dt);
    const waking = t - S.wakeAt < 900 && !rm;
    P.power = waking ? S.power * (0.55 + 0.45 * Math.abs(Math.sin(sec * 43) * Math.sin(sec * 17))) : S.power;
    // hologram-stand: alleen het pantser gevonden
    const holoT = parts.has('lijf') && parts.size === 1 && !S.landing ? 1 : 0;
    if (holoT && !S.holoOn) audio.play('holo');
    S.holoOn = !!holoT;
    P.holo = rm ? holoT : lerpK(P.holo, holoT, 3, dt);
    // Mega-Mecha-Pof: fase klaar (mood compleet) met alle zeven delen vast
    const megaT = mood === 'compleet' && allParts() && !S.landing ? 1 : 0;
    if (megaT && !S.megaOn) { S.megaAt = t; S.spin0 = t + 500; S.hop = { t0: t + 400, h: 22 }; S.sqV -= 1.6; audio.play('mega'); audio.buzz([60, 40, 60, 40, 120]); burst({ x: 0, y: 20, z: 0 }, 1.4); kick(4000); }
    S.megaOn = !!megaT;
    S.mega = rm ? megaT : clamp(S.mega + (megaT ? dt / 2.4 : -dt / 1.2), 0, 1);
    P.mega = ease(S.mega);
    P.headTilt = lerpK(P.headTilt, headTilt, 5 * (rm ? 60 : 1), dt);
    // tijdelijke uitdrukking (react)
    const ex = S.expr && t < S.expr.until ? S.expr : null;
    let armUp = [0, 0];
    if (ex) {
      if (ex.kind === 'fout') Object.assign(T, { browL: -0.8, browR: -0.8, lid: 0.45, mouth: 0.05, smirk: 0.4, eyeClose: 0 });
      if (ex.kind === 'tik' || ex.kind === 'goed') Object.assign(T, { eyeClose: 1, arcHappy: true, mouth: 0.6, lid: 0 });
      if (ex.kind === 'hint') { Object.assign(T, { browL: 0.9, browR: 0.3, mouth: 0.3, cross: 0, lid: 0 }); S.gazeT = { x: 0.5, y: -0.9 }; gazeMode = 'fixed'; armUp = [0, 0.75 + 0.1 * Math.sin(sec * 10)]; }
      if (ex.kind === 'start') { Object.assign(T, { eyeClose: 0.85, arcHappy: false, mouth: 0.95, cross: 0, lid: 0 }); armUp = [0.85, 0.85]; }
      // walkietalkie: luistert (grote ogen, kijkt naar je, hand bij het 'oor') en denkt (kijkt omhoog, "hmm")
      if (ex.kind === 'luister') { Object.assign(T, { browL: 0.7, browR: 0.7, mouth: 0.08, cross: 0, lid: 0, eyeClose: 0, lean: 0.25 * Math.sin(sec * 2.2) }); S.gazeT = { x: 0, y: 0.25 }; gazeMode = 'fixed'; armUp = [0.55 + 0.25 * S.liveIn, 0]; }
      if (ex.kind === 'denk') { Object.assign(T, { browL: 0.9, browR: 0.2, mouth: 0.12, smirk: 0.3, cross: 0, lid: 0.15 }); S.gazeT = { x: 0.6 * Math.sin(sec * 1.3), y: -0.9 }; gazeMode = 'fixed'; armUp = [0, 0.7 + 0.08 * Math.sin(sec * 6)]; }
      if (ex.kind === 'praat') { Object.assign(T, { browL: 0.3 + 0.5 * S.liveOut, browR: 0.3 + 0.5 * S.liveOut, cross: 0, lid: 0, eyeClose: 0 }); S.gazeT = { x: 0.15 * Math.sin(sec * 0.9), y: 0.1 }; gazeMode = 'fixed'; armUp = [0.35 * S.liveOut, 0.35 * S.liveOut]; }
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
    // zweven op de jetpack: slapen = op de grond met een waakvlammetje, compleet = hoger en vol gas
    const hoverT = mood === 'slaap' ? 0 : -7 - 8 * S.melt - 9 * P.mega + (mood === 'brutaal' ? -4 : 0) + 4 * Math.sin(sec * Math.PI) * mv;
    P.hover = rm ? hoverT : lerpK(P.hover, hoverT, mood === 'slaap' ? 1.5 : 4, dt);
    P.thrust = lerpK(P.thrust, mood === 'slaap' ? 0.3 : 1 + 0.5 * P.mega, 3 * kk, dt);
    // praten: mond per woord
    S.talk = Math.max(0, S.talk - dt * 4.5);
    // live (walkietalkie): de mond volgt het echte volume, zonder het kunstmatige klapperen
    const talkOpen = S.live ? clamp(S.liveOut * 1.35, 0, 1) : S.talk > 0 ? S.talk * (0.55 + 0.45 * Math.abs(Math.sin(sec * 17))) : 0;
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
    if (mood === 'compleet' && mv) { const b = Math.abs(Math.sin(sec * 4.2)), amp = 16 - 10 * P.mega; hop += -amp * b; if (b < 0.3) bounceSq = -0.09 * (1 - P.mega * 0.6) * (1 - b / 0.3); } // Mega vliegt: minder stuiteren, meer zweven
    P.hop = hop;
    // veer: S.sq is de afwijking van de schaal, S.sqV de snelheid
    S.sqV += (-170 * S.sq - 11 * S.sqV) * dt; S.sq += S.sqV * dt; if (rm) { S.sq = 0; S.sqV = 0; }
    P.sqY = S.sq + bounceSq;
    applyPose(m, P, parts);
    landStep(t, dt);
    dropsStep(dt);
  }

  // ---- installatie: het deel vliegt van buiten beeld naar zijn plek (boog, draait om zijn as), klikt vast met een flits,
  //      vonkjes en het geluid 'vast', veert na en de robot zegt er iets over. Gestart door setParts(parts, { land }).
  // Startpunt per deel (in de ruimte van zijn ouder: hoofd of lijf), zo gekozen dat het deel niet door het gezicht vliegt.
  const FLY_FROM = { lijf: { x: -175, y: 10, z: 45 }, ogen: { x: 125, y: -95, z: 35 }, neus: { x: -70, y: -85, z: 75 }, mond: { x: -150, y: 50, z: 70 }, armen: { x: 170, y: -50, z: 50 }, benen: { x: -150, y: 95, z: 60 }, hoed: { x: -135, y: -105, z: -20 } };
  // Middelpunt van het deel (in de ruimte van het lijf), voor vonkjes en flits.
  const PART_CENTER = { lijf: { x: 0, y: 25, z: 30 }, ogen: { x: 0, y: -50, z: 12 }, neus: { x: 0, y: -34, z: 22 }, mond: { x: 0, y: -23, z: 22 }, armen: { x: 0, y: 24, z: 12 }, benen: { x: 0, y: 86, z: 10 }, hoed: { x: -10, y: -90, z: 0 } };
  const qb = (p0, p1, p2, f) => (1 - f) * (1 - f) * p0 + 2 * (1 - f) * f * p1 + f * f * p2;
  function landStep(t) {
    const L = S.landing; if (!L) return;
    const a = m.parts[L.key], b = m.base[L.key];
    const FLY = 780, u = t - L.t0;
    if (RM()) {
      if (!L.hit) { L.hit = true; impact(L, a, b, true); }
      if (u > 300) finishLanding(L);
      return;
    }
    if (u < 0) { a.translate.set(L.from); return; }
    if (u < FLY) {
      const f = ease(u / FLY), sp = 1 - f;
      a.translate.set({ x: qb(L.from.x, L.ctrl.x, b.x, f), y: qb(L.from.y, L.ctrl.y, b.y, f), z: qb(L.from.z, L.ctrl.z, b.z, f) });
      a.rotate.y = L.spinDir * sp * sp * Math.PI * 2;      // draait om zijn as tot hij recht staat
      a.rotate.z = L.spinDir * sp * 0.45;
      const sc = 1.3 - 0.3 * f; a.scale.set({ x: sc, y: sc, z: sc });
      return;
    }
    if (!L.hit) { L.hit = true; impact(L, a, b, false); }
    const v = (u - FLY) / 1000, damp = Math.exp(-7 * v), osc = Math.cos(19 * v);
    a.translate.set(b); a.rotate.z = 0; a.rotate.y = 0;
    a.scale.set({ x: 1 + 0.22 * damp * osc, y: 1 - 0.28 * damp * osc, z: 1 + 0.22 * damp * osc });
    if (v > 0.75) finishLanding(L);
  }
  // Punt in de ruimte van het lijf → wereldruimte (m.world), voor vonkjes en flits.
  function toWorld(p) {
    const c = Math.cos(P.yaw), s = Math.sin(P.yaw), y = p.y + P.hover + P.hop;
    return { x: p.x * c + p.z * s, y, z: -p.x * s + p.z * c };
  }
  // Vonkjes + flits op een punt (lijfruimte). k = kracht.
  function burst(center, k = 1) {
    if (RM()) return;
    const w = toWorld(center), TAU = Math.PI * 2;
    m.drops.forEach((d, i) => {
      const ang = (i / m.drops.length) * TAU + rnd(-0.3, 0.3), sp = rnd(70, 150) * k, up = Math.random() < 0.6;
      d.s.translate.set({ x: w.x + Math.cos(ang) * 5, y: w.y, z: w.z + Math.sin(ang) * 5 + 2 });
      d.vx = Math.cos(ang) * sp; d.vz = Math.sin(ang) * sp * 0.6; d.vy = up ? -rnd(80, 190) * k : -rnd(10, 60); d.life = rnd(0.4, 0.75);
      d.s.stroke = rnd(3, 7); d.s.visible = true;
    });
    m.flash.translate.set({ x: w.x, y: w.y, z: w.z + 30 });
    S.flash = { t0: now(), k };
  }
  function impact(L, a, b, quiet) {
    setGhost(a, false);
    audio.play('vast');
    audio.buzz([30, 30, 60]);
    if (quiet) return;
    S.sqV -= 1.8;     // de hele robot zakt even in
    const c = PART_CENTER[L.key];
    if (L.key === 'armen') { burst({ x: -60, y: 28, z: 10 }, 0.8); setTimeout(() => burst({ x: 60, y: 28, z: 10 }, 0.8), 90); }
    else burst(c, L.key === 'lijf' || L.key === 'benen' ? 1.2 : 1);
  }
  function dropsStep(dt) {
    for (const d of m.drops) {
      if (!d.s.visible) continue;
      d.life -= dt; if (d.life <= 0) { d.s.visible = false; continue; }
      d.vy += 520 * dt; const p = d.s.translate; p.x += d.vx * dt; p.y += d.vy * dt; p.z += d.vz * dt;
      d.s.stroke = Math.max(1, d.s.stroke - dt * 6);
    }
    const F = S.flash;
    if (F) {
      const u = (now() - F.t0) / 380;
      if (u >= 1) { m.flash.visible = false; S.flash = null; }
      else { m.flash.visible = true; const sc = (0.3 + 2.8 * ease(u)) * F.k; m.flash.scale.set({ x: sc, y: sc, z: 1 }); m.flash.stroke = 4 - 3 * u; m.flash.color = `rgba(255,255,255,${(0.9 * (1 - u)).toFixed(2)})`; }
    }
  }
  function finishLanding(L) {
    const a = m.parts[L.key], b = m.base[L.key];
    a.translate.set(b); a.scale.set({ x: 1, y: 1, z: 1 }); a.rotate.z = 0; a.rotate.y = 0;
    S.landing = null; S.landed[L.key] = now();
    S.hop = { t0: now(), h: 14 }; S.expr = { kind: 'goed', until: now() + 900 };
    kick(1200);
    afterLanding(L.key);
  }
  async function afterLanding(key) {
    const naam = isJarige(inner.lastBy) ? jarigeNaam() : null;
    // Na het installatieritueel: de installatiezin (welk vermogen hij terugkrijgt, STORY.md §2); `deel` blijft de reserve.
    const line = pickLine('installatie', { sub: key, naam }) || pickLine('deel', { sub: key, naam });
    const complete = PART_KEYS.every(k => parts.has(k));
    const fin = globalThis.pkm?.finale; // chat 7: de app speelt de finale (Mega 1-2-3, vers, confetti, finale) via js/finale.js
    let ok = true;
    if (line) { ok = await say(fill(line, { naam }), { auto: true, force: true, ...(fin?.voice ? { voice: fin.voice() } : {}) }); if (!ok && !(complete && fin)) return; }
    if (complete && fin) { fin.start({ intro: !ok && line ? fill(line, { naam }) : null }); return; } // niet gezegd (iets anders praatte): de finale begint ermee
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
    const b = m?.base[key] || { x: 0, y: 0, z: 0 }, from = { ...FLY_FROM[key] };
    const ctrl = { x: (from.x + b.x) / 2, y: Math.min(from.y, b.y) - 45, z: (from.z + b.z) / 2 + 25 };
    S.landing = { key, t0: now() + (RM() ? 0 : 120), hit: false, spinDir: Math.random() < .5 ? -1 : 1, from, ctrl };
    if (built) {
      setGhost(m.parts[key], false);
      if (!RM()) { m.parts[key].translate.set(from); audio.play('vlieg'); }
    }
    kick(2400);
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
    c.hum?.stop(); c.player?.stop(); cancelAnimationFrame(c.raf);
    if (c.utts?.length && synth) { for (const u of c.utts) u.onend = u.onerror = u.onboundary = u.onstart = null; try { synth.cancel(); } catch {} }
    if (bubbleOwner === el && bubbleEl) { bubbleEl.classList.remove('show'); bubbleEl.hidden = true; cancelAnimationFrame(bubbleRaf); bubbleRaf = 0; }
    c.resolve(result);
  }
  function say(text, opts = {}) {
    if (typeof opts === 'number') opts = { ms: opts };
    text = String(text ?? '').trim();
    if (!text || destroyed) return Promise.resolve(false);
    if (S.live) return Promise.resolve(false); // walkietalkie is open: het live monster praat zelf
    if (opts.auto && talking && !opts.force) return Promise.resolve(false);
    if (opts.auto && talking && opts.force && !talking.auto) return Promise.resolve(false);
    stopTalking(false);
    const id = ++talkSeq;
    const muteNow = audio.muted();
    const wantVoice = opts.voice === true ? true : opts.voice === false ? false : isSpeakerPhone();
    const voice = wantVoice && !muteNow && (!!synth || monsterVoice.enabled());
    const minMs = opts.ms ?? clamp(text.length * 60 + 1800, 3200, 12000);
    return new Promise(resolve => {
      const c = talking = { id, resolve, timers: [], typer: 0, utts: [], hum: null, auto: !!opts.auto, typed: false, spoken: !voice, shownAt: now() };
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
      // stem: eerst de echte monsterstem (ElevenLabs, js/voice.js), anders de stem van de telefoon
      const speakWeb = () => {
        if (talking !== c) return;
        if (!synth) { c.spoken = true; audio.play('brom'); maybeDone(); return; }
        const vs = voiceSettings(), parts = phrases(text);
        let boundary = false, started = false;
        const detach = () => { for (const x of c.utts) x.onend = x.onerror = x.onboundary = x.onstart = null; };
        const est = () => { if (boundary || talking !== c) return; const { times } = wordTimes(text, vs.rate); times.forEach(s => c.timers.push(setTimeout(() => { if (!boundary && talking === c) { mouthPulse(1); c.hum?.pulse(0.8); } }, s * 1000))); };
        parts.forEach((t, i) => {
          const u = new SpeechSynthesisUtterance(uitspraak(t)), tone = phraseTone(t, i, vs.pitch, vs.swing, vs.rate);
          u.lang = 'nl-NL'; if (vs.voice) u.voice = vs.voice; u.pitch = tone.pitch; u.rate = tone.rate; u.volume = 1;
          if (i === 0) u.onstart = () => { started = true; c.hum = audio.hum(); c.timers.push(setTimeout(est, 450)); };
          u.onboundary = e => { if (e.name && e.name !== 'word') return; boundary = true; mouthPulse(1); c.hum?.pulse(1); };
          const last = i === parts.length - 1;
          u.onend = () => { if (last && talking === c) { c.hum?.stop(); c.hum = null; c.spoken = true; maybeDone(); } };
          u.onerror = () => { if (talking !== c) return; detach(); try { synth.cancel(); } catch {} c.hum?.stop(); c.hum = null; c.spoken = true; maybeDone(); };
          c.utts.push(u);
        });
        // iOS: soms komt onstart nooit (spraak niet ontgrendeld) → val terug op een stille mond.
        c.timers.push(setTimeout(() => { if (!started && talking === c) { detach(); try { synth.cancel(); } catch {} c.spoken = true; const { times } = wordTimes(text, 1.1); times.forEach(s => c.timers.push(setTimeout(() => talking === c && mouthPulse(0.8), s * 1000))); maybeDone(); } }, 1600));
        const go = () => { if (talking !== c) return; try { for (const u of c.utts) synth.speak(u); } catch { c.spoken = true; } };
        if (synth.speaking || synth.pending) { try { synth.cancel(); } catch {} c.timers.push(setTimeout(go, 80)); } else go();
        c.timers.push(setTimeout(() => { if (talking === c) { c.spoken = true; maybeDone(); } }, 30000)); // vangnet
      };
      if (voice && monsterVoice.enabled()) {
        monsterVoice.speak(text, { galm: megaActive() }).then(pl => { // Mega-Mecha-Pof praat met een lichte galm
          if (talking !== c) { pl.stop(); return; }
          c.player = pl; c.hum = null;
          const meter = () => { if (talking !== c || c.spoken) return; const lv = pl.level(); if (lv > 0.08) mouthPulse(Math.min(1, lv * 1.1)); c.raf = requestAnimationFrame(meter); };
          c.raf = requestAnimationFrame(meter);
          pl.done.then(() => { if (talking === c) { c.spoken = true; maybeDone(); } });
          c.timers.push(setTimeout(() => { if (talking === c) { c.spoken = true; maybeDone(); } }, (pl.duration || 20) * 1000 + 3000)); // vangnet
        }, err => { console.warn('[monster] stem → telefoonstem:', err?.message || err); speakWeb(); });
      } else if (voice) speakWeb();
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
    // aankomst: belt Mecha-Pof zelf (inkomende oproep, index.html/walkie.js), dan zegt hij hier niets; de briefing komt via de walkie
    offs.push(r.on('stop.arrived', () => { if (pk.callRinging?.()) return; const l = lineFor('aankomst'); if (l) setTimeout(() => { if (!pk.callRinging?.()) say(l, { auto: true }); }, 600); }));
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
    /** Walkietalkie: elk frame aanroepen met de fase en de volumes (0..1). phase: 'luister'|'denk'|'praat'|null.
        De mond volgt het uitgaande volume; bij een harde piek een klein hupje. null = terug naar normaal. */
    live(phase, { out = 0, in: inp = 0 } = {}) {
      if (!phase) { if (S.live) { S.live = null; S.liveOut = S.liveIn = 0; S.expr = null; kick(300); } return; }
      if (talking) stopTalking(false);
      const t = now();
      S.live = phase;
      S.liveOut = lerpK(S.liveOut, phase === 'praat' ? clamp(out, 0, 1) : 0, out > S.liveOut ? 40 : 14, 1 / 60);
      S.liveIn = lerpK(S.liveIn, phase === 'luister' ? clamp(inp, 0, 1) : 0, 20, 1 / 60);
      S.expr = { kind: phase, until: t + 500 };
      if (phase === 'praat' && out > 0.75 && t - S.livePeak > 900 && !RM()) { S.livePeak = t; S.hop = { t0: t, h: 6 }; }
      if (phase === 'luister' && inp > 0.6 && !RM()) S.sqV += 0.15;
      kick(500);
    },
    react(kind) { react(kind); },
    /** Extra: zeg een zin uit monster-lines.js ('start', 'stilte', 'deel', …). Voor de testpagina. */
    line(sit, sub) {
      const naam = jarigeNaam();
      const l = sub != null ? pickLine(sit, { sub, naam }) : pickLine(sit, { mood, naam });
      return l ? say(fill(l, { naam, hints: hintCount() })) : Promise.resolve(false);
    },
    get mood() { return mood; },
    get parts() { return [...parts]; },
    /** Extra (testpagina): hologram-stand, Mega-Mecha-Pof en de kosten per beeldje. */
    get status() { return { holo: +P.holo.toFixed(2), mega: +P.mega.toFixed(2), power: +P.power.toFixed(2), landing: S.landing?.key || null, frameMs: +S.frameMs.toFixed(2), shapes: m ? countShapes(m.world) : 0 }; },
    get _model() { return m; }, // alleen voor de testpagina
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
