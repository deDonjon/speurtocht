// keuze.js — meerkeuze. Fout gekozen opties blijven op alle telefoons rood. Zet: { t:'choose', v }.
import { norm } from './vraag.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default {
  type: 'keuze',
  init(config) { return { answer: norm(config.answer), wrong: [], solved: false }; },
  reduce(data, move) {
    if (move.t !== 'choose' || data.solved) return data;
    if (norm(move.v) === data.answer) return { ...data, solved: true };
    return data.wrong.includes(move.v) ? data : { ...data, wrong: [...data.wrong, move.v] };
  },
  isSolved(data) { return data.solved; },
  render(el, data, api) {
    const c = api.config;
    el.innerHTML = `${c.image ? `<img class="pimg" src="${esc(c.image)}" alt="Zoek deze plek">` : ''}
      <p class="question">${esc(c.question)}</p>
      <div class="choices">${(c.options || []).map((o, i) => {
        const wrong = data.wrong.includes(o), right = data.solved && norm(o) === data.answer;
        return `<button data-i="${i}" class="${wrong ? 'wrong' : ''} ${right ? 'right' : ''}" ${wrong || data.solved ? 'disabled' : ''}>${esc(o)}</button>`;
      }).join('')}</div>
      <p class="feedback ${data.solved ? 'ok' : ''}">${data.solved ? '✓ Goed zo!' : data.wrong.length ? 'Dat is het niet. Probeer een andere!' : ''}</p>`;
    el.querySelectorAll('.choices button').forEach(b => b.onclick = () => api.move({ t: 'choose', v: c.options[+b.dataset.i] }));
  },
};
