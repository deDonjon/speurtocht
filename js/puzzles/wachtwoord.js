// wachtwoord.js — de wachtwoordstop: de kinderen zéggen het wachtwoord tegen Mecha-Pof via de walkietalkie.
// De ElevenLabs-agent roept dan de client tool `unlock_stop` aan (js/walkie.js `tools`, ingericht in index.html), die in de
// browser sync.solve() aanroept (en een zet {t:'unlock', v} zet, zodat elke telefoon het slot open ziet gaan).
// Valt terug op een codepuzzel: wie de walkie niet aan de praat krijgt, typt de code op de werkbank.
//
// config: { type:'wachtwoord', question, password:'stroop|stroopwafel', answer?:'1234' (getypte reserve; standaard = password),
//           hint?, image?, radio_text? }
// Zetten: { t:'unlock', v }  (walkie, via de tool)  ·  { t:'answer', v }  (getypt op de werkbank)
// Zonder `password` in de config vertrouwt de app op het oordeel van de agent (die kent het wachtwoord via {{wachtwoord}}).
import { norm, esc } from './_shared.js';

const WRONG = ['Hmm, dat is het niet. Zoek het wachtwoord nog eens!', 'Nog niet goed. Overleg even!', 'Bijna... of toch niet. Nog een keer!'];
const list = v => String(v ?? '').split('|').map(norm).filter(Boolean);

export default {
  type: 'wachtwoord',
  init(config) {
    const passwords = list(config.password);
    return { passwords, answers: list(config.answer).length ? list(config.answer) : passwords, tries: [], solved: false, how: null };
  },
  reduce(data, move) {
    if (data.solved) return data;
    if (move.t === 'unlock') {
      const ok = !data.passwords.length || data.passwords.includes(norm(move.v));
      return ok ? { ...data, solved: true, how: 'walkie' } : { ...data, tries: [...data.tries, { v: String(move.v ?? '').slice(0, 40), ok: false, how: 'walkie' }] };
    }
    if (move.t === 'answer') {
      const ok = data.answers.includes(norm(move.v));
      return { ...data, solved: ok, how: ok ? 'code' : data.how, tries: [...data.tries, { v: String(move.v ?? '').slice(0, 40), ok, how: 'code' }] };
    }
    return data;
  },
  isSolved(data) { return data.solved; },
  render(el, data, api) {
    const c = api.config;
    if (!el.querySelector('.pz-ww')) {
      el.innerHTML = `<div class="pz-ww">${c.image ? `<img class="pimg" src="${esc(c.image)}" alt="">` : ''}
          <p class="question">${esc(c.question || 'Zoek het wachtwoord en zeg het tegen Mecha-Pof.')}</p>
          <div class="hint pz-radio">📻 <span class="pz-radio-txt"></span></div>
          <p class="feedback" aria-live="polite"></p>
          <ul class="tries"></ul>
          <button class="ghost pz-toggle" type="button">Lukt de walkietalkie niet? Typ de code</button>
          <form class="pz-answer row" autocomplete="off" novalidate hidden>
            <input class="big grow" type="text" placeholder="code" aria-label="Code" autocapitalize="off" autocorrect="off" spellcheck="false">
            <button class="ok" type="submit">Check</button>
          </form></div>`;
      el.querySelector('.pz-toggle').onclick = () => { const f = el.querySelector('form'); f.hidden = !f.hidden; if (!f.hidden) f.querySelector('input').focus(); };
      el.querySelector('form').addEventListener('submit', e => {
        e.preventDefault(); const inp = el.querySelector('input'), v = inp.value;
        if (!norm(v)) return; inp.value = ''; api.move({ t: 'answer', v });
      });
    }
    const radioDev = api.radioDevice, mine = !radioDev || radioDev === (api.devices || [])[api.deviceIndex];
    const who = (api.players || []).filter(p => p.device_id === radioDev && p.online).map(p => p.name).join(' & ');
    el.querySelector('.pz-radio-txt').innerHTML = c.radio_text ? esc(c.radio_text)
      : mine ? 'Open de walkietalkie (📻 bovenin), houd de knop vast en zeg het wachtwoord tegen Mecha-Pof. Eindig met <b>over</b>.'
      : `Zeg het wachtwoord tegen Mecha-Pof via de walkietalkie op de telefoon van <b>${esc(who || 'de radio')}</b>. Eindig met <b>over</b>.`;
    const last = data.tries[data.tries.length - 1], fb = el.querySelector('.feedback');
    fb.textContent = data.solved ? (data.how === 'walkie' ? '✓ Wachtwoord geaccepteerd! Slot open.' : '✓ Code goed!') : last ? (last.how === 'walkie' ? 'Mecha-Pof kende dat wachtwoord niet. Probeer het nog eens.' : WRONG[(data.tries.length - 1) % 3]) : '';
    fb.classList.toggle('ok', data.solved);
    el.querySelector('.pz-toggle').hidden = data.solved || !el.querySelector('form').hidden;
    if (data.solved) el.querySelector('form').hidden = true;
    el.querySelector('.tries').innerHTML = data.tries.filter(t => !t.ok).slice(-4).map(t => `<li>${esc(t.v)}</li>`).join('');
  },
};
