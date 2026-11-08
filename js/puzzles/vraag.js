// vraag.js — raadsel of vraag met een tekstantwoord (meerdere goede antwoorden gescheiden door |).
// Ook de basis voor code.js. Zet: { t:'answer', v }.
export const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WRONG = ['Hmm, dat is het niet. Probeer nog eens!', 'Nog niet goed. Denk goed na!', 'Bijna... of toch niet. Nog een keer!'];

export function makeTextPuzzle(type, { numeric }) {
  return {
    type,
    init(config) {
      return { answers: String(config.answer ?? '').split('|').map(norm).filter(Boolean), tries: [], solved: false };
    },
    reduce(data, move) {
      if (move.t !== 'answer' || data.solved) return data;
      const ok = data.answers.includes(norm(move.v));
      return { ...data, solved: ok, tries: [...data.tries, { v: String(move.v ?? '').slice(0, 60), ok, by: move.by }] };
    },
    isSolved(data) { return data.solved; },
    render(el, data, api) {
      const c = api.config;
      if (!el.querySelector('form.pz-answer')) {
        el.innerHTML = `${c.image ? `<img class="pimg" src="${esc(c.image)}" alt="Zoek deze plek">` : ''}
          <p class="question">${esc(c.question)}</p>
          <form class="pz-answer row" autocomplete="off" novalidate>
            <input class="big grow" ${numeric ? 'type="tel" inputmode="numeric" pattern="[0-9]*" placeholder="cijfers"' : 'type="text" placeholder="jullie antwoord"'} aria-label="Antwoord" autocapitalize="off" autocorrect="off" spellcheck="false">
            <button class="ok" type="submit">Check</button>
          </form>
          <p class="feedback" aria-live="polite"></p>
          <ul class="tries"></ul>`;
        el.querySelector('form').addEventListener('submit', e => {
          e.preventDefault();
          const inp = el.querySelector('input'); const v = inp.value;
          if (!norm(v)) return;
          inp.value = ''; api.move({ t: 'answer', v });
        });
      }
      const last = data.tries[data.tries.length - 1];
      const fb = el.querySelector('.feedback');
      fb.textContent = data.solved ? '✓ Goed zo!' : last ? WRONG[(data.tries.length - 1) % 3] : '';
      fb.classList.toggle('ok', data.solved);
      el.querySelector('form').hidden = data.solved;
      // Eerdere pogingen: zo ziet iedereen op elke telefoon wat er al geprobeerd is.
      el.querySelector('.tries').innerHTML = data.tries.filter(t => !t.ok).slice(-4).map(t => `<li>${esc(t.v)}</li>`).join('');
    },
  };
}

export default makeTextPuzzle('vraag', { numeric: false });
