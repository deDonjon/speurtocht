// splits.js — "Gesplitst signaal": Mecha-Pof zendt een code in stukken. Elke telefoon vangt één stuk op;
// de speurders zeggen hun stuk hardop tegen elkaar en de werkbank typt het hele antwoord. Zet: { t:'answer', v }.
// Eén telefoon: de stukken komen één voor één voorbij (tik, 4 s zichtbaar, weg) en moeten onthouden worden.
// Config: { type:'splits', question, question_solo?, pieces:['STRO','OPME','TER'], answer:'stroopmeter|stroop meter', hint, show?: 4 }  (show: seconden zichtbaar in de 1-telefoonvariant)
import { esc, norm, piecesFor, myDevice, namesOf, WRONG } from './_shared.js';

export default {
  type: 'splits',
  multi: true, // alle telefoons tekenen deze puzzel (ieder zijn eigen stuk); alleen de werkbank krijgt het invoerveld
  init(config) {
    const pieces = (config.pieces || []).map(String).filter(Boolean);
    return { pieces: pieces.length ? pieces : ['?', '?', '?'], answers: String(config.answer ?? '').split('|').map(norm).filter(Boolean), tries: [], solved: false };
  },
  reduce(data, move) {
    if (move.t !== 'answer' || data.solved) return data;
    const ok = data.answers.includes(norm(move.v));
    return { ...data, solved: ok, tries: [...data.tries, { v: String(move.v ?? '').slice(0, 60), ok, by: move.by }] };
  },
  isSolved(data) { return data.solved; },
  render(el, data, api) {
    const c = api.config, { d, n } = myDevice(api), mine = piecesFor(data.pieces.length, d, n);
    const canType = !api.roles || api.roles.includes('werkbank');
    const key = [n, d, data.pieces.length, canType].join('|');
    if (el.dataset.key !== key || !el.querySelector('.pz-splits')) {
      el.dataset.key = key; el._solo = { shown: new Set(), timer: 0, now: -1 };
      el.innerHTML = `<div class="pz-splits">
        ${c.image ? `<img class="pimg" src="${esc(c.image)}" alt="">` : ''}
        <p class="question">${esc((n === 1 && c.question_solo) || c.question || 'Mecha-Pof zendt een geheim woord in stukken. Zoek ze bij elkaar!')}</p>
        <div class="pieces"></div>
        <p class="note pieces-note"></p>
        <form class="pz-answer row" autocomplete="off" novalidate ${canType ? '' : 'hidden'}>
          <input class="big grow" type="text" placeholder="het hele antwoord" aria-label="Antwoord" autocapitalize="off" autocorrect="off" spellcheck="false">
          <button class="ok" type="submit">Check</button></form>
        <p class="feedback" aria-live="polite"></p><ul class="tries"></ul></div>`;
      el.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const inp = el.querySelector('input'); if (!norm(inp.value)) return; const v = inp.value; inp.value = ''; api.move({ t: 'answer', v }); });
      el.querySelector('.pieces').addEventListener('click', e => {
        const b = e.target.closest('[data-peek]'); if (!b) return;
        const i = +b.dataset.peek, s = el._solo; clearTimeout(s.timer); s.now = i; s.shown.add(i);
        drawPieces(); s.timer = setTimeout(() => { s.now = -1; drawPieces(); }, (c.show || 4) * 1000);
      });
    }
    const drawPieces = () => {
      const box = el.querySelector('.pieces'), note = el.querySelector('.pieces-note'); if (!box) return;
      if (n === 1) { // solo: één stuk tegelijk, onthouden
        const s = el._solo;
        box.innerHTML = `<div class="piece-row">${data.pieces.map((p, i) => `<button class="piece ${s.now === i ? 'open' : ''} ${s.shown.has(i) ? 'seen' : ''}" data-peek="${i}" ${data.solved ? 'disabled' : ''}>
            <small>stuk ${i + 1}</small><b>${s.now === i ? esc(p) : s.shown.has(i) ? '· · ·' : '?'}</b></button>`).join('')}</div>`;
        note.textContent = data.solved ? '' : 'Tik een stuk aan: het is maar even te zien. Onthoud ze en plak ze aan elkaar.';
      } else {
        box.innerHTML = `<div class="piece-row">${data.pieces.map((p, i) => mine.includes(i)
          ? `<div class="piece open mine"><small>stuk ${i + 1} · jouw telefoon</small><b>${esc(p)}</b></div>`
          : `<div class="piece"><small>stuk ${i + 1} · bij ${esc(namesOf(i % n, api))}</small><b>?</b></div>`).join('')}</div>`;
        note.textContent = data.solved ? '' : canType ? 'Lees jullie stukken aan elkaar voor en typ hier het hele antwoord.' : 'Lees jouw stuk hardop voor. De werkbank typt het antwoord.';
      }
    };
    drawPieces();
    const last = data.tries[data.tries.length - 1], fb = el.querySelector('.feedback');
    fb.textContent = data.solved ? '✓ Signaal compleet!' : last ? WRONG[(data.tries.length - 1) % WRONG.length] : '';
    fb.classList.toggle('ok', data.solved);
    el.querySelector('form').hidden = data.solved || !canType;
    el.querySelector('.tries').innerHTML = data.tries.filter(t => !t.ok).slice(-4).map(t => `<li>${esc(t.v)}</li>`).join('');
  },
  destroy(el) { clearTimeout(el._solo?.timer); el.innerHTML = ''; },
};
