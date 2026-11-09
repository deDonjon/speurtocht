// formatie.js — formatie op GPS rond een punt.
// 3 telefoons: stel je op als driehoek rond het punt (elke telefoon op een hoek, ± `ring` m van het midden, marge `margin` m).
// 2 telefoons: tegenover elkaar, het punt precies tussen jullie in. 1 telefoon: loop een rondje op ± `loop` m om het punt.
// Config: { type:'formatie', lat?, lng? (standaard: de plek van de stop), ring:15, margin:8, loop:20, maxAcc:30, question?, hint? }
// Zetten: { t:'pos', d:device_id, lat, lng, acc, ts } (elke telefoon stuurt stil zijn eigen positie) en { t:'done' }
// (de eerste telefoon die de formatie ziet kloppen zet hem vast, zodat hij ook opgelost blijft als er een telefoon wegvalt).

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d) => (v === '' || v == null || !Number.isFinite(+v) ? d : +v);
const TAU = Math.PI * 2, FRESH_MS = 20_000, LAP = 0.92; // een rondje telt bij 92% (GPS knipt hoekjes af)
const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const tsOf = m => Date.parse(m.at) || +m.ts || 0;

/** Lokale vlakke projectie in meters rond P (x = oost, y = noord). */
export function toXY(P, lat, lng) {
  return { x: (lng - P.lng) * Math.cos(P.lat * Math.PI / 180) * 111_320, y: (lat - P.lat) * 110_540 };
}

/** Beste regelmatige n-hoek (straal R, vrij te draaien) door de punten; geeft per punt de afstand tot zijn hoek. */
export function fitPolygon(pts, R) {
  const n = pts.length; if (!n) return null;
  const sorted = pts.map(p => ({ ...p, a: Math.atan2(p.y, p.x) })).sort((a, b) => a.a - b.a);
  let sx = 0, sy = 0;
  sorted.forEach((p, i) => { const r = p.a - (TAU * i) / n; sx += Math.cos(r); sy += Math.sin(r); });
  const rot = Math.atan2(sy, sx);
  const corners = sorted.map((_, i) => ({ x: R * Math.cos(rot + (TAU * i) / n), y: R * Math.sin(rot + (TAU * i) / n) }));
  const errs = sorted.map((p, i) => Math.hypot(p.x - corners[i].x, p.y - corners[i].y));
  return { rot, corners, order: sorted.map(p => p.d), errs, worst: Math.max(...errs) };
}

function activeStopPos() { try { const st = globalThis.pkm?.state?.activeStop?.(); return st ? { lat: st.lat, lng: st.lng } : null; } catch { return null; } }

export default {
  type: 'formatie',

  init(config, ctx = {}) {
    const P = Number.isFinite(+config.lat) && config.lat !== '' && config.lat != null ? { lat: +config.lat, lng: +config.lng } : activeStopPos();
    const devices = [...new Set(ctx.devices || [])].sort();
    const n = Math.min(3, Math.max(1, ctx.phones || 1), Math.max(1, devices.length));
    const names = {};
    for (const p of ctx.players || []) if (p.device_id) names[p.device_id] = names[p.device_id] ? names[p.device_id] + ' & ' + p.name : p.name;
    return {
      P, n, devices, mode: n >= 3 ? 'driehoek' : n === 2 ? 'lijn' : 'rondje', names,
      R: num(config.ring, 15), margin: num(config.margin, 8), loop: num(config.loop, 20), maxAcc: num(config.maxAcc, 30),
      pos: {}, fit: null, laps: {}, solved: false, locked: false,
    };
  },

  reduce(data, move) {
    if (move.t === 'done') return data.locked ? data : { ...data, solved: true, locked: true };
    if (move.t !== 'pos' || !data.P || !move.d || !Number.isFinite(+move.lat) || !Number.isFinite(+move.lng)) return data;
    const { x, y } = toXY(data.P, +move.lat, +move.lng), acc = num(move.acc, 99), ts = tsOf(move);
    const pos = { ...data.pos, [move.d]: { d: move.d, x, y, acc, ts } };
    let { fit, laps, solved } = data;

    if (data.mode === 'rondje') {
      const r = Math.hypot(x, y), a = Math.atan2(y, x), inBand = Math.abs(r - data.loop) <= data.margin && acc <= data.maxAcc;
      const prev = laps[move.d] || { sum: 0, a: null, inBand: false };
      let sum = prev.sum;
      if (inBand && prev.inBand && prev.a != null) { const da = wrap(a - prev.a); if (Math.abs(da) < 1.4) sum += da; } // grote sprong = GPS-sprong, telt niet
      laps = { ...laps, [move.d]: { sum, a, inBand } };
      if (Math.abs(sum) >= TAU * LAP) solved = true;
    } else {
      const newest = Math.max(...Object.values(pos).map(p => p.ts));
      const fresh = Object.values(pos).filter(p => newest - p.ts <= FRESH_MS && p.acc <= data.maxAcc).sort((a, b) => b.ts - a.ts).slice(0, data.n);
      fit = fresh.length === data.n ? fitPolygon(fresh, data.R) : null;
      if (fit) { let mp = Infinity; for (let i = 0; i < fresh.length; i++) for (let j = i + 1; j < fresh.length; j++) mp = Math.min(mp, Math.hypot(fresh[i].x - fresh[j].x, fresh[i].y - fresh[j].y)); fit = { ...fit, minPair: mp }; }
      // elke telefoon dicht bij zijn hoek én echt uit elkaar (minstens `ring` m), anders telt een kluitje bij het punt ook
      if (fit && fit.worst <= data.margin && fit.minPair >= data.R) solved = true;
    }
    return { ...data, pos, fit, laps, solved: data.solved || solved };
  },

  isSolved(data) { return data.solved; },

  render(el, data, api) {
    style();
    const c = api.config || {}, me = api.me?.[0]?.device_id ?? api.deviceId ?? 'dit-toestel';
    let st = el._fz;
    if (!st) {
      st = el._fz = { sentAt: 0, sent: null, fix: null, err: '', stop: null, doneSent: false };
      el.innerHTML = `<p class="question fz-q"></p><div class="fz-radar"></div><p class="fz-me status"></p><div class="fz-list"></div><p class="feedback" aria-live="polite"></p>`;
      const quiet = api.moveQuiet || (globalThis.pkm?.sync ? m => globalThis.pkm.sync.move({ ...m, id: Math.random().toString(36).slice(2, 10) }).catch(() => {}) : api.move);
      const onFix = f => {
        st.fix = f; st.err = '';
        const now = Date.now(), moved = st.sent ? dist(st.sent, f) : Infinity;
        if (!st.last?.data.locked && (moved >= 3 || now - st.sentAt >= 5000)) { st.sentAt = now; st.sent = f; quiet({ t: 'pos', d: me, lat: +f.lat.toFixed(6), lng: +f.lng.toFixed(6), acc: Math.round(f.acc), ts: now }); }
        if (st.last) draw(el, st.last.data, st.last.api);
      };
      const onErr = msg => { st.err = msg; if (st.last) draw(el, st.last.data, st.last.api); };
      st.stop = (api.gps?.watch || watchGps)(onFix, onErr);
    }
    st.last = { data, api };
    // De formatie klopt: zet hem vast op de server (één keer per telefoon; dubbel kan geen kwaad).
    if (data.solved && !data.locked && !st.doneSent) { st.doneSent = true; api.move({ t: 'done' }); }
    el.querySelector('.fz-q').textContent = c.question || QUESTION[data.mode](data);
    draw(el, data, api);
  },

  destroy(el) { el._fz?.stop?.(); delete el._fz; },
};

const QUESTION = {
  driehoek: d => `Mijn sensoren hebben een driehoek nodig! Ga met de drie telefoons rond het punt staan, elk op een hoek, zo'n ${d.R} meter van het midden. Bliep als het klopt!`,
  lijn: d => `Twee telefoons? Dan wordt het een lijn: ga tegenover elkaar staan met het punt precies in het midden, elk zo'n ${d.R} meter ervandaan.`,
  rondje: d => `Mijn radar moet geijkt worden. Loop met de telefoon één heel rondje om het punt, op zo'n ${d.loop} meter afstand. Niet afsnijden!`,
};

function dist(a, b) { const P = { lat: a.lat, lng: a.lng }, q = toXY(P, b.lat, b.lng); return Math.hypot(q.x, q.y); }
function watchGps(onFix, onErr) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) { onErr('Deze telefoon heeft geen GPS. Vraag de begeleider.'); return () => {}; }
  const id = navigator.geolocation.watchPosition(
    p => onFix({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy || 30 }),
    e => onErr(e.code === 1 ? 'Locatie staat uit voor deze site. Zet hem aan in de instellingen (aA in de adresbalk → Locatie).' : 'GPS zoekt nog… ga even in de open lucht staan.'),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  return () => navigator.geolocation.clearWatch(id);
}

const DOT = ['#7FE8FF', '#F2BE62', '#FF7F9E', '#4ADE80'];
function draw(el, data, api) {
  const st = el._fz, me = api.me?.[0]?.device_id ?? api.deviceId ?? 'dit-toestel';
  const radar = el.querySelector('.fz-radar'), meEl = el.querySelector('.fz-me'), list = el.querySelector('.fz-list'), fb = el.querySelector('.feedback');
  if (!data.P) { radar.innerHTML = ''; meEl.textContent = ''; fb.textContent = 'Er is geen punt ingesteld voor deze formatie. Vraag de begeleider.'; return; }
  // eigen positie: de laatste GPS van deze telefoon gaat voor wat er op de server staat
  const pos = { ...data.pos };
  if (st.fix) { const q = toXY(data.P, st.fix.lat, st.fix.lng); pos[me] = { d: me, x: q.x, y: q.y, acc: st.fix.acc, ts: Date.now() }; }
  // alleen telefoons die nu meedoen (bij het rondje alleen deze telefoon)
  for (const d of Object.keys(pos)) if (d !== me && (data.mode === 'rondje' || (data.devices.length && !data.devices.includes(d)))) delete pos[d];
  const target = data.mode === 'rondje' ? data.loop : data.R;
  const pts = Object.values(pos), far = Math.max(target + data.margin, ...pts.map(p => Math.hypot(p.x, p.y))) * 1.15;
  const S = 120 / far, X = v => 130 + v * S, Y = v => 130 - v * S; // noord = boven
  const devs = Object.keys(pos).sort(), colorOf = d => DOT[Math.max(0, devs.indexOf(d)) % DOT.length];
  let svg = `<svg viewBox="0 0 260 260" role="img" aria-label="Radar met het punt in het midden en de telefoons">
    <circle cx="130" cy="130" r="${(target + data.margin) * S}" fill="rgba(127,232,255,.08)"/>
    <circle cx="130" cy="130" r="${Math.max(0, target - data.margin) * S}" fill="var(--bg,#141A26)"/>
    <circle cx="130" cy="130" r="${target * S}" fill="none" stroke="var(--led,#7FE8FF)" stroke-width="1.5" stroke-dasharray="4 5" opacity=".7"/>
    <path d="M130 8 V252 M8 130 H252" stroke="var(--line,#3C4A66)" stroke-width="1"/>
    <text x="130" y="20" text-anchor="middle" class="fz-n">N</text>`;
  if (data.mode !== 'rondje' && data.fit) {
    const cs = data.fit.corners;
    svg += `<polygon points="${cs.map(p => `${X(p.x)},${Y(p.y)}`).join(' ')}" fill="none" stroke="${data.solved ? 'var(--ok,#4ADE80)' : 'var(--gold,#F2BE62)'}" stroke-width="2" opacity=".8"/>`;
    cs.forEach((p, i) => { svg += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${data.margin * S}" fill="none" stroke="${data.fit.errs[i] <= data.margin ? 'var(--ok,#4ADE80)' : 'var(--gold,#F2BE62)'}" stroke-width="1.5" stroke-dasharray="3 3"/>`; });
  }
  if (data.mode === 'rondje') {
    const lap = data.laps[me] || Object.values(data.laps)[0];
    const frac = Math.min(1, Math.abs(lap?.sum || 0) / (TAU * LAP));
    if (frac > 0 && lap) {
      const start = lap.a - (lap.sum || 0), end = lap.a, rr = target * S, large = Math.abs(end - start) > Math.PI ? 1 : 0, sweep = (lap.sum || 0) > 0 ? 0 : 1;
      svg += frac >= 1 ? `<circle cx="130" cy="130" r="${rr}" fill="none" stroke="var(--ok,#4ADE80)" stroke-width="7" opacity=".85"/>`
        : `<path d="M${X(rr / S * Math.cos(start))} ${Y(rr / S * Math.sin(start))} A${rr} ${rr} 0 ${large} ${sweep} ${X(rr / S * Math.cos(end))} ${Y(rr / S * Math.sin(end))}" fill="none" stroke="var(--led,#7FE8FF)" stroke-width="7" stroke-linecap="round" opacity=".85"/>`;
    }
  }
  svg += `<text x="130" y="137" text-anchor="middle" font-size="18">🥞</text>`;
  for (const p of pts) {
    const mine = p.d === me, stale = Date.now() - p.ts > FRESH_MS && !mine;
    svg += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${Math.max(3, Math.min(40, p.acc * S))}" fill="${colorOf(p.d)}" opacity=".12"/>
      <circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${mine ? 9 : 7}" fill="${colorOf(p.d)}" stroke="#fff" stroke-width="${mine ? 3 : 1.5}" opacity="${stale ? .35 : 1}"/>`;
  }
  radar.innerHTML = svg + '</svg>';

  // mijn regel
  const mine = pos[me];
  if (st.err && !st.fix) meEl.innerHTML = `<span class="bad">${esc(st.err)}</span>`;
  else if (!mine) meEl.textContent = 'GPS zoekt je positie…';
  else {
    const r = Math.hypot(mine.x, mine.y), diff = r - target;
    const how = Math.abs(diff) <= data.margin / 2 ? 'precies goed!' : Math.abs(diff) <= data.margin ? (diff > 0 ? 'net iets te ver' : 'net iets te dichtbij') : diff > 0 ? `${Math.round(diff)} m te ver, loop naar het punt toe` : `${Math.round(-diff)} m te dichtbij, loop achteruit`;
    meEl.innerHTML = `Jij: <b>${Math.round(r)} m</b> van het midden · ${how}${mine.acc > data.maxAcc ? ` · <span class="bad">GPS ±${Math.round(mine.acc)} m, te wiebelig</span>` : ` · GPS ±${Math.round(mine.acc)} m`}`;
  }

  // lijst van telefoons
  if (data.mode === 'rondje') {
    const lap = data.laps[me] || Object.values(data.laps)[0];
    const pct = Math.min(100, Math.round(Math.abs(lap?.sum || 0) / (TAU * LAP) * 100));
    list.innerHTML = `<div class="meter" aria-hidden="true"><i style="width:${pct}%"></i></div><p class="note center">${pct}% van het rondje${lap && !lap.inBand && pct < 100 ? ' · buiten de ring telt niet mee' : ''}</p>`;
  } else {
    const errs = {}; data.fit?.order.forEach((d, i) => { errs[d] = data.fit.errs[i]; });
    const shown = [...new Set([...Object.keys(data.names), ...Object.keys(pos)])].sort().slice(0, 4);
    list.innerHTML = `<ul class="fz-phones">${shown.map(d => {
      const p = pos[d], name = data.names[d] || (d === me ? 'Deze telefoon' : 'Telefoon');
      const s = !p ? 'nog geen GPS' : Date.now() - p.ts > FRESH_MS && d !== me ? 'al even stil…' : errs[d] == null ? `${Math.round(Math.hypot(p.x, p.y))} m van het midden` : errs[d] <= data.margin ? '✓ op zijn hoek' : `${Math.round(errs[d])} m naast zijn hoek`;
      return `<li><i style="background:${colorOf(d)}"></i><b>${esc(name)}${d === me ? ' (jij)' : ''}</b><span>${esc(s)}</span></li>`;
    }).join('')}</ul>`;
  }
  fb.classList.toggle('ok', data.solved);
  fb.textContent = data.solved
    ? (data.mode === 'rondje' ? '✓ Radar geijkt! Piep-piep, ik zie weer alles om me heen.' : '✓ Formatie staat! Mijn sensoren piepen tevreden. Bliep!')
    : data.mode !== 'rondje' && data.fit ? (data.fit.worst <= data.margin && data.fit.minPair < data.R ? `Te dicht op elkaar! Ga minstens ${data.R} meter uit elkaar staan.` : 'Bijna… schuif een stukje tot alle hoeken groen zijn.') : '';
}

let styled = false;
function style() {
  if (styled || typeof document === 'undefined') return; styled = true;
  const s = document.createElement('style'); s.id = 'pz-formatie';
  s.textContent = `
.fz-radar{width:min(100%,300px);margin:0 auto;aspect-ratio:1;background:var(--visor,#0E1B2E);border:2px solid var(--led-dark,#15A4C8);border-radius:50%;overflow:hidden;box-shadow:0 0 18px rgba(127,232,255,.18),inset 0 0 30px rgba(0,0,0,.5)}
.fz-radar svg{display:block;width:100%;height:100%}
.fz-n{fill:var(--muted,#93A0B8);font:700 11px var(--hud,monospace)}
.fz-me .bad,.fz-me .bad b{color:var(--straw,#FF5A4E)}
.fz-phones{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.fz-phones li{display:flex;align-items:center;gap:8px;background:var(--visor,#0E1B2E);border:1px solid var(--line,#3C4A66);border-radius:10px;padding:6px 10px;font-size:.95rem}
.fz-phones i{width:12px;height:12px;border-radius:50%;flex:none}
.fz-phones span{margin-left:auto;color:var(--muted,#93A0B8);font-weight:800;text-align:right}`;
  document.head.appendChild(s);
}
