// _shared.js — hulpjes voor de puzzels die over meerdere telefoons lopen (splits, slot, sync).
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** Deterministische random uit de seed van de puzzelstand (zelfde op elke telefoon). */
export function rng(seed) { let a = (seed ?? 1) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Stuk i van n hoort bij toestel i mod phones. Geeft de stukken van toestel d. */
export function piecesFor(n, d, phones) { phones = Math.max(1, phones | 0); d = ((d | 0) % phones + phones) % phones; const out = []; for (let i = 0; i < n; i++) if (i % phones === d) out.push(i); return out; }
/** Index van dit toestel (api.deviceIndex, anders 0) en het aantal toestellen (api.phones). */
export function myDevice(api) { return { d: Math.max(0, api.deviceIndex | 0), n: Math.max(1, api.phones | 0) }; }
/** Toestel-id van de speler die een zet deed (voor zetten die per telefoon tellen). */
export function deviceOfMove(move, ctx) { return (ctx.players || []).find(p => p.id === move.by)?.device_id || move.by || 'x'; }
export const WRONG = ['Hmm, dat is het niet. Probeer nog eens!', 'Nog niet goed. Overleg even!', 'Bijna... of toch niet. Nog een keer!'];
/** Namen van de bewakers op het toestel met index d, voor "vraag het aan …". */
export function namesOf(d, api) {
  const dev = (api.devices || [])[d]; if (!dev) return `telefoon ${d + 1}`;
  const names = (api.players || []).filter(p => p.device_id === dev).map(p => p.name);
  return names.length ? names.join(' & ') : `telefoon ${d + 1}`;
}
