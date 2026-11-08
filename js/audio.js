// audio.js — het geluidspalet van het Pannenkoekenmonster, helemaal uit Web Audio (geen bestanden).
//   import { audio } from './js/audio.js';
//   audio.play('plop')            // naam uit SOUNDS hieronder
//   audio.hum()  → { pulse(strength), stop() }   // funky wah-baslijn onder de stem van het monster
//   audio.buzz(patroon)           // trillen via pkm.buzz (iPhone: alleen een tikje direct na een tik)
//   audio.muted()                 // dempknop (localStorage pkm2_muted, gezet door index.html)
//   audio.chime([freq…])          // oude toonreeks, voor wie nog chime gebruikt
//
// iPhone: Web Audio zwijgt tot de eerste tik en standaard ook bij de stil-schakelaar.
// Bij elke tik maken we de context wakker en zetten we audioSession op 'playback' ('play-and-record' zolang de walkietalkie open is).

const MUTE_KEY = 'pkm2_muted';
let ctx = null, master = null, noiseBuf = null;

export function muted() {
  try { return JSON.parse(localStorage.getItem(MUTE_KEY)) === true; } catch { return false; }
}

function context() {
  try {
    const want = recording ? 'auto' : 'playback'; // walkietalkie open: Safari kiest zelf (microfoon + luidspreker)
    if (navigator.audioSession && navigator.audioSession.type !== want) navigator.audioSession.type = want;
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // iOS zet de context op 'interrupted' (bijv. na de stem of een melding): bij de volgende kans weer aanzetten.
      ctx.onstatechange = () => { lastState = ctx.state; if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume?.().catch(() => {}); };
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      master = ctx.createGain(); master.gain.value = 0.9;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state !== 'running') {
      ctx.resume?.().catch(() => {});
      const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, 22050); b.connect(ctx.destination); b.start(0);
    }
  } catch { return null; }
  return ctx;
}
let lastState = 'nog niet gestart', unlocks = 0, recording = false;
/** Walkietalkie aan/uit. In de stand 'playback' weigert iOS de microfoon; met 'auto' regelt Safari het zelf
    (microfoon aan, geluid via de luidspreker). 'play-and-record' kan het geluid naar het oorspeakertje sturen. */
export function setRecording(on) {
  recording = !!on;
  try { if (navigator.audioSession) navigator.audioSession.type = recording ? 'auto' : 'playback'; } catch {}
}
export function unlock() { unlocks++; context(); }
if (typeof addEventListener === 'function') {
  // iPhone: alleen touchend, click, pointerup en keydown tellen als 'echte' tik die geluid mag starten.
  for (const ev of ['pointerdown', 'touchend', 'pointerup', 'click', 'keydown']) addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener?.('visibilitychange', () => { if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') ctx.resume?.().catch(() => {}); });
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
  zend()     { hiss({ dur: 0.09, vol: 0.12, from: 3200, to: 2200, q: 0.7 }); tone({ f: 1400, type: 'square', at: 0.05, dur: 0.05, vol: 0.08, filter: 2500 }); }, // walkietalkie: knop in
  over()     { tone({ f: [1300, 900], type: 'square', dur: 0.08, vol: 0.08, filter: 2500 }); hiss({ at: 0.05, dur: 0.22, vol: 0.14, from: 2600, to: 900, q: 0.6 }); }, // knop los: "over!"
};

export const audio = {
  muted,
  unlock,
  names: Object.keys(SOUNDS),
  /** Speel een geluid uit het palet. Stil als de dempknop aan staat. */
  play(name) {
    if (muted() || !SOUNDS[name]) return;
    if (!context()) return;
    const go = () => { try { SOUNDS[name](); } catch (e) { console.warn('[audio]', name, e); } };
    // Nog niet aan (iPhone vóór de eerste tik, of 'interrupted'): eerst aanzetten, dan pas spelen.
    if (ctx.state === 'running') go(); else ctx.resume?.().then(go, () => {});
  },
  /** Kale testpiep, rechtstreeks naar de luidspreker (zonder palet, compressor of dempknop). */
  beep() {
    const c = context(); if (!c) return;
    const go = () => { const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + 0.02; o.frequency.value = 880; g.gain.setValueAtTime(0.4, t); g.gain.setValueAtTime(0, t + 0.25); o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.3); };
    if (c.state === 'running') go(); else c.resume?.().then(go, () => {});
  },
  /** Voor de geluidscheck op test/monster.html. */
  status() {
    return { opnemen: recording, context: ctx ? ctx.state : lastState, audioSession: navigator.audioSession?.type ?? '(niet beschikbaar)', muted: muted(), tikken: unlocks, sampleRate: ctx?.sampleRate ?? null };
  },
  /** Oude toonreeks (triangle, 0,14 s per noot). */
  chime(fs) {
    if (muted() || !context()) return;
    try { notes(fs, 0.14, { dur: 0.38, vol: 0.45 }); } catch {}
  },
  /** Funky baslijn onder de stem: zachte wah-bas die per woord een noot uit de pentatonische toonladder pakt. */
  hum() {
    if (muted() || !context()) return { pulse() {}, stop() {} };
    const t = ctx.currentTime;
    const NOTES = [55, 65.41, 73.42, 82.41, 98, 110]; // A-mineur pentatonisch (A1 … A2)
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'sawtooth'; o1.frequency.value = NOTES[0]; o2.type = 'square'; o2.frequency.value = NOTES[0] / 2;
    lp.type = 'lowpass'; lp.frequency.value = 280; lp.Q.value = 7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + 0.2);
    o1.connect(lp); o2.connect(lp); lp.connect(g).connect(master); o1.start(t); o2.start(t);
    let stopped = false, step = 0;
    const RIFF = [0, 0, 3, 2, 0, 4, 3, 1]; // klein loopje, met af en toe een sprongetje
    return {
      pulse(s = 1) {
        if (stopped) return; const n = ctx.currentTime;
        const f = NOTES[(RIFF[step++ % RIFF.length] + (Math.random() < 0.15 ? 5 : 0)) % NOTES.length];
        o1.frequency.cancelScheduledValues(n); o1.frequency.setTargetAtTime(f, n, 0.015);
        o2.frequency.cancelScheduledValues(n); o2.frequency.setTargetAtTime(f / 2, n, 0.015);
        lp.frequency.cancelScheduledValues(n); lp.frequency.setValueAtTime(260, n);
        lp.frequency.exponentialRampToValueAtTime(900 + 500 * s, n + 0.05); lp.frequency.exponentialRampToValueAtTime(280, n + 0.3); // wah
        g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n);
        g.gain.exponentialRampToValueAtTime(0.025 + 0.08 * s, n + 0.02); g.gain.exponentialRampToValueAtTime(0.025, n + 0.26);
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
