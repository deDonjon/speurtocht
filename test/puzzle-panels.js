// puzzle-panels.js — nep-sync voor de puzzeltestpagina's (test/puzzle-<type>.html).
// Eén pagina speelt 1, 2 of 3 telefoons: elk paneel is een toestel met één bewaker; alle panelen delen één `moves`-array
// (zoals puzzle_state.moves op de server). Een zet in het ene paneel staat meteen in de andere. Geen netwerk nodig.
//   mountPuzzleTest({ type, config, phones: 3 })
import { piecesFor } from '../js/puzzles/_shared.js';

const NAMES = ['Hannah', 'Elin', 'Isa'], TALENTS = ['sleutelbewaarder', 'speurneus', 'kaartlezer'];
const ROLES = ['radio', 'kaart', 'werkbank'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function mountPuzzleTest({ type, config, phones = 3, seed = 42, stopIndex = 0 }) {
  const mod = (await import(`../js/puzzles/${type}.js`)).default;
  const root = document.getElementById('phones'), log = document.getElementById('log');
  const say = m => { const d = document.createElement('div'); d.textContent = `${new Date().toLocaleTimeString()} ${m}`; log.prepend(d); };
  let moves = [], seq = 0, solved = false, n = phones;
  const players = () => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: NAMES[i], device_id: 'dev' + i, talent: TALENTS[i], online: true }));
  const devices = () => Array.from({ length: n }, (_, i) => 'dev' + i);
  const ctx = () => ({ seed, variant: 0, players: players(), phones: n, devices: devices() });
  // rol van toestel d bij stop s (zelfde formule als js/roles.js): rol r hoort bij toestel ((r - s) mod 3) mod n
  const rolesOf = d => ROLES.filter((_, r) => ((((r - stopIndex) % 3) + 3) % 3) % n === d);

  function draw() {
    root.innerHTML = '';
    const c = ctx();
    const data = moves.reduce((d, m) => mod.reduce(d, m, c), mod.init(config, c));
    solved = mod.isSolved(data, config, c);
    document.getElementById('state').textContent = `${moves.length} zetten · ${solved ? 'OPGELOST ✓' : 'nog bezig'} · data: ${JSON.stringify(data).slice(0, 400)}`;
    for (let d = 0; d < n; d++) {
      const roles = rolesOf(d), werkbank = roles.includes('werkbank') || !!mod.multi;
      const panel = document.createElement('section'); panel.className = 'phone';
      panel.innerHTML = `<header><b>📱 ${NAMES[d]}</b> <span>${roles.map(r => ({ radio: '📻', kaart: '🗺️', werkbank: '🔧' })[r]).join(' ') || '–'}</span></header><div class="pz"></div>`;
      root.appendChild(panel);
      const el = panel.querySelector('.pz');
      if (!werkbank) { el.innerHTML = `<p class="question">${esc(config.question || '')}</p><p class="note">🔧 De werkbank staat op een andere telefoon.</p>`; continue; }
      const api = {
        me: [players()[d]], talents: [TALENTS[d]], phones: n, config, hints: 0, roles, deviceIndex: d, devices: devices(), players: players(),
        werkbankDevice: 'dev' + ROLES.indexOf('werkbank'),
        move: m => { if (solved) return; const mv = { ...m, id: 'm' + (++seq), by: 'p' + d, at: new Date().toISOString() }; moves.push(mv); say(`${NAMES[d]}: ${JSON.stringify(m)}`); draw(); },
        hint: () => say('hint gevraagd'), solve: () => say(`🔑 ${NAMES[d]} dient in`),
      };
      mod.render(el, data, api);
    }
    if (solved) say('✓ opgelost');
  }
  document.getElementById('phonesSel').onchange = e => { n = +e.target.value; moves = []; say(`${n} telefoon(s)`); draw(); };
  document.getElementById('phonesSel').value = String(n);
  document.getElementById('reset').onclick = () => { moves = []; seed = Math.floor(Math.random() * 1e9); say('opnieuw, seed ' + seed); draw(); };
  draw();
  return { get moves() { return moves; }, draw, piecesFor };
}
