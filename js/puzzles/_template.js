// _template.js — kopieer dit naar js/puzzles/<type>.js. Interface: CONTRACTS.md §3.
// Voorbeeld: een cijfercode van 4 posities die door meerdere telefoons samen wordt ingevuld.
export default {
  type: 'template',

  // Startstand, afgeleid uit stop.puzzles[variant] en ctx { seed, players, devices, variant, phones }. Puur: geen DOM, geen random zonder ctx.seed.
  init(config, ctx) {
    return { digits: [null, null, null, null], tries: 0 };
  },

  // Eén zet verwerken. Dezelfde zetten in dezelfde volgorde geven op elke telefoon dezelfde data.
  reduce(data, move, ctx) {
    if (move.t === 'digit') { const d = data.digits.slice(); d[move.pos] = move.v; return { ...data, digits: d }; }
    if (move.t === 'check') return { ...data, tries: data.tries + 1 };
    return data;
  },

  isSolved(data, config, ctx) {
    return data.digits.join('') === String(config.answer || '');
  },

  // Tekent alles in `el`; api = { me, talents, phones, config, move(m), hint(), solve() }. Alleen de Sleutelbewaarder mag api.solve() aanroepen.
  render(el, data, api) {
    el.innerHTML = `<p>${api.config.question || ''}</p>
      <div class="row">${data.digits.map((v, i) => `<input type="tel" maxlength="1" value="${v ?? ''}" data-pos="${i}" aria-label="cijfer ${i + 1}">`).join('')}</div>
      ${api.talents.includes('sleutelbewaarder') ? '<button data-a="solve">🔑 Indienen</button>' : '<p>Alleen de Sleutelbewaarder kan indienen.</p>'}`;
    el.querySelectorAll('input').forEach(inp => inp.oninput = () => api.move({ t: 'digit', pos: +inp.dataset.pos, v: +inp.value }));
    el.querySelector('[data-a=solve]')?.addEventListener('click', () => api.solve());
  },

  destroy(el) { el.innerHTML = ''; },
};
