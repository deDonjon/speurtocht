// memory.js — paren zoeken, gedeeld over alle telefoons (iedereen ziet dezelfde kaarten). Zet: { t:'flip', i }.
// Twee niet-passende kaarten blijven open tot de volgende zet; elke telefoon draait ze na 1 s zelf zichtbaar terug.
const ICONS = ['🥞', '🍓', '🫐', '🍯', '🥓', '🍌', '🧈', '🍳', '🥛', '🍫'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export default {
  type: 'memory',
  init(config, ctx) {
    const n = Math.max(3, Math.min(8, +config.pairs || 6)), r = rng(ctx.seed ?? 1);
    const cards = ICONS.slice(0, n).flatMap(i => [i, i]);
    for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
    return { cards, open: [], matched: [], moves: 0 };
  },
  reduce(data, move) {
    if (move.t !== 'flip') return data;
    const i = move.i | 0;
    let open = data.open.length >= 2 ? [] : data.open.slice(); // een mis wordt bij de volgende zet gesloten
    if (i < 0 || i >= data.cards.length || data.matched.includes(i) || open.includes(i)) return data;
    open.push(i);
    let { matched, moves } = data;
    if (open.length === 2) {
      moves++;
      if (data.cards[open[0]] === data.cards[open[1]]) { matched = [...matched, ...open]; open = []; }
    }
    return { ...data, open, matched, moves };
  },
  isSolved(data) { return data.matched.length === data.cards.length; },
  render(el, data, api) {
    const c = api.config, cols = data.cards.length > 12 ? 4 : data.cards.length > 8 ? 4 : 3;
    const miss = data.open.length === 2 ? data.open.join() : '';
    el.innerHTML = `<p class="question">${esc(c.question || 'Vind alle paren!')}</p>
      <div class="memo" style="grid-template-columns:repeat(${cols},1fr)">${data.cards.map((ic, i) => {
        const up = data.open.includes(i) || data.matched.includes(i);
        return `<button class="mcard ${up ? 'up' : ''} ${data.matched.includes(i) ? 'done' : ''}" data-i="${i}" aria-label="kaart ${i + 1}"><span class="face">${up ? ic : '🥞'}</span></button>`;
      }).join('')}</div>
      <p class="note center">Zetten: ${data.moves} · Paren: ${data.matched.length / 2} van ${data.cards.length / 2}</p>`;
    el.querySelectorAll('.mcard').forEach(b => b.onclick = () => api.move({ t: 'flip', i: +b.dataset.i }));
    // Mis: na 1 s alleen op het scherm terugdraaien; de stand blijft gelijk tot de volgende zet.
    clearTimeout(el._missT);
    if (miss) el._missT = setTimeout(() => {
      if (el.dataset.miss !== miss) return;
      data.open.forEach(i => { const b = el.querySelector(`.mcard[data-i="${i}"]`); if (b) { b.classList.remove('up'); b.firstElementChild.textContent = '🥞'; } });
    }, 1000);
    el.dataset.miss = miss;
  },
  destroy(el) { clearTimeout(el._missT); },
};
