// navvoice.js — gesproken navigatie: zodra de LED-ogen (deel `ogen`) terug zijn, zegt Mecha-Pof op de radiotelefoon
// hoe ver het nog is en of ze warmer of kouder worden. Zonder ogen zwijgt hij daarover ("alles is zwart").
//
//   const nav = createNavVoice({ mon, state, hasRole, lineText, isBusy });   // index.html
//   nav.destroy()
//   nav.tick(now)   // alleen voor tests: beoordeel de huidige positie meteen
//
// Regels (claude/MECHA-POF-SPEL.md, "Walkie en stem" punt 4):
//   • alleen in fase `onderweg`, alleen op de telefoon met de rol `radio`, alleen als `ogen` in game.parts zit
//   • hooguit één zin per 20 s (MIN_GAP_MS); de eerste pas 6 s na het begin van de etappe, zodat de installatiezin klaar is
//   • warmer/kouder = dichterbij/verder dan bij de vórige zin (geen GPS-gewiebel: verschil ≥ 8 m); anders "gelijk", en dat zeggen we minder vaak
//   • afstand afgerond (10 m onder 100 m, 25 m tot 300 m, daarboven 50 m); GPS slechter dan 40 m telt niet
//   • met de mond (`mond`) er soms een brutalere zin bij
// De zinnen staan in monster-lines.js onder `navigatie` ({afstand}). Gezegd via mon.say(…, { auto: true }): een lopende zin
// (installatie, regiebericht) wordt nooit onderbroken, dan komt de navigatie de volgende keer wel.
const MIN_GAP_MS = 20_000, FIRST_DELAY_MS = 6_000, SAME_GAP_MS = 45_000, MOVE_M = 8, MAX_ACC = 40, NEAR_M = 40, FAR_M = 400;

export function haversine(a, b) {
  const R = 6371000, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
/** Afstand in woorden-vriendelijke stappen: 10 m onder 100, 25 m tot 300, daarboven 50. */
export function roundDist(d) { const step = d < 100 ? 10 : d < 300 ? 25 : 50; return Math.max(step, Math.round(d / step) * step); }

export function createNavVoice({ mon, state, hasRole, lineText, isBusy = () => false, now = () => Date.now() } = {}) {
  let lastSaidAt = 0, lastDist = null, lastSameAt = 0, stopKey = null, legStart = 0, destroyed = false;
  const off = [];

  function reset(key) { stopKey = key; lastDist = null; lastSaidAt = 0; lastSameAt = 0; legStart = now(); }

  /** Kiest de situatie voor deze afstand t.o.v. de vorige zin; null = nu niets zeggen. */
  function situation(d, t) {
    if (d < NEAR_M) return 'dichtbij';
    if (lastDist == null) return d > FAR_M ? 'ver' : 'gelijk';
    const delta = d - lastDist;
    if (delta <= -MOVE_M) return 'warmer';
    if (delta >= MOVE_M) return 'kouder';
    if (t - lastSameAt < SAME_GAP_MS) return null; // "staan jullie stil?" niet elke 20 s
    return 'gelijk';
  }

  function tick(t = now()) {
    if (destroyed) return null;
    const s = state.get(), g = s.game, st = state.activeStop(), pos = s.pos;
    const key = g && st ? g.id + ':' + st.id + ':' + g.active_index : null;
    if (key !== stopKey) reset(key);
    if (!g || g.phase !== 'onderweg' || !st || !pos) return null;
    if (!(g.parts || []).includes('ogen')) return null;          // zonder ogen ziet hij niks
    if (!hasRole('radio') || !state.me().length) return null;   // alleen de radiotelefoon praat
    if (isBusy()) return null;                                   // walkie of oproep open
    if ((pos.acc || 0) > MAX_ACC) return null;
    if (t - legStart < FIRST_DELAY_MS || t - lastSaidAt < MIN_GAP_MS) return null;
    const d = haversine(pos, st);
    const sit = situation(d, t);
    if (!sit) return null;
    const brutaal = (g.parts || []).includes('mond') && (sit === 'warmer' || sit === 'kouder') && Math.random() < 0.3;
    const text = lineText('navigatie', { sub: brutaal ? 'brutaal' : sit, vars: { afstand: roundDist(d) } });
    if (!text) return null;
    lastSaidAt = t; lastDist = d; if (sit === 'gelijk') lastSameAt = t;
    mon?.say(text, { auto: true, ms: 3600 });
    return { sit, d, text };
  }

  off.push(state.on('pos', () => tick()));
  off.push(state.on('game', () => tick()));
  return {
    tick,
    get status() { return { lastSaidAt, lastDist, stopKey }; },
    destroy() { destroyed = true; off.forEach(f => f?.()); },
  };
}
export default createNavVoice;
