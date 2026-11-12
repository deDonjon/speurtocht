// roles.js — drie telefoons, drie rollen, roterend per stop. Zie claude/MECHA-POF-SPEL.md.
//   radio    : Mecha-Pof praat hardop, walkietalkie, inkomende oproepen (vervangt isSpeakerPhone)
//   kaart    : kaart, afstand, warmer/kouder; de anderen zien alleen de aanwijzing
//   werkbank : puzzelinvoer en indienen (de Sleutelbewaarder-regel blijft)
// Rol = (volgnummer van de stop + plaats van het toestel in de gesorteerde device-lijst) mod 3.
// Met 1 of 2 toestellen online vallen rollen samen: elke rol heeft altijd precies één eigenaar.
// Alles wordt uit `state` afgeleid, dus elke telefoon komt op dezelfde verdeling uit.
import { state } from './state.js';

export const ROLES = ['radio', 'kaart', 'werkbank'];
export const ROLE_INFO = {
  radio:    { icon: '📻', label: 'Radio',    short: 'Mecha-Pof praat via deze telefoon' },
  kaart:    { icon: '🗺️', label: 'Kaart',    short: 'Deze telefoon ziet de kaart en de afstand' },
  werkbank: { icon: '🔧', label: 'Werkbank', short: 'Op deze telefoon wordt de puzzel gemaakt' },
};

/** Volgnummer van de actieve stop (0 in de lobby). */
export function stopIndex() { return state.get().game?.active_index ?? 0; }

/** Plaats van een toestel in de gesorteerde lijst, of -1. */
export function deviceIndex(deviceId = state.get().device.id, devices = state.devices()) { return devices.indexOf(deviceId); }

/** Eigenaar (index in `devices`) van rol-index r bij stop-index s, met n toestellen.
 *  Bij 3 toestellen: toestel d heeft rol (s + d) mod 3. Bij minder vouwen de ontbrekende toestellen op de aanwezige. */
export function ownerOf(r, s, n) {
  if (n <= 0) return 0;
  const full = ((r - s) % 3 + 3) % 3; // het toestel dat deze rol zou hebben als er drie waren
  return full % n;
}

/** Alle rollen van een toestel bij stop-index s (lijst van 0 tot 3 rollen). */
export function rolesOf(deviceId = state.get().device.id, s = stopIndex(), devices = state.devices()) {
  const n = devices.length, d = devices.indexOf(deviceId);
  if (d < 0) return n === 0 ? ROLES.slice() : []; // alleen op de wereld: alles; wel toestellen maar ik hoor er niet bij: niets
  return ROLES.filter((_, r) => ownerOf(r, s, n) === d);
}
export const myRoles = () => rolesOf();
export const hasRole = role => myRoles().includes(role);

/** Toestel-id dat een rol heeft bij de actieve stop. */
export function deviceWithRole(role, s = stopIndex(), devices = state.devices()) {
  const r = ROLES.indexOf(role); if (r < 0 || !devices.length) return null;
  return devices[ownerOf(r, s, devices.length)];
}
/** Namen van de bewakers op een toestel ("Hannah & Isa"). */
export function namesOnDevice(deviceId) {
  if (!deviceId) return '';
  const s = state.get();
  const live = state.playersOn?.(deviceId) || [];
  const ps = deviceId === s.device.id ? state.me() : s.players.filter(p => live.includes(p.id) || (p.device_id === deviceId && p.online));
  return ps.map(p => p.name).join(' & ');
}
/** Wie heeft een rol: "Hannah & Isa" of '' als dat deze telefoon is. */
export function whoHas(role) { const d = deviceWithRole(role); return d && d !== state.get().device.id ? namesOnDevice(d) : ''; }

/** Verdeling van `n` stukjes (puzzelfragmenten, draaischijven) over de toestellen: stuk i hoort bij toestel i mod phones.
 *  Geeft de indexen van de stukjes voor toestel `d`. */
export function piecesFor(n, d, phones) { phones = Math.max(1, phones | 0); const out = []; for (let i = 0; i < n; i++) if (i % phones === (d % phones + phones) % phones) out.push(i); return out; }

export default { ROLES, ROLE_INFO, stopIndex, deviceIndex, ownerOf, rolesOf, myRoles, hasRole, deviceWithRole, namesOnDevice, whoHas, piecesFor };
