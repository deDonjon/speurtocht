// teaser.js — voorpret vóór het feest. Zolang game.settings.teaser.until in de toekomst ligt, krijgen de meiden
// geen inlogscherm maar een aftelklok, Mecha-Pof in stand-by (met de delen die al "gevonden" zijn als hologram)
// en elke dag een nieuwe systeemmelding die hij hardop voorleest. Ingelogde telefoons en de begeleider (regiesleutel)
// zien gewoon de app. Alles komt uit Supabase (game.settings.teaser), dus teksten zijn zonder code aan te passen:
//   settings.teaser = { until: '2026-11-13T15:00:00+01:00', enabled: true,
//                       lines: [ { from: '2026-11-09', text: 'Bzzt…', part: 'lijf' }, … ] }
// `from` = de dag vanaf wanneer de regel zichtbaar is (lokale datum), `part` = deel dat vanaf die dag oplicht.

const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

export function localDate(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function teaserActive(game, now = Date.now()) {
  const t = game?.settings?.teaser; if (!t?.until || t.enabled === false) return false;
  const until = Date.parse(t.until); return Number.isFinite(until) && until > now;
}
/** Regels die al vrij zijn (from ≤ vandaag), nieuwste eerst. */
export function teaserLines(game, now = new Date()) {
  const today = localDate(now);
  return ((game?.settings?.teaser?.lines) || []).filter(l => l && l.text && (!l.from || l.from <= today)).sort((a, b) => (a.from || '') < (b.from || '') ? 1 : -1);
}
export function revealedParts(game, now) { return [...new Set(teaserLines(game, now).map(l => l.part).filter(Boolean))]; }
export function countdown(until, now = Date.now()) {
  const ms = Math.max(0, Date.parse(until) - now), d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
  return { d, h, m, ms };
}
export function fmtDag(iso) { const d = new Date(iso + 'T12:00:00'); return `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]}`; }
function fmtMoment(iso) { const d = new Date(iso); return `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]} om ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

const CSS = `
.teaser .cd{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:4px 0}
.teaser .cd div{background:var(--visor,#0E1B2E);border:2px solid var(--line,#3C4A66);border-radius:14px;padding:10px 6px;text-align:center}
.teaser .cd b{display:block;font-family:var(--display,'Lilita One',sans-serif);font-weight:400;font-size:2.2rem;line-height:1;color:var(--led,#7FE8FF);text-shadow:0 0 14px rgba(127,232,255,.55);font-variant-numeric:tabular-nums}
.teaser .cd small{display:block;margin-top:4px;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted,#9AA3B5)}
.teaser .log{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;text-align:left}
.teaser .log li{border-left:3px solid var(--line,#3C4A66);padding:4px 0 4px 12px}
.teaser .log li.new{border-left-color:var(--led,#7FE8FF)}
.teaser .log li p{margin:2px 0 0;font-weight:700}
.teaser .log li .eyebrow{font-size:.7rem}
.teaser .hear{animation:tpulse 2.4s ease-in-out infinite}
@keyframes tpulse{50%{box-shadow:0 0 0 8px rgba(127,232,255,.12)}}
@media (prefers-reduced-motion:reduce){.teaser .hear{animation:none}}`;
function injectCss() { if (document.getElementById('teaser-css')) return; const s = document.createElement('style'); s.id = 'teaser-css'; s.textContent = CSS; document.head.appendChild(s); }

/**
 * Tekent het teaserscherm in `el`. ctx = { game, mon, say(text), esc, mslot(size, extra), birthday }.
 * Geeft { update(), destroy() } terug (zelfde vorm als de andere schermen in index.html).
 */
export function mountTeaser(el, ctx) {
  injectCss();
  const { game, mon, say, esc, mslot } = ctx;
  const t = game?.settings?.teaser || {};
  const lines = teaserLines(game), newest = lines[0];
  const parts = revealedParts(game);
  const until = t.until;
  el.classList.add('teaser');
  el.innerHTML = `
    <div class="center"><span class="eyebrow">Het feest van ${esc(ctx.birthday || 'de jarige')}</span><h1>${esc(game?.title || 'Mecha-Pof')}</h1></div>
    ${mslot('lg', 'data-parts="teaser"')}
    <div class="page center"><span class="tab">Systeem in stand-by</span><span class="stamp">GESLOTEN</span>
      <h2 id="cdtitle">Nog even wachten…</h2>
      <div class="cd" id="cd"></div>
      <p class="note">Het geheime dossier opent ${esc(until ? fmtMoment(until) : 'op het feest')}. Tot die tijd kan niemand inloggen, zelfs Mecha-Pof niet.</p>
      ${newest ? `<button class="wide hear" id="hear">🔊 Tik om Mecha-Pof te horen</button>` : ''}
    </div>
    <div class="page"><span class="tab">Systeemlogboek</span>
      ${lines.length ? `<ul class="log">${lines.map((l, i) => `<li class="${i === 0 ? 'new' : ''}"><span class="eyebrow">${l.from ? esc(fmtDag(l.from)) : 'melding'}${i === 0 ? ' · nieuw' : ''}</span><p>${esc(l.text)}</p></li>`).join('')}</ul>` : '<p class="note">Nog geen meldingen. Mecha-Pof slaapt.</p>'}
      <p class="note">Elke dag verschijnt hier een nieuwe melding. Kom morgen weer kijken.</p>
    </div>`;
  if (mon) { mon.setParts(parts); mon.setMood('slaap'); }
  const hear = el.querySelector('#hear');
  if (hear && newest) hear.onclick = () => { if (mon) { mon.setMood('wakker'); } say(newest.text); setTimeout(() => mon?.setMood('slaap'), 15000); };
  let timer = null;
  const tick = () => {
    const cd = el.querySelector('#cd'), title = el.querySelector('#cdtitle'); if (!cd || !until) return;
    const c = countdown(until);
    cd.innerHTML = `<div><b>${c.d}</b><small>${c.d === 1 ? 'dag' : 'dagen'}</small></div><div><b>${c.h}</b><small>uur</small></div><div><b>${c.m}</b><small>${c.m === 1 ? 'minuut' : 'minuten'}</small></div>`;
    title.textContent = c.ms === 0 ? 'Het is zover!' : c.d === 0 ? 'Vandaag!' : c.d === 1 ? 'Nog één keer slapen' : `Nog ${c.d} keer slapen`;
  };
  tick(); timer = setInterval(tick, 30_000);
  return { update: tick, destroy() { clearInterval(timer); } };
}
