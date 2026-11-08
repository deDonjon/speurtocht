// audio.js — het geluidspalet van het Pannenkoekenmonster, helemaal uit Web Audio (geen bestanden).
//   import { audio } from './js/audio.js';
//   audio.play('plop')            // naam uit SOUNDS hieronder
//   audio.hum()  → { pulse(strength), stop() }   // lage brom onder de stem van het monster
//   audio.buzz(patroon)           // trillen via pkm.buzz (iPhone: alleen een tikje direct na een tik)
//   audio.muted()                 // dempknop (localStorage pkm2_muted, gezet door index.html)
//   audio.chime([freq…])          // oude toonreeks, voor wie nog chime gebruikt
//
// iPhone: Web Audio zwijgt tot de eerste tik en standaard ook bij de stil-schakelaar.
// Bij elke tik maken we de context wakker en zetten we audioSession op 'playback'.

const MUTE_KEY = 'pkm2_muted';
let ctx = null, master = null, noiseBuf = null;

export function muted() {
  try { return JSON.parse(localStorage.getItem(MUTE_KEY)) === true; } catch { return false; }
}

function context() {
  try {
    if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      master = ctx.createGain(); master.gain.value = 0.9;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state !== 'running') {
      ctx.resume?.();
      const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, 22050); b.connect(ctx.destination); b.start(0);
    }
  } catch { return null; }
  return ctx;
}
export function unlock() { context(); }
if (typeof addEventListener === 'function') {
  addEventListener('pointerdown', unlock, { capture: true, passive: true });
  addEventListener('touchend', unlock, { capture: true, passive: true });
}

// ---------------------------------------------------------------- bouwstenen
function noise() {
  if (noiseBuf) return noiseBuf;
  const n = ctx.sampleRate * 0.6; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
// Eén toon met een korte envelop. f mag een getal of [van, naar] zijn (glijdende toonhoogte).
function tone({ f = 440, type = 'triangle', at = 0, dur = 0.2, vol = 0.35, attack = 0.01, vib = 0, filter = 0 }) {
  const t = ctx.currentTime + 0.02 + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  const [f0, f1] = Array.isArray(f) ? f : [f, f];
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vib; lg.gain.value = f0 * 0.06; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = o.connect(g);
  if (filter) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = filter; out = out.connect(lp); }
  out.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}
function hiss({ at = 0, dur = 0.2, vol = 0.3, from = 2000, to = 400, q = 1.2, type = 'bandpass' }) {
  const t = ctx.currentTime + 0.02 + at;
  const s = ctx.createBufferSource(); s.buffer = noise();
  const bp = ctx.createBiquadFilter(); bp.type = type; bp.Q.value = q;
  bp.frequency.setValueAtTime(from, t); bp.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bp).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.05);
}
const notes = (fs, step, opt = {}) => fs.forEach((f, i) => tone({ f, at: i * step, dur: opt.dur || 0.3, vol: opt.vol || 0.3, type: opt.type || 'triangle' }));

// ---------------------------------------------------------------- het palet
export const SOUNDS = {
  plop()     { tone({ f: [620, 170], type: 'sine', dur: 0.12, vol: 0.5 }); hiss({ dur: 0.05, vol: 0.08, from: 900, to: 500 }); },     // stroop-plop bij een zet
  deel()     { notes([523, 587, 659, 698, 784, 880, 988, 1047], 0.075, { dur: 0.22, vol: 0.26 }); tone({ f: 2093, type: 'sine', at: 0.62, dur: 0.5, vol: 0.12, vib: 7 }); }, // toonladdertje
  spetter()  { tone({ f: [140, 50], type: 'sine', dur: 0.22, vol: 0.6 }); hiss({ dur: 0.28, vol: 0.32, from: 2600, to: 350, q: 0.8 }); hiss({ at: 0.06, dur: 0.12, vol: 0.12, from: 4000, to: 1500 }); }, // landing
  val()      { hiss({ dur: 0.45, vol: 0.1, from: 3500, to: 600, q: 3 }); },                                                            // vallen (whoosh)
  klik()     { tone({ f: 1900, type: 'square', dur: 0.03, vol: 0.12, filter: 3500 }); tone({ f: 1250, type: 'square', at: 0.04, dur: 0.03, vol: 0.1, filter: 3500 }); }, // vastklikken
  brom()     { tone({ f: [110, 92], type: 'sawtooth', dur: 0.5, vol: 0.22, filter: 420 }); tone({ f: [55, 46], type: 'sine', dur: 0.55, vol: 0.25 }); }, // korte brom (ballon zonder stem)
  tik()      { tone({ f: 1250, type: 'sine', dur: 0.05, vol: 0.4 }); },                                                             // aftellen
  tak()      { tone({ f: 880, type: 'sine', dur: 0.06, vol: 0.4 }); },
  fout()     { tone({ f: [330, 300], type: 'square', dur: 0.16, vol: 0.18, filter: 1200 }); tone({ f: [233, 180], type: 'square', at: 0.16, dur: 0.3, vol: 0.18, filter: 900 }); },
  hint()     { tone({ f: 659, type: 'sine', dur: 0.35, vol: 0.3 }); tone({ f: 880, type: 'sine', at: 0.13, dur: 0.5, vol: 0.28, vib: 6 }); tone({ f: 1760, type: 'sine', at: 0.13, dur: 0.4, vol: 0.06 }); },
  badge()    { notes([784, 988, 1175, 1568], 0.08, { dur: 0.35, vol: 0.24 }); hiss({ at: 0.3, dur: 0.4, vol: 0.06, from: 8000, to: 5000, q: 2 }); },
  giggle()   { [0, 1, 2, 3, 4].forEach(i => tone({ f: [1050 - i * 60, 820 - i * 60], type: 'sine', at: i * 0.085, dur: 0.07, vol: 0.22, vib: 30 })); }, // hihihi
  start()    { notes([262, 330, 392, 523], 0.14, { dur: 0.4, vol: 0.4 }); },
  aankomst() { notes([523, 659, 784], 0.14, { dur: 0.38, vol: 0.4 }); },
  login()    { notes([392, 523], 0.14, { dur: 0.38, vol: 0.4 }); },
  ok()       { notes([523, 784], 0.14, { dur: 0.38, vol: 0.4 }); },
};

export const audio = {
  muted,
  unlock,
  names: Object.keys(SOUNDS),
  /** Speel een geluid uit het palet. Stil als de dempknop aan staat. */
  play(name) {
    if (muted() || !SOUNDS[name]) return;
    if (!context()) return;
    try { SOUNDS[name](); } catch (e) { console.warn('[audio]', name, e); }
  },
  /** Oude toonreeks (triangle, 0,14 s per noot). */
  chime(fs) {
    if (muted() || !context()) return;
    try { notes(fs, 0.14, { dur: 0.38, vol: 0.45 }); } catch {}
  },
  /** Lage brom onder de stem: draait zacht door, pulse() geeft per woord een duwtje. */
  hum() {
    if (muted() || !context()) return { pulse() {}, stop() {} };
    const t = ctx.currentTime;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'sawtooth'; o1.frequency.value = 74; o2.type = 'sine'; o2.frequency.value = 37;
    lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.2);
    o1.connect(lp); o2.connect(lp); lp.connect(g).connect(master); o1.start(t); o2.start(t);
    let stopped = false;
    return {
      pulse(s = 1) {
        if (stopped) return; const n = ctx.currentTime;
        g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n);
        g.gain.exponentialRampToValueAtTime(0.03 + 0.11 * s, n + 0.03); g.gain.exponentialRampToValueAtTime(0.03, n + 0.28);
        o1.frequency.setValueAtTime(70 + Math.random() * 10, n);
      },
      stop() {
        if (stopped) return; stopped = true; const n = ctx.currentTime;
        g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n); g.gain.exponentialRampToValueAtTime(0.0001, n + 0.25);
        o1.stop(n + 0.3); o2.stop(n + 0.3);
      },
    };
  },
  /** Trillen. Via pkm.buzz van index.html (die kent de iPhone-truc), anders navigator.vibrate. */
  buzz(pattern) {
    const b = globalThis.pkm?.buzz;
    if (b) { try { b(pattern); } catch {} return; }
    try { navigator.vibrate?.(pattern); } catch {}
  },
};

export default audio;
