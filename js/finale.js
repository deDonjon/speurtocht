// finale.js — de finale thuis en het eindscherm (chat 7, claude/ONBOARDING-FINALE.md §C). Gebruikt door index.html en kern.html.
//
//   const fin = createFinale({ mon, state, audio, confetti, voice: () => true|false|undefined, onStage, key })
//   fin.start()        speel de finale: Mega-Mecha-Pof groeit → LINES.mega 1-2-3 (met galm) → vers → confetti → finale + hints
//   fin.stage          'idle' | 'mega' | 'vers' | 'confetti' | 'finale' | 'eind'
//   fin.done           true als de finale (op dit toestel) al gespeeld is; blijft bewaard per spel (localStorage)
//   fin.reset()        opnieuw kunnen afspelen (kern.html: knop "Finale opnieuw")
//   fin.voice()        doorgegeven aan mon.say: true = altijd hardop (kern), false = alleen tekst, undefined = alleen de radiotelefoon
//   endCards(state)    HTML van het eindscherm: per speurder haar badges en één zin van Mecha-Pof (LINES.eind / eindBadge)
//
// Start: monster.js roept globalThis.pkm.finale.start() aan zodra het zevende deel (de hoed) na het installatieritueel geland is
// en de installatiezin klaar is. Kern.html heeft ook een knop. Speelt per toestel één keer per spel.
import { PARTS, TALENTS } from './state.js';
import { LINES, NAAM_JARIGE } from './monster-lines.js?v=7';

const PART_KEYS = Object.keys(PARTS);
const WOORDEN = ['nul', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien', 'elf', 'twaalf'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = l => Array.isArray(l) && l.length ? l[Math.floor(Math.random() * l.length)] : null;
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };

export function fillLine(text, { jarige, naam, hints } = {}) {
  const w = n => WOORDEN[n] ?? String(n);
  return String(text || '')
    .replace(/\{jarige\}/g, jarige || NAAM_JARIGE).replace(/\{naam\}/g, naam || '')
    .replace(/\{Hints\}/g, () => { const s = w(hints ?? 0); return s[0].toUpperCase() + s.slice(1); }).replace(/\{hints\}/g, () => w(hints ?? 0));
}

export const BADGES = {
  'kruimelaar-vanger': { icon: '🍪', label: 'Kruimelaar-vanger' },
  vonkenvanger:        { icon: '⚡', label: 'Vonkenvanger' },
  'jetpack-redder':    { icon: '🔥', label: 'Jetpack-redder' },
  wensvervuller:       { icon: '🎂', label: 'Wensvervuller' },
};
export function badgeInfo(b) {
  if (BADGES[b]) return BADGES[b];
  if (typeof b === 'string' && b.startsWith('monteur-')) { const p = PARTS[b.slice(8)]; return { icon: p?.icon || '🔧', label: 'Monteur ' + (p?.label || b.slice(8)).replace(/^(het|de) /, '') }; }
  return { icon: '🏅', label: String(b) };
}

/** Eindscherm: één kaart per speurder, jarige eerst, daarna op talentvolgorde. */
export function endCards(st) {
  const s = st.get(), order = Object.keys(TALENTS);
  const ps = s.players.slice().sort((a, b) => (!!b.is_birthday - !!a.is_birthday) || (order.indexOf(a.talent) - order.indexOf(b.talent)) || a.name.localeCompare(b.name));
  return ps.map(p => {
    const t = TALENTS[p.talent], part = t?.part, info = PARTS[part];
    const zin = fillLine(pick(LINES.eind?.[p.talent] || LINES.eind?.geen) || '', { naam: p.name });
    const extra = (p.badges || []).map(b => pick(LINES.eindBadge?.[b])).filter(Boolean).join(' ');
    const badges = [...new Set(p.badges || [])].map(b => { const x = badgeInfo(b); return `<span class="fin-badge" title="${esc(x.label)}">${x.icon} ${esc(x.label)}</span>`; }).join('');
    return `<div class="fin-card" style="--acc:${p.color || info?.color || '#7FE8FF'}">
      <div class="fin-head"><span class="fin-ic">${info?.icon || '⭐'}</span><div><b>${esc(p.name)}${p.is_birthday ? ' 🎂' : ''}</b><small>${esc(t?.label || 'Monteur')}${info ? ' · ' + esc(info.label) : ''}</small></div></div>
      <p class="fin-zin">“${esc(zin)}${extra ? ' ' + esc(extra) : ''}”</p>
      <div class="fin-badges">${badges || '<span class="fin-badge dim">nog geen badges</span>'}</div></div>`;
  }).join('');
}
export const END_CSS = `.fin-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;width:100%}
.fin-card{background:#0E1B2E;border:2px solid #3C4A66;border-left:8px solid var(--acc);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:8px;text-align:left;box-shadow:0 0 14px color-mix(in srgb,var(--acc) 22%,transparent)}
.fin-head{display:flex;gap:10px;align-items:center}.fin-head b{display:block;font-size:1.15rem;font-weight:900;color:#fff}.fin-head small{display:block;color:#93A0B8;font-size:.82rem}
.fin-ic{font-size:2rem;flex:none}.fin-zin{margin:0;font-weight:800;line-height:1.35;color:#EAF2FF}
.fin-badges{display:flex;gap:6px;flex-wrap:wrap}.fin-badge{background:#1A1F2A;border:1px solid #15A4C8;color:#7FE8FF;border-radius:999px;padding:2px 9px;font-size:.8rem;font-weight:800;white-space:nowrap}
.fin-badge.dim{border-color:#3C4A66;color:#93A0B8}`;

export function createFinale({ mon, state, audio, confetti, voice = () => undefined, onStage = () => {}, key = 'pkm2_finale' } = {}) {
  let stage = 'idle', running = false, runId = 0;
  const gameKey = () => key + ':' + (state.get().game?.started_at || 'x');
  const set = s => { stage = s; try { onStage(s); } catch (e) { console.error('[finale]', e); } };
  const jarige = () => state.get().players.find(p => p.is_birthday)?.name || NAAM_JARIGE;
  // Zegt een zin; wordt hij onderbroken (een verrassing of regiebericht praat ertussendoor), dan nog één keer.
  async function say(text, extra = {}) {
    if (!text) return;
    const v = voice(), opts = { ...(v !== undefined ? { voice: v } : {}), ...extra };
    if (!(await mon.say(text, opts))) await mon.say(text, opts);
  }
  /** intro: zin die eerst gezegd moet worden (de installatiezin van de hoed, als die niet aan bod kwam). */
  async function start({ intro } = {}) {
    if (running) return;
    running = true; const id = ++runId;
    const alive = () => id === runId;
    try {
      if (intro) { await say(intro); if (!alive()) return; }
      mon.setParts(PART_KEYS); mon.setMood('compleet');
      set('mega');
      audio?.play?.('mega');
      await sleep(2600); if (!alive()) return; // Mega-Mecha-Pof groeit (monster.js: 2,4 s)
      for (const l of LINES.mega || []) { await say(fillLine(l, { jarige: jarige() }), { ms: 5000 }); if (!alive()) return; await sleep(400); }
      set('vers');
      await say(fillLine(pick(LINES.vers), { jarige: jarige() }), { ms: 16000 }); if (!alive()) return;
      set('confetti');
      confetti?.(); audio?.play?.('badge'); setTimeout(() => confetti?.(), 1800);
      await sleep(1200); if (!alive()) return;
      set('finale');
      await say(fillLine(pick(LINES.finale), { jarige: jarige() })); if (!alive()) return;
      const h = state.get().game?.hints ?? 0, sub = h === 0 ? 'nul' : h === 1 ? 'een' : 'meer';
      await say(fillLine(pick(LINES.finaleHints?.[sub]), { hints: h })); if (!alive()) return;
      store.set(gameKey(), '1');
      set('eind');
      await sleep(600);
      await say(pick(LINES.afscheid));
    } finally { if (id === runId) running = false; }
  }
  return {
    start,
    get stage() { return stage; },
    get running() { return running; },
    get done() { return store.get(gameKey()) === '1'; },
    reset() { runId++; running = false; store.del(gameKey()); set('idle'); },
    voice,
  };
}
export default createFinale;
