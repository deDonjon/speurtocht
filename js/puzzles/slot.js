// slot.js — "Het stroopslot": een cijferslot met draaischijven. Elke telefoon draait aan zijn eigen schijf (schijf i hoort bij
// telefoon i mod phones); de werkbank probeert het slot. Zetten: { t:'turn', i, d:+1|-1 } en { t:'check' }.
// Eén telefoon: alle schijven op één scherm. Per schijf een raadsel in de config; het slot zegt alleen of het hele slot klopt.
// Config: { type:'slot', question, symbols?: ['0',…,'9'], dials:[{ clue:'Hoeveel pannenkoeken in zijn pantser?', answer:'4' }, …], hint }
import { esc, piecesFor, myDevice, namesOf } from './_shared.js';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const WRONG = ['Krrr... het slot zit nog dicht. Kijk de raadsels nog eens na.', 'Piep! Nog niet goed. Overleg met de andere telefoons.', 'Bijna? Of toch niet. Draai nog eens!'];

export default {
  type: 'slot',
  multi: true,
  init(config) {
    const symbols = (config.symbols || DIGITS).map(String);
    const dials = (config.dials || []).map(x => ({ clue: String(x.clue || ''), answer: String(x.answer ?? '') }));
    const list = dials.length ? dials : [{ clue: '', answer: symbols[0] }, { clue: '', answer: symbols[0] }, { clue: '', answer: symbols[0] }];
    return { symbols, dials: list, pos: list.map(() => 0), tries: [], solved: false };
  },
  reduce(data, move) {
    if (data.solved) return data;
    if (move.t === 'turn') {
      const i = move.i | 0; if (i < 0 || i >= data.pos.length) return data;
      const pos = data.pos.slice(); const n = data.symbols.length; pos[i] = (((pos[i] + (move.d < 0 ? -1 : 1)) % n) + n) % n;
      return { ...data, pos };
    }
    if (move.t === 'check') {
      const ok = data.dials.every((dl, i) => data.symbols[data.pos[i]] === dl.answer);
      return { ...data, solved: ok, tries: [...data.tries, { code: data.pos.map(p => data.symbols[p]).join(''), ok, by: move.by }] };
    }
    return data;
  },
  isSolved(data) { return data.solved; },
  render(el, data, api) {
    const c = api.config, { d, n } = myDevice(api), mine = piecesFor(data.dials.length, d, n);
    const canCheck = !api.roles || api.roles.includes('werkbank');
    el.innerHTML = `<div class="pz-slot">
      ${c.image ? `<img class="pimg" src="${esc(c.image)}" alt="">` : ''}
      <p class="question">${esc(c.question || 'Het stroopslot! Zet elke schijf op het goede cijfer.')}</p>
      <div class="dials">${data.dials.map((dl, i) => { const own = mine.includes(i);
        return `<div class="dial ${own ? 'mine' : ''} ${data.solved ? 'ok' : ''}">
          <small>${own ? `schijf ${i + 1}` : `schijf ${i + 1} · ${esc(namesOf(i % n, api))}`}</small>
          ${own && !data.solved ? `<button class="plain turn" data-turn="${i}" data-d="1" aria-label="omhoog">▲</button>` : '<span class="turn"></span>'}
          <b class="sym">${esc(data.symbols[data.pos[i]])}</b>
          ${own && !data.solved ? `<button class="plain turn" data-turn="${i}" data-d="-1" aria-label="omlaag">▼</button>` : '<span class="turn"></span>'}
          ${dl.clue ? `<p class="dial-clue">${esc(dl.clue)}</p>` : ''}
        </div>`; }).join('')}</div>
      ${data.solved ? '' : canCheck ? `<button class="ok wide big-btn" data-check>🔒 Probeer het slot</button>` : `<p class="note">De werkbank (${esc(namesOf(wbIndex(api), api))}) probeert het slot zodra alle schijven staan.</p>`}
      <p class="feedback ${data.solved ? 'ok' : ''}" aria-live="polite">${data.solved ? '✓ Klik! Het slot springt open.' : data.tries.length ? esc(WRONG[(data.tries.length - 1) % WRONG.length]) : ''}</p>
      ${data.tries.length ? `<ul class="tries">${data.tries.filter(t => !t.ok).slice(-4).map(t => `<li>${esc(t.code)}</li>`).join('')}</ul>` : ''}
    </div>`;
    el.querySelectorAll('[data-turn]').forEach(b => b.onclick = () => api.move({ t: 'turn', i: +b.dataset.turn, d: +b.dataset.d }));
    const ck = el.querySelector('[data-check]'); if (ck) ck.onclick = () => api.move({ t: 'check' });
  },
  destroy(el) { el.innerHTML = ''; },
};
// Index van het toestel met de werkbank, als de app die meegeeft; anders 0.
function wbIndex(api) { const i = (api.devices || []).indexOf(api.werkbankDevice); return i < 0 ? 0 : i; }
