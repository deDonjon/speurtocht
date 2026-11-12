// hoera.js — de hoera-meter in de finale (13 nov): hoe harder de meiden HOERA roepen, hoe hoger de meter. Alleen op het kernscherm.
//
//   const meter = createHoeraMeter({ top, floor })   top/floor in dBFS: floor = 0 %, top = 100 % (zie HOERA_TOP / HOERA_FLOOR)
//   await meter.vraag()      vraagt de microfoon één keer (bij "Kern aanzetten", zodat de vraag niet midden in de finale komt) en laat hem weer los
//   await meter.open()       microfoon open (begin van de finale); false = geen microfoon of geen toestemming → de finale loopt gewoon door
//   await meter.listen(ms, onLevel)   luistert ms lang; onLevel(nu, piek) in procenten, ±20× per seconde → piek (0–100), of null zonder microfoon.
//                            Geeft onLevel true terug, dan stopt het luisteren meteen (de kaarsjes in de finale).
//   meter.close()            microfoon los
//   meter.ok                 true zolang de microfoon open is; meter.maxDb = de hardste meting in dBFS (voor het bijstellen)
//
// Meet het volume (RMS) van de microfoon, zonder automatische versterking (anders is elke kreet even hard). De echo-onderdrukking
// staat aan, zodat de muziek uit de eigen luidspreker minder meetelt. Er wordt niets opgenomen of verstuurd.
export const HOERA_FLOOR = -46; // dBFS: stil in de kamer = 0 %
export const HOERA_TOP = -14;   // dBFS: zes meiden die gillen = 100 % (bijstellen: kern.html?hoeratop=-20 → makkelijker, -10 → moeilijker)
export const pct = (db, floor = HOERA_FLOOR, top = HOERA_TOP) => Math.max(0, Math.min(100, Math.round((db - floor) / (top - floor) * 100)));
export const hoeraLabel = p => p >= 90 ? 'MEGA-HOERA!' : p >= 60 ? 'Keihard!' : p >= 30 ? 'Lekker hard' : 'Fluisterstand';
export const hoeraTier = p => p >= 90 ? 'mega' : p >= 60 ? 'hard' : 'zacht';

export function createHoeraMeter({ top = HOERA_TOP, floor = HOERA_FLOOR } = {}) {
  let stream = null, ctx = null, an = null, buf = null, maxDb = -100;
  const media = () => globalThis.navigator?.mediaDevices?.getUserMedia ? globalThis.navigator.mediaDevices : null;
  const get = () => media().getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
  function close() {
    try { stream?.getTracks().forEach(t => t.stop()); } catch {}
    try { ctx?.close?.(); } catch {}
    stream = ctx = an = buf = null;
  }
  async function vraag() {
    if (!media()) return false;
    try { const s = await get(); s.getTracks().forEach(t => t.stop()); return true; } catch (e) { console.warn('[hoera] geen microfoon', e?.message || e); return false; }
  }
  async function open() {
    if (an) return true;
    if (!media()) return false;
    try {
      stream = await get();
      ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
      await ctx.resume?.().catch?.(() => {});
      an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
      ctx.createMediaStreamSource(stream).connect(an); // niet naar de luidspreker: alleen meten
      buf = new Float32Array(an.fftSize); maxDb = -100;
      return true;
    } catch (e) { console.warn('[hoera] microfoon open', e?.message || e); close(); return false; }
  }
  function db() {
    an.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-7);
  }
  async function listen(ms = 2600, onLevel = () => {}) {
    if (!an) return null;
    let level = 0, piek = 0; const end = Date.now() + ms;
    while (Date.now() < end && an) {
      const d = db(); maxDb = Math.max(maxDb, d);
      const p = pct(d, floor, top);
      level = p > level ? level + (p - level) * 0.6 : level + (p - level) * 0.25; // snel omhoog, rustig omlaag; één tik telt niet als kreet
      piek = Math.max(piek, level);
      let stop = false; try { stop = onLevel(Math.round(level), Math.round(piek)) === true; } catch {}
      if (stop) break; // onLevel geeft true terug = genoeg gehoord (kaarsjes uit)
      await new Promise(r => setTimeout(r, 50));
    }
    return Math.round(piek);
  }
  return { vraag, open, listen, close, get ok() { return !!an; }, get maxDb() { return Math.round(maxDb); }, top, floor };
}
export default createHoeraMeter;
