// sync.js (puzzel) — "Gelijkschakelen": alle telefoons drukken precies tegelijk. Zet: { t:'press', pos? }.
// Met 2 of 3 telefoons: elke telefoon een grote knop; het lampje knippert op elke telefoon op dezelfde maat (wandklok).
//   Alle toestellen binnen `window` ms gedrukt = één treffer; `rounds` treffers = opgelost. De tijd komt van de server (move.at).
// Eén telefoon: een lichtbalk zweeft heen en weer; tik als hij in de groene zone staat. `pos` (0–100) gaat mee in de zet,
//   de zone komt uit de seed, dus elke herberekening geeft dezelfde uitkomst.
// Config: { type:'sync', question, question_solo?, window?: 900, rounds?: 2, hint }  (question_solo: tekst voor de 1-telefoonvariant)
import { esc, rng, myDevice, deviceOfMove } from './_shared.js';

const BEAT_MS = 2000, SWEEP_MS = 1800, STALE_MS = 4000;
const at = m => { const t = Date.parse(m.at || ''); return Number.isFinite(t) ? t : Date.now(); };

export default {
  type: 'sync',
  multi: true,
  init(config, ctx) {
    const solo = (ctx.phones | 0) <= 1, r = rng(ctx.seed);
    return { mode: solo ? 'solo' : 'multi', need: Math.max(1, +config.rounds || (solo ? 3 : 2)), window: Math.max(200, +config.window || 900),
      zone: solo ? Math.round(20 + r() * 60) : 50, half: 8, hits: 0, misses: 0, presses: {}, last: null };
  },
  reduce(data, move, ctx) {
    if (move.t !== 'press' || data.hits >= data.need) return data;
    if (data.mode === 'solo') {
      const pos = +move.pos; if (!Number.isFinite(pos)) return data;
      const ok = Math.abs(pos - data.zone) <= data.half;
      return { ...data, hits: data.hits + (ok ? 1 : 0), misses: data.misses + (ok ? 0 : 1), last: { ok, pos } };
    }
    const t = at(move), dev = deviceOfMove(move, ctx);
    let presses = { ...data.presses };
    for (const k of Object.keys(presses)) if (t - presses[k] > STALE_MS) delete presses[k]; // oude drukken tellen niet meer mee
    presses[dev] = t;
    const need = Math.max(2, ctx.phones | 0);
    if (Object.keys(presses).length < need) return { ...data, presses, last: { waiting: need - Object.keys(presses).length } };
    const ts = Object.values(presses), spread = Math.max(...ts) - Math.min(...ts), ok = spread <= data.window;
    return { ...data, presses: {}, hits: data.hits + (ok ? 1 : 0), misses: data.misses + (ok ? 0 : 1), last: { ok, spread } };
  },
  isSolved(data) { return data.hits >= data.need; },
  render(el, data, api) {
    const c = api.config, { n } = myDevice(api), solved = data.hits >= data.need;
    const key = [data.mode, solved].join('|');
    if (el.dataset.key !== key || !el.querySelector('.pz-sync')) {
      el.dataset.key = key; cancelAnimationFrame(el._raf || 0);
      el.innerHTML = `<div class="pz-sync">
        ${c.image ? `<img class="pimg" src="${esc(c.image)}" alt="">` : ''}
        <p class="question">${esc((data.mode === 'solo' && c.question_solo) || c.question || (data.mode === 'solo' ? 'Mecha-Pof moet gelijkgeschakeld worden. Tik precies als het licht in de groene zone staat!' : 'Mecha-Pof moet gelijkgeschakeld worden. Druk op alle telefoons precies tegelijk!'))}</p>
        ${data.mode === 'solo'
          ? `<div class="sweep"><i class="zone"></i><i class="light"></i></div>`
          : `<div class="beat"><i class="lamp"></i><span class="note">Tel samen af en druk als het lampje groen is.</span></div>`}
        ${solved ? '' : `<button class="ok wide press">${data.mode === 'solo' ? '⚡ TIK!' : '⚡ DRUK!'}</button>`}
        <p class="feedback" aria-live="polite"></p>
        <p class="note sync-score"></p></div>`;
      const btn = el.querySelector('.press');
      if (data.mode === 'solo') {
        const zone = el.querySelector('.zone'); zone.style.left = (data.zone - data.half) + '%'; zone.style.width = (data.half * 2) + '%';
        const light = el.querySelector('.light'); const t0 = performance.now();
        const posAt = t => { const u = ((t - t0) % (2 * SWEEP_MS)) / SWEEP_MS; return (u <= 1 ? u : 2 - u) * 100; };
        const tick = t => { light.style.left = posAt(t) + '%'; el._raf = requestAnimationFrame(tick); };
        el._raf = requestAnimationFrame(tick);
        if (btn) btn.onclick = () => api.move({ t: 'press', pos: Math.round(posAt(performance.now())) });
      } else {
        const lamp = el.querySelector('.lamp'); lamp.style.animationDelay = -(Date.now() % BEAT_MS) + 'ms'; // zelfde maat op elke telefoon
        if (btn) btn.onclick = () => api.move({ t: 'press' });
      }
    }
    const fb = el.querySelector('.feedback'), sc = el.querySelector('.sync-score'), L = data.last;
    let msg = '';
    if (solved) msg = '✓ Gelijkgeschakeld! Alle systemen lopen weer synchroon.';
    else if (L?.waiting) msg = `Nog ${L.waiting} telefoon${L.waiting > 1 ? 's' : ''}… druk allemaal!`;
    else if (L && data.mode === 'multi') msg = L.ok ? `✓ Treffer! Jullie zaten ${L.spread} ms uit elkaar.` : `${L.spread} ms uit elkaar: te veel. Tel samen af en probeer opnieuw!`;
    else if (L) msg = L.ok ? '✓ Raak!' : 'Mis! Wacht tot het licht in het groen staat.';
    fb.textContent = msg; fb.classList.toggle('ok', solved || !!L?.ok);
    sc.textContent = `Treffers: ${data.hits} van ${data.need}${data.misses ? ` · missers: ${data.misses}` : ''}${data.mode === 'multi' ? ` · ${n} telefoon${n > 1 ? 's' : ''} binnen ${data.window} ms` : ''}`;
  },
  destroy(el) { cancelAnimationFrame(el._raf || 0); el.innerHTML = ''; },
};
