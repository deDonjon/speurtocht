// audio.js — het geluidspalet van Mecha-Pof, de keukenrobot, helemaal uit Web Audio (geen bestanden).
// Toon: lief en speels, met een randje keukenmechaniek (piepjes, servo-zoem, tandwieltjes, ovenbel, stoompufje). Nooit hard of stoer.
//   import { audio } from './js/audio.js';
//   audio.play('plop')            // naam uit SOUNDS hieronder (installatie: 'vlieg' en 'vast'; 'holo'; 'mega')
//   audio.playBuffer(buf, { galm })  // stem afspelen; galm = lichte nagalm voor Mega-Mecha-Pof
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
// robotbouwstenen
const blip = (f0, f1, at = 0, vol = 0.22, dur = 0.07) => tone({ f: [f0, f1], type: 'sine', at, dur, vol, attack: 0.004 });          // bliep / bloep
const bell = (f, at = 0, vol = 0.2, dur = 0.9) => {                                                                                  // ovenbelletje (metaalachtig, met boventonen)
  tone({ f, type: 'sine', at, dur, vol, attack: 0.003 });
  tone({ f: f * 2.76, type: 'sine', at, dur: dur * 0.5, vol: vol * 0.3, attack: 0.003 });
  tone({ f: f * 5.4, type: 'sine', at, dur: dur * 0.25, vol: vol * 0.12, attack: 0.002 });
};
const whirr = (f0, f1, at = 0, dur = 0.3, vol = 0.07) => tone({ f: [f0, f1], type: 'sawtooth', at, dur, vol, attack: 0.04, filter: 1100, vib: 28 }); // servo-zoem
const ratchet = (n, at = 0, step = 0.035, vol = 0.12) => { for (let i = 0; i < n; i++) hiss({ at: at + i * step, dur: 0.022, vol, from: 3400, to: 2800, q: 5 }); }; // tandwieltjes
const puff = (at = 0, vol = 0.07) => hiss({ at, dur: 0.35, vol, from: 5000, to: 1800, q: 0.5, type: 'highpass' });                     // stoompufje
// Nagalm-impuls voor de galm (Mega-Mecha-Pof): 0,9 s ruis die exponentieel uitsterft, één keer gemaakt per context.
let impulseBuf = null;
function impulse(c) {
  if (impulseBuf && impulseBuf.sampleRate === c.sampleRate) return impulseBuf;
  const n = Math.floor(c.sampleRate * 0.9); impulseBuf = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = impulseBuf.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6) * (i < 400 ? i / 400 : 1); }
  return impulseBuf;
}

// ---------------------------------------------------------------- het palet
export const SOUNDS = {
  plop()     { blip(900, 1350, 0, 0.28, 0.06); tone({ f: 2400, type: 'square', at: 0.005, dur: 0.02, vol: 0.05, filter: 4000 }); },  // toetsje bij een zet: bliep
  deel()     { whirr(220, 660, 0, 0.32); ratchet(4, 0.05, 0.05, 0.09);                                                                  // servo draait, tandwieltjes, dan het muziekdoosje
               [784, 880, 1047, 1175, 1319, 1568].forEach((f, i) => tone({ f, type: 'sine', at: 0.32 + i * 0.07, dur: 0.25, vol: 0.2 })); bell(2093, 0.78, 0.14, 1); },
  spetter()  { tone({ f: [150, 55], type: 'sine', dur: 0.22, vol: 0.55 }); tone({ f: 420, type: 'square', dur: 0.05, vol: 0.06, filter: 1600 });
               bell(330, 0.01, 0.1, 0.35); puff(0.08, 0.1); ratchet(2, 0.12, 0.05, 0.08); },                                              // deel klikt vast: tonk-klink-pssst
  val()      { hiss({ dur: 0.45, vol: 0.09, from: 3500, to: 600, q: 3 }); tone({ f: [1400, 500], type: 'sine', dur: 0.4, vol: 0.06, vib: 9 }); }, // vallen (jetpack-zwiepje)
  klik()     { tone({ f: 1900, type: 'square', dur: 0.03, vol: 0.1, filter: 3500 }); tone({ f: 1250, type: 'square', at: 0.04, dur: 0.03, vol: 0.09, filter: 3500 }); }, // vastklikken
  brom()     { blip(520, 760, 0, 0.18, 0.09); blip(760, 600, 0.11, 0.16, 0.09); blip(600, 980, 0.22, 0.18, 0.12); },                    // bie-bu-bliep (ballon zonder stem)
  tik()      { tone({ f: 1250, type: 'sine', dur: 0.05, vol: 0.4 }); },                                                             // aftellen
  tak()      { tone({ f: 880, type: 'sine', dur: 0.06, vol: 0.4 }); },
  fout()     { blip(520, 470, 0, 0.24, 0.14); blip(400, 300, 0.17, 0.24, 0.26); tone({ f: 150, type: 'square', at: 0.17, dur: 0.22, vol: 0.04, filter: 600 }); }, // bu-buuu (verdrietig, niet streng)
  hint()     { blip(660, 1320, 0, 0.22, 0.1); bell(1760, 0.12, 0.16, 0.7); },                                                       // lampje gaat aan: bliep-ting
  badge()    { notes([784, 988, 1175, 1568], 0.08, { dur: 0.35, vol: 0.22, type: 'sine' }); bell(2093, 0.34, 0.12, 0.8); },
  giggle()   { [0, 1, 2, 3, 4].forEach(i => blip(1300 - i * 70, 980 - i * 70, i * 0.075, 0.18, 0.06)); },                            // robot-hihihi
  start()    { whirr(110, 440, 0, 0.45, 0.08); ratchet(5, 0.08, 0.06, 0.08);                                                        // opstarten: zoem, tandwieltjes, piepjes, belletje
               blip(523, 523, 0.45, 0.2, 0.07); blip(659, 659, 0.55, 0.2, 0.07); blip(784, 784, 0.65, 0.2, 0.07); bell(1047, 0.78, 0.22, 1); puff(0.8, 0.06); },
  aankomst() { bell(1319, 0, 0.22, 0.6); bell(1319, 0.32, 0.09, 0.5); blip(784, 1568, 0.18, 0.14, 0.12); },                         // radarping met echo
  login()    { blip(600, 900, 0, 0.24, 0.07); blip(900, 1200, 0.1, 0.24, 0.09); },                                                    // bie-dup
  ok()       { bell(1568, 0, 0.22, 0.8); },                                                                                         // ting! (ovenbel)
  zend()     { hiss({ dur: 0.09, vol: 0.12, from: 3200, to: 2200, q: 0.7 }); tone({ f: 1400, type: 'square', at: 0.05, dur: 0.05, vol: 0.08, filter: 2500 }); }, // walkietalkie: knop in
  bel()      { [0, 0.42].forEach(at => { tone({ f: 1320, type: 'square', at, dur: 0.16, vol: 0.12, filter: 3000 }); tone({ f: 1660, type: 'square', at: at + 0.18, dur: 0.16, vol: 0.12, filter: 3000 }); }); }, // terugbellen: tring-tring
  over()     { tone({ f: [1300, 900], type: 'square', dur: 0.08, vol: 0.08, filter: 2500 }); hiss({ at: 0.05, dur: 0.22, vol: 0.14, from: 2600, to: 900, q: 0.6 }); }, // knop los: "over!"
  // installatie (monster.js): het deel vliegt in beeld (zwiep + servo) en klikt vast (klak-klik met een vonkje)
  vlieg()    { hiss({ dur: 0.7, vol: 0.07, from: 500, to: 2600, q: 1.4 }); whirr(260, 820, 0.05, 0.6, 0.05); tone({ f: [600, 1500], type: 'sine', at: 0.1, dur: 0.55, vol: 0.04, vib: 7 }); },
  vast()     { tone({ f: [820, 380], type: 'sine', dur: 0.09, vol: 0.5, attack: 0.003 }); tone({ f: 2300, type: 'square', dur: 0.025, vol: 0.09, filter: 4200 }); // klak!
               tone({ f: 1560, type: 'square', at: 0.07, dur: 0.03, vol: 0.08, filter: 4000 }); bell(1976, 0.08, 0.1, 0.45);                                  // klik + tingel
               ratchet(3, 0.1, 0.03, 0.07); blip(1046, 1568, 0.2, 0.14, 0.09); },                                                                         // vonkjes, bliep: zit vast
  // hologram verschijnt (alleen het pantser gevonden): zacht gezoem met een flakkertje
  holo()     { tone({ f: [320, 640], type: 'sine', dur: 0.5, vol: 0.09, attack: 0.08, vib: 14 }); tone({ f: [1800, 2300], type: 'sine', at: 0.05, dur: 0.6, vol: 0.035, vib: 40 });
               hiss({ at: 0.3, dur: 0.25, vol: 0.04, from: 4000, to: 6000, q: 2, type: 'bandpass' }); },
  // Mega-Mecha-Pof: opstartzoem die omhoog gaat, tandwielen, akkoord van ovenbellen, stoompuf en een warme bas
  mega()     { whirr(90, 720, 0, 1.3, 0.09); ratchet(8, 0.15, 0.07, 0.07); puff(1.1, 0.08);
               [523, 659, 784, 1047].forEach((f, i) => bell(f, 1.25 + i * 0.09, 0.18, 1.4)); tone({ f: [65, 98], type: 'triangle', at: 1.25, dur: 1.2, vol: 0.22, attack: 0.05, filter: 400 }); },
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
  /** mp3 (ArrayBuffer) → AudioBuffer, voor de monsterstem (js/voice.js). */
  async decode(arr) {
    const c = context(); if (!c) throw new Error('geen geluid');
    return await new Promise((ok, fail) => { const p = c.decodeAudioData(arr, ok, fail); p?.catch?.(fail); });
  },
  /** Speel een AudioBuffer af via de luidspreker, met een meter voor de mond.
      → { done: Promise, level() 0..1, stop() }. Gaat niet via de compressor van het palet: een stem moet schoon klinken.
      { galm: true } = lichte galm (Mega-Mecha-Pof): een korte nagalm plus een zachte echo, de stem zelf blijft voorop. */
  playBuffer(buf, { galm = false } = {}) {
    const c = context(); if (!c) throw new Error('geen geluid');
    const src = c.createBufferSource(), an = c.createAnalyser(), g = c.createGain();
    src.buffer = buf; an.fftSize = 512; g.gain.value = 1;
    src.connect(an); an.connect(g).connect(c.destination);
    if (galm) {
      try {
        const conv = c.createConvolver(), wet = c.createGain(), dl = c.createDelay(0.5), fb = c.createGain(), wetD = c.createGain(), lp = c.createBiquadFilter();
        conv.buffer = impulse(c); wet.gain.value = 0.32; dl.delayTime.value = 0.14; fb.gain.value = 0.28; wetD.gain.value = 0.2;
        lp.type = 'lowpass'; lp.frequency.value = 2600;
        g.connect(conv).connect(wet).connect(c.destination);
        g.connect(dl); dl.connect(fb).connect(lp).connect(dl); dl.connect(wetD).connect(c.destination);
      } catch (e) { console.warn('[audio] galm', e); }
    }
    const data = new Uint8Array(an.fftSize);
    let stopped = false, end;
    const done = new Promise(r => { end = r; src.onended = () => { stopped = true; r(true); }; });
    const go = () => { try { src.start(); } catch { end(false); } };
    if (c.state === 'running') go(); else c.resume?.().then(go, () => end(false));
    return {
      done,
      duration: buf.duration,
      level() {
        if (stopped) return 0;
        an.getByteTimeDomainData(data);
        let sum = 0; for (let i = 0; i < data.length; i++) { const x = (data[i] - 128) / 128; sum += x * x; }
        return Math.min(1, Math.sqrt(sum / data.length) * 4.5); // spraak ≈ 0,1–0,25 rms → 0,45–1
      },
      stop() { if (stopped) return; stopped = true; try { src.stop(); } catch {} end(false); },
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
