// opdracht.js — een opdracht in de echte wereld; iemand van de groep tikt af als het gelukt is. Zet: { t:'done' }.
// Bij de stop Thuis zonder eigen tekst wordt het: de boterknop indrukken (jetpack aan).
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default {
  type: 'opdracht',
  init() { return { solved: false }; },
  reduce(data, move) { return move.t === 'done' ? { solved: true, by: move.by } : data; },
  isSolved(data) { return data.solved; },
  render(el, data, api) {
    const c = api.config, hat = !c.question;
    el.innerHTML = `${c.image ? `<img class="pimg" src="${esc(c.image)}" alt="">` : ''}
      <p class="question">${hat ? 'Jullie zijn thuis! Mecha-Pof wacht op zijn laatste deel: de boterknop met de stroop-jetpack.' : esc(c.question)}</p>
      ${data.solved ? `<p class="feedback ok">✓ ${hat ? 'Jetpack aan! Systeem compleet!' : 'Opdracht gelukt!'}</p>`
        : `<button class="ok big-btn">${hat ? '🧈 Druk op de boterknop!' : '✅ Opdracht gelukt!'}</button>`}`;
    const b = el.querySelector('button'); if (b) b.onclick = () => api.move({ t: 'done' });
  },
};
