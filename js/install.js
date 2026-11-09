// install.js — het installatieritueel na elke vondst (claude/MECHA-POF-SPEL.md).
// De monteur van het deel (de speler met het talent dat bij dat deel hoort) houdt haar telefoon omhoog en schudt;
// de andere telefoons tonen het deel dat vastklikt via mon.setParts(parts, { land }).
// Het schudden gaat als badge `monteur-<deel>` over de server (award_badge mag elke speler; zie CONTRACTS §2), zodat
// elke telefoon binnen 1 s het klikken ziet. Zonder sensor (of zonder toestemming): een grote knop. Zonder bericht: na 45 s door.
//
//   const install = createInstall({ mon, sync, state, PARTS, TALENTS, audio, buzz, confetti, overlay, closeOverlay, mslot, esc });
//   install.start({ part, stop_id, by, last })   // bij stop.solved, op elke telefoon
//   install.onBadge(badge)                      // bij badge.awarded; geeft true als het een monteur-badge was
//   install.busy                                 // overlay staat open

export const BADGE_PREFIX = 'monteur-';
const SHAKE_DELTA = 11, SHAKES_NEEDED = 4, SHAKE_WINDOW = 1600, WAIT_MS = 45_000, BUTTON_AFTER_MS = 12_000;

export function createInstall(d) {
  const { mon, sync, state, PARTS, TALENTS, audio, buzz, confetti, overlay, closeOverlay, mslot, esc } = d;
  let cur = null; // { part, last, done, timers:[], stopMotion }

  function monteurOf(part) {
    const t = Object.keys(TALENTS).find(k => TALENTS[k].part === part);
    return t ? state.get().players.find(p => p.talent === t) || null : null;
  }
  const clear = () => { if (!cur) return; cur.timers.forEach(clearTimeout); cur.stopMotion?.(); };

  function start({ part, stop_id, by, last }) {
    clear();
    const info = PARTS[part] || { icon: '⭐', label: 'een geheim deel' };
    const got = (state.get().game?.parts || []).filter(p => p !== part); // zonder het nieuwe deel: dat klikt zo vast
    const monteur = monteurOf(part);
    const mine = !monteur || state.me().some(p => p.id === monteur.id) || !monteur.online;
    const byName = state.player(by)?.name;
    cur = { part, last: !!last, done: false, timers: [], stopMotion: null, monteur };
    const o = overlay(`<div class="page install"><span class="tab">Deel gevonden</span>
      <div style="font-size:3.6rem;line-height:1">${info.icon}</div>
      <h2>${esc(info.label[0].toUpperCase() + info.label.slice(1))}!</h2>
      <p>Jullie hebben <strong>${esc(info.label)}</strong> van Mecha-Pof terug${byName ? ` (ingediend door ${esc(byName)})` : ''}.</p>
      ${mslot('md', 'data-parts="1"')}
      <div id="inst"></div></div>`);
    mon.setParts(got);
    const box = o.querySelector('#inst');
    if (mine) renderMonteur(box, monteur, part); else renderWait(box, monteur);
    cur.timers.push(setTimeout(() => clicked(part, 'timeout'), WAIT_MS));
  }

  // ---- de monteur: schudden (of knop)
  function renderMonteur(box, monteur, part) {
    const name = monteur ? monteur.name : 'Speurders';
    const who = monteur ? `<b>${esc(name)}</b>, jij bent de monteur van dit deel.` : 'Dit deel mag iedereen monteren.';
    const canMotion = typeof DeviceMotionEvent !== 'undefined';
    const needsPerm = canMotion && typeof DeviceMotionEvent.requestPermission === 'function';
    box.innerHTML = `<p class="clue">🔧 ${who} Houd je telefoon <b>omhoog</b> en <b>schud</b> hem om het deel vast te klikken!</p>
      <div class="shake"><i></i></div>
      <div id="instbtns" class="row" style="justify-content:center"></div>
      <p class="note" id="instnote"></p>`;
    const btns = box.querySelector('#instbtns'), note = box.querySelector('#instnote'), meter = box.querySelector('.shake i');
    const bigButton = (label = '🔧 Klik het vast!') => { btns.innerHTML = `<button class="ok big-btn wide">${label}</button>`; btns.querySelector('button').onclick = () => finish(monteur, part); };
    const listen = () => {
      let last = null, hits = [], lastHit = 0;
      const onMotion = e => {
        const a = e.accelerationIncludingGravity || e.acceleration; if (!a) return;
        const m = Math.hypot(a.x || 0, a.y || 0, a.z || 0), t = performance.now();
        if (last != null && Math.abs(m - last) > SHAKE_DELTA && t - lastHit > 110) {
          lastHit = t; hits = hits.filter(x => t - x < SHAKE_WINDOW); hits.push(t);
          if (meter) meter.style.width = Math.min(100, hits.length / SHAKES_NEEDED * 100) + '%';
          audio.play('plop');
          if (hits.length >= SHAKES_NEEDED) { stop(); finish(monteur, part); }
        }
        last = m;
      };
      const stop = () => removeEventListener('devicemotion', onMotion);
      addEventListener('devicemotion', onMotion);
      cur.stopMotion = stop;
      note.textContent = 'Schudden maar! Stevig, vier keer heen en weer.';
      cur.timers.push(setTimeout(() => { if (cur && !cur.done) { note.textContent = 'Lukt het schudden niet? Dan mag de knop.'; bigButton(); } }, BUTTON_AFTER_MS));
    };
    if (!canMotion) { note.textContent = 'Deze telefoon heeft geen bewegingssensor.'; bigButton(); return; }
    if (needsPerm) { // iPhone: toestemming alleen na een tik
      btns.innerHTML = '<button class="berry big-btn wide">📱 Klaar om te schudden</button>';
      btns.querySelector('button').onclick = async () => {
        let ok = false; try { ok = (await DeviceMotionEvent.requestPermission()) === 'granted'; } catch {}
        btns.innerHTML = '';
        if (ok) listen(); else { note.textContent = 'Geen toestemming voor de sensor; dan met de knop.'; bigButton(); }
      };
      note.textContent = 'Tik eerst op de knop, dan mag de telefoon zijn sensor gebruiken.';
    } else listen();
  }
  async function finish(monteur, part) {
    if (!cur || cur.done || cur.part !== part) return;
    cur.stopMotion?.();
    const target = monteur?.id || state.me()[0]?.id;
    clicked(part, 'local');
    try { if (target) await sync.badge(target, BADGE_PREFIX + part); } catch (e) { console.warn('[install] badge', e.message); }
  }

  // ---- de anderen: wachten op het klikken
  function renderWait(box, monteur) {
    box.innerHTML = `<p class="clue">🔧 Wacht tot <b>${esc(monteur.name)}</b> het deel vastklikt: zij houdt haar telefoon omhoog en schudt hem.</p>
      <p class="note">Roep haar als ze het niet gezien heeft!</p>`;
  }

  // ---- klik: deel landt, knop om door te gaan
  function clicked(part, how) {
    if (!cur || cur.part !== part || cur.done) return false;
    cur.done = true; clear();
    const got = [...new Set([...(state.get().game?.parts || []), part])];
    mon.setParts(got, { land: part }); mon.react('goed');
    audio.play('deel'); buzz([60, 40, 60, 40, 120]);
    if (cur.last) confetti();
    const box = document.querySelector('#ov .install #inst');
    if (box) {
      const extra = how === 'timeout' ? ' Mecha-Pof heeft het zelf maar vastgeklikt.' : '';
      box.innerHTML = `<h2>✓ Vastgeklikt!</h2><p>${esc(PARTS[part]?.label || 'Het deel')} zit weer op zijn plek.${extra}</p>
        <button class="ok wide big-btn">${cur.last ? '🥞 Pannenkoeken!' : 'Op naar de volgende plek ▶'}</button>`;
      box.querySelector('button').onclick = () => { cur = null; closeOverlay(); };
    } else { cur = null; }
    return true;
  }
  function onBadge(badge) {
    if (typeof badge !== 'string' || !badge.startsWith(BADGE_PREFIX)) return false;
    clicked(badge.slice(BADGE_PREFIX.length), 'badge');
    return true;
  }

  return { start, onBadge, get busy() { return !!cur; }, monteurOf };
}
export default createInstall;
