// finale.js — de finale thuis en het eindscherm (chat 7, claude/ONBOARDING-FINALE.md §C). Gebruikt door index.html en kern.html.
//
//   const fin = createFinale({ mon, state, audio, confetti, voice: () => true|false|undefined, onStage, key })
//   fin.start()        speel de finale (kort, afwisselend zin / beeld / muziek): check → mega (onthulling) → rapje op dansmuziek
//                      (dj, vers, hiep, dans) → dansstuk met confetti → taart (volgende missie) → eind. music() = speelt dit toestel de muziek
//   fin.stage          'idle' | 'check' | 'mega' | 'vers' | 'confetti' | 'terugblik' | 'taart' | 'eind'
//   fin.slide          tijdens 'terugblik': { i, n, item:{icon,title,sub} }
//   highlights()       optioneel: (async) lijst dia's; anders buildHighlights(state.get())
//   fin.done           true als de finale (op dit toestel) al gespeeld is; blijft bewaard per spel (localStorage)
//   fin.reset()        opnieuw kunnen afspelen (kern.html: knop "Finale opnieuw")
//   fin.voice()        doorgegeven aan mon.say: true = altijd hardop (kern), false = alleen tekst, undefined = alleen de radiotelefoon
//   endCards(state)    HTML van het eindscherm: per speurder haar badges en één zin van Mecha-Pof (LINES.eind / eindBadge)
//
// Start: monster.js roept globalThis.pkm.finale.start() aan zodra het zevende deel (de hoed) na het installatieritueel geland is
// en de installatiezin klaar is. Kern.html heeft ook een knop. Speelt per toestel één keer per spel.
import { PARTS, TALENTS } from './state.js';
import { LINES, NAAM_JARIGE } from './monster-lines.js?v=12';

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
.fin-badge.dim{border-color:#3C4A66;color:#93A0B8}
.fin-check{display:flex;justify-content:center;gap:clamp(6px,1.2vw,14px);flex-wrap:wrap;margin:6px 0}
.fin-check i{font-style:normal;font-size:clamp(1.6rem,4vw,3.4rem);width:1.6em;height:1.6em;display:grid;place-items:center;border-radius:50%;background:#0E1B2E;border:3px solid #7FE8FF;box-shadow:0 0 16px rgba(127,232,255,.55);animation:finPop .35s both}
@keyframes finPop{0%{transform:scale(0);opacity:0}70%{transform:scale(1.25);opacity:1}100%{transform:none;opacity:1}}
.fin-meter{width:min(100%,520px);height:clamp(22px,3.4vh,38px);margin:8px auto;border-radius:999px;background:#0E1B2E;border:3px solid #3C4A66;overflow:hidden;position:relative}
.fin-meter b{position:absolute;inset:0;width:0;background:linear-gradient(90deg,#F2BE62,#F59E2E 60%,#FF5A4E);animation:finFill 2.4s ease-out forwards}
.fin-meter span{position:absolute;inset:0;display:grid;place-items:center;font-weight:900;letter-spacing:.2em;color:#fff;text-shadow:0 2px 0 #000}
@keyframes finFill{to{width:100%}}
.fin-eq{display:flex;justify-content:center;align-items:flex-end;gap:6px;height:clamp(40px,8vh,90px);margin:8px 0}
.fin-eq i{width:clamp(8px,1.2vw,16px);border-radius:4px;background:linear-gradient(#7FE8FF,#15A4C8);animation:finEq .5s ease-in-out infinite alternate}
@keyframes finEq{from{height:15%}to{height:100%}}
.fin-taart{display:flex;align-items:center;justify-content:center;gap:clamp(8px,2vw,24px);flex-wrap:wrap;margin:6px 0}
.fin-taart div{display:flex;flex-direction:column;align-items:center;gap:4px;background:#0E1B2E;border:3px solid #F2BE62;border-radius:18px;padding:clamp(8px,1.6vh,18px) clamp(12px,2vw,26px);box-shadow:0 0 18px rgba(242,190,98,.3)}
.fin-taart div.na{border-color:#3C4A66;box-shadow:none;opacity:.8}
.fin-taart em{font-style:normal;font-size:clamp(2.4rem,7vw,5.5rem);line-height:1;animation:finPop .5s both}
.fin-taart b{font-weight:900;font-size:clamp(.95rem,1.8vw,1.6rem);color:#fff}
.fin-taart small{color:#93A0B8;font-weight:800;font-size:clamp(.75rem,1.1vw,1rem);letter-spacing:.12em;text-transform:uppercase}
.fin-taart .pijl{font-size:clamp(1.6rem,3vw,2.6rem);color:#F2BE62}
.fin-slide{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;animation:finSlide .45s both}
.fin-slide em{font-style:normal;font-size:clamp(3rem,8vw,6.5rem);line-height:1.1}.fin-slide em.wide{font-size:clamp(1.6rem,4.2vw,3.4rem);letter-spacing:.06em}
.fin-slide b{font-weight:900;font-size:clamp(1.3rem,2.8vw,2.6rem);color:#fff;line-height:1.15}
.fin-slide small{color:#93A0B8;font-weight:800;font-size:clamp(.9rem,1.5vw,1.3rem)}
.fin-dots{display:flex;gap:6px;margin-top:6px}.fin-dots i{width:9px;height:9px;border-radius:50%;background:#3C4A66}.fin-dots i.on{background:#F2BE62}
@keyframes finSlide{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}`;
// Beeld van de volgende missie (finale-stap 'taart' en het eindscherm): eerst taart versieren, dan pannenkoeken.
export const TAART_HTML = `<div class="fin-taart"><div><small>Eerst</small><em>🎂</em><b>Taart versieren</b></div><span class="pijl">➜</span><div class="na"><small>Daarna</small><em style="animation-delay:.4s">🥞</em><b>Pannenkoeken</b></div></div>`;
// Terugblik: de hoogtepunten van het spel als dia's (finale-stap 'terugblik', ±3 s per dia, alleen beeld en muziek).
// d = { game, players, stops, puzzle_states?, events? } (kern.html: regie_state met alle puzzeltijden; telefoons: de eigen stand).
export const SLIDE_MS = 3200;
const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const duur = ms => { const m = Math.max(1, Math.round(ms / 60000)), u = Math.floor(m / 60), r = m % 60; return u ? `${u} uur${r ? ' en ' + r + ' min' : ''}` : (m === 1 ? "1 minuut" : `${m} minuten`); };
const namen = l => l.length <= 1 ? (l[0] || '') : l.slice(0, -1).join(', ') + ' en ' + l.at(-1);
export function buildHighlights(d = {}) {
  const g = d.game || {}, players = d.players || [], stops = (d.stops || []).filter(x => x.part), out = [];
  const naam = id => players.find(p => p.id === id)?.name;
  const met = b => players.filter(p => (p.badges || []).includes(b)).map(p => p.name);
  const t0 = Date.parse(g.started_at || ''), t1 = Date.parse(g.finished_at || '') || Date.now();
  if (t0) out.push({ icon: '⏱️', title: duur(t1 - t0) + ' op pad', sub: `${stops.length || 7} plekken, ${(g.parts || []).length || 7} onderdelen` });
  out.push({ icon: Object.values(PARTS).map(p => p.icon).join(' '), title: 'Alle zeven onderdelen terug', sub: 'Pantser, ogen, neus, mond, armen, benen en de boterknop', wide: true });
  const ps = (d.puzzle_states || []).filter(x => x.solved_at && x.arrived_at).map(x => ({ ...x, ms: Date.parse(x.solved_at) - Date.parse(x.arrived_at), stop: (d.stops || []).find(st => st.id === x.stop_id) }))
    .filter(x => x.stop && x.stop.key !== 'home' && x.ms > 5000).sort((a, b) => a.ms - b.ms);
  if (ps.length) { const f = ps[0], w = naam(f.solved_by); out.push({ icon: '⚡', title: `Snelste klus: ${mmss(f.ms)}`, sub: f.stop.name + (w ? ` · opgelost door ${w}` : '') }); }
  if (ps.length > 2) { const l = ps.at(-1); out.push({ icon: '🧠', title: `Taaiste klus: ${mmss(l.ms)}`, sub: l.stop.name + ' · maar jullie gaven niet op' }); }
  const ev = d.events || [];
  const kr = met('kruimelaar-vanger'); if (kr.length || ev.some(e => e.type === 'thief.caught')) out.push({ icon: '🍪', title: 'De Kruimelaar gevangen', sub: kr.length ? 'door ' + namen(kr) : 'het onderdeel is terug' });
  const storm = ev.find(e => e.type === 'storm.end'), vk = met('vonkenvanger');
  if (storm || vk.length) out.push({ icon: '⚡', title: storm?.payload?.total ? `${storm.payload.total} vonken weggetikt` : 'Kortsluiting opgelost', sub: vk.length ? 'Vonkenvanger: ' + namen(vk) : 'samen sneller dan de stroom' });
  const jp = met('jetpack-redder'); if (jp.length) out.push({ icon: '🔥', title: 'Jetpack gered', sub: 'op tijd thuis, nét voor de oververhitting' });
  const wens = met('wensvervuller'); if (wens.length || g.wish_used) out.push({ icon: '🎂', title: 'De verjaardagswens', sub: (wens[0] || players.find(p => p.is_birthday)?.name || 'de jarige') + ' deed haar wens' });
  out.push({ icon: '💧', title: `${g.drops || 0} stroopdruppels`, sub: (g.hints || 0) === 0 ? 'en geen enkele hint nodig' : `en ${g.hints} hint${g.hints === 1 ? '' : 's'}` });
  return out.slice(0, 8);
}
export function slideHTML(sl, i = 0, n = 1) {
  if (!sl) return '';
  return `<div class="fin-slide"><em class="${sl.wide ? 'wide' : ''}">${sl.icon}</em><b>${esc(sl.title)}</b>${sl.sub ? `<small>${esc(sl.sub)}</small>` : ''}<span class="fin-dots">${Array.from({ length: n }, (_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</span></div>`;
}
// Beeld per finale-stap voor het kernscherm (groot). check en taart; mega = stroopmeter; vers/confetti = equalizer.
export function stageHTML(stage, fin) {
  if (stage === 'terugblik') return slideHTML(fin?.slide?.item, fin?.slide?.i, fin?.slide?.n);
  if (stage === 'check') return `<div class="fin-check">${Object.values(PARTS).map((p, i) => `<i style="animation-delay:${(i * CHECK_MS / 1000).toFixed(2)}s">${p.icon}</i>`).join('')}</div>`;
  if (stage === 'mega') return `<div class="fin-meter"><b></b><span>STROOPMETER · MEGA</span></div>`;
  if (stage === 'vers' || stage === 'confetti') return `<div class="fin-eq">${Array.from({ length: 12 }, (_, i) => `<i style="animation-delay:${(i * 0.07 % 0.5).toFixed(2)}s;animation-duration:${(0.35 + (i * 37 % 30) / 100).toFixed(2)}s"></i>`).join('')}</div>`;
  if (stage === 'taart') return TAART_HTML;
  return '';
}

// Dansnummer voor de finale (ElevenLabs Music, gemaakt met de functie monster-music). Laadt het niet, dan het eigen deuntje.
export const CHECK_MS = 420; // per onderdeel in de check (kern.html en index.html animeren op dezelfde maat)
export const DANS_URL = 'https://lnhliamckstuwiwyzxyl.supabase.co/storage/v1/object/public/monster/music/dans-a.mp3';
export function createFinale({ mon, state, audio, confetti, voice = () => undefined, music = () => true, track = DANS_URL, onStage = () => {}, key = 'pkm2_finale', highlights = null } = {}) {
  let stage = 'idle', running = false, runId = 0, slide = null;
  const gameKey = () => key + ':' + (state.get().game?.started_at || 'x');
  const set = s => { stage = s; try { onStage(s); } catch (e) { console.error('[finale]', e); } };
  const jarige = () => state.get().players.find(p => p.is_birthday)?.name || NAAM_JARIGE;
  // Zegt een zin; wordt hij onderbroken (een verrassing of regiebericht praat ertussendoor), dan nog één keer.
  async function say(text, extra = {}) {
    if (!text) return;
    const v = voice(), opts = { ...(v !== undefined ? { voice: v } : {}), ...extra };
    if (!(await mon.say(text, opts))) await mon.say(text, opts);
  }
  // Het verjaardagsrapje op het dansmuziekje. Muziek alleen op het toestel dat praat (music()), anders gewoon de zinnen.
  let dance = null, trackP = null;
  async function rapje(alive) {
    const J = { jarige: jarige() }, w = l => fillLine(l, J);
    let buffer = null;
    if (music()) buffer = await Promise.race([trackP || audio?.loadTrack?.(track) || null, sleep(2500).then(() => null)]); // te traag: eigen deuntje
    dance = music() ? audio?.dance?.({ buffer }) || null : null;
    const talk = async (t, ms) => { dance?.duck(true); await say(t, ms ? { ms } : {}); dance?.duck(false); };
    try {
      await talk(w(pick(LINES.dj) || '')); if (!alive()) return;
      await sleep(dance ? dance.beat * 4 * 1000 : 300); if (!alive()) return; // één maat alleen muziek
      const vers = pick(LINES.vers), regels = Array.isArray(vers) ? vers : [vers];
      for (const r of regels) { await talk(w(r), 6000); if (!alive()) return; await sleep(dance ? dance.beat * 2 * 1000 : 200); } // halve maat muziek tussen de regels
      for (const h of LINES.hiep || []) { await talk(w(h), 3000); if (!alive()) return; await sleep(1300); if (!alive()) return; } // HOERA!
      await talk(w(pick(LINES.dans) || ''), 5000); if (!alive()) return;
      set('confetti');
      dance?.drop(); confetti?.(); audio?.play?.('badge'); setTimeout(() => confetti?.(), 1800); setTimeout(() => confetti?.(), 6000);
      await sleep(dance ? dance.beat * 32 * 1000 : 1200); if (!alive()) return; // dansstuk: acht maten (±16 s)
      await terugblik(alive); // muziek loopt zachter door onder de dia's
    } finally { dance?.stop(1.8); dance = null; slide = null; }
    await sleep(1200);
  }
  // Terugblik: korte zin, dan de hoogtepunten als dia's met muziek eronder (geen gepraat).
  async function terugblik(alive) {
    let list = [];
    try { list = await Promise.race([Promise.resolve(highlights ? highlights() : buildHighlights(state.get())), sleep(2500).then(() => null)]) || buildHighlights(state.get()); }
    catch (e) { console.warn('[finale] terugblik', e); list = buildHighlights(state.get()); }
    if (!list.length) return;
    dance?.duck(true);
    await say(fillLine(pick(LINES.terugblik), { jarige: jarige() }), { ms: 4000 }); if (!alive()) return;
    for (let i = 0; i < list.length; i++) {
      slide = { i, n: list.length, item: list[i] }; set('terugblik'); audio?.play?.('plop');
      await sleep(SLIDE_MS); if (!alive()) return;
    }
    slide = null;
  }
  /** intro: zin die eerst gezegd moet worden (de installatiezin van de hoed, als die niet aan bod kwam).
   *  Kort en afwisselend (Job, 9 nov): steeds één korte zin, dan beeld of muziek. ±1,5 min tot de walkie.
   *  check (7 onderdelen klikken in beeld) → mega (stroopmeter vult, Mega groeit, onthulling + laken eraf) → vers (DJ, 2 regels,
   *  hiep hiep) → confetti (dansstuk) → taart (volgende missie: taart versieren, dan pannenkoeken) → eind (walkie: over en sluiten). */
  async function start({ intro } = {}) {
    if (running) return;
    running = true; const id = ++runId;
    const alive = () => id === runId;
    const J = () => ({ jarige: jarige() });
    try {
      trackP = music() ? audio?.loadTrack?.(track) : null; // alvast laden
      if (intro) { await say(intro); if (!alive()) return; }
      mon.setParts(PART_KEYS); mon.setMood('wakker');
      // 1. beeld: zeven onderdelen klikken één voor één aan, dan één korte zin
      set('check');
      for (let i = 0; i < PART_KEYS.length; i++) { audio?.play?.('klik'); await sleep(CHECK_MS); if (!alive()) return; }
      await say(fillLine(pick(LINES.mega?.check), J()), { ms: 4000 }); if (!alive()) return;
      // 2. beeld + geluid: stroopmeter naar MEGA, Mega-Mecha-Pof groeit; dan de onthulling (laken eraf)
      set('mega');
      mon.setMood('compleet'); // monster.js: groeien, 'mega'-geluid, sprongetje
      await sleep(2600); if (!alive()) return;
      await say(fillLine(pick(LINES.mega?.onthul), J()), { ms: 5000 }); if (!alive()) return;
      confetti?.(); audio?.play?.('badge');
      await sleep(1500); if (!alive()) return;
      // 3. muziek: het rapje en de dans
      set('vers');
      await rapje(alive); if (!alive()) return;
      // 4. beeld: de volgende missie, eerst taart versieren, dan pannenkoeken
      set('taart');
      audio?.play?.('badge');
      await sleep(900); if (!alive()) return;
      await say(fillLine(pick(LINES.taart), J()), { ms: 6000 }); if (!alive()) return;
      await sleep(1200); if (!alive()) return;
      store.set(gameKey(), '1');
      set('eind');
      await sleep(600);
      await say(fillLine(pick(LINES.afscheid), J()));
    } finally { if (id === runId) running = false; }
  }
  return {
    start,
    get stage() { return stage; },
    get slide() { return slide; },
    get running() { return running; },
    get done() { return store.get(gameKey()) === '1'; },
    reset() { runId++; running = false; dance?.stop(0.5); dance = null; store.del(gameKey()); set('idle'); },
    voice,
  };
}
export default createFinale;
