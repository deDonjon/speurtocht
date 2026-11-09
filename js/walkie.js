// walkie.js — walkietalkie met Mecha-Pof: knop ingedrukt houden = praten, loslaten = het monster antwoordt.
//
// Contract:
//   openWalkie({ mon, context, onClose, greeting?, tools?, incoming? }) → { update(text), close(), open }
//     mon      het monster uit monster.js (de walkie hangt mon.el in zijn eigen .mslot en roept elk frame mon.live() aan)
//     context  () → { jarige, spelers, ... }  spelstand voor de agent (dynamic variables, zie MONSTER-AGENT.md)
//     onClose  wordt aangeroepen na het ophangen (index.html hangt het monster dan terug)
//     greeting eigen openingszin voor dit gesprek (bijv. de briefing van een onderdeel, walkie.briefing.<deel>); anders een zin uit walkie.hallo
//     tools    { naam: async (params) → string }  client tools van de agent (ElevenLabs "Client" tools, bijv. unlock_stop); de sleutel is de toolnaam
//     incoming true = het gesprek begon met een oproep van Mecha-Pof (andere statustekst)
//   update(text)  vertel de agent iets dat net gebeurde (bijv. "Ze hebben de neus gevonden"), zonder dat het monster hoeft te antwoorden
//   incomingCall({ mon, context, greeting, title?, sub?, tools?, timeout?, onAnswer?, onMissed?, onClose? }) → { close(), open }
//     De radiotelefoon gaat over (belgeluid + trillen, knop Opnemen). Opnemen = openWalkie met `greeting` als {{begroeting}}.
//     Niet opgenomen binnen `timeout` ms (40 s) → onMissed(greeting): index.html laat Mecha-Pof de tekst dan zelf zeggen.
//
// Techniek: ElevenLabs Agents via WebRTC (@elevenlabs/client). Het token komt van de Supabase Edge Function
// `monster-token`, zodat de API-sleutel nooit in de app staat. De microfoon staat standaard dicht; alleen zolang
// de knop ingedrukt is gaat hij open. Zo hoort het monster geen wind of geschreeuw van de rest.
// Animatie: de mond volgt het echte uitgaande volume (getOutputVolume), dus het klopt bij elke zin.
//
// Walkietalkie-regels (ook in de prompt van de agent, zie MONSTER-AGENT.md):
//   • Elk bericht eindigt met "over". Zonder "over" antwoordt het monster niet op de vraag, maar vraagt het om "over".
//   • Ophangen = "over en sluiten". Het monster zegt gedag en de app hangt daarna zelf op.
//   • Wie op Ophangen tikt zonder "over en sluiten", wordt meteen teruggebeld (één keer; daarna hangt de knop echt op).
// De begroeting wisselt: de app kiest een zin uit monster-lines.js (walkie.hallo) en stuurt hem mee als {{begroeting}}.
import { audio, setRecording } from './audio.js?v=9';
import { SUPABASE_URL, SUPABASE_KEY } from './sync.js';
import { LINES, NAAM_JARIGE } from './monster-lines.js?v=6';
import { uitspraak } from './voice.js?v=3';

const SDK = [
  'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.29.0/dist/lib.iife.js',
  'https://unpkg.com/@elevenlabs/client@1.29.0/dist/lib.iife.js',
];
const TOKEN_URL = SUPABASE_URL + '/functions/v1/monster-token';
const TAIL_MS = 450;          // na loslaten nog even luisteren, anders valt het laatste woord weg
const THINK_MAX_MS = 9000;    // zo lang mag het monster "denken" voordat we zeggen dat het niet antwoordt

let sdkPromise = null;
function loadSdk() {
  if (globalThis.ElevenLabsClient?.Conversation) return Promise.resolve(globalThis.ElevenLabsClient);
  return sdkPromise ||= (async () => {
    for (const src of SDK) {
      try {
        await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
        if (globalThis.ElevenLabsClient?.Conversation) return globalThis.ElevenLabsClient;
      } catch {}
    }
    sdkPromise = null;
    throw new Error('De walkietalkie-software kon niet laden. Is er internet?');
  })();
}
async function getToken() {
  const r = await fetch(TOKEN_URL, { headers: { apikey: SUPABASE_KEY } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) throw new Error(j.error || `Geen verbinding met het monster (${r.status})`);
  return j.token;
}
// Alle waarden als korte tekst: ontbrekende variabelen laten de agent haperen.
// Namen gaan in uitspraak-spelling mee (Evy → Eevie), zodat de stem ze goed zegt.
const KEYS = ['begroeting', 'jarige', 'spelers', 'fase', 'stop_naam', 'stop_nummer', 'stops_totaal', 'aanwijzing', 'puzzel_vraag', 'puzzel_hint', 'delen_gevonden', 'delen_nog', 'hints_gebruikt', 'wachtwoord'];
function vars(ctx = {}) {
  return Object.fromEntries(KEYS.map(k => [k, uitspraak(String(ctx[k] ?? '').trim()) || '-']));
}
// "Hannah, Elin, Isa" → "Hannah, Elin en Isa"
function namen(list) { const a = String(list || '').split(/\s*,\s*/).filter(Boolean); return a.length > 1 ? a.slice(0, -1).join(', ') + ' en ' + a[a.length - 1] : a[0] || 'speurders'; }
const lastGreet = {};
const fillGreeting = (l, ctx = {}) => String(l || '').replace(/\{spelers\}/g, namen(ctx.spelers)).replace(/\{jarige\}/g, ctx.jarige && ctx.jarige !== 'de jarige' ? ctx.jarige : NAAM_JARIGE).replace(/\{naam\}/g, ctx.naam || 'speurder');
function greeting(kind, ctx) {
  const list = LINES.walkie?.[kind] || [];
  const fresh = list.length > 1 ? list.filter(l => l !== lastGreet[kind]) : list;
  const l = fresh[Math.floor(Math.random() * fresh.length)] || 'Mecha-Pof hier. Zeg het maar. Over!';
  lastGreet[kind] = l;
  return fillGreeting(l, ctx);
}
/** Openingszin voor een oproep van Mecha-Pof: de briefing van een onderdeel (walkie.briefing.<deel>), of een algemene
    oproepzin (walkie.oproep, met {naam}). Voor index.html en de testpagina. */
export function callGreeting({ part, naam, text } = {}) {
  if (text) return fillGreeting(text, { naam });
  if (part && LINES.walkie?.briefing?.[part]?.length) { const l = LINES.walkie.briefing[part]; return fillGreeting(l[Math.floor(Math.random() * l.length)], { naam }); }
  return greeting('oproep', { naam });
}
// Eindigt dit bericht met "over en sluiten" (of "over en uit")? Spraakherkenning schrijft het soms los of met streepjes.
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
export const saysSluiten = t => /\bover\s*(en\s*)?(sluiten|sluit|uit)$/.test(norm(t));
export const saysOver = t => /\bover$/.test(norm(t)) || saysSluiten(t);

function injectCss() {
  if (document.getElementById('walkie-css')) return;
  const s = document.createElement('style'); s.id = 'walkie-css';
  s.textContent = `
#walkie{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:space-between;
  padding:calc(env(safe-area-inset-top,0px) + 14px) 16px calc(env(safe-area-inset-bottom,0px) + 18px);
  background:linear-gradient(rgba(60,74,102,.35) 1px,transparent 1px) 0 0/40px 40px,linear-gradient(90deg,rgba(60,74,102,.35) 1px,transparent 1px) 0 0/40px 40px,radial-gradient(120% 80% at 50% 30%,#33405A 0%,#0B0F18 72%);color:#EAF2FF;font-family:Nunito,system-ui,sans-serif;
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:none}
#walkie .wk-top{width:100%;max-width:480px;display:flex;align-items:center;gap:10px}
#walkie .wk-top h2{flex:1;margin:0;font:400 1.35rem 'Lilita One',system-ui,sans-serif;letter-spacing:.02em;color:#7FE8FF;text-shadow:0 0 12px rgba(127,232,255,.5)}
#walkie .wk-led{width:12px;height:12px;border-radius:50%;background:#4A5058;box-shadow:0 0 0 3px rgba(255,255,255,.06)}
#walkie .wk-led.on{background:#5BD27A;box-shadow:0 0 10px #5BD27A}
#walkie .wk-led.tx{background:#FF5A4E;box-shadow:0 0 12px #FF5A4E}
#walkie .wk-x{background:rgba(255,255,255,.1);color:#EAF2FF;border:0;border-radius:999px;padding:10px 16px;font:800 1rem Nunito,sans-serif}
#walkie .wk-mid{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;width:100%}
#walkie .mslot{background:radial-gradient(circle at 50% 40%,#1E3352,#0E1B2E 75%);border-radius:28px;padding:8px;box-shadow:0 10px 40px rgba(0,0,0,.5),0 0 24px rgba(127,232,255,.25),inset 0 0 0 3px #7FE8FF}
#walkie .wk-state{font:800 1.15rem Nunito,sans-serif;min-height:1.6em;text-align:center}
#walkie .wk-said{max-width:440px;min-height:2.6em;text-align:center;opacity:.75;font-size:.95rem}
#walkie .wk-ptt{width:min(62vw,220px);aspect-ratio:1;border-radius:50%;border:0;color:#fff;font:400 1.3rem/1.15 'Lilita One',sans-serif;
  background:radial-gradient(circle at 50% 35%,#ff7a5c,#d8352a 70%);box-shadow:0 10px 0 #8f1f17,0 16px 30px rgba(0,0,0,.5);
  transition:transform .08s,box-shadow .08s;touch-action:none;-webkit-tap-highlight-color:transparent}
#walkie .wk-ptt.down{transform:translateY(8px) scale(.97);box-shadow:0 2px 0 #8f1f17,0 6px 16px rgba(0,0,0,.5);background:radial-gradient(circle at 50% 35%,#ff9a6c,#ff4a35 70%)}
#walkie .wk-ptt:disabled{filter:grayscale(.8) brightness(.7)}
#walkie .wk-ptt small{display:block;font:800 .8rem Nunito,sans-serif;opacity:.85;margin-top:4px}
#walkie .wk-rules{font:700 .9rem Nunito,sans-serif;color:#BFEFFF;text-align:center;margin:6px 0 12px;opacity:.9}
#walkie .wk-rules b{color:#7FE8FF}
#walkie .wk-diag{font:600 .72rem ui-monospace,Menlo,monospace;opacity:.45;text-align:center}
#walkie .wk-err{color:#FFB4A8;text-align:center;max-width:420px}
#walkie .wk-retry{margin-top:8px;background:#F2BE62;color:#3A1C06;border:0;border-radius:999px;padding:12px 20px;font:800 1rem Nunito,sans-serif}
#walkie .wk-tool{font:800 .85rem Nunito,sans-serif;color:#FFE98A;text-align:center;min-height:1.2em}
/* inkomende oproep: de radiotelefoon gaat over */
#wk-ring{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:space-between;
  padding:calc(env(safe-area-inset-top,0px) + 22px) 18px calc(env(safe-area-inset-bottom,0px) + 22px);color:#EAF2FF;font-family:Nunito,system-ui,sans-serif;
  background:linear-gradient(rgba(60,74,102,.35) 1px,transparent 1px) 0 0/40px 40px,linear-gradient(90deg,rgba(60,74,102,.35) 1px,transparent 1px) 0 0/40px 40px,radial-gradient(120% 80% at 50% 30%,#33405A 0%,#0B0F18 72%);-webkit-user-select:none;user-select:none}
#wk-ring .rg-top{text-align:center;display:flex;flex-direction:column;gap:6px;align-items:center}
#wk-ring .rg-eye{font:700 .78rem 'Chakra Petch',ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:#7FE8FF;animation:wk-blink 1.1s steps(1) infinite}
#wk-ring h2{margin:0;font:400 2rem 'Lilita One',system-ui,sans-serif;color:#F2BE62;text-shadow:0 3px 0 #9A5419,0 0 24px rgba(242,190,98,.25)}
#wk-ring .rg-sub{font-weight:800;color:#BFEFFF;max-width:420px}
#wk-ring .mslot{background:radial-gradient(circle at 50% 40%,#1E3352,#0E1B2E 75%);border-radius:28px;padding:8px;box-shadow:0 10px 40px rgba(0,0,0,.5),0 0 24px rgba(127,232,255,.25),inset 0 0 0 3px #7FE8FF;animation:wk-ring 1.7s ease-in-out infinite}
#wk-ring .rg-btns{width:100%;max-width:420px;display:flex;flex-direction:column;gap:12px;align-items:center}
#wk-ring .rg-answer{width:100%;min-height:84px;border:0;border-radius:999px;color:#062814;font:400 1.6rem 'Lilita One',system-ui,sans-serif;letter-spacing:.02em;
  background:linear-gradient(180deg,#86F0AE 0%,#4ADE80 50%,#2FBF66 100%);box-shadow:0 6px 0 #1F8A4C,0 0 24px rgba(74,222,128,.35);touch-action:manipulation}
#wk-ring .rg-answer:active{transform:translateY(4px);box-shadow:0 2px 0 #1F8A4C}
#wk-ring .rg-later{background:transparent;border:0;color:#93A0B8;text-decoration:underline;font:800 .95rem Nunito,sans-serif;min-height:44px;padding:8px 14px}
@keyframes wk-ring{0%,100%{transform:rotate(0)}10%{transform:rotate(-3deg) translateX(-3px)}20%{transform:rotate(3deg) translateX(3px)}30%{transform:rotate(-2deg)}40%{transform:rotate(2deg)}50%{transform:none}}
@keyframes wk-blink{0%,55%{opacity:1}56%,100%{opacity:.35}}
@media (prefers-reduced-motion:reduce){#walkie .wk-ptt{transition:none}#wk-ring .mslot,#wk-ring .rg-eye{animation:none}}`;
  document.head.appendChild(s);
}

// iPhone: het geluid van het monster speelt via een <audio>-element van de SDK. Safari start dat soms pas na een
// echte tik, dus bij elke tik op de walkietalkie duwen we het afspelen nog eens aan.
function kickPlayback(conv) {
  try { conv?.connection?.getRoom?.()?.startAudio?.().catch?.(() => {}); } catch {}
  for (const a of document.querySelectorAll('audio')) { try { a.muted = false; if (a.paused) a.play().catch(() => {}); } catch {} }
}

export function openWalkie({ mon, context = () => ({}), onClose, greeting: firstGreeting = null, tools = null, incoming = false } = {}) {
  injectCss();
  document.getElementById('walkie')?.remove(); document.getElementById('wk-ring')?.remove();
  const el = document.createElement('div'); el.id = 'walkie';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Walkietalkie met Mecha-Pof');
  el.innerHTML = `
    <div class="wk-top"><span class="wk-led" aria-hidden="true"></span><h2>Mecha-Pof · walkietalkie</h2><button class="wk-x" data-a="close">Ophangen</button></div>
    <div class="wk-mid"><div class="mslot" data-size="lg"></div><div class="wk-state" aria-live="polite">Verbinden…</div><div class="wk-said"></div><div class="wk-tool" aria-live="polite"></div><div class="wk-diag" aria-hidden="true"></div></div>
    <div class="wk-rules">Eindig met <b>“over”</b> · klaar? Zeg <b>“over en sluiten”</b></div>
    <button class="wk-ptt" disabled aria-label="Houd ingedrukt om te praten">Houd vast<small>om te praten</small></button>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s);
  const led = $('.wk-led'), stateEl = $('.wk-state'), said = $('.wk-said'), ptt = $('.wk-ptt'), toolEl = $('.wk-tool');
  if (mon) { $('.mslot').appendChild(mon.el); mon.setSize('lg'); }

  const diag = el.querySelector('.wk-diag'); let diagN = 0, conn = 'verbinden';
  let conv = null, closed = false, mode = 'listening', pressing = false, thinkingSince = 0, tailTimer = 0, raf = 0, prevVol = 1;
  // over en sluiten: ending = kind zei het, het monster zegt nog gedag; daarna ophangen. calledBack = al een keer teruggebeld.
  let sessId = 0, ending = false, endSpoke = false, endTimer = 0, everConnected = false, calledBack = false, callbackMode = false;
  const setState = t => { stateEl.textContent = t; };

  // ---- elk frame: fase + volumes naar het monster
  function frame() {
    raf = 0; if (closed) return;
    let phase = 'praat', out = 0, inp = 0;
    if (conv) {
      try { out = conv.getOutputVolume?.() || 0; inp = conv.getInputVolume?.() || 0; } catch {}
      if (pressing) phase = 'luister';
      else if (mode === 'speaking') { phase = 'praat'; thinkingSince = 0; }
      else if (thinkingSince) {
        phase = 'denk';
        if (performance.now() - thinkingSince > THINK_MAX_MS) { thinkingSince = 0; setState('Hmm, het monster zegt niks. Probeer het nog eens.'); }
      }
    }
    // volume (0 = -100 dB, 1 = -30 dB) omzetten naar mondopening: stil = dicht, gewone spraak = halfopen, hard = wijd
    const mouth = Math.max(0, Math.min(1, (out - 0.12) * 1.7));
    const ear = Math.max(0, Math.min(1, (inp - 0.1) * 1.6));
    mon?.live(phase, { out: mouth, in: ear });
    if (++diagN % 15 === 0) diag.textContent = conv ? `${conn} · ${mode} · monster ${out.toFixed(2)} · mic ${inp.toFixed(2)} · ${document.querySelectorAll('audio').length}🔈 · ${navigator.audioSession?.type || '-'}` : conn;
    raf = requestAnimationFrame(frame);
  }

  // ---- knop: ingedrukt houden
  function down(e) {
    if (!conv || pressing) return;
    e?.preventDefault?.();
    pressing = true; clearTimeout(tailTimer);
    kickPlayback(conv);
    try { ptt.setPointerCapture?.(e.pointerId); } catch {}
    try { prevVol = 1; conv.setVolume({ volume: 0 }); } catch {}  // zenden = niet tegelijk horen (en geen echo)
    try { conv.setMicMuted(false); } catch {}
    ptt.classList.add('down'); led.className = 'wk-led tx';
    audio.play('zend'); audio.buzz(25);
    setState('🎙️ Praat maar… het monster luistert');
  }
  function up(e) {
    if (!pressing) return;
    e?.preventDefault?.();
    pressing = false;
    ptt.classList.remove('down'); led.className = 'wk-led on';
    audio.play('over'); audio.buzz([15, 40, 15]);
    tailTimer = setTimeout(() => {
      try { conv?.setMicMuted(true); } catch {}
      try { conv?.setVolume({ volume: prevVol }); } catch {}
    }, TAIL_MS);
    thinkingSince = performance.now();
    setState('🤔 Het monster denkt na…');
  }
  ptt.addEventListener('pointerdown', down);
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) ptt.addEventListener(ev, up);
  ptt.addEventListener('contextmenu', e => e.preventDefault());
  const onKey = e => { if (e.code === 'Space' && !e.repeat) { e.type === 'keydown' ? down(e) : up(e); } };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  el.addEventListener('click', e => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'close') close(); if (a === 'retry') { connect(); } });
  // (close() zonder force belt terug als er niet met "over en sluiten" is afgesloten; zie callBack())

  // ---- client tools (ElevenLabs "Client" tools): de agent roept ze aan, de browser voert ze uit en geeft een korte tekst terug.
  // De sleutel is de toolnaam uit het dashboard (hoofdlettergevoelig). Een fout wordt tekst, zodat het gesprek doorgaat.
  function clientTools() {
    const out = {};
    for (const [name, fn] of Object.entries(tools || {})) {
      if (typeof fn !== 'function') continue;
      out[name] = async (params = {}) => {
        toolEl.textContent = '⚙️ ' + name + '…';
        try { const r = await fn(params, { update: t => { try { conv?.sendContextualUpdate(String(t)); } catch {} } }); toolEl.textContent = typeof r === 'string' ? r : ''; return r == null ? 'ok' : r; }
        catch (e) { console.warn('[walkie] tool', name, e); toolEl.textContent = ''; return 'Dat lukte niet: ' + (e?.message || e); }
      };
    }
    return out;
  }

  // ---- verbinden
  async function connect() {
    $('.wk-err')?.remove(); $('.wk-retry')?.remove(); ptt.hidden = false;
    setState('📡 Verbinden met het monster…'); ptt.disabled = true; led.className = 'wk-led';
    try {
      setRecording(true); // iOS: anders "AudioSession category is not compatible with audio capture"
      const [El, token] = await Promise.all([loadSdk(), getToken()]);
      if (closed) return;
      setRecording(true);
      const id = ++sessId; ending = false; endSpoke = false;
      const live = () => id === sessId; // oude sessie (na terugbellen) mag niets meer doen
      const ctx = context() || {};
      // begroeting: terugbelzin, anders de eigen openingszin van een oproep (briefing), anders een gewone hallo-zin
      const begroeting = callbackMode ? greeting('terugbel', ctx) : firstGreeting ? fillGreeting(firstGreeting, ctx) : greeting('hallo', ctx);
      conv = await El.Conversation.startSession({
        conversationToken: token,
        connectionType: 'webrtc',
        dynamicVariables: vars({ ...ctx, begroeting }),
        clientTools: clientTools(),
        useWakeLock: true,
        onConnect: () => { led.className = 'wk-led on'; conn = 'verbonden'; },
        onStatusChange: ({ status }) => { conn = status; },
        onModeChange: ({ mode: m }) => {
          if (!live()) return;
          mode = m;
          if (ending) { if (m === 'speaking') endSpoke = true; else if (endSpoke) { clearTimeout(endTimer); endTimer = setTimeout(() => close({ force: true }), 700); } }
          if (closed || pressing) return;
          if (m === 'speaking') setState('🤖 Mecha-Pof praat…');
          else if (!thinkingSince) setState('Houd de knop vast om iets te zeggen');
        },
        onMessage: ({ source, message }) => {
          if (!live()) return;
          if (source === 'user' && message) {
            said.textContent = '“' + message + '”';
            if (saysSluiten(message) && !ending) { // netjes afgesloten: monster zegt gedag, dan hangen we op
              ending = true; endSpoke = false; ptt.disabled = true; setState('👋 Over en sluiten…');
              clearTimeout(endTimer); endTimer = setTimeout(() => close({ force: true }), 9000); // vangnet als er geen gedag komt
            }
          }
          if ((source === 'ai' || source === 'agent') && message) said.textContent = message.replace(/\[[^\]]{1,30}\]\s*/g, '').replace(/\bEevie\b/g, 'Evy').replace(/\bMekka-Pof\b/g, 'Mecha-Pof').trim(); // stemregie zoals [playful] niet tonen; namen weer in gewone spelling
        },
        onError: (msg) => { console.warn('[walkie]', msg); conn = 'fout: ' + String(msg).slice(0, 60); },
        onDisconnect: () => { if (!live() || closed || ending || switching) return; fail('De verbinding is verbroken.'); },
      });
      if (closed) { try { await conv.endSession(); } catch {} return; }
      firstGreeting = null; // de eigen openingszin geldt één keer; terugbellen krijgt een terugbelzin
      try { conv.setMicMuted(true); } catch {}
      kickPlayback(conv); setTimeout(() => kickPlayback(conv), 800);
      el.addEventListener('pointerdown', () => kickPlayback(conv), { capture: true });
      ptt.disabled = false; led.className = 'wk-led on'; everConnected = true;
      setState(callbackMode ? '📞 Mecha-Pof belt terug…' : incoming ? '📞 Opgenomen! Mecha-Pof praat zo…' : 'Mecha-Pof neemt op…');
      thinkingSince = performance.now(); // het eerste bericht (begroeting) komt vanzelf
    } catch (err) {
      fail(err?.message || String(err));
    }
  }
  function fail(msg) {
    conv = null; ptt.disabled = true; pressing = false; ptt.classList.remove('down'); led.className = 'wk-led'; thinkingSince = 0;
    setState('📵 Geen verbinding'); ptt.hidden = true;
    const m = /audiosession/i.test(msg) ? 'De iPhone gaf de microfoon niet vrij. Tik op Opnieuw proberen.' : /permission|notallowed|denied/i.test(msg) ? 'De microfoon mag niet. Sta de microfoon toe voor deze website en probeer opnieuw.' : msg;
    $('.wk-mid').insertAdjacentHTML('beforeend', `<p class="wk-err">${m.replace(/[<>&]/g, '')}</p><button class="wk-retry" data-a="retry">Opnieuw proberen</button>`);
  }

  // Ophangen zonder "over en sluiten": meteen terugbellen (één keer). De tweede keer hangt de knop echt op.
  let switching = false;
  async function callBack() {
    calledBack = true; callbackMode = true; switching = true; sessId++;
    const c = conv; conv = null; thinkingSince = 0; pressing = false; ptt.classList.remove('down');
    try { await c?.endSession(); } catch {}
    switching = false;
    if (closed) return;
    ptt.disabled = true; led.className = 'wk-led tx';
    setState('📞 Tring tring… Mecha-Pof belt terug!'); said.textContent = 'Ophangen doe je met “over en sluiten”.';
    audio.play('bel'); audio.buzz([200, 120, 200]);
    setTimeout(() => { if (!closed) { audio.play('bel'); audio.buzz([200, 120, 200]); } }, 1100);
    setTimeout(() => { if (!closed) connect(); }, 1900);
  }
  async function close({ force = false } = {}) {
    if (closed) return;
    if (!force && !ending && everConnected && !calledBack && conv) { callBack(); return; }
    closed = true; clearTimeout(endTimer);
    cancelAnimationFrame(raf); clearTimeout(tailTimer);
    removeEventListener('keydown', onKey); removeEventListener('keyup', onKey);
    mon?.live(null);
    const c = conv; conv = null;
    try { await c?.endSession(); } catch {}
    setRecording(false);
    el.remove();
    onClose?.();
  }

  connect();
  raf = requestAnimationFrame(frame);
  return {
    update(text) { try { conv?.sendContextualUpdate(String(text)); } catch {} },
    close: () => close({ force: true }), // de app zelf (bijv. bij een nieuw scherm) hangt altijd echt op
    get open() { return !closed; },
  };
}

// ---------------------------------------------------------------- inkomende oproep (stop.arrived, monster.call)
// Alleen de radiotelefoon (hasRole('radio'), index.html beslist dat). Belgeluid 'bel' uit audio.js elke 1,7 s plus trillen,
// Mecha-Pof wiebelt in zijn slot, grote knop Opnemen. Opnemen → openWalkie met `greeting` als {{begroeting}}.
// Later → onClose(); niets gezegd. Niet opgenomen binnen `timeout` → onMissed(greeting): de app zegt de tekst dan zelf.
const RING_MS = 1700;
export function incomingCall({ mon, context = () => ({}), greeting: text, title = 'Mecha-Pof belt!', sub = '', tools = null, timeout = 40_000, onAnswer, onMissed, onClose } = {}) {
  injectCss();
  document.getElementById('wk-ring')?.remove();
  if (document.getElementById('walkie')) { // de walkie is al open: niet bellen, de tekst meteen als context meegeven
    return { close() {}, get open() { return false; }, answered: false };
  }
  const el = document.createElement('div'); el.id = 'wk-ring';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Inkomende oproep van Mecha-Pof');
  const esc = s => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  el.innerHTML = `
    <div class="rg-top"><span class="rg-eye">📞 Inkomende oproep</span><h2>${esc(title)}</h2>${sub ? `<p class="rg-sub">${esc(sub)}</p>` : ''}</div>
    <div class="mslot" data-size="lg"></div>
    <div class="rg-btns"><button class="rg-answer" data-a="answer">📻 Opnemen</button><button class="rg-later" data-a="later">Later</button></div>`;
  document.body.appendChild(el);
  let home = null;
  if (mon) { home = mon.el.parentNode; el.querySelector('.mslot').appendChild(mon.el); mon.setSize('lg'); try { mon.react?.('hint'); } catch {} }
  let closed = false, answered = false;
  const ring = () => { if (closed) return; audio.play('bel'); audio.buzz([220, 120, 220]); };
  ring(); const ringTimer = setInterval(ring, RING_MS);
  const missTimer = setTimeout(() => { if (!closed) { finish(); onMissed?.(text); } }, timeout);
  function finish() { if (closed) return; closed = true; clearInterval(ringTimer); clearTimeout(missTimer); el.remove(); }
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'later') { finish(); onClose?.(); }
    if (a === 'answer') {
      answered = true; finish(); audio.play('zend');
      const w = openWalkie({ mon, context, greeting: text, tools, incoming: true, onClose });
      onAnswer?.(w);
    }
  });
  return { close() { finish(); onClose?.(); }, get open() { return !closed; }, get answered() { return answered; } };
}
