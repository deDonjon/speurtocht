// schuif.js — 3×3 schuifpuzzel van het monster (of van config.image). Gedeeld: elke tik is een zet. Zet: { t:'slide', i }.
// De beginstand komt uit de seed: 60 geldige zetten vanaf opgelost, dus altijd oplosbaar.
// Het plaatje: config.image, anders window.pkm.monsterUrl() uit index.html (later js/monster.js).
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const adjacent = (a, b) => Math.abs((a / 3 | 0) - (b / 3 | 0)) + Math.abs(a % 3 - b % 3) === 1;

export default {
  type: 'schuif',
  init(config, ctx) {
    const r = rng(ctx.seed ?? 1); const tiles = [0, 1, 2, 3, 4, 5, 6, 7, 8]; let empty = 8, prev = -1;
    for (let k = 0; k < 60; k++) {
      const cand = [empty - 3, empty + 3, empty - 1, empty + 1].filter(x => x >= 0 && x < 9 && x !== prev && adjacent(x, empty));
      const pick = cand[Math.floor(r() * cand.length)];
      [tiles[empty], tiles[pick]] = [tiles[pick], tiles[empty]]; prev = empty; empty = pick;
    }
    if (tiles.every((t, k) => t === k)) { [tiles[7], tiles[8]] = [tiles[8], tiles[7]]; empty = 7; } // nooit al opgelost beginnen
    return { tiles, empty, moves: 0 };
  },
  reduce(data, move) {
    if (move.t !== 'slide') return data;
    const i = move.i | 0;
    if (i < 0 || i > 8 || !adjacent(i, data.empty)) return data; // gelijktijdige tik van een andere telefoon: ongeldig, negeren
    const tiles = data.tiles.slice(); [tiles[i], tiles[data.empty]] = [tiles[data.empty], tiles[i]];
    return { tiles, empty: i, moves: data.moves + 1 };
  },
  isSolved(data) { return data.tiles.every((t, k) => t === k); },
  render(el, data, api) {
    const c = api.config, img = c.image || globalThis.pkm?.monsterUrl?.() || '';
    const solved = this.isSolved(data);
    el.innerHTML = `<p class="question">${esc(c.question || 'Het monster is door elkaar geschud. Schuif het weer in elkaar!')}</p>
      <div class="slide ${solved ? 'solved' : ''}">${data.tiles.map((t, i) => t === 8 && !solved ? `<div class="stile empty"></div>` :
        `<button class="stile" data-i="${i}" style="background-image:url('${esc(img)}');background-position:${(t % 3) * 50}% ${(t / 3 | 0) * 50}%" aria-label="tegel ${t + 1}"></button>`).join('')}</div>
      <p class="note center">${solved ? '✓ Het monster is weer heel!' : 'Tik een tegel naast het gat · Zetten: ' + data.moves}</p>`;
    if (!solved) el.querySelectorAll('.stile[data-i]').forEach(b => b.onclick = () => api.move({ t: 'slide', i: +b.dataset.i }));
  },
};
