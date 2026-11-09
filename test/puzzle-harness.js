// puzzle-harness.js — nep-sync voor test/puzzle-<type>.html: één gedeelde moves-array voor 1 tot 3 nep-telefoons (iframes).
// Zet = { ...m, id, by, at } erbij, net als de server; na `latency` ms zien alle telefoons hem. Voor 'scan' doet hij de servercontrole na.
const DEVICES = [
  { id: 'devA', players: [{ id: 'p1', name: 'Hannah', talent: 'sleutelbewaarder', is_birthday: true }, { id: 'p2', name: 'Elin', talent: 'speurneus' }] },
  { id: 'devB', players: [{ id: 'p3', name: 'Isa', talent: 'kaartlezer' }, { id: 'p4', name: 'Evy', talent: 'codekraker' }] },
  { id: 'devC', players: [{ id: 'p5', name: 'Lauren', talent: 'rekenmeester' }, { id: 'p6', name: 'Julia', talent: 'tijdbewaker' }] },
];
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function startHarness({ type, config, phones = 2, secret = null, latency = 120, frameHeight = 640 }) {
  const subs = new Map();
  const H = window.harness = {
    type, config, secret, moves: [], hints: 0, solvedAt: null, seed: (Math.random() * 2 ** 31) | 0, phones, latency,
    players() { return DEVICES.flatMap(d => d.players.map(p => ({ ...p, device_id: d.id, online: DEVICES.indexOf(d) < H.phones }))); },
    ctx() { const devs = DEVICES.slice(0, H.phones).map(d => d.id); return { seed: H.seed, variant: 0, phones: H.phones, devices: devs, players: H.players() }; },
    me(dev) { return H.players().filter(p => p.device_id === dev); },
    move(dev, m, quiet) {
      let mv = { ...m, id: Math.random().toString(36).slice(2, 10), by: H.me(dev)[0]?.id, at: new Date().toISOString() };
      if (mv.t === 'scan') { // zoals puzzle_move op de server
        delete mv.ok; const want = H.secret == null ? null : [].concat(H.secret).map(norm).filter(Boolean);
        if (!want || !want.length) mv.ok = null; else if (want.includes(norm(mv.v))) { delete mv.v; mv.ok = true; } else mv.ok = false;
      }
      setTimeout(() => { H.moves.push(mv); log(`${dev}: ${JSON.stringify(m)}`, quiet); H.notify(); }, H.latency);
    },
    hint() { H.hints++; log('💡 hint'); H.notify(); },
    solve(dev) { H.solvedAt = new Date().toISOString(); log(`🔑 ingediend door ${dev}`); H.notify(); },
    subscribe(dev, fn) { subs.set(dev, fn); },
    notify(flag) { for (const fn of subs.values()) try { fn(flag); } catch (e) { console.error(e); } onChange?.(); },
    reset() { H.moves = []; H.hints = 0; H.solvedAt = null; H.seed = (Math.random() * 2 ** 31) | 0; log('— reset —'); H.notify('reset'); },
    setPhones(n) { H.phones = n; frames(); H.notify(); },
  };
  let onChange = null; H.onChange = fn => { onChange = fn; };
  const wrap = document.getElementById('phones');
  function frames() {
    subs.clear(); wrap.innerHTML = '';
    DEVICES.slice(0, H.phones).forEach(d => {
      const f = document.createElement('iframe'); f.src = `puzzle-frame.html?dev=${d.id}`; f.title = d.id; f.style.height = frameHeight + 'px';
      f.allow = 'camera; geolocation'; wrap.appendChild(f);
    });
  }
  function log(t, quiet) { const el = document.getElementById('log'); if (!el || (quiet && !document.getElementById('showquiet')?.checked)) return; const d = document.createElement('div'); d.textContent = t; el.prepend(d); }
  document.querySelectorAll('[data-phones]').forEach(b => b.onclick = () => H.setPhones(+b.dataset.phones));
  document.getElementById('reset')?.addEventListener('click', () => H.reset());
  frames();
  return H;
}
