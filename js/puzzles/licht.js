// licht.js — lichtcode. Eén telefoon (de zender) knippert een kleurcode van 4 tot 6 kleuren; de andere telefoons bouwen hem samen na.
// 1 telefoon: dezelfde telefoon knippert eerst de code en daarna typen jullie hem uit je hoofd na.
// Config (stop.puzzles[i]): { type:'licht', length:4–6 (standaard 5), colors:3–5 (standaard 4), speed: ms per kleur (standaard 750), question?, hint? }
// Zetten: { t:'play' } (zender knippert; telt mee zodat iedereen het ziet), { t:'tap', c }, { t:'undo' }, { t:'clear' }.
// Bij de laatste kleur controleert reduce zelf: goed = opgelost, fout = poging erbij en opnieuw beginnen.

export const COLORS = [
  { k: 'r', name: 'rood',  hex: '#FF4B3E', sym: '♥', f: 392 },
  { k: 'g', name: 'geel',  hex: '#FFD23F', sym: '★', f: 494 },
  { k: 'b', name: 'blauw', hex: '#3FA7FF', sym: '●', f: 587 },
  { k: 'n', name: 'groen', hex: '#3EE07A', sym: '▲', f: 659 },
  { k: 'p', name: 'paars', hex: '#B266FF', sym: '■', f: 784 },
];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Number.isFinite(+v) && v !== '' && v != null ? +v : d));
const col = k => COLORS.find(c => c.k === k);
const WRONG = [
  'Bzzzt! Foutmelding. Mijn lampjes knipperden iets anders. Nog een keer!',
  'Krrr… dat was niet mijn code. Kijk nog eens goed naar de zender!',
  'Bliep-bloep. Bijna! Of… helemaal niet. Opnieuw!',
];

export default {
  type: 'licht',

  init(config, ctx = {}) {
    const len = clamp(config.length, 4, 6, 5), nc = clamp(config.colors, 3, 5, 4), r = rng(ctx.seed ?? 1);
    const palette = COLORS.slice(0, nc).map(c => c.k);
    const seq = [];
    while (seq.length < len) { const k = palette[Math.floor(r() * nc)]; if (k !== seq[seq.length - 1]) seq.push(k); } // nooit twee keer dezelfde kleur achter elkaar
    const devices = [...new Set(ctx.devices || [])].sort();
    const solo = (ctx.phones || 1) < 2 || devices.length < 2;
    const zender = solo ? null : devices[(ctx.seed >>> 0) % devices.length];
    const zenderNames = (ctx.players || []).filter(p => zender && p.device_id === zender).map(p => p.name).join(' & ');
    return { seq, palette, input: [], tries: 0, plays: 0, solved: false, solo, zender, zenderNames, lastWrong: null };
  },

  reduce(data, move) {
    if (data.solved && move.t !== 'play') return data;
    if (move.t === 'play') return { ...data, plays: data.plays + 1 };
    if (move.t === 'undo') return { ...data, input: data.input.slice(0, -1), lastWrong: null };
    if (move.t === 'clear') return { ...data, input: [], lastWrong: null };
    if (move.t !== 'tap' || !data.palette.includes(move.c)) return data;
    const input = [...data.input, move.c];
    if (input.length < data.seq.length) return { ...data, input, lastWrong: null };
    const ok = input.join('') === data.seq.join('');
    return ok ? { ...data, input, solved: true, lastWrong: null } : { ...data, input: [], tries: data.tries + 1, lastWrong: input };
  },

  isSolved(data) { return data.solved; },

  render(el, data, api) {
    style();
    const c = api.config || {}, myDev = api.me?.[0]?.device_id ?? api.deviceId ?? null;
    const isZender = !data.solo && myDev === data.zender;
    const q = c.question || (data.solo
      ? 'Mecha-Pof knippert een geheime lichtcode. Kijk heel goed, onthoud de kleuren en bouw hem daarna na!'
      : 'Eén telefoon is de zender en knippert de lichtcode van Mecha-Pof. De anderen kijken mee en bouwen hem na!');
    const len = data.seq.length, play = () => { api.move({ t: 'play' }); flash(data.seq, c.speed); };

    let body;
    if (data.solved) {
      body = `<div class="lk-dots">${data.seq.map(k => dot(k)).join('')}</div>
        <p class="feedback ok">✓ Lichtcode geaccepteerd! Bliep-bliep-bloep, mijn lampjes doen het weer.</p>`;
    } else if (isZender) {
      body = `<div class="lk-role">📡 Jij bent de <b>zender</b>. Houd je scherm naar de bouwers en druk op de knop.</div>
        <button class="berry wide big-btn" data-a="play">💡 Zend de lichtcode</button>
        <div class="lk-dots" aria-label="Voortgang van de bouwers">${Array.from({ length: len }, (_, i) => `<span class="lk-dot ${i < data.input.length ? 'on' : ''}"></span>`).join('')}</div>
        <p class="note center">Bouwers: ${data.input.length} van ${len} kleuren · gezonden: ${data.plays}×${data.tries ? ` · fout: ${data.tries}×` : ''}</p>`;
    } else {
      const zLine = data.solo
        ? `<button class="berry wide big-btn" data-a="play">💡 ${data.plays ? 'Laat nog een keer zien' : 'Laat de lichtcode zien'}</button>
           ${data.plays >= 3 ? '<p class="note center">Mecha-Pof zucht: "Nóg een keer? Mijn lampjes worden er warm van." 😮‍💨</p>' : ''}`
        : `<div class="lk-role">👀 Kijk naar de telefoon van <b>${esc(data.zenderNames || 'de zender')}</b>: die knippert de code.${data.plays ? ` (${data.plays}× gezonden)` : ''}</div>`;
      body = `${zLine}
        <div class="lk-dots" aria-label="Jullie code">${Array.from({ length: len }, (_, i) => dot(data.input[i])).join('')}</div>
        <div class="lk-pad">${data.palette.map(k => { const x = col(k); return `<button class="lk-key" data-c="${k}" style="--k:${x.hex}" aria-label="${x.name}"><span>${x.sym}</span><small>${x.name}</small></button>`; }).join('')}</div>
        <div class="row" style="justify-content:space-between"><button class="plain" data-a="undo" ${data.input.length ? '' : 'disabled'}>↩︎ Terug</button><button class="ghost" data-a="clear" ${data.input.length ? '' : 'disabled'}>Wis alles</button></div>`;
    }
    el.innerHTML = `<p class="question">${esc(q)}</p>${body}
      <p class="feedback" aria-live="polite">${data.lastWrong ? WRONG[(data.tries - 1) % WRONG.length] : ''}</p>
      ${data.lastWrong && !data.solved ? `<div class="lk-dots lk-wrong" aria-label="Laatste foute poging">${data.lastWrong.map(k => dot(k)).join('')}</div>` : ''}`;
    el.querySelector('[data-a=play]')?.addEventListener('click', play);
    el.querySelector('[data-a=undo]')?.addEventListener('click', () => api.move({ t: 'undo' }));
    el.querySelector('[data-a=clear]')?.addEventListener('click', () => api.move({ t: 'clear' }));
    el.querySelectorAll('.lk-key').forEach(b => b.addEventListener('click', () => { beep(col(b.dataset.c).f, 0.12); api.move({ t: 'tap', c: b.dataset.c }); }));
  },

  destroy() { stopFlash(); },
};

function dot(k) { const x = k && col(k); return x ? `<span class="lk-dot on" style="--k:${x.hex}">${x.sym}</span>` : '<span class="lk-dot"></span>'; }

// ---------------------------------------------------------------- knipperen (alleen op deze telefoon, schermvullend)
let flashT = [], ov = null, actx = null;
function beep(f, dur = 0.5) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.05);
  } catch {}
}
function stopFlash() { flashT.forEach(clearTimeout); flashT = []; ov?.remove(); ov = null; }
function flash(seq, speed) {
  stopFlash();
  const on = clamp(speed, 400, 1500, 750), off = Math.round(on * 0.4);
  ov = document.createElement('div'); ov.className = 'lk-flash'; document.body.appendChild(ov);
  const show = (bg, html) => { if (!ov) return; ov.style.background = bg; ov.innerHTML = html; };
  let t = 0; const at = (ms, fn) => flashT.push(setTimeout(fn, (t += ms)));
  ['3', '2', '1'].forEach(n => at(t ? 600 : 0, () => { show('#0E1B2E', `<b class="lk-count">${n}</b><small>Klaar voor de lichtcode…</small>`); beep(330, 0.08); }));
  seq.forEach((k, i) => {
    const x = col(k);
    at(i ? off : 600, () => { show(x.hex, `<b class="lk-sym">${x.sym}</b><small>${x.name} · ${i + 1} van ${seq.length}</small>`); beep(x.f, on / 1000 * 0.8); navigator.vibrate?.(60); });
    at(on, () => show('#05070C', ''));
  });
  at(off, () => { show('#0E1B2E', '<b class="lk-count" style="font-size:2.4rem">Bliep!</b><small>Code verzonden. Over!</small>'); beep(880, 0.15); });
  at(1100, stopFlash);
  ov.addEventListener('click', () => { if (ov?.dataset.tap) stopFlash(); else if (ov) ov.dataset.tap = '1'; }); // twee keer tikken = stoppen
}

let styled = false;
function style() {
  if (styled || typeof document === 'undefined') return; styled = true;
  const s = document.createElement('style'); s.id = 'pz-licht';
  s.textContent = `
.lk-role{background:var(--visor,#0E1B2E);border:1px solid var(--line2,#4E5D7E);border-left:4px solid var(--led,#7FE8FF);border-radius:12px;padding:10px 12px;font-weight:800}
.lk-dots{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:6px 0}
.lk-dot{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-size:20px;color:rgba(0,0,0,.55);background:var(--visor,#0E1B2E);border:2px dashed var(--line2,#4E5D7E)}
.lk-dot.on{background:var(--k,var(--led,#7FE8FF));border:2px solid rgba(255,255,255,.6);box-shadow:0 0 14px var(--k,#7FE8FF)}
.lk-wrong{opacity:.55}.lk-wrong .lk-dot{width:28px;height:28px;font-size:14px}
.lk-pad{display:grid;grid-template-columns:repeat(auto-fit,minmax(64px,1fr));gap:10px}
.lk-key{min-height:76px;padding:6px;border-radius:16px;background:var(--k);color:rgba(0,0,0,.65);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;
  box-shadow:0 4px 0 rgba(0,0,0,.45),0 0 16px color-mix(in srgb,var(--k) 45%,transparent),inset 0 1px 0 rgba(255,255,255,.5)}
.lk-key span{font-size:1.8rem;line-height:1}.lk-key small{font-size:.75rem;font-weight:900;text-transform:uppercase;letter-spacing:.05em}
.lk-flash{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#fff;transition:background .08s;
  font-family:var(--display,sans-serif);text-shadow:0 2px 0 rgba(0,0,0,.35);-webkit-user-select:none;user-select:none}
.lk-flash .lk-sym{font-size:min(60vw,320px);line-height:1;color:rgba(0,0,0,.35);text-shadow:none}
.lk-flash .lk-count{font-size:6rem;line-height:1;color:var(--led,#7FE8FF)}
.lk-flash small{font-family:var(--hud,monospace);font-size:1.1rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.85)}`;
  document.head.appendChild(s);
}
