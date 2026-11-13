// demo/prelude.js — draait vóór de app (gewoon <script>, geen module) en schermt de demo af van het echte spel.
//
//  1. Eigen opslag: localStorage en sessionStorage krijgen een voorvoegsel ("pkmdemo:"). De demo leest en schrijft dus
//     nooit pkm2_session, pkm2_device, pkm2_test enzovoort van het echte spel, ook niet op een telefoon die vandaag meedoet.
//     Lukt dat afschermen niet (oude browser), dan start de demo niet.
//  2. Netwerkwacht: alles naar Supabase wordt tegengehouden, behalve openbare bestanden lezen (opgenomen zinnen van
//     Mecha-Pof, foto's) en de kaartgegevens. Geen nieuwe stemopnames, geen tekeningen, geen teaser, geen RPC's.
//     De live walkie (ElevenLabs) staat standaard uit; aanzetten kan in het demopaneel, maar nooit tijdens het feest.
//  3. Het spel zelf draait helemaal op dit toestel: demo/fake-supabase.js (via de import map in demo/index.html).
(function () {
  'use strict';
  var PREFIX = 'pkmdemo:';
  var SUPA = 'https://lnhliamckstuwiwyzxyl.supabase.co';

  function wrap(real) {
    var api = {
      getItem: function (k) { return real.getItem(PREFIX + k); },
      setItem: function (k, v) { real.setItem(PREFIX + k, String(v)); },
      removeItem: function (k) { real.removeItem(PREFIX + k); },
      clear: function () { api._keys().forEach(function (k) { real.removeItem(PREFIX + k); }); },
      key: function (i) { return api._keys()[i] ?? null; },
      _keys: function () { var out = []; for (var i = 0; i < real.length; i++) { var k = real.key(i); if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length)); } return out; },
    };
    Object.defineProperty(api, 'length', { get: function () { return api._keys().length; } });
    return api;
  }

  var safe = false;
  try {
    var realLS = window.localStorage, realSS = window.sessionStorage;
    var ls = wrap(realLS), ss = wrap(realSS);
    Object.defineProperty(window, 'localStorage', { configurable: true, enumerable: true, get: function () { return ls; } });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, enumerable: true, get: function () { return ss; } });
    // eslint-disable-next-line no-undef
    safe = window.localStorage === ls && localStorage === ls && window.sessionStorage === ss && sessionStorage === ss;
    window.__demoRealStorage = realLS; // alleen voor "opnieuw beginnen"
  } catch (e) { safe = false; }
  if (!safe) { // niet afgeschermd: niet starten, anders zou de demo het echte spel op dit toestel kunnen raken
    location.replace(new URL('demo/niet-ondersteund.html', document.baseURI).href);
    throw new Error('demo: opslag niet af te schermen');
  }

  // GPS uit, teleportknop aan (zelfde schakelaar als ?test=1, maar nu in de demo-opslag)
  if (localStorage.getItem('pkm2_test') == null) localStorage.setItem('pkm2_test', 'true');

  // ---------------------------------------------------------------- netwerkwacht
  // Tijdens het feest (vrijdag 13 nov 2026, 14:00–19:30) nooit de live walkie: die deelt het ElevenLabs-tegoed en de
  // limiet op gelijktijdige gesprekken met de telefoons van de meiden.
  var PARTY_FROM = Date.parse('2026-11-13T14:00:00+01:00'), PARTY_TO = Date.parse('2026-11-13T19:30:00+01:00');
  window.__demo = window.__demo || {};
  window.__demo.partyNow = function () { var t = Date.now(); return t >= PARTY_FROM && t <= PARTY_TO; };
  window.__demo.liveWalkie = function () { return localStorage.getItem('demo_live_walkie') === '1' && !window.__demo.partyNow(); };
  window.__demo.blocked = [];

  function allowed(url, method) {
    if (url.indexOf(SUPA) !== 0) return true; // fonts, Leaflet, kaarttegels, ElevenLabs-SDK
    var path = url.slice(SUPA.length);
    if (method !== 'GET' && method !== 'HEAD') return false;
    if (path.indexOf('/storage/v1/object/public/') === 0) return true;            // opgenomen zinnen, foto's (alleen lezen)
    if (path.indexOf('/rest/v1/board_data') === 0) return true;                   // kaart van het 3D-bord (alleen lezen)
    if (path.indexOf('/functions/v1/monster-token') === 0) return window.__demo.liveWalkie();
    return false;
  }
  function reason(url) {
    if (url.indexOf('/functions/v1/monster-token') >= 0) return window.__demo.partyNow()
      ? 'Tijdens het feest praat Mecha-Pof alleen met de meiden. In de demo hoor je zijn bericht na het ophangen.'
      : 'In de demo praat Mecha-Pof niet live. Hang op, dan zegt hij zijn bericht zelf. (Live walkie: tik op DEMO.)';
    return 'Niet in de demo';
  }
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    try { url = new URL(url, document.baseURI).href; } catch (e) {}
    if (allowed(url, method)) return realFetch(input, init);
    window.__demo.blocked.push(method + ' ' + url);
    return Promise.resolve(new Response(JSON.stringify({ ok: false, error: reason(url) }), { status: 503, headers: { 'content-type': 'application/json' } }));
  };
  var RealWS = window.WebSocket;
  window.WebSocket = function (url, p) {
    if (String(url).indexOf('lnhliamckstuwiwyzxyl.supabase.co') >= 0) throw new Error('demo: geen Realtime naar het echte spel');
    return p === undefined ? new RealWS(url) : new RealWS(url, p);
  };
  window.WebSocket.prototype = RealWS.prototype;
  ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { window.WebSocket[k] = RealWS[k]; });
  if (navigator.sendBeacon) { var sb = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function (u, d) { return String(u).indexOf(SUPA) === 0 ? false : sb(u, d); }; }
})();
