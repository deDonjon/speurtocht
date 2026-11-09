// voice.js — de echte stem van Mecha-Pof (ElevenLabs) voor alles wat het monster zegt buiten de walkietalkie.
//
//   import { voice, uitspraak } from './voice.js?v=3';
//   const p = await voice.speak(text, { galm })  → { done: Promise, level() 0..1, stop(), duration }   (gooit een fout als het niet lukt)
//                                         galm = lichte nagalm (Mega-Mecha-Pof, zie monster.js); de mp3 blijft dezelfde
//   voice.prewarm(texts, onProgress)    → zinnen vooraf laten opnemen (testpagina)
//   uitspraak(text)                     → tekst zoals de stem hem moet uitspreken (Evy → Eevie)
//
// Elke zin staat als mp3 in de openbare bucket `monster`: tts/<VOICE_VERSION>/<sha256 van de tekst>.mp3.
//   1. Eerst proberen we die URL rechtstreeks (snel, gratis, ook als de zin al eens gezegd is).
//   2. Bestaat hij niet: Edge Function `monster-tts` maakt hem met de monsterstem en bewaart hem.
//   3. Lukt dat niet binnen TIMEOUT_MS: de app valt terug op de stem van de telefoon (monster.js).
// Andere stem of andere instellingen? Hoog VOICE_VERSION op, dan worden alle zinnen opnieuw gemaakt.
import { audio } from './audio.js?v=9';
import { SUPABASE_URL, SUPABASE_KEY } from './sync.js';

export const VOICE_VERSION = 'pof1';
const TTS_URL = SUPABASE_URL + '/functions/v1/monster-tts';
const FILE_URL = SUPABASE_URL + '/storage/v1/object/public/monster/tts/' + VOICE_VERSION + '/';
const TIMEOUT_MS = 7000;
const OFF_KEY = 'pkm2_voice_off'; // testpagina: '1' = altijd de telefoonstem

// Namen die de stem anders zou uitspreken. Alleen voor de stem; op het scherm blijft de echte spelling.
const UITSPRAAK = [
  [/\bEvy\b/g, 'Eevie'],
  [/\bMecha-Pof\b/g, 'Mekka-Pof'],
];
export function uitspraak(text) { return UITSPRAAK.reduce((t, [re, s]) => t.replace(re, s), String(text ?? '')); }

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const buffers = new Map(); // tekst → Promise<AudioBuffer>
let failures = 0, failedAt = 0;

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('te traag')), ms))]);
}
async function fetchMp3(text) {
  const file = FILE_URL + await sha256(text) + '.mp3';
  let r = await fetch(file).catch(() => null);
  if (!r?.ok) {
    const g = await fetch(TTS_URL, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, v: VOICE_VERSION }) });
    const j = await g.json().catch(() => ({}));
    if (!g.ok || !j.url) throw new Error(j.error || 'stem: ' + g.status);
    r = await fetch(j.url);
    if (!r.ok) throw new Error('stem: mp3 ' + r.status);
  }
  return await r.arrayBuffer();
}
function load(text) {
  if (!buffers.has(text)) {
    const p = fetchMp3(text).then(arr => audio.decode(arr));
    p.catch(() => buffers.delete(text));
    buffers.set(text, p);
  }
  return buffers.get(text);
}

export const voice = {
  /** Staat de echte stem aan? (uit op de testpagina, of even uit na een paar fouten achter elkaar) */
  enabled() {
    try { if (localStorage.getItem(OFF_KEY) === '1') return false; } catch {}
    if (typeof crypto === 'undefined' || !crypto.subtle) return false;
    if (failures >= 3 && Date.now() - failedAt < 60_000) return false; // geen internet: een minuut niet proberen
    return true;
  },
  setEnabled(on) { try { on ? localStorage.removeItem(OFF_KEY) : localStorage.setItem(OFF_KEY, '1'); } catch {} },
  /** Zeg de tekst met de monsterstem. Gooit een fout als het (op tijd) niet lukt; de beller valt dan terug.
      { galm: true } geeft de stem een lichte galm (Mega-Mecha-Pof); het opgenomen bestand verandert niet. */
  async speak(text, { galm = false } = {}) {
    const t = uitspraak(text).trim();
    if (!t) throw new Error('lege tekst');
    try {
      const buf = await withTimeout(load(t), TIMEOUT_MS);
      failures = 0;
      return audio.playBuffer(buf, { galm });
    } catch (e) { failures++; failedAt = Date.now(); throw e; }
  },
  /** Zinnen vooraf laten maken (en in de cache van deze telefoon zetten). onProgress(i, n, text, ok). */
  async prewarm(texts, onProgress) {
    const list = [...new Set(texts.map(x => uitspraak(x).trim()).filter(Boolean))];
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      let good = false;
      try { await load(list[i]); good = true; ok++; } catch (e) { console.warn('[voice] prewarm', list[i], e); }
      onProgress?.(i + 1, list.length, list[i], good);
    }
    return { ok, total: list.length };
  },
};

export default voice;
