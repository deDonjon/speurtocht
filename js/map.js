// map.js — de wonderlandkaart: Leaflet met warme beslagtegels (overdag) of chocolade-avond (na 16:30),
// een pannenkoek als doel, het gelopen stroopspoor, gevonden delen op hun plek en de andere bewakers als bessen.
// Gebruik: const m = createMap(); host.appendChild(m.el); m.update({...}); m.fit();
// Leaflet (window.L) moet al geladen zijn; zonder Leaflet geeft createMap() null.

const TILES = {
  dag:   'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
  avond: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
};
const ATTR = '&copy; OpenStreetMap &copy; CARTO';
const TRAIL_KEY = 'pkm2_trail';
const AVOND_UUR = 16.5; // vanaf 16:30 de avondkaart (zon onder rond 16:50)

const css = `
.wmap{position:relative;height:min(44vh,320px);width:100%;z-index:0;background:#F6E3BC}
.wmap.avond{background:#2A1A10}
.wmap .leaflet-tile-pane{filter:sepia(.55) saturate(1.7) hue-rotate(-12deg) brightness(1.04) contrast(.92)}
.wmap.avond .leaflet-tile-pane{filter:sepia(.7) saturate(1.6) hue-rotate(-18deg) brightness(1.15) contrast(1.05)}
.wmap::after{content:'';position:absolute;inset:0;z-index:401;pointer-events:none;
  background:radial-gradient(circle at 20% 30%,rgba(255,255,255,.18) 0 2px,transparent 3px) 0 0/38px 38px,
             radial-gradient(circle at 70% 60%,rgba(180,110,30,.10) 0 2px,transparent 3px) 0 0/52px 52px,
             radial-gradient(ellipse at center,transparent 55%,rgba(120,70,20,.28) 100%)}
.wmap.avond::after{background:radial-gradient(circle at 30% 40%,rgba(255,230,160,.10) 0 1.5px,transparent 2.5px) 0 0/44px 44px,
             radial-gradient(ellipse at center,transparent 50%,rgba(10,5,0,.45) 100%)}
.wmap .leaflet-control-attribution{font-size:9px;background:rgba(255,249,236,.7)}
.wm-target{position:relative;width:64px;height:64px}
.wm-target .ring{position:absolute;inset:4px;border-radius:50%;border:4px solid rgba(214,140,30,.9);animation:wm-pulse 1.8s ease-out infinite}
.wm-target .cake{position:absolute;inset:0;display:grid;place-items:center;font-size:34px;filter:drop-shadow(0 3px 2px rgba(80,40,10,.45));animation:wm-bob 2.4s ease-in-out infinite}
.wm-target .steam{position:absolute;left:50%;top:-6px;width:6px;height:16px;margin-left:-3px;border-radius:6px;background:rgba(255,255,255,.75);filter:blur(1px);animation:wm-steam 2.2s ease-out infinite}
.wm-target .steam.b{margin-left:6px;animation-delay:.8s}
.wm-me{width:30px;height:30px;border-radius:50% 50% 46% 46%;background:radial-gradient(circle at 35% 30%,#FFF3C9,#F1BE55 60%,#C98A22);border:3px solid #FFF9EC;
  box-shadow:0 2px 6px rgba(60,30,5,.45);display:grid;place-items:center;font-size:13px;animation:wm-wobble 3s ease-in-out infinite}
.wm-friend{width:24px;height:24px;border-radius:50%;border:3px solid #FFF9EC;display:grid;place-items:center;font:900 11px/1 Nunito,system-ui,sans-serif;color:#fff;
  box-shadow:0 2px 5px rgba(60,30,5,.4);text-shadow:0 1px 1px rgba(0,0,0,.4)}
.wm-part{width:34px;height:34px;border-radius:50%;background:#FFF9EC;border:3px solid #E8B04A;display:grid;place-items:center;font-size:17px;box-shadow:0 2px 6px rgba(60,30,5,.35)}
.wm-home{width:34px;height:34px;border-radius:12px;background:#5B3391;border:3px solid #FFF9EC;display:grid;place-items:center;font-size:17px}
@keyframes wm-pulse{0%{transform:scale(.55);opacity:1}100%{transform:scale(1.7);opacity:0}}
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
    tiles = L.tileLayer(a ? TILES.avond : TILES.dag, { maxZoom: 19, subdomains: 'abcd', attribution: ATTR, detectRetina: true }).addTo(map);
    if (layers.trail) layers.trail.setStyle({ color: a ? '#F3C24E' : '#C7861E' });
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
      layers.trailGlow = L.polyline(tl, { color: '#6B3A10', weight: 11, opacity: .35, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
      layers.trail = L.polyline(tl, { color: avond ? '#F3C24E' : '#C7861E', weight: 6, opacity: .95, lineCap: 'round', lineJoin: 'round', dashArray: '1 11', interactive: false }).addTo(map);
    } else { layers.trailGlow.setLatLngs(tl); layers.trail.setLatLngs(tl); }

    // gevonden delen blijven op de kaart liggen
    for (const f of o.found || []) if (!layers.found.has(f.id)) layers.found.set(f.id, L.marker([f.lat, f.lng], { interactive: false, icon: icon(`<div class="wm-part">${f.icon}</div>`, 34) }).addTo(map));
    for (const [id, m] of layers.found) if (!(o.found || []).some(f => f.id === id)) { m.remove(); layers.found.delete(id); }

    // het doel
    const d = pos ? dist(pos, st) : null;
    if (o.seesTarget) {
      layers.cloud?.remove(); layers.cloud = null;
      const html = st.key === 'home' ? '<div class="wm-target"><div class="ring"></div><div class="cake">🏠</div></div>'
        : '<div class="wm-target"><div class="ring"></div><span class="steam"></span><span class="steam b"></span><div class="cake">🥞</div></div>';
      if (!layers.target || lastStop !== st.id) { layers.target?.remove(); layers.target = L.marker(t, { interactive: false, icon: icon(html, 64), zIndexOffset: 500 }).addTo(map); }
      if (pos) {
        const ll = [[pos.lat, pos.lng], t];
        if (!layers.line) layers.line = L.polyline(ll, { color: '#7A3E12', weight: 4, opacity: .8, dashArray: '2 10', lineCap: 'round', interactive: false }).addTo(map);
        else layers.line.setLatLngs(ll);
      }
    } else {
      layers.target?.remove(); layers.target = null; layers.line?.remove(); layers.line = null;
      const r = Math.max(30, Math.min(160, (d ?? 240) * .55)); // geurwolk: hoe dichterbij, hoe kleiner
      if (!layers.cloud) layers.cloud = L.circle(t, { radius: r, color: '#D68C1E', weight: 3, dashArray: '4 8', fillColor: '#F6C35B', fillOpacity: .22, interactive: false }).addTo(map);
      else layers.cloud.setLatLng(t).setRadius(r);
    }
    lastStop = st.id;

    // ik (het groepje op deze telefoon)
    if (pos) {
      const p = [pos.lat, pos.lng];
      if (!layers.me) { layers.me = L.marker(p, { interactive: false, zIndexOffset: 1000, icon: icon('<div class="wm-me">🍓</div>', 30) }).addTo(map);
        layers.acc = L.circle(p, { radius: pos.acc || 20, color: '#C8372D', weight: 1, fillOpacity: .06, interactive: false }).addTo(map); }
      else { layers.me.setLatLng(p); layers.acc.setLatLng(p).setRadius(pos.acc || 20); }
    }

    // de andere bewakers (laatste positie uit de hartslag), als gekleurde bessen met hun voorletter
    const seen = new Set();
    for (const f of o.players || []) {
      if (!f.online || f.lat == null || (o.meIds || []).includes(f.id)) continue;
      seen.add(f.id);
      const html = `<div class="wm-friend" style="background:${f.color || '#5B3391'}">${(f.name || '?')[0].toUpperCase()}</div>`;
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
