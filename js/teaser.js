// teaser.js — voorpret vóór het feest. Zolang game.settings.teaser.until in de toekomst ligt, krijgen de meiden
// geen inlogscherm maar een aftelklok, Mecha-Pof in stand-by (met de delen die al "gevonden" zijn als hologram)
// en elke dag een nieuwe systeemmelding die hij hardop voorleest. Ingelogde telefoons en de begeleider (regiesleutel)
// zien gewoon de app. Alles komt uit Supabase (game.settings.teaser), dus teksten zijn zonder code aan te passen:
//   settings.teaser = { until: '2026-11-13T15:00:00+01:00', enabled: true,
//                       lines: [ { from: '2026-11-09', text: 'Bzzt…', part: 'lijf' }, … ] }
// `from` = de dag vanaf wanneer de regel zichtbaar is (lokale datum), `part` = deel dat vanaf die dag oplicht.

import { SUPABASE_URL, SUPABASE_KEY, GAME_CODE } from './sync.js';

const NAME_KEY = 'pkm2_teaser_me';
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
/** Aantal keer slapen = aantal kalenderdagen tot de dag van het feest (niet 24-uurs blokken). */
export function slapen(until, now = Date.now()) {
  const a = new Date(now), b = new Date(until);
  return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
}
export function fmtDag(iso) { const d = new Date(iso + 'T12:00:00'); return `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]}`; }
function fmtMoment(iso) { const d = new Date(iso); return `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]} om ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

/** Naam melden bij de server (anon): geeft { player|null, teaser }. Telt bezoeken en 🔊-tikken voor de regie. */
export async function hello(name, deviceId, play = false) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/teaser_hello', { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_game: GAME_CODE, p_name: name || '', p_device: deviceId, p_play: !!play }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Geen verbinding');
  return r.json();
}
function savedMe() { try { return JSON.parse(localStorage.getItem(NAME_KEY) || 'null'); } catch { return null; } }
function saveMe(p) { try { p ? localStorage.setItem(NAME_KEY, JSON.stringify(p)) : localStorage.removeItem(NAME_KEY); } catch {} }
const GROET = ['Bzzt. Signaal van {naam} gedetecteerd.', 'Piep piep. Hallo {naam}.', 'Krrr. {naam}! Mijn sensoren worden er blij van.', 'Bliep. Daar is {naam} weer.', 'Systeemmelding voor {naam}.'];
function groet(p, now = new Date()) {
  if (p?.is_birthday) return `Tringeling. De jarige zelf: ${p.name}!`;
  return GROET[(now.getDate() + (p?.name?.length || 0)) % GROET.length].replace('{naam}', p.name);
}

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
.teaser .me{display:flex;align-items:center;justify-content:space-between;gap:10px}
.teaser .me b{color:var(--led,#7FE8FF)}
.teaser .help{display:none;border:1px dashed var(--line,#3C4A66);border-radius:10px;padding:10px;text-align:left}
.teaser .help.open{display:block}
@keyframes tpulse{50%{box-shadow:0 0 0 8px rgba(127,232,255,.12)}}
@media (prefers-reduced-motion:reduce){.teaser .hear{animation:none}}`;
function injectCss() { if (document.getElementById('teaser-css')) return; const s = document.createElement('style'); s.id = 'teaser-css'; s.textContent = CSS; document.head.appendChild(s); }

/**
 * Tekent het teaserscherm in `el`. ctx = { game, mon, say(text), esc, mslot(size, extra), birthday, deviceId }.
 * Geeft { update(), destroy() } terug (zelfde vorm als de andere schermen in index.html).
 */
export function mountTeaser(el, ctx) {
  injectCss();
  const { game, mon, say, esc, mslot } = ctx;
  const t = game?.settings?.teaser || {};
  const lines = teaserLines(game), newest = lines[0];
  const parts = revealedParts(game);
  const until = t.until;
  let me = savedMe();
  el.classList.add('teaser');
  const draw = () => {
    el.innerHTML = `
    <div class="center"><span class="eyebrow">Het feest van ${esc(ctx.birthday || 'de jarige')}</span><h1>${esc(game?.title || 'Mecha-Pof')}</h1></div>
    ${mslot('lg', 'data-parts="teaser"')}
    <div class="page center"><span class="tab">Systeem in stand-by</span><span class="stamp">GESLOTEN</span>
      <h2 id="cdtitle">Nog even wachten…</h2>
      <div class="cd" id="cd"></div>
      <p class="note">Het geheime dossier opent ${esc(until ? fmtMoment(until) : 'op het feest')}. Tot die tijd kan niemand inloggen, zelfs Mecha-Pof niet.</p>
      ${newest && me ? `<button class="wide hear" id="hear">🔊 Tik om Mecha-Pof te horen</button>` : ''}
    </div>
    ${me ? `<div class="page"><span class="tab">Signaal herkend</span>
        <div class="me"><span>Ingelogd als speurder <b>${esc(me.name)}</b>${me.is_birthday ? ' 🎂' : ''}</span><button class="ghost" id="notme">Dit ben ik niet</button></div>
        <p class="note">Mecha-Pof kent je nu. Elke dag een nieuwe melding, speciaal voor jou.</p></div>`
      : `<div class="page"><span class="tab">Wie ben jij?</span>
        <p>Typ je voornaam, dan weet Mecha-Pof wie er luistert. Hoofdletters maken niet uit.</p>
        <form class="row" id="whof" autocomplete="off"><input class="big grow" type="text" autocapitalize="words" autocomplete="given-name" placeholder="je voornaam" aria-label="Voornaam" maxlength="40"><button class="ok" type="submit">Dat ben ik</button></form>
        <p class="feedback" id="whofb"></p>
        <button class="ghost" id="helpbtn">Mijn naam werkt niet</button>
        <div class="help" id="help"><p><b>Lukt het niet?</b></p><p class="note">Typ alleen je voornaam, zoals op de uitnodiging. Spaties, hoofdletters en accenten maken niet uit. Nog steeds niet? Vraag het aan ${esc(ctx.birthday || 'de jarige')} of haar vader; hij kan zien welke naam je probeerde en het in orde maken.</p></div></div>`}
    <div class="page"><span class="tab">Systeemlogboek</span>
      ${lines.length ? `<ul class="log">${lines.map((l, i) => `<li class="${i === 0 ? 'new' : ''}"><span class="eyebrow">${l.from ? esc(fmtDag(l.from)) : 'melding'}${i === 0 ? ' · nieuw' : ''}</span><p>${esc(l.text)}</p></li>`).join('')}</ul>` : '<p class="note">Nog geen meldingen. Mecha-Pof slaapt.</p>'}
      <p class="note">Elke dag verschijnt hier een nieuwe melding. Kom morgen weer kijken.</p>
    </div>`;
    if (mon) { mon.setParts(parts); mon.setMood('slaap'); }
    const hear = el.querySelector('#hear');
    if (hear && newest) hear.onclick = () => {
      mon?.setMood('wakker'); say(`${groet(me)} ${newest.text}`); setTimeout(() => mon?.setMood('slaap'), 18000);
      hello(me?.name, ctx.deviceId, true).catch(() => {});
    };
    const f = el.querySelector('#whof');
    if (f) f.onsubmit = async e => {
      e.preventDefault(); const inp = f.querySelector('input'), fb = el.querySelector('#whofb'), name = inp.value.trim();
      if (!name) return; fb.textContent = 'Signaal zoeken…';
      try {
        const r = await hello(name, ctx.deviceId);
        if (r.player) { me = r.player; saveMe(me); draw(); tick(); say(`${groet(me)} Welkom bij de voorpret.`); }
        else { fb.textContent = 'Bzzt… die naam staat niet in mijn geheugen. Probeer het nog eens, of tik op "Mijn naam werkt niet".'; inp.select(); }
      } catch (err) { fb.textContent = 'Geen verbinding met Mecha-Pof. Probeer het zo nog eens.'; }
    };
    const hb = el.querySelector('#helpbtn'); if (hb) hb.onclick = () => el.querySelector('#help').classList.toggle('open');
    const nm = el.querySelector('#notme'); if (nm) nm.onclick = () => { me = null; saveMe(null); draw(); tick(); };
  };
  let timer = null;
  const tick = () => {
    const cd = el.querySelector('#cd'), title = el.querySelector('#cdtitle'); if (!cd || !until) return;
    const c = countdown(until), n = slapen(until);
    cd.innerHTML = `<div><b>${c.d}</b><small>${c.d === 1 ? 'dag' : 'dagen'}</small></div><div><b>${c.h}</b><small>uur</small></div><div><b>${c.m}</b><small>${c.m === 1 ? 'minuut' : 'minuten'}</small></div>`;
    title.textContent = c.ms === 0 ? 'Het is zover!' : n <= 0 ? 'Vandaag!' : n === 1 ? 'Nog één keer slapen' : `Nog ${n} keer slapen`;
  };
  draw(); tick(); timer = setInterval(tick, 30_000);
  if (me) hello(me.name, ctx.deviceId).then(r => { if (r.player) { me = r.player; saveMe(me); } }).catch(() => {}); // bezoek tellen
  return { update: tick, destroy() { clearInterval(timer); } };
}
