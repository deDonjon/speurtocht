// map.js — de radarkaart van Mecha-Pof: Leaflet met blauwdruktegels (overdag) of een donkere nachtradar (na 16:30),
// een pannenkoek met radarpuls als doel, het gelopen stroopspoor, gevonden delen op hun plek en de andere bewakers als gekleurde stippen.
// Gebruik: const m = createMap(); host.appendChild(m.el); m.update({...}); m.fit();
// Leaflet (window.L) moet al geladen zijn; zonder Leaflet geeft createMap() null.

// OpenStreetMap-tegels (geen sleutel nodig; CARTO vraagt sinds kort wel een API-sleutel).
// De radarkleuren komen uit CSS-filters op de tegels (omgekeerd en naar blauw gedraaid), plus een raster en scanlijnen erover.
const TILES = { dag: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', avond: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' };
const ATTR = '&copy; OpenStreetMap';
const TRAIL_KEY = 'pkm2_trail';
const AVOND_UUR = 16.5; // vanaf 16:30 de avondkaart (zon onder rond 16:50)

const css = `
.wmap{position:relative;height:min(44vh,320px);width:100%;z-index:0;background:#0E1B2E}
.wmap.avond{background:#070D18}
.wmap .leaflet-tile-pane{filter:invert(.92) hue-rotate(185deg) saturate(.75) brightness(.95) contrast(.95)}
.wmap.avond .leaflet-tile-pane{filter:invert(.95) hue-rotate(190deg) saturate(.6) brightness(.72) contrast(1.05)}
.wmap::after{content:'';position:absolute;inset:0;z-index:401;pointer-events:none;
  background:linear-gradient(rgba(127,232,255,.07) 1px,transparent 1px) 0 0/32px 32px,
             linear-gradient(90deg,rgba(127,232,255,.07) 1px,transparent 1px) 0 0/32px 32px,
             repeating-linear-gradient(0deg,rgba(0,0,0,.08) 0 1px,transparent 1px 3px),
             radial-gradient(ellipse at center,transparent 55%,rgba(5,10,20,.55) 100%)}
.wmap .leaflet-control-attribution{font-size:9px;background:rgba(14,27,46,.75);color:#93A0B8}
.wmap .leaflet-control-attribution a{color:#7FE8FF}
.wm-target{position:relative;width:64px;height:64px}
.wm-target .ring{position:absolute;inset:4px;border-radius:50%;border:3px solid rgba(127,232,255,.95);box-shadow:0 0 12px rgba(127,232,255,.8);animation:wm-pulse 1.8s ease-out infinite}
.wm-target .ring.b{animation-delay:.9s}
.wm-target .cake{position:absolute;inset:0;display:grid;place-items:center;font-size:32px;filter:drop-shadow(0 0 6px rgba(127,232,255,.8)) drop-shadow(0 3px 2px rgba(0,0,0,.5));animation:wm-bob 2.4s ease-in-out infinite}
.wm-target .steam{position:absolute;left:50%;top:-6px;width:6px;height:16px;margin-left:-3px;border-radius:6px;background:rgba(201,211,224,.75);filter:blur(1px);animation:wm-steam 2.2s ease-out infinite}
.wm-target .steam.b{margin-left:6px;animation-delay:.8s}
.wm-me{width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FCE3A6,#F2BE62 55%,#C9792C);border:3px solid #0E1B2E;
  box-shadow:0 0 0 2px #F2BE62,0 0 14px rgba(242,190,98,.8);display:grid;place-items:center;font-size:13px;animation:wm-wobble 3s ease-in-out infinite}
.wm-friend{width:24px;height:24px;border-radius:50%;border:3px solid #0E1B2E;display:grid;place-items:center;font:900 11px/1 Nunito,system-ui,sans-serif;color:#0E1B2E;
  box-shadow:0 0 0 2px rgba(255,255,255,.5),0 0 10px rgba(0,0,0,.5)}
.wm-part{width:34px;height:34px;border-radius:50%;background:#0E1B2E;border:2px solid #7FE8FF;display:grid;place-items:center;font-size:17px;box-shadow:0 0 10px rgba(127,232,255,.6)}
.wm-home{width:34px;height:34px;border-radius:12px;background:#0E1B2E;border:2px solid #F2BE62;display:grid;place-items:center;font-size:17px;box-shadow:0 0 10px rgba(242,190,98,.6)}
@keyframes wm-pulse{0%{transform:scale(.55);opacity:1}100%{transform:scale(1.8);opacity:0}}
@keyframes wm-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes wm-steam{0%{transform:translateY(6px) scaleY(.6);opacity:0}30%{opacity:.9}100%{transform:translateY(-14px) scaleY(1.1);opacity:0}}
@keyframes wm-wobble{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@media (prefers-reduced-motion:reduce){.wmap *{animation:none!important}}`;

function dist(a, b) {
  const R = 6371000, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const isAvond = () => { const q = new URLSearchParams(location.search).get('avond'); if (q != null) return q !== '0'; const d = new Date(); return d.getHours() + d.getMinutes() / 60 >= AVOND_UUR; };
const icon = (html, size, cls = '') => L.divIcon({ className: cls, html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
function loadTrail(gameKey) { try { const t = JSON.parse(localStorage.getItem(TRAIL_KEY)); return t?.key === gameKey ? t.pts : []; } catch { return []; } }
function saveTrail(gameKey, pts) { try { localStorage.setItem(TRAIL_KEY, JSON.stringify({ key: gameKey, pts: pts.slice(-600) })); } catch {} }

export function createMap() {
  if (typeof L === 'undefined') return null;
  if (!document.getElementById('wmap-css')) { const s = document.createElement('style'); s.id = 'wmap-css'; s.textContent = css; document.head.appendChild(s); }
  const el = document.createElement('div'); el.className = 'wmap';
  const map = L.map(el, { zoomControl: false, attributionControl: true });
  let avond = null, tiles = null;
  const layers = { trail: null, trailGlow: null, line: null, target: null, cloud: null, me: null, acc: null, friends: new Map(), found: new Map() };
  let trail = [], trailKey = null, fittedFor = null, lastStop = null;

  function setTheme() {
    const a = isAvond(); if (a === avond) return; avond = a;
    el.classList.toggle('avond', a);
    if (tiles) tiles.remove();
    tiles = L.tileLayer(a ? TILES.avond : TILES.dag, { maxZoom: 19, attribution: ATTR }).addTo(map);
    if (layers.trail) layers.trail.setStyle({ color: '#F59E2E' });
  }

  /**
   * opts: { stop, pos, gameKey, seesTarget, players:[{id,name,lat,lng,online,color}], meIds:[...], found:[{id,lat,lng,icon}], home }
   * seesTarget = Kaartlezer (of niemand is Kaartlezer): exacte pannenkoek + stippellijn. Anders: een wolk rond het doel die krimpt.
   */
  function update(o) {
    setTheme();
    const st = o.stop; if (!st) return;
    if (o.gameKey !== trailKey) { trailKey = o.gameKey; trail = loadTrail(trailKey); }
    const t = [st.lat, st.lng], pos = o.pos;

    // stroopspoor: elke 6 m een punt erbij
    if (pos && (!trail.length || dist(trail[trail.length - 1], pos) > 6)) { trail.push({ lat: +pos.lat.toFixed(6), lng: +pos.lng.toFixed(6) }); saveTrail(trailKey, trail); }
    const tl = trail.map(p => [p.lat, p.lng]);
    if (!layers.trail) {
      layers.trailGlow = L.polyline(tl, { color: '#F59E2E', weight: 12, opacity: .22, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
      layers.trail = L.polyline(tl, { color: '#F59E2E', weight: 6, opacity: .95, lineCap: 'round', lineJoin: 'round', dashArray: '1 11', interactive: false }).addTo(map);
    } else { layers.trailGlow.setLatLngs(tl); layers.trail.setLatLngs(tl); }

    // gevonden delen blijven op de kaart liggen
    for (const f of o.found || []) if (!layers.found.has(f.id)) layers.found.set(f.id, L.marker([f.lat, f.lng], { interactive: false, icon: icon(`<div class="wm-part">${f.icon}</div>`, 34) }).addTo(map));
    for (const [id, m] of layers.found) if (!(o.found || []).some(f => f.id === id)) { m.remove(); layers.found.delete(id); }

    // het doel
    const d = pos ? dist(pos, st) : null;
    if (o.seesTarget) {
      layers.cloud?.remove(); layers.cloud = null;
      const html = st.key === 'home' ? '<div class="wm-target"><div class="ring"></div><div class="ring b"></div><div class="cake">🏠</div></div>'
        : '<div class="wm-target"><div class="ring"></div><div class="ring b"></div><span class="steam"></span><span class="steam b"></span><div class="cake">🥞</div></div>';
      if (!layers.target || lastStop !== st.id) { layers.target?.remove(); layers.target = L.marker(t, { interactive: false, icon: icon(html, 64), zIndexOffset: 500 }).addTo(map); }
      if (pos) {
        const ll = [[pos.lat, pos.lng], t];
        if (!layers.line) layers.line = L.polyline(ll, { color: '#7FE8FF', weight: 3, opacity: .85, dashArray: '2 10', lineCap: 'round', interactive: false }).addTo(map);
        else layers.line.setLatLngs(ll);
      }
    } else {
      layers.target?.remove(); layers.target = null; layers.line?.remove(); layers.line = null;
      const r = Math.max(30, Math.min(160, (d ?? 240) * .55)); // geurwolk: hoe dichterbij, hoe kleiner
      if (!layers.cloud) layers.cloud = L.circle(t, { radius: r, color: '#7FE8FF', weight: 2, dashArray: '4 8', fillColor: '#7FE8FF', fillOpacity: .12, interactive: false }).addTo(map);
      else layers.cloud.setLatLng(t).setRadius(r);
    }
    lastStop = st.id;

    // ik (het groepje op deze telefoon)
    if (pos) {
      const p = [pos.lat, pos.lng];
      if (!layers.me) { layers.me = L.marker(p, { interactive: false, zIndexOffset: 1000, icon: icon('<div class="wm-me">🤖</div>', 30) }).addTo(map);
        layers.acc = L.circle(p, { radius: pos.acc || 20, color: '#F2BE62', weight: 1, fillOpacity: .08, interactive: false }).addTo(map); }
      else { layers.me.setLatLng(p); layers.acc.setLatLng(p).setRadius(pos.acc || 20); }
    }

    // de andere bewakers (laatste positie uit de hartslag), als gekleurde bessen met hun voorletter
    const seen = new Set();
    for (const f of o.players || []) {
      if (!f.online || f.lat == null || (o.meIds || []).includes(f.id)) continue;
      seen.add(f.id);
      const html = `<div class="wm-friend" style="background:${f.color || '#7FE8FF'}">${(f.name || '?')[0].toUpperCase()}</div>`;
      const m = layers.friends.get(f.id);
      if (!m) layers.friends.set(f.id, L.marker([f.lat, f.lng], { interactive: false, icon: icon(html, 24) }).addTo(map));
      else m.setLatLng([f.lat, f.lng]);
    }
    for (const [id, m] of layers.friends) if (!seen.has(id)) { m.remove(); layers.friends.delete(id); }

    const fitKey = st.id + (pos ? 'p' : '');
    if (fittedFor !== fitKey) { fittedFor = fitKey; fit(o); }
    requestAnimationFrame(() => map.invalidateSize());
  }

  let lastO = null;
  function fit(o = lastO) {
    lastO = o; if (!o?.stop) return;
    const t = L.latLng(o.stop.lat, o.stop.lng);
    if (o.pos) map.fitBounds(L.latLngBounds([L.latLng(o.pos.lat, o.pos.lng), t]).pad(.25), { maxZoom: 18, padding: [30, 30] });
    else map.setView(t, 17);
  }
  return { el, map, update: o => { lastO = o; update(o); }, fit: () => fit(), invalidate: () => map.invalidateSize() };
}
