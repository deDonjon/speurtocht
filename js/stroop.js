// stroop.js — de stroopmeter: wat stroopdruppels zijn, wat ze waard zijn en bij welk onderdeel (en welke monteur) ze horen.
// Regels (ongewijzigd, zie index.html dropsFor): per onderdeel 10 druppels, 3 minder per hint (minimaal 2),
// 3 extra als de puzzel binnen 4 minuten na aankomst is ingediend. Een fout antwoord kost niets.
// De druppels zijn van het hele team; per onderdeel laten we zien bij welke monteur ze horen (het talent van dat deel).
//   stackOf(drops, stops)            → hoogte van de pannenkoekenstapel (1..10), zelfde formule als het eindscherm
//   nextAt(drops, stops)             → druppels die nog nodig zijn voor de volgende pannenkoek (0 = stapel is vol)
//   loadDropLog(sync, state)         → Map(stop_id → { part, drops }) uit alle stop.solved van dit spel
//   dropRows(log, state)             → [{ part, icon, label, who, drops|null }] per onderdeel in routevolgorde, + bonus
//   dropsByPlayer(log, players)      → { [player_id]: druppels } voor het onderdeel van die monteur
import { PARTS, TALENTS } from './state.js';

export const BASE = 10, HINT_COST = 3, FAST_BONUS = 3, FAST_MS = 4 * 60_000;
export const stackOf = (drops = 0, stops = 7) => Math.max(1, Math.min(10, Math.round((drops || 0) / ((stops || 7) * 10) * 10)));
export function nextAt(drops = 0, stops = 7) {
  const s = stackOf(drops, stops); if (s >= 10) return 0;
  return Math.max(1, Math.ceil((s + 0.5) * (stops || 7)) - (drops || 0));
}
const monteurOf = (part, players = []) => { const t = Object.keys(TALENTS).find(k => TALENTS[k].part === part); return t ? players.find(p => p.talent === t) || null : null; };

/** Alle stop.solved van het lopende spel. Lukt de vraag aan de server niet, dan wat de telefoon zelf nog weet (laatste 50 events). */
export async function loadDropLog(sync, state) {
  const s = state.get(), t0 = Date.parse(s.game?.started_at || '') || 0;
  let rows = null;
  try { rows = await sync.solvedLog?.(); } catch {}
  if (!Array.isArray(rows)) rows = (s.events || []).filter(e => e.type === 'stop.solved');
  const log = new Map();
  rows.filter(e => (Date.parse(e.at) || Infinity) >= t0).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .forEach(e => { const p = e.payload || {}; if (p.stop_id) log.set(p.stop_id, { part: p.part || null, drops: +p.drops || 0 }); });
  return log;
}

export function dropRows(log, state) {
  const s = state.get(), players = s.players || [], byPart = {}; let bonus = 0, bonusN = 0;
  for (const v of (log || new Map()).values()) { if (v.part) byPart[v.part] = (byPart[v.part] || 0) + v.drops; else { bonus += v.drops; bonusN++; } }
  const order = (state.route?.() || []).map(x => x.part).filter(Boolean);
  const parts = [...new Set([...order, ...Object.keys(PARTS)])].filter(k => PARTS[k]);
  const got = s.game?.parts || [];
  const rows = parts.map(k => ({ part: k, icon: PARTS[k].icon, label: PARTS[k].label, who: monteurOf(k, players)?.name || 'het hele team',
    drops: k in byPart ? byPart[k] : got.includes(k) ? 0 : null }));
  if (bonusN) rows.push({ part: null, icon: '⭐', label: bonusN > 1 ? 'bonusopdrachten' : 'de bonusopdracht', who: 'het hele team', drops: bonus });
  return rows;
}

export function dropsByPlayer(log, players = []) {
  const out = {};
  for (const v of (log || new Map()).values()) { const m = v.part && monteurOf(v.part, players); if (m) out[m.id] = (out[m.id] || 0) + v.drops; }
  return out;
}

export default { BASE, HINT_COST, FAST_BONUS, FAST_MS, stackOf, nextAt, loadDropLog, dropRows, dropsByPlayer };
