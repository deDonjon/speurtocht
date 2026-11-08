// walkie.js — walkietalkie met het Pannenkoekenmonster: knop ingedrukt houden = praten, loslaten = het monster antwoordt.
//
// Contract:
//   openWalkie({ mon, context, onClose }) → { update(text), close() }
//     mon      het monster uit monster.js (de walkie hangt mon.el in zijn eigen .mslot en roept elk frame mon.live() aan)
//     context  () → { jarige, spelers, ... }  spelstand voor de agent (dynamic variables, zie MONSTER-AGENT.md)
//     onClose  wordt aangeroepen na het ophangen (index.html hangt het monster dan terug)
//   update(text)  vertel de agent iets dat net gebeurde (bijv. "Ze hebben de neus gevonden"), zonder dat het monster hoeft te antwoorden
//
// Techniek: ElevenLabs Agents via WebRTC (@elevenlabs/client). Het token komt van de Supabase Edge Function
// `monster-token`, zodat de API-sleutel nooit in de app staat. De microfoon staat standaard dicht; alleen zolang
// de knop ingedrukt is gaat hij open. Zo hoort het monster geen wind of geschreeuw van de rest.
// Animatie: de mond volgt het echte uitgaande volume (getOutputVolume), dus het klopt bij elke zin.
import { audio, setRecording } from './audio.js?v=5';
import { SUPABASE_URL, SUPABASE_KEY } from './sync.js';

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
function vars(ctx = {}) {
  const keys = ['jarige', 'spelers', 'fase', 'stop_naam', 'stop_nummer', 'stops_totaal', 'aanwijzing', 'puzzel_vraag', 'puzzel_hint', 'delen_gevonden', 'delen_nog', 'hints_gebruikt'];
  return Object.fromEntries(keys.map(k => [k, String(ctx[k] ?? '').trim() || '-']));
}

function injectCss() {
  if (document.getElementById('walkie-css')) return;
  const s = document.createElement('style'); s.id = 'walkie-css';
  s.textContent = `
#walkie{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:space-between;
  padding:calc(env(safe-area-inset-top,0px) + 14px) 16px calc(env(safe-area-inset-bottom,0px) + 18px);
  background:radial-gradient(120% 80% at 50% 30%,#3a2412 0%,#1c1108 70%);color:#FFF4DF;font-family:Nunito,system-ui,sans-serif;
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:none}
#walkie .wk-top{width:100%;max-width:480px;display:flex;align-items:center;gap:10px}
#walkie .wk-top h2{flex:1;margin:0;font:400 1.35rem 'Lilita One',system-ui,sans-serif;letter-spacing:.02em;color:#F6C35B}
#walkie .wk-led{width:12px;height:12px;border-radius:50%;background:#7a6a55;box-shadow:0 0 0 3px rgba(255,255,255,.06)}
#walkie .wk-led.on{background:#5BD27A;box-shadow:0 0 10px #5BD27A}
#walkie .wk-led.tx{background:#FF5A4E;box-shadow:0 0 12px #FF5A4E}
#walkie .wk-x{background:rgba(255,255,255,.1);color:#FFF4DF;border:0;border-radius:999px;padding:10px 16px;font:800 1rem Nunito,sans-serif}
#walkie .wk-mid{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;width:100%}
#walkie .mslot{background:#FFF4DF;border-radius:28px;padding:8px;box-shadow:0 10px 40px rgba(0,0,0,.45),inset 0 0 0 4px #F6C35B}
#walkie .wk-state{font:800 1.15rem Nunito,sans-serif;min-height:1.6em;text-align:center}
#walkie .wk-said{max-width:440px;min-height:2.6em;text-align:center;opacity:.75;font-size:.95rem}
#walkie .wk-ptt{width:min(62vw,220px);aspect-ratio:1;border-radius:50%;border:0;color:#fff;font:400 1.3rem/1.15 'Lilita One',sans-serif;
  background:radial-gradient(circle at 50% 35%,#ff7a5c,#d8352a 70%);box-shadow:0 10px 0 #8f1f17,0 16px 30px rgba(0,0,0,.5);
  transition:transform .08s,box-shadow .08s;touch-action:none;-webkit-tap-highlight-color:transparent}
#walkie .wk-ptt.down{transform:translateY(8px) scale(.97);box-shadow:0 2px 0 #8f1f17,0 6px 16px rgba(0,0,0,.5);background:radial-gradient(circle at 50% 35%,#ff9a6c,#ff4a35 70%)}
#walkie .wk-ptt:disabled{filter:grayscale(.8) brightness(.7)}
#walkie .wk-ptt small{display:block;font:800 .8rem Nunito,sans-serif;opacity:.85;margin-top:4px}
#walkie .wk-diag{font:600 .72rem ui-monospace,Menlo,monospace;opacity:.45;text-align:center}
#walkie .wk-err{color:#FFB4A8;text-align:center;max-width:420px}
#walkie .wk-retry{margin-top:8px;background:#F6C35B;color:#3a2412;border:0;border-radius:999px;padding:12px 20px;font:800 1rem Nunito,sans-serif}
@media (prefers-reduced-motion:reduce){#walkie .wk-ptt{transition:none}}`;
  document.head.appendChild(s);
}

// iPhone: het geluid van het monster speelt via een <audio>-element van de SDK. Safari start dat soms pas na een
// echte tik, dus bij elke tik op de walkietalkie duwen we het afspelen nog eens aan.
function kickPlayback(conv) {
  try { conv?.connection?.getRoom?.()?.startAudio?.().catch?.(() => {}); } catch {}
  for (const a of document.querySelectorAll('audio')) { try { a.muted = false; if (a.paused) a.play().catch(() => {}); } catch {} }
}

export function openWalkie({ mon, context = () => ({}), onClose } = {}) {
  injectCss();
  document.getElementById('walkie')?.remove();
  const el = document.createElement('div'); el.id = 'walkie';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Walkietalkie met het Pannenkoekenmonster');
  el.innerHTML = `
    <div class="wk-top"><span class="wk-led" aria-hidden="true"></span><h2>Monster-walkietalkie</h2><button class="wk-x" data-a="close">Ophangen</button></div>
    <div class="wk-mid"><div class="mslot" data-size="lg"></div><div class="wk-state" aria-live="polite">Verbinden…</div><div class="wk-said"></div><div class="wk-diag" aria-hidden="true"></div></div>
    <button class="wk-ptt" disabled aria-label="Houd ingedrukt om te praten">Houd vast<small>om te praten</small></button>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s);
  const led = $('.wk-led'), stateEl = $('.wk-state'), said = $('.wk-said'), ptt = $('.wk-ptt');
  if (mon) { $('.mslot').appendChild(mon.el); mon.setSize('lg'); }

  const diag = el.querySelector('.wk-diag'); let diagN = 0, conn = 'verbinden';
  let conv = null, closed = false, mode = 'listening', pressing = false, thinkingSince = 0, tailTimer = 0, raf = 0, prevVol = 1;
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

  // ---- verbinden
  async function connect() {
    $('.wk-err')?.remove(); $('.wk-retry')?.remove(); ptt.hidden = false;
    setState('📡 Verbinden met het monster…'); ptt.disabled = true; led.className = 'wk-led';
    try {
      setRecording(true); // iOS: anders "AudioSession category is not compatible with audio capture"
      const [El, token] = await Promise.all([loadSdk(), getToken()]);
      if (closed) return;
      setRecording(true);
      conv = await El.Conversation.startSession({
        conversationToken: token,
        connectionType: 'webrtc',
        dynamicVariables: vars(context()),
        useWakeLock: true,
        onConnect: () => { led.className = 'wk-led on'; conn = 'verbonden'; },
        onStatusChange: ({ status }) => { conn = status; },
        onModeChange: ({ mode: m }) => {
          mode = m;
          if (closed || pressing) return;
          if (m === 'speaking') setState('🥞 Het monster praat…');
          else if (!thinkingSince) setState('Houd de knop vast om iets te zeggen');
        },
        onMessage: ({ source, message }) => {
          if (source === 'user' && message) said.textContent = '“' + message + '”';
          if ((source === 'ai' || source === 'agent') && message) said.textContent = message.replace(/\[[^\]]{1,30}\]\s*/g, '').trim(); // stemregie zoals [playful] niet tonen
        },
        onError: (msg) => { console.warn('[walkie]', msg); conn = 'fout: ' + String(msg).slice(0, 60); },
        onDisconnect: () => { if (!closed) fail('De verbinding is verbroken.'); },
      });
      if (closed) { try { await conv.endSession(); } catch {} return; }
      try { conv.setMicMuted(true); } catch {}
      kickPlayback(conv); setTimeout(() => kickPlayback(conv), 800);
      el.addEventListener('pointerdown', () => kickPlayback(conv), { capture: true });
      ptt.disabled = false; led.className = 'wk-led on';
      setState('Het monster neemt op…');
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

  async function close() {
    if (closed) return; closed = true;
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
    close,
    get open() { return !closed; },
  };
}
