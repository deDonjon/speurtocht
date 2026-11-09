// walkie.js — videobellen met Mecha-Pof: een FaceTime-achtig scherm (het monster groot in beeld, jij klein in de hoek)
// met een walkietalkie-knop eronder. Twee standen, te wisselen met de knop linksonder (onthouden op deze telefoon):
//   • Houd vast  (uitwijk)    knop ingedrukt houden = praten, loslaten = het monster antwoordt. De microfoon staat
//                             alleen open zolang de knop ingedrukt is en het monster zwijgt zolang je zendt (echt gedempt, ook op iPhone).
//   • Vrij praten (standaard) de lijn staat open zoals bij een gewoon telefoongesprek: gewoon praten, het monster luistert
//                             zelf en onderbreekt zichzelf als jij begint. De grote knop is dan een microfoon aan/uit-knop.
//
// Contract:
//   openWalkie({ mon, context, onClose, greeting?, tools?, incoming?, zeg? }) → { update(text), close(), open }
//     zeg      vast antwoord dat groot in beeld staat (briefing bij aankomst: "Begrepen, over en sluiten")
//     mon      het monster uit monster.js (de walkie hangt mon.el in zijn eigen .mslot en roept elk frame mon.live() aan)
//     context  () → { jarige, spelers, ... }  spelstand voor de agent (dynamic variables, zie MONSTER-AGENT.md)
//     onClose  wordt aangeroepen na het ophangen (index.html hangt het monster dan terug)
//     greeting eigen openingszin voor dit gesprek (bijv. de briefing van een onderdeel, walkie.briefing.<deel>); anders een zin uit walkie.hallo
//     tools    { naam: async (params) → string }  client tools van de agent (ElevenLabs "Client" tools, bijv. unlock_stop); de sleutel is de toolnaam
//     incoming true = het gesprek begon met een oproep van Mecha-Pof (andere statustekst)
//   update(text)  vertel de agent iets dat net gebeurde (bijv. "Ze hebben de neus gevonden"), zonder dat het monster hoeft te antwoorden
//   incomingCall({ mon, context, greeting, title?, sub?, tools?, timeout?, zeg?, gemist?, onAnswer?, onMissed?, onClose? }) → { close(), open }
//     gemist   tekst die de app zelf zegt als niemand opneemt (zonder 'zeg dan …'); anders greeting
//     De radiotelefoon gaat over (belgeluid + trillen, knop Opnemen). Opnemen = openWalkie met `greeting` als {{begroeting}}.
//     Niet opgenomen binnen `timeout` ms (40 s) → onMissed(greeting): index.html laat Mecha-Pof de tekst dan zelf zeggen.
//
// Techniek: ElevenLabs Agents via WebRTC (@elevenlabs/client). Het token komt van de Supabase Edge Function
// `monster-token`, zodat de API-sleutel nooit in de app staat.
// Dempen van het monster tijdens het zenden: de SDK speelt het geluid via <audio>-elementen en `setVolume()` zet daar
// alleen `.volume` op — en dat negeert iOS (het volume van een <audio> is op de iPhone alleen-lezen). Daarom zetten we
// bij het indrukken ook `.muted` op die elementen (duck()); dat werkt wél. kickPlayback() mag ze dan niet weer aanzetten.
// Animatie: de mond volgt het echte uitgaande volume (getOutputVolume), dus het klopt bij elke zin.
//
// Walkietalkie-regels (ook in de prompt van de agent, zie MONSTER-AGENT.md):
//   • Elk bericht eindigt met "over". Zonder "over" antwoordt het monster niet op de vraag, maar vraagt het om "over".
//   • Ophangen = "over en sluiten". Het monster zegt gedag en de app hangt daarna zelf op.
//   • Wie op Ophangen tikt zonder "over en sluiten", wordt meteen teruggebeld (één keer; daarna hangt de knop echt op).
// De begroeting wisselt: de app kiest een zin uit monster-lines.js (walkie.hallo) en stuurt hem mee als {{begroeting}}.
import { audio, setRecording } from './audio.js?v=11';
import { SUPABASE_URL, SUPABASE_KEY } from './sync.js';
import { LINES, NAAM_JARIGE } from './monster-lines.js?v=9';
import { uitspraak } from './voice.js?v=7';

const SDK = [
  'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.29.0/dist/lib.iife.js',
  'https://unpkg.com/@elevenlabs/client@1.29.0/dist/lib.iife.js',
];
const TOKEN_URL = SUPABASE_URL + '/functions/v1/monster-token';
const TAIL_MS = 450;          // na loslaten nog even luisteren, anders valt het laatste woord weg
const THINK_MAX_MS = 9000;    // zo lang mag het monster "denken" voordat we zeggen dat het niet antwoordt
const MODE_KEY = 'pkm2_walkie_mode'; // 'open' (vrij praten, standaard) | 'hold' (knop vasthouden)
const TALK_LEVEL = 0.22;      // vrij praten: vanaf dit microfoonvolume "luistert" het monster zichtbaar

export const getWalkieMode = () => { try { return localStorage.getItem(MODE_KEY) === 'hold' ? 'hold' : 'open'; } catch { return 'open'; } };
export const setWalkieMode = m => { try { localStorage.setItem(MODE_KEY, m === 'open' ? 'open' : 'hold'); } catch {} };

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
const KEYS = ['begroeting', 'jarige', 'spelers', 'fase', 'stop_naam', 'stop_nummer', 'stops_totaal', 'aanwijzing', 'puzzel_vraag', 'puzzel_hint', 'delen_gevonden', 'delen_nog', 'hints_gebruikt', 'wachtwoord', 'talenten']; // talenten: chat 7, voorstelronde in de lobby
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
export function callGreeting({ part, naam, text, type } = {}) {
  if (text) return fillGreeting(text, { naam });
  if (part && LINES.walkie?.briefing?.[part]?.length) return arrivalCall({ part, type, naam }).greeting;
  return greeting('oproep', { naam });
}
/** Oproep bij aankomst: briefing van het onderdeel + een duidelijk slot (walkie.briefingSlot): wat ze nu moeten doen en wat ze
    terugzeggen. type = puzzeltype van de stop ('wachtwoord' krijgt een eigen slot), part 'hoed' = thuis.
    → { greeting (zin voor de walkie), zeg (staat groot in beeld), gemist (wat de app zelf zegt als niemand opneemt) } */
export function arrivalCall({ part, type, naam } = {}) {
  const list = LINES.walkie?.briefing?.[part] || LINES.walkie?.briefing?.bonus || [];
  const body = fillGreeting(list[Math.floor(Math.random() * list.length)] || 'Bzzzt! Mecha-Pof hier. Jullie zijn er!', { naam });
  const slots = LINES.walkie?.briefingSlot || {};
  const slot = (part === 'hoed' && slots.hoed) || (type === 'wachtwoord' && slots.wachtwoord) || slots.werkbank || { tekst: 'Begrepen? Zeg dan: begrepen, over en sluiten. Over!', zeg: 'Begrepen, over en sluiten', gemist: '' };
  return { greeting: body + ' ' + slot.tekst, zeg: slot.zeg, gemist: (body + ' ' + (slot.gemist || '')).trim() };
}
// Eindigt dit bericht met "over en sluiten" (of "over en uit")? Spraakherkenning schrijft het soms los of met streepjes.
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
export const saysSluiten = t => /\bover\s*(en\s*)?(sluiten|sluit|uit)$/.test(norm(t));
export const saysOver = t => /\bover$/.test(norm(t)) || saysSluiten(t);

const BG = 'linear-gradient(rgba(60,74,102,.35) 1px,transparent 1px) 0 0/40px 40px,linear-gradient(90deg,rgba(60,74,102,.35) 1px,transparent 1px) 0 0/40px 40px,radial-gradient(120% 80% at 50% 30%,#33405A 0%,#0B0F18 72%)';
function injectCss() {
  if (document.getElementById('walkie-css')) return;
  const s = document.createElement('style'); s.id = 'walkie-css';
  s.textContent = `
#walkie[role=dialog],#wk-ring{--led:#7FE8FF;--gold:#F2BE62;--red:#FF5A4E;--ok:#4ADE80;--ink:#EAF2FF;--muted:#93A0B8;--visor:#0E1B2E;
  --display:'Lilita One','Arial Rounded MT Bold',system-ui,sans-serif;--body:Nunito,'Segoe UI',system-ui,sans-serif;--hud:'Chakra Petch',ui-monospace,Menlo,monospace;
  position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;gap:10px;
  padding:calc(env(safe-area-inset-top,0px) + 10px) 12px calc(env(safe-area-inset-bottom,0px) + 14px);
  background:${BG};color:var(--ink);font-family:var(--body);-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:none}
/* ---- het "videobeeld": Mecha-Pof groot in beeld */
.wk-screen{position:relative;flex:1;width:100%;max-width:520px;min-height:0;border-radius:30px;overflow:hidden;
  background:radial-gradient(circle at 50% 38%,#1E3352 0%,var(--visor) 70%,#070C15 100%);
  box-shadow:0 14px 48px rgba(0,0,0,.55),0 0 28px rgba(127,232,255,.22),inset 0 0 0 3px var(--led);
  display:flex;flex-direction:column}
.wk-screen::before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;
  background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 4px),radial-gradient(90% 70% at 50% 50%,transparent 55%,rgba(0,0,0,.45) 100%)}
.wk-screen::after{content:"";position:absolute;inset:3px;pointer-events:none;border-radius:27px;box-shadow:inset 0 0 40px rgba(127,232,255,.12)}
.wk-screen.tx{box-shadow:0 14px 48px rgba(0,0,0,.55),0 0 34px rgba(255,90,78,.35),inset 0 0 0 3px var(--red)}
.wk-screen.tx::after{box-shadow:inset 0 0 44px rgba(255,90,78,.18)}
.wk-hud{position:relative;z-index:2;display:flex;align-items:center;gap:8px;padding:12px 14px 0;font:700 .72rem var(--hud);letter-spacing:.14em;text-transform:uppercase;color:var(--led)}
.wk-live{display:flex;align-items:center;gap:7px;background:rgba(7,12,21,.55);border-radius:999px;padding:5px 10px 5px 7px;backdrop-filter:blur(4px)}
.wk-led{width:9px;height:9px;border-radius:50%;background:#4A5058;box-shadow:0 0 0 2px rgba(255,255,255,.06);flex:none}
.wk-led.on{background:var(--ok);box-shadow:0 0 10px var(--ok)}
.wk-led.tx{background:var(--red);box-shadow:0 0 12px var(--red);animation:wk-blink .9s steps(1) infinite}
.wk-led.wait{background:var(--gold);box-shadow:0 0 10px var(--gold);animation:wk-blink 1.1s steps(1) infinite}
.wk-name{flex:1;font:400 1.15rem var(--display);letter-spacing:.02em;text-transform:none;color:var(--ink);text-shadow:0 2px 0 rgba(0,0,0,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wk-time{font-variant-numeric:tabular-nums;color:var(--ink);opacity:.9}
.wk-sig{display:flex;align-items:flex-end;gap:2px;height:14px}
.wk-sig i{display:block;width:4px;border-radius:1px;background:rgba(127,232,255,.25)}
.wk-sig i:nth-child(1){height:5px}.wk-sig i:nth-child(2){height:8px}.wk-sig i:nth-child(3){height:11px}.wk-sig i:nth-child(4){height:14px}
.wk-sig.ok i{background:var(--led);box-shadow:0 0 6px rgba(127,232,255,.6)}
.wk-sig.wait i{animation:wk-sig 1.2s ease-in-out infinite}
.wk-sig.wait i:nth-child(2){animation-delay:.15s}.wk-sig.wait i:nth-child(3){animation-delay:.3s}.wk-sig.wait i:nth-child(4){animation-delay:.45s}
/* jouw "camerabeeld" rechtsboven: je stem als balkjes */
.wk-pip{position:absolute;z-index:2;top:46px;right:12px;width:74px;height:98px;border-radius:16px;background:rgba(7,12,21,.72);border:2px solid rgba(127,232,255,.35);
  box-shadow:0 6px 18px rgba(0,0,0,.5);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;padding:8px 6px;backdrop-filter:blur(6px);transition:border-color .2s,box-shadow .2s}
.wk-pip.tx{border-color:var(--red);box-shadow:0 6px 18px rgba(0,0,0,.5),0 0 16px rgba(255,90,78,.45)}
.wk-pip.live{border-color:var(--ok)}
.wk-bars{display:flex;align-items:flex-end;gap:4px;height:38px;color:var(--led)}
.wk-pip.tx .wk-bars{color:var(--red)}.wk-pip.live .wk-bars{color:var(--ok)}
.wk-bars i{display:block;width:6px;height:100%;border-radius:3px;background:currentColor;transform:scaleY(.12);transform-origin:bottom;box-shadow:0 0 6px currentColor;will-change:transform}
.wk-pip-lbl{font:700 .62rem var(--hud);letter-spacing:.14em;color:var(--muted)}
.wk-pip.tx .wk-pip-lbl{color:var(--red)}.wk-pip.live .wk-pip-lbl{color:var(--ok)}
.wk-stage{position:relative;z-index:1;flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:6px 0}
#walkie .mslot{display:flex;align-items:center;justify-content:center}
#walkie .mslot .pkmon.lg{width:min(80vw,320px,44vh)}
/* ondertitels onderaan het beeld */
.wk-foot{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:6px;padding:0 14px 8px;text-align:center}
.wk-state{font:800 1.05rem var(--body);min-height:1.5em;color:var(--ink);text-shadow:0 2px 6px rgba(0,0,0,.7)}
.wk-said{max-width:100%;min-height:1.4em;font:700 .95rem/1.3 var(--body);color:var(--ink);background:rgba(7,12,21,.62);border-radius:12px;padding:6px 12px;backdrop-filter:blur(4px)}
.wk-said:empty{display:none}
.wk-tool{font:800 .85rem var(--body);color:#FFE98A;min-height:0}
.wk-tool:empty{display:none}
.wk-diag{position:relative;z-index:2;padding:0 10px 5px;font:600 .6rem var(--hud);opacity:.4;text-align:center;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wk-err{color:#FFB4A8;text-align:center;max-width:420px;font-weight:700}
.wk-retry{margin-top:4px;background:var(--gold);color:#3A1C06;border:0;border-radius:999px;padding:12px 20px;font:800 1rem var(--body)}
/* ---- regels + bedieningsbalk (zoals FaceTime: ronde knoppen, rood ophangen) */
.wk-rules{font:700 .86rem var(--body);color:#BFEFFF;text-align:center;opacity:.9;min-height:1.2em}
.wk-rules b{color:var(--led)}
.wk-bar{width:100%;max-width:520px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;justify-items:center;gap:8px;padding:0 6px}
.wk-rnd{display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:0;color:var(--ink);font:800 .72rem var(--body);padding:4px;-webkit-tap-highlight-color:transparent}
.wk-rnd .ic{display:flex;align-items:center;justify-content:center;width:62px;height:62px;border-radius:50%;background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 2px rgba(255,255,255,.08),0 6px 16px rgba(0,0,0,.4);font-size:1.6rem;transition:transform .08s}
.wk-rnd:active .ic{transform:scale(.94)}
.wk-rnd small{color:var(--muted);font:800 .72rem var(--body)}
.wk-mode.open .ic{background:rgba(127,232,255,.18);box-shadow:inset 0 0 0 2px var(--led),0 6px 16px rgba(0,0,0,.4)}
.wk-mode.open small{color:var(--led)}
.wk-hang .ic{background:linear-gradient(180deg,#ff7a6e,#d8352a);box-shadow:0 5px 0 #8f1f17,0 10px 20px rgba(0,0,0,.45)}
.wk-hang .ic span{display:block;transform:rotate(135deg)}
.wk-hang:active .ic{transform:translateY(3px);box-shadow:0 2px 0 #8f1f17}
/* de praatknop */
.wk-ptt{width:132px;height:132px;border-radius:50%;border:0;color:#fff;font:400 1.15rem/1.1 var(--display);letter-spacing:.01em;
  background:radial-gradient(circle at 50% 35%,#ff7a5c,#d8352a 70%);box-shadow:0 10px 0 #8f1f17,0 16px 30px rgba(0,0,0,.5),0 0 0 6px rgba(255,90,78,.15);
  transition:transform .08s,box-shadow .08s,background .2s;touch-action:none;-webkit-tap-highlight-color:transparent}
.wk-ptt.down{transform:translateY(8px) scale(.97);box-shadow:0 2px 0 #8f1f17,0 6px 16px rgba(0,0,0,.5),0 0 0 10px rgba(255,90,78,.25);background:radial-gradient(circle at 50% 35%,#ff9a6c,#ff4a35 70%)}
.wk-ptt:disabled{filter:grayscale(.8) brightness(.7)}
.wk-ptt small{display:block;font:800 .74rem var(--body);opacity:.85;margin-top:3px}
/* vrij praten: de knop is een microfoon aan/uit */
.wk-ptt.mic{background:radial-gradient(circle at 50% 35%,#86F0AE,#2FBF66 70%);box-shadow:0 10px 0 #1F8A4C,0 16px 30px rgba(0,0,0,.5),0 0 0 6px rgba(74,222,128,.15);color:#062814}
.wk-ptt.mic small{opacity:.8}
.wk-ptt.mic.off{background:radial-gradient(circle at 50% 35%,#6B7688,#3C4555 70%);box-shadow:0 10px 0 #232A36,0 16px 30px rgba(0,0,0,.5);color:var(--ink)}
.wk-ptt.mic:active{transform:translateY(6px);box-shadow:0 3px 0 #1F8A4C,0 6px 16px rgba(0,0,0,.5)}
.wk-ptt.mic.off:active{box-shadow:0 3px 0 #232A36,0 6px 16px rgba(0,0,0,.5)}
/* ---- inkomende oproep: de radiotelefoon gaat over */
#wk-ring{justify-content:space-between;gap:14px;padding-top:calc(env(safe-area-inset-top,0px) + 14px)}
#wk-ring .rg-screen{position:relative;flex:1;width:100%;max-width:520px;min-height:0;border-radius:30px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:14px;
  background:radial-gradient(circle at 50% 38%,#1E3352 0%,var(--visor) 70%,#070C15 100%);box-shadow:0 14px 48px rgba(0,0,0,.55),0 0 28px rgba(127,232,255,.22),inset 0 0 0 3px var(--led);animation:wk-ringglow 1.7s ease-in-out infinite}
#wk-ring .rg-screen::before{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 4px)}
#wk-ring .rg-eye{position:absolute;z-index:1;top:14px;left:50%;transform:translateX(-50%);font:700 .74rem var(--hud);letter-spacing:.16em;text-transform:uppercase;color:var(--led);animation:wk-blink 1.1s steps(1) infinite;background:rgba(7,12,21,.55);border-radius:999px;padding:5px 12px}
#wk-ring .mslot{position:relative;z-index:1;animation:wk-ring 1.7s ease-in-out infinite}
#wk-ring .mslot .pkmon.lg{width:min(80vw,320px,42vh)}
#wk-ring h2{position:relative;z-index:1;margin:0;font:400 2rem var(--display);color:var(--gold);text-shadow:0 3px 0 #9A5419,0 0 24px rgba(242,190,98,.25);text-align:center}
#wk-ring .rg-sub{position:relative;z-index:1;margin:0;font-weight:800;color:#BFEFFF;max-width:420px;text-align:center}
#wk-ring .rg-btns{width:100%;max-width:420px;display:flex;flex-direction:column;gap:10px;align-items:center}
#wk-ring .rg-answer{width:100%;min-height:84px;border:0;border-radius:999px;color:#062814;font:400 1.6rem var(--display);letter-spacing:.02em;
  background:linear-gradient(180deg,#86F0AE 0%,#4ADE80 50%,#2FBF66 100%);box-shadow:0 6px 0 #1F8A4C,0 0 24px rgba(74,222,128,.35);touch-action:manipulation;animation:wk-pulse 1.7s ease-in-out infinite}
#wk-ring .rg-answer:active{transform:translateY(4px);box-shadow:0 2px 0 #1F8A4C}
#wk-ring .rg-later{background:transparent;border:0;color:var(--muted);text-decoration:underline;font:800 .95rem var(--body);min-height:44px;padding:8px 14px}
@keyframes wk-ring{0%,100%{transform:rotate(0)}10%{transform:rotate(-3deg) translateX(-3px)}20%{transform:rotate(3deg) translateX(3px)}30%{transform:rotate(-2deg)}40%{transform:rotate(2deg)}50%{transform:none}}
@keyframes wk-ringglow{0%,100%{box-shadow:0 14px 48px rgba(0,0,0,.55),0 0 28px rgba(127,232,255,.22),inset 0 0 0 3px var(--led)}50%{box-shadow:0 14px 48px rgba(0,0,0,.55),0 0 44px rgba(127,232,255,.5),inset 0 0 0 3px #B9F3FF}}
@keyframes wk-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
@keyframes wk-blink{0%,55%{opacity:1}56%,100%{opacity:.35}}
@keyframes wk-sig{0%,100%{opacity:.25}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){.wk-ptt,.wk-rnd .ic{transition:none}#wk-ring .mslot,#wk-ring .rg-eye,#wk-ring .rg-screen,#wk-ring .rg-answer,.wk-led,.wk-sig i{animation:none}}`;
  document.head.appendChild(s);
}

// iPhone: het geluid van het monster speelt via een <audio>-element van de SDK. Safari start dat soms pas na een
// echte tik, dus bij elke tik op de walkietalkie duwen we het afspelen nog eens aan. `unmute` false = laat gedempte
// elementen gedempt (tijdens het zenden).
function kickPlayback(conv, unmute = true) {
  try { conv?.connection?.getRoom?.()?.startAudio?.().catch?.(() => {}); } catch {}
  for (const a of document.querySelectorAll('audio')) { try { if (unmute) a.muted = false; if (a.paused) a.play().catch(() => {}); } catch {} }
}
const fmtTime = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

export function openWalkie({ mon, context = () => ({}), onClose, greeting: firstGreeting = null, tools = null, incoming = false, zeg = '' } = {}) {
  injectCss();
  document.querySelector('#walkie[role=dialog]')?.remove(); document.getElementById('wk-ring')?.remove(); // (niet de knop #walkie van test/monster.html)
  const el = document.createElement('div'); el.id = 'walkie';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Walkietalkie met Mecha-Pof');
  el.innerHTML = `
    <div class="wk-screen">
      <div class="wk-hud"><span class="wk-live"><i class="wk-led wait" aria-hidden="true"></i><span class="wk-livetxt">Verbinden</span></span><span class="wk-name">Mecha-Pof</span><span class="wk-time">00:00</span><span class="wk-sig wait" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>
      <div class="wk-pip" aria-label="Jouw microfoon"><span class="wk-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="wk-pip-lbl">Jij</span></div>
      <div class="wk-stage"><div class="mslot" data-size="lg"></div></div>
      <div class="wk-foot"><div class="wk-state" aria-live="polite">Verbinden…</div><div class="wk-said"></div><div class="wk-tool" aria-live="polite"></div></div>
      <div class="wk-diag" aria-hidden="true"></div>
    </div>
    <div class="wk-rules">Eindig met <b>“over”</b> · klaar? Zeg <b>“over en sluiten”</b></div>
    <div class="wk-bar">
      <button class="wk-rnd wk-mode" data-a="mode" aria-label="Praatstand wisselen"><span class="ic">✋</span><small>Houd vast</small></button>
      <button class="wk-ptt" disabled aria-label="Houd ingedrukt om te praten">Houd vast<small>om te praten</small></button>
      <button class="wk-rnd wk-hang" data-a="close" aria-label="Ophangen"><span class="ic"><span>📞</span></span><small>Ophangen</small></button>
    </div>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s);
  const screen = $('.wk-screen'), led = $('.wk-led'), liveTxt = $('.wk-livetxt'), timeEl = $('.wk-time'), sig = $('.wk-sig'), pip = $('.wk-pip'), bars = [...el.querySelectorAll('.wk-bars i')];
  const stateEl = $('.wk-state'), said = $('.wk-said'), ptt = $('.wk-ptt'), toolEl = $('.wk-tool'), modeBtn = $('.wk-mode');
  if (mon) { $('.mslot').appendChild(mon.el); mon.setSize('lg'); }

  const diag = el.querySelector('.wk-diag'); let diagN = 0, conn = 'verbinden';
  let conv = null, closed = false, mode = 'listening', pressing = false, thinkingSince = 0, tailTimer = 0, raf = 0;
  let pttMode = getWalkieMode(), micOn = false, startedAt = 0, lastSec = -1;
  // over en sluiten: ending = kind zei het, het monster zegt nog gedag; daarna ophangen. calledBack = al een keer teruggebeld.
  let sessId = 0, ending = false, endSpoke = false, endTimer = 0, everConnected = false, calledBack = false, callbackMode = false;
  // hush: de eerste zin van elk gesprek (briefing, oproep, hallo, terugbelzin) mag Mecha-Pof zonder onderbreking uitspreken.
  // Microfoon dicht en praatknop uit tot hij klaar is (even stil na 'speaking'); vangnet als hij niet begint of niet stopt.
  let hush = false, hushSpoke = false, hushIdle = 0, hushStart = 0, hushMax = 0;
  const setState = t => { stateEl.textContent = t; };
  const setLed = (cls, txt) => { led.className = 'wk-led ' + cls; liveTxt.textContent = txt; };
  const open = () => pttMode === 'open';
  const transmitting = () => pressing || (open() && micOn && !!conv);

  // ---- dempen van het monster terwijl je zendt (zie kop: .muted, want iOS negeert .volume)
  let ducked = false; const duckedEls = new Set();
  function duck(on) {
    ducked = !!on;
    try { conv?.setVolume({ volume: on ? 0 : 1 }); } catch {}
    if (on) { for (const a of document.querySelectorAll('audio')) { try { if (!a.muted) { a.muted = true; duckedEls.add(a); } } catch {} } }
    else { for (const a of duckedEls) { try { a.muted = false; } catch {} } duckedEls.clear(); }
  }

  // ---- praatstand: knop vasthouden of vrij praten
  function applyMode() {
    const o = open();
    modeBtn.classList.toggle('open', o);
    modeBtn.querySelector('.ic').textContent = o ? '🎧' : '✋';
    modeBtn.querySelector('small').textContent = o ? 'Vrij praten' : 'Houd vast';
    ptt.classList.toggle('mic', o);
    if (o) {
      ptt.classList.toggle('off', !micOn);
      ptt.innerHTML = micOn ? 'Mic aan<small>tik om te dempen</small>' : 'Mic uit<small>tik om te praten</small>';
      ptt.setAttribute('aria-label', micOn ? 'Microfoon uitzetten' : 'Microfoon aanzetten');
    } else {
      ptt.classList.remove('off', 'down');
      ptt.innerHTML = 'Houd vast<small>om te praten</small>';
      ptt.setAttribute('aria-label', 'Houd ingedrukt om te praten');
    }
    $('.wk-rules').innerHTML = zeg ? `Zeg nu: <b>“${String(zeg).replace(/[<>&]/g, '')}”</b>` // oproep met een vast antwoord (briefing bij aankomst)
      : o ? 'Gewoon praten · eindig met <b>“over”</b> · klaar? <b>“over en sluiten”</b>' : 'Eindig met <b>“over”</b> · klaar? Zeg <b>“over en sluiten”</b>';
    if (conv && !ending && hush) { try { conv.setMicMuted(true); } catch {} ptt.disabled = true; setState('🤫 Luister eerst naar Mecha-Pof…'); return; }
    if (conv && !ending) {
      if (o) { try { conv.setMicMuted(!micOn); } catch {} duck(false); setState(micOn ? '🎧 De lijn staat open. Praat maar!' : 'Tik op de knop om je microfoon aan te zetten'); }
      else { pressing = false; clearTimeout(tailTimer); try { conv.setMicMuted(true); } catch {} duck(false); setState('Houd de knop vast om iets te zeggen'); }
    }
  }
  function toggleMode() {
    if (pressing) up();
    pttMode = open() ? 'hold' : 'open'; setWalkieMode(pttMode);
    micOn = open() && !!conv && !hush; // vrij praten begint met de microfoon aan (niet tijdens de eerste zin)
    audio.play('zend'); audio.buzz(20);
    applyMode();
  }
  function toggleMic() {
    if (!conv || !open() || hush) return;
    micOn = !micOn; kickPlayback(conv);
    try { conv.setMicMuted(!micOn); } catch {}
    audio.play(micOn ? 'zend' : 'over'); audio.buzz(micOn ? 25 : [15, 40, 15]);
    applyMode();
  }

  // ---- elk frame: fase + volumes naar het monster, balkjes in je eigen beeldje, klok
  function frame() {
    raf = 0; if (closed) return;
    const t = performance.now();
    let phase = 'praat', out = 0, inp = 0;
    if (conv) {
      try { out = conv.getOutputVolume?.() || 0; inp = conv.getInputVolume?.() || 0; } catch {}
      if (pressing) phase = 'luister';
      else if (mode === 'speaking') { phase = 'praat'; thinkingSince = 0; }
      else if (open() && micOn && inp > TALK_LEVEL) { phase = 'luister'; thinkingSince = 0; }
      else if (thinkingSince) {
        phase = 'denk';
        if (t - thinkingSince > THINK_MAX_MS) { thinkingSince = 0; setState('Hmm, het monster zegt niks. Probeer het nog eens.'); }
      }
    }
    // volume (0 = -100 dB, 1 = -30 dB) omzetten naar mondopening: stil = dicht, gewone spraak = halfopen, hard = wijd
    const mouth = Math.max(0, Math.min(1, (out - 0.12) * 1.7));
    const ear = Math.max(0, Math.min(1, (inp - 0.1) * 1.6));
    mon?.live(phase, { out: mouth, in: ear });
    // jouw beeldje: vijf balkjes dansen op je stem (lichte golf zodat het leeft, ook als je stil bent)
    const tx = transmitting(); pip.classList.toggle('tx', pressing); pip.classList.toggle('live', tx && !pressing); screen.classList.toggle('tx', pressing);
    for (let i = 0; i < bars.length; i++) {
      const wave = 0.5 + 0.5 * Math.sin(t / 160 + i * 1.3);
      const h = tx ? 0.12 + ear * (0.45 + 0.55 * wave) : 0.08 + 0.05 * wave;
      bars[i].style.transform = `scaleY(${Math.max(0.06, Math.min(1, h)).toFixed(3)})`;
    }
    if (startedAt) { const sec = Math.floor((t - startedAt) / 1000); if (sec !== lastSec) { lastSec = sec; timeEl.textContent = fmtTime(t - startedAt); } }
    if (++diagN % 15 === 0) diag.textContent = conv ? `${conn} · ${mode} · ${pttMode}${open() ? (micOn ? '/mic' : '/stil') : ''} · monster ${out.toFixed(2)} · mic ${inp.toFixed(2)} · ${document.querySelectorAll('audio').length}🔈 · ${navigator.audioSession?.type || '-'}` : conn;
    raf = requestAnimationFrame(frame);
  }

  // ---- knop vasthouden: indrukken = zenden (microfoon open, monster gedempt), loslaten = het monster antwoordt
  function down(e) {
    if (!conv || pressing || open() || hush) return;
    e?.preventDefault?.();
    pressing = true; clearTimeout(tailTimer);
    kickPlayback(conv, false);
    try { ptt.setPointerCapture?.(e.pointerId); } catch {}
    duck(true);                                   // zenden = het monster niet tegelijk horen (en geen echo)
    try { conv.setMicMuted(false); } catch {}
    ptt.classList.add('down'); setLed('tx', 'Zendt');
    audio.play('zend'); audio.buzz(25);
    setState('🎙️ Praat maar… het monster luistert');
  }
  function up(e) {
    if (!pressing) return;
    e?.preventDefault?.();
    pressing = false;
    ptt.classList.remove('down'); setLed('on', 'Live');
    audio.play('over'); audio.buzz([15, 40, 15]);
    tailTimer = setTimeout(() => {
      try { conv?.setMicMuted(true); } catch {}
      duck(false);
    }, TAIL_MS);
    thinkingSince = performance.now();
    setState('🤔 Het monster denkt na…');
  }
  ptt.addEventListener('pointerdown', e => { if (open()) return; down(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) ptt.addEventListener(ev, up);
  ptt.addEventListener('click', () => { if (open()) toggleMic(); });
  ptt.addEventListener('contextmenu', e => e.preventDefault());
  const onKey = e => {
    if (e.code !== 'Space' || e.repeat) return;
    if (open()) { if (e.type === 'keydown') toggleMic(); return; }
    e.type === 'keydown' ? down(e) : up(e);
  };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  el.addEventListener('click', e => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'close') close(); if (a === 'retry') connect(); if (a === 'mode') toggleMode(); });
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
    setState('📡 Verbinden met het monster…'); ptt.disabled = true; setLed('wait', 'Verbinden'); sig.className = 'wk-sig wait';
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
        onConnect: () => { setLed('on', 'Live'); sig.className = 'wk-sig ok'; conn = 'verbonden'; if (!startedAt) startedAt = performance.now(); },
        onStatusChange: ({ status }) => { conn = status; },
        onModeChange: ({ mode: m }) => {
          if (!live()) return;
          mode = m;
          if (ending) { if (m === 'speaking') endSpoke = true; else if (endSpoke) { clearTimeout(endTimer); endTimer = setTimeout(() => close({ force: true }), 700); } }
          if (hush) { // eerste zin: pas vrijgeven als hij echt klaar is (korte pauzes tussen zinnen tellen niet)
            clearTimeout(hushIdle);
            if (m === 'speaking') { hushSpoke = true; clearTimeout(hushStart); setState('🤫 Luister eerst naar Mecha-Pof…'); }
            else if (hushSpoke) hushIdle = setTimeout(unhush, 900);
            return;
          }
          if (closed || pressing) return;
          if (m === 'speaking') setState('🤖 Mecha-Pof praat…');
          else if (!thinkingSince) setState(open() ? (micOn ? '🎧 De lijn staat open. Praat maar!' : 'Tik op de knop om je microfoon aan te zetten') : 'Houd de knop vast om iets te zeggen');
        },
        onMessage: ({ source, message }) => {
          if (!live()) return;
          if (source === 'user' && message) {
            said.textContent = '“' + message + '”';
            if (saysSluiten(message) && !ending) { // netjes afgesloten: monster zegt gedag, dan hangen we op
              ending = true; endSpoke = false; ptt.disabled = true; setState('👋 Over en sluiten…');
              if (open()) { micOn = false; try { conv?.setMicMuted(true); } catch {} applyMode(); }
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
      micOn = open();      // vrij praten: lijn meteen open; vasthouden: microfoon dicht tot de knop ingedrukt wordt
      try { conv.setMicMuted(!micOn); } catch {}
      kickPlayback(conv); setTimeout(() => kickPlayback(conv, !ducked), 800);
      el.addEventListener('pointerdown', () => kickPlayback(conv, !ducked), { capture: true });
      ptt.disabled = false; setLed('on', 'Live'); everConnected = true;
      hush = true; hushSpoke = false; micOn = false; // eerst de openingszin uit laten spreken
      clearTimeout(hushIdle); clearTimeout(hushStart); clearTimeout(hushMax);
      hushStart = setTimeout(unhush, 12_000); // begint hij niet te praten: toch vrijgeven
      hushMax = setTimeout(unhush, 60_000);   // praat hij eindeloos: toch vrijgeven
      applyMode();
      setState(callbackMode ? '📞 Mecha-Pof belt terug…' : incoming ? '📞 Opgenomen! Mecha-Pof praat zo…' : 'Mecha-Pof neemt op…');
      thinkingSince = performance.now(); // het eerste bericht (begroeting) komt vanzelf
    } catch (err) {
      fail(err?.message || String(err));
    }
  }
  function unhush() {
    if (!hush) return;
    hush = false; clearTimeout(hushIdle); clearTimeout(hushStart); clearTimeout(hushMax);
    if (closed || !conv || ending) return;
    micOn = open(); ptt.disabled = false;
    audio.play('zend'); audio.buzz(25); // piepje: nu mogen jullie praten
    applyMode();
    setState(open() ? '🎧 Jullie beurt! Praat maar.' : 'Jullie beurt! Houd de knop vast om iets te zeggen');
  }
  function fail(msg) {
    hush = false; clearTimeout(hushIdle); clearTimeout(hushStart); clearTimeout(hushMax);
    conv = null; ptt.disabled = true; pressing = false; ptt.classList.remove('down'); setLed('', 'Geen lijn'); sig.className = 'wk-sig'; thinkingSince = 0; duck(false);
    setState('📵 Geen verbinding'); ptt.hidden = true;
    const m = /audiosession/i.test(msg) ? 'De iPhone gaf de microfoon niet vrij. Tik op Opnieuw proberen.' : /permission|notallowed|denied/i.test(msg) ? 'De microfoon mag niet. Sta de microfoon toe voor deze website en probeer opnieuw.' : msg;
    $('.wk-foot').insertAdjacentHTML('beforeend', `<p class="wk-err">${m.replace(/[<>&]/g, '')}</p><button class="wk-retry" data-a="retry">Opnieuw proberen</button>`);
  }

  // Ophangen zonder "over en sluiten": meteen terugbellen (één keer). De tweede keer hangt de knop echt op.
  let switching = false;
  async function callBack() {
    calledBack = true; callbackMode = true; switching = true; sessId++;
    const c = conv; conv = null; thinkingSince = 0; pressing = false; ptt.classList.remove('down'); duck(false);
    try { await c?.endSession(); } catch {}
    switching = false;
    if (closed) return;
    ptt.disabled = true; setLed('wait', 'Belt terug'); sig.className = 'wk-sig wait';
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
    duck(false);
    try { await c?.endSession(); } catch {}
    setRecording(false);
    el.remove();
    onClose?.();
  }

  applyMode();
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
// Mecha-Pof wiebelt in beeld, grote knop Opnemen. Opnemen → openWalkie met `greeting` als {{begroeting}}.
// Later → onClose(); niets gezegd. Niet opgenomen binnen `timeout` → onMissed(greeting): de app zegt de tekst dan zelf.
const RING_MS = 1700;
export function incomingCall({ mon, context = () => ({}), greeting: text, title = 'Mecha-Pof belt!', sub = '', tools = null, timeout = 40_000, zeg = '', gemist = '', onAnswer, onMissed, onClose } = {}) {
  injectCss();
  document.getElementById('wk-ring')?.remove();
  if (document.querySelector('#walkie[role=dialog]')) { // de walkie is al open: niet bellen (index.html geeft de tekst dan als context mee)
    return { close() {}, get open() { return false; }, answered: false };
  }
  const el = document.createElement('div'); el.id = 'wk-ring';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Inkomende oproep van Mecha-Pof');
  const esc = s => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  el.innerHTML = `
    <div class="rg-screen">
      <span class="rg-eye">📞 Inkomende oproep</span>
      <div class="mslot" data-size="lg"></div>
      <h2>${esc(title)}</h2>${sub ? `<p class="rg-sub">${esc(sub)}</p>` : ''}
    </div>
    <div class="rg-btns"><button class="rg-answer" data-a="answer">📻 Opnemen</button><button class="rg-later" data-a="later">Later</button></div>`;
  document.body.appendChild(el);

  if (mon) { el.querySelector('.mslot').appendChild(mon.el); mon.setSize('lg'); }
  let closed = false, answered = false;
  const ring = () => { if (closed) return; audio.play('bel'); audio.buzz([220, 120, 220]); };
  ring(); const ringTimer = setInterval(ring, RING_MS);
  const missTimer = setTimeout(() => { if (!closed) { finish(); onMissed?.(gemist || text); } }, timeout); // gemist: zonder 'zeg dan …', want er luistert niemand
  function finish() { if (closed) return; closed = true; clearInterval(ringTimer); clearTimeout(missTimer); el.remove(); }
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'later') { finish(); onClose?.(); }
    if (a === 'answer') {
      answered = true; finish(); audio.play('zend');
      const w = openWalkie({ mon, context, greeting: text, tools, incoming: true, zeg, onClose });
      onAnswer?.(w);
    }
  });
  return { close() { finish(); onClose?.(); }, get open() { return !closed; }, get answered() { return answered; } };
}
