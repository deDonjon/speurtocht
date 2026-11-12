// planning.js — waar staat het team ten opzichte van het schema, en wat kan de regie nu inzetten? (12 nov 2026)
// Pure functies, geen DOM en geen netwerk: regie.js tekent het blok "Stand" en geeft het seintje. Getest in test/node-planning.mjs.
//
// Schema in minuten na de start (draaiboek: start 15:30, thuis ±16:51, hoed vast ±16:56). `aan` = aankomst op de plek,
// `klaar` = onderdeel ingediend. Plek 5 heeft de QR-puzzel (±5 min extra). Aanpassen mag: alleen deze tabel.
export const ORDER = ['lijf', 'ogen', 'neus', 'mond', 'armen', 'benen', 'hoed'];
export const PLAN = {
  lijf:  { aan: 6,  klaar: 13 },
  ogen:  { aan: 19, klaar: 28 },
  neus:  { aan: 31, klaar: 40 },
  mond:  { aan: 44, klaar: 51 },
  armen: { aan: 55, klaar: 65 },
  benen: { aan: 70, klaar: 77 },
  hoed:  { aan: 81, klaar: 86 },
};
export const PLAN_TOTAL = PLAN.hoed.klaar;
export const TANKSTATION = { lat: 51.616805, lng: 5.562375 }; // scoutplek 41, het bord van de Kortsluiting

const ms = v => (v == null ? NaN : typeof v === 'number' ? v : Date.parse(v));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Stand van het spel tegenover het schema.
 *  in:  { phase, parts[], activePart (deel van de actieve plek, leeg bij een bonus), startedAt, arrivedAt (actieve puzzel),
 *         lastSolvedAt (laatst ingediende plek), now }
 *  uit: null vóór de start, anders { elapsed, planNow, lag, rest, eta, done, total, klaar, traag, waar }
 *       lag > 0 = achter op schema, lag < 0 = voor (minuten). rest = minuten tot de hoed vastzit. eta = tijdstip (ms). */
export function stand({ phase, parts = [], activePart = '', startedAt, arrivedAt, lastSolvedAt, now = Date.now() } = {}) {
  const t0 = ms(startedAt);
  if (!phase || phase === 'lobby' || !Number.isFinite(t0)) return null;
  const tNow = ms(now), elapsed = Math.max(0, (tNow - t0) / 60000);
  const found = ORDER.filter(p => parts.includes(p)), done = found.length, total = ORDER.length;
  let solved = ms(lastSolvedAt); if (!(solved >= t0)) solved = NaN; // van een vorig spel = niet meetellen
  if (phase === 'finale' || phase === 'klaar' || parts.includes('hoed')) {
    const dur = Number.isFinite(solved) ? (solved - t0) / 60000 : elapsed;
    return { elapsed, planNow: PLAN_TOTAL, lag: dur - PLAN_TOTAL, rest: 0, eta: Number.isFinite(solved) ? solved : tNow, done: total, total, klaar: true, traag: 0, waar: 'klaar', duur: dur };
  }
  const lastPart = found[found.length - 1] || null;
  const nextPart = ORDER[lastPart ? ORDER.indexOf(lastPart) + 1 : 0] || 'hoed';
  let base, seg, t, waar;
  const arr = ms(arrivedAt);
  if (phase === 'puzzel' && PLAN[activePart] && !parts.includes(activePart)) { // bij de puzzel van een plek met een onderdeel
    base = PLAN[activePart].aan; seg = PLAN[activePart].klaar - base; t = arr >= t0 ? (tNow - arr) / 60000 : 0; waar = 'puzzel';
  } else { // onderweg naar de volgende plek (of bezig met een bonus: die tijd telt als achterstand)
    base = lastPart ? PLAN[lastPart].klaar : 0; seg = PLAN[nextPart].aan - base;
    t = lastPart ? (Number.isFinite(solved) ? (tNow - solved) / 60000 : 0) : elapsed; waar = phase === 'puzzel' ? 'bonus' : 'onderweg';
  }
  t = Math.max(0, t);
  const planNow = base + clamp(t, 0, seg), rest = PLAN_TOTAL - planNow;
  return { elapsed, planNow, lag: elapsed - planNow, rest, eta: tNow + rest * 60000, done, total, klaar: false,
    traag: waar === 'puzzel' && t > seg + 3 ? Math.round(t) : 0, waar, nextPart };
}

/** Wat kan de regie nu inzetten? Lijst van { id, icon, titel, tekst, tab }. Eén verrassing tegelijk: loopt er één, dan geen nieuwe seintjes.
 *  in: { st (uit stand()), phase, parts[], used: { thief, fork, storm, finale }, surprise (kind of leeg), nearTank (true/false/null = geen GPS),
 *        hints (van de actieve puzzel), monteur: { armen: 'Lauren' } } */
export function seintjes({ st, phase, parts = [], used = {}, surprise = '', nearTank = null, hints = 0, monteur = {} } = {}) {
  if (!st || st.klaar) return [];
  const has = p => parts.includes(p), lag = Math.round(st.lag), out = [];
  const onderweg = phase === 'onderweg', vrij = !surprise;
  if (st.traag && !hints) out.push({ id: 'traag-' + parts.length, icon: '💡', titel: `Deze puzzel duurt al ${st.traag} min`, tekst: 'Geef een hint (tab Spel → 💡) of keur de plek goed.', tab: 'spel' });
  if (vrij && onderweg && has('neus') && !has('mond') && !used.fork)
    out.push({ id: 'fork', icon: '📡', titel: 'Nu kan: Dubbel signaal', tekst: lag >= 5 ? `Jullie lopen ${lag} min achter: gerust overslaan.` : 'Op het pad naar de Stadsbrink. Vul twee keuzes in en open hem.', tab: 'verras' });
  if (vrij && onderweg && has('armen') && !has('benen') && !used.thief)
    out.push({ id: 'thief', icon: '🍪', titel: 'Nu kan: de Kruimelaar', tekst: `De armen zitten vast, dus ${monteur.armen || 'de Rekenmeester'} pakt hem terug.${lag >= 8 ? ` Wel ${lag} min achter: houd het bij één of twee punten.` : ''}`, tab: 'verras' });
  if (vrij && has('benen') && !has('hoed') && !used.finale)
    out.push({ id: 'finale', icon: '🔥', titel: 'Nu: Jetpack-timer starten', tekst: 'De benen zitten vast. Zet de timer op ±10 minuten.', tab: 'verras' });
  if ((vrij || surprise === 'finale') && onderweg && has('benen') && !has('hoed') && !used.storm && nearTank !== false) // mag tijdens de timer: de regie zet de timer daarna terug
    out.push({ id: 'storm', icon: '⚡', titel: nearTank ? 'Jullie staan bij het tankstation: Kortsluiting!' : 'Bij het tankstation: Kortsluiting', tekst: 'Start hem zodra ze vóór het bord staan, naast de rijbaan.', tab: 'verras' });
  if (lag <= -5 && has('neus') && !has('benen'))
    out.push({ id: 'bonus-' + parts.length, icon: '⭐', titel: `${-lag} min voor op schema`, tekst: 'Tijd voor een bonusopdracht (tab Bonus).', tab: 'bonus' });
  return out;
}

/** Korte tekst voor de balk en de melding: "+4 min" / "−6 min" / "op schema". */
export function lagText(lag) { const n = Math.round(lag); return Math.abs(n) < 3 ? 'op schema' : n > 0 ? `${n} min achter` : `${-n} min voor`; }
