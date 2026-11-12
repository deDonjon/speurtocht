// walkie.js — videobellen met Mecha-Pof: een FaceTime-achtig scherm (het monster groot in beeld, jij klein in de hoek)
// met een walkietalkie-knop eronder. Twee standen, te wisselen met de knop linksonder (onthouden op deze telefoon):
//   • Houd vast  (uitwijk)    knop ingedrukt houden = praten, loslaten = het monster antwoordt. De microfoon staat
//                             alleen open zolang de knop ingedrukt is en het monster zwijgt zolang je zendt (echt gedempt, ook op iPhone).
//   • Vrij praten (standaard) de lijn staat open zoals bij een gewoon telefoongesprek: gewoon praten, het monster luistert
//                             zelf en onderbreekt zichzelf als jij begint. De grote knop is dan een microfoon aan/uit-knop.
//
// Contract:
//   openWalkie({ mon, context, onClose, greeting?, tools?, incoming?, zeg?, title?, sub? }) → { update(text), close(), open }
//     title    kop bovenin (standaard 'Radio Mecha-Pof'; bij een oproep 'Oproep van Mecha-Pof'); sub = regel eronder (de plek)
//     Het laatste bericht van Mecha-Pof staat altijd als tekst in beeld (BERICHT #n) met een knop ↻ Herhaal: de microfoon gaat
//     dan even dicht en Mecha-Pof zegt zijn bericht nog een keer (voor als er doorheen gepraat is).
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
import { LINES, NAAM_JARIGE } from './monster-lines.js?v=15';
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
const fillGreeting = (l, ctx = {}) => String(l || '').replace(/\{spelers\}/g, namen(ctx.spelers)).replace(/\{jarige\}/g, ctx.jarige && ctx.jarige !== 'de jarige' ? ctx.jarige : NAAM_JARIGE).replace(/\{naam\}/g, ctx.naam || 'speurder').replace(/\{monteur\}/g, ctx.monteur || 'monteur');
function greeting(kind, ctx) {
  const list = LINES.walkie?.[kind] || [];
  const fresh = list.length > 1 ? list.filter(l => l !== lastGreet[kind]) : list;
  const l = fresh[Math.floor(Math.random() * fresh.length)] || 'Mecha-Pof hier. Zeg het maar. Over!';
  lastGreet[kind] = l;
  return fillGreeting(l, ctx);
}
/** Openingszin voor een oproep van Mecha-Pof: de briefing van een onderdeel (walkie.briefing.<deel>), of een algemene
    oproepzin (walkie.oproep, met {naam}). Voor index.html en de testpagina. */
export function callGreeting({ part, naam, text, type, monteur } = {}) {
  if (text) return fillGreeting(text, { naam });
  if (part && LINES.walkie?.briefing?.[part]?.length) return arrivalCall({ part, type, naam, monteur }).greeting;
  return greeting('oproep', { naam });
}
/** Oproep bij aankomst: briefing van het onderdeel + een duidelijk slot (walkie.briefingSlot): wat ze nu moeten doen en wat ze
    terugzeggen. type = puzzeltype van de stop ('wachtwoord' krijgt een eigen slot), part 'hoed' = thuis.
    monteur = hoe Mecha-Pof de monteur van dit deel aanspreekt ("Tijdbewaker Elin"), voor {monteur} in briefing en slot.
    → { greeting (zin voor de walkie), zeg (staat groot in beeld), gemist (wat de app zelf zegt als niemand opneemt) } */
const MONTEUR_TALENT = { ogen: 'Speurneus', neus: 'Kaartlezer', mond: 'Codekraker', armen: 'Rekenmeester', benen: 'Tijdbewaker', hoed: 'Sleutelbewaarder' };
export function arrivalCall({ part, type, naam, monteur } = {}) {
  monteur = monteur || MONTEUR_TALENT[part] || 'monteur';
  const list = LINES.walkie?.briefing?.[part] || LINES.walkie?.briefing?.bonus || [];
  const body = fillGreeting(list[Math.floor(Math.random() * list.length)] || 'Bzzzt! Mecha-Pof hier. Jullie zijn er!', { naam, monteur });
  const slots = LINES.walkie?.briefingSlot || {};
  const slot = (part === 'hoed' && slots.hoed) || (type === 'wachtwoord' && slots.wachtwoord) || (['slot', 'formatie', 'licht', 'splits'].includes(type) && slots.samen) || slots.werkbank || { tekst: 'Begrepen? Zeg dan: begrepen, over en sluiten. Over!', zeg: 'Begrepen, over en sluiten', gemist: '' };
  const f = t => fillGreeting(t, { naam, monteur });
  return { greeting: body + ' ' + f(slot.tekst), zeg: slot.zeg, gemist: (body + ' ' + f(slot.gemist || '')).trim() };
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
#walkie[role=dialog],#wk-ring{--line:#3C4A66;--led:#7FE8FF;--gold:#F2BE62;--red:#FF5A4E;--ok:#4ADE80;--ink:#EAF2FF;--muted:#93A0B8;--visor:#0E1B2E;
  --display:'Lilita One','Arial Rounded MT Bold',system-ui,sans-serif;--body:Nunito,'Segoe UI',system-ui,sans-serif;--hud:'Chakra Petch',ui-monospace,Menlo,monospace;
  position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;gap:8px;
  padding:calc(env(safe-area-inset-top,0px) + 8px) 12px calc(env(safe-area-inset-bottom,0px) + 10px);
  background:${BG};color:var(--ink);font-family:var(--body);-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:none}
/* ---- kop: duidelijk wie er aan de lijn is, met kanaal, klok en signaal */
.wk-top{width:100%;max-width:520px;display:flex;flex-direction:column;gap:3px;padding:0 2px}
.wk-topline{display:flex;align-items:center;gap:8px;font:700 .7rem var(--hud);letter-spacing:.12em;text-transform:uppercase;color:var(--led)}
.wk-ch{flex:1;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wk-title{margin:0;font:400 clamp(1.55rem,7.4vw,2.1rem)/1.02 var(--display);letter-spacing:.02em;color:var(--gold);text-shadow:0 3px 0 #9A5419,0 0 22px rgba(242,190,98,.3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wk-subt{font:700 .82rem var(--hud);letter-spacing:.1em;text-transform:uppercase;color:#BFEFFF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:1.1em}
.wk-subt:empty{display:none}
/* ---- beurtbalk: in één oogopslag wie er nu praat */
.wk-turn{width:100%;max-width:520px;display:flex;align-items:center;gap:10px;border-radius:12px;padding:8px 12px;font:700 .98rem/1.15 var(--hud);letter-spacing:.06em;text-transform:uppercase;
  background:rgba(7,12,21,.7);border:2px solid var(--line,#3C4A66);color:var(--muted);transition:background .15s,border-color .15s,color .15s}
.wk-turn b{font:700 .7rem var(--hud);letter-spacing:.14em;border-radius:6px;padding:3px 7px;background:currentColor;flex:none}
.wk-turn b span{color:#070C15}
.wk-turn small{display:block;font:800 .74rem var(--body);letter-spacing:0;text-transform:none;opacity:.9}
.wk-turn.rx{border-color:var(--led);color:var(--led);background:rgba(127,232,255,.12);box-shadow:0 0 18px rgba(127,232,255,.22)}
.wk-turn.go{border-color:var(--ok);color:var(--ok);background:rgba(74,222,128,.14);box-shadow:0 0 18px rgba(74,222,128,.25)}
.wk-turn.tx{border-color:var(--red);color:var(--red);background:rgba(255,90,78,.14)}
.wk-turn.think,.wk-turn.wait{border-color:var(--gold);color:var(--gold);background:rgba(242,190,98,.1)}
.wk-turn.think b,.wk-turn.wait b{animation:wk-blink 1.1s steps(1) infinite}
/* ---- het "videobeeld": Mecha-Pof in beeld, met vizierhoeken en een scoop van het geluid */
.wk-screen{position:relative;flex:1;width:100%;max-width:520px;min-height:104px;border-radius:22px;overflow:hidden;
  background:radial-gradient(circle at 50% 38%,#1E3352 0%,var(--visor) 70%,#070C15 100%);
  box-shadow:0 14px 48px rgba(0,0,0,.55),0 0 28px rgba(127,232,255,.22),inset 0 0 0 2px var(--led);
  display:flex;flex-direction:column}
.wk-screen::before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;z-index:3;
  background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 4px),radial-gradient(90% 70% at 50% 50%,transparent 55%,rgba(0,0,0,.45) 100%)}
.wk-screen::after{content:"";position:absolute;inset:9px;pointer-events:none;z-index:3;
  background:linear-gradient(var(--led),var(--led)) 0 0/18px 2px,linear-gradient(var(--led),var(--led)) 0 0/2px 18px,linear-gradient(var(--led),var(--led)) 100% 0/18px 2px,linear-gradient(var(--led),var(--led)) 100% 0/2px 18px,
    linear-gradient(var(--led),var(--led)) 0 100%/18px 2px,linear-gradient(var(--led),var(--led)) 0 100%/2px 18px,linear-gradient(var(--led),var(--led)) 100% 100%/18px 2px,linear-gradient(var(--led),var(--led)) 100% 100%/2px 18px;
  background-repeat:no-repeat;opacity:.75}
.wk-screen.tx{box-shadow:0 14px 48px rgba(0,0,0,.55),0 0 34px rgba(255,90,78,.35),inset 0 0 0 2px var(--red)}
.wk-live{display:flex;align-items:center;gap:6px;background:rgba(7,12,21,.55);border-radius:999px;padding:4px 9px 4px 6px}
.wk-led{width:9px;height:9px;border-radius:50%;background:#4A5058;box-shadow:0 0 0 2px rgba(255,255,255,.06);flex:none}
.wk-led.on{background:var(--ok);box-shadow:0 0 10px var(--ok)}
.wk-led.tx{background:var(--red);box-shadow:0 0 12px var(--red);animation:wk-blink .9s steps(1) infinite}
.wk-led.wait{background:var(--gold);box-shadow:0 0 10px var(--gold);animation:wk-blink 1.1s steps(1) infinite}
.wk-time{font-variant-numeric:tabular-nums;color:var(--ink);opacity:.9}
.wk-sig{display:flex;align-items:flex-end;gap:2px;height:14px}
.wk-sig i{display:block;width:4px;border-radius:1px;background:rgba(127,232,255,.25)}
.wk-sig i:nth-child(1){height:5px}.wk-sig i:nth-child(2){height:8px}.wk-sig i:nth-child(3){height:11px}.wk-sig i:nth-child(4){height:14px}
.wk-sig.ok i{background:var(--led);box-shadow:0 0 6px rgba(127,232,255,.6)}
.wk-sig.wait i{animation:wk-sig 1.2s ease-in-out infinite}
.wk-sig.wait i:nth-child(2){animation-delay:.15s}.wk-sig.wait i:nth-child(3){animation-delay:.3s}.wk-sig.wait i:nth-child(4){animation-delay:.45s}
.wk-scope{position:relative;z-index:2;display:block;width:100%;height:30px;flex:none;opacity:.9}
.wk-tag{position:absolute;z-index:4;left:16px;top:14px;font:700 .62rem var(--hud);letter-spacing:.14em;color:var(--led);opacity:.8}
/* ---- berichtvak: wat Mecha-Pof het laatst zei, om mee te lezen en te herhalen */
.wk-msg{width:100%;max-width:520px;border:2px solid var(--led);border-radius:14px;background:rgba(7,12,21,.82);box-shadow:0 0 16px rgba(127,232,255,.18);display:flex;flex-direction:column;overflow:hidden}
.wk-msghead{display:flex;align-items:center;gap:8px;padding:5px 6px 5px 12px;background:rgba(127,232,255,.12);border-bottom:1px solid rgba(127,232,255,.35);font:700 .7rem var(--hud);letter-spacing:.14em;text-transform:uppercase;color:var(--led)}
.wk-msghead span{flex:1}
.wk-rep{font:700 .8rem var(--hud);letter-spacing:.08em;text-transform:uppercase;min-height:40px;padding:6px 14px;border-radius:10px;border:2px solid var(--gold);background:rgba(242,190,98,.16);color:var(--gold);-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.wk-rep:active{transform:translateY(2px);background:rgba(242,190,98,.3)}
.wk-rep:disabled{opacity:.35}
.wk-msgtxt{padding:8px 12px 9px;font:800 1.02rem/1.34 var(--body);color:var(--ink);max-height:6.9em;min-height:2.7em;overflow-y:auto;touch-action:pan-y;-webkit-overflow-scrolling:touch}
.wk-msgtxt:empty::before{content:"… wacht op signaal";color:var(--muted);font:700 .85rem var(--hud);letter-spacing:.1em}
.wk-msg.flash{animation:wk-flash .9s}
.wk-you{padding:5px 12px 7px;border-top:1px dashed rgba(147,160,184,.4);font:700 .8rem/1.25 var(--body);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wk-you:empty{display:none}
/* jouw "camerabeeld" rechtsboven: je stem als balkjes */
.wk-pip{position:absolute;z-index:4;top:12px;right:12px;width:62px;height:78px;border-radius:16px;background:rgba(7,12,21,.72);border:2px solid rgba(127,232,255,.35);
  box-shadow:0 6px 18px rgba(0,0,0,.5);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;padding:8px 6px;backdrop-filter:blur(6px);transition:border-color .2s,box-shadow .2s}
.wk-pip.tx{border-color:var(--red);box-shadow:0 6px 18px rgba(0,0,0,.5),0 0 16px rgba(255,90,78,.45)}
.wk-pip.live{border-color:var(--ok)}
.wk-bars{display:flex;align-items:flex-end;gap:4px;height:30px;color:var(--led)}
.wk-pip.tx .wk-bars{color:var(--red)}.wk-pip.live .wk-bars{color:var(--ok)}
.wk-bars i{display:block;width:6px;height:100%;border-radius:3px;background:currentColor;transform:scaleY(.12);transform-origin:bottom;box-shadow:0 0 6px currentColor;will-change:transform}
.wk-pip-lbl{font:700 .62rem var(--hud);letter-spacing:.14em;color:var(--muted)}
.wk-pip.tx .wk-pip-lbl{color:var(--red)}.wk-pip.live .wk-pip-lbl{color:var(--ok)}
.wk-stage{position:relative;z-index:1;flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:6px 0}
#walkie .mslot{display:flex;align-items:center;justify-content:center}
#walkie .mslot .pkmon.lg{width:min(52vw,230px,22vh)}
/* ondertitels onderaan het beeld */
.wk-foot{position:relative;z-index:4;display:flex;flex-direction:column;align-items:center;gap:4px;padding:0 76px 4px;text-align:center}
.wk-state{font:800 .9rem var(--body);min-height:1.3em;color:var(--ink);text-shadow:0 2px 6px rgba(0,0,0,.7)}
.wk-tool{font:800 .85rem var(--body);color:#FFE98A;min-height:0}
.wk-tool:empty{display:none}
.wk-diag{position:relative;z-index:4;padding:0 10px 3px;font:600 .55rem var(--hud);opacity:.35;text-align:center;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wk-err{color:#FFB4A8;text-align:center;max-width:420px;font-weight:700}
.wk-retry{margin-top:4px;background:var(--gold);color:#3A1C06;border:0;border-radius:999px;padding:12px 20px;font:800 1rem var(--body)}
/* ---- regels + bedieningsbalk (zoals FaceTime: ronde knoppen, rood ophangen) */
.wk-rules{font:700 .86rem var(--body);color:#BFEFFF;text-align:center;opacity:.9;min-height:1.2em}
.wk-rules b{color:var(--led)}
.wk-rules.zeg{width:100%;max-width:520px;opacity:1;border:2px solid var(--gold);border-radius:12px;background:rgba(242,190,98,.12);padding:6px 10px;font:700 .72rem var(--hud);letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}
.wk-rules.zeg b{display:block;font:400 1.3rem/1.15 var(--display);letter-spacing:.01em;text-transform:none;color:#fff;margin-top:1px}
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
.wk-ptt{width:112px;height:112px;border-radius:50%;border:0;color:#fff;font:400 1.15rem/1.1 var(--display);letter-spacing:.01em;
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
#wk-ring .rg-eye{position:absolute;z-index:1;top:14px;left:50%;transform:translateX(-50%);white-space:nowrap;font:700 .95rem var(--hud);letter-spacing:.14em;text-transform:uppercase;color:var(--led);animation:wk-blink 1.1s steps(1) infinite;background:rgba(7,12,21,.55);border-radius:999px;padding:5px 12px}
#wk-ring .mslot{position:relative;z-index:1;animation:wk-ring 1.7s ease-in-out infinite}
#wk-ring .mslot .pkmon.lg{width:min(80vw,320px,42vh)}
#wk-ring h2{position:relative;z-index:1;margin:0;font:400 clamp(2rem,10vw,2.7rem)/1.05 var(--display);color:var(--gold);text-shadow:0 3px 0 #9A5419,0 0 24px rgba(242,190,98,.25);text-align:center}
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
@keyframes wk-flash{0%,40%{box-shadow:0 0 0 4px var(--gold),0 0 30px rgba(242,190,98,.6)}100%{box-shadow:0 0 16px rgba(127,232,255,.18)}}
@media (max-height:700px){.wk-msgtxt{max-height:5.4em;font-size:.95rem}.wk-ptt{width:96px;height:96px}.wk-rnd .ic{width:54px;height:54px}.wk-title{font-size:1.5rem}}
@media (max-height:600px){.wk-subt,.wk-turn small,.wk-tag,.wk-diag,.wk-state{display:none}.wk-msgtxt{max-height:4.1em}.wk-turn{padding:5px 10px}.wk-ptt{width:84px;height:84px;font-size:1rem}#walkie .mslot .pkmon.lg{width:min(40vw,18vh)}}
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

export function openWalkie({ mon, context = () => ({}), onClose, greeting: firstGreeting = null, tools = null, incoming = false, zeg = '', title = '', sub = '' } = {}) {
  const escH = t => String(t ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  injectCss();
  document.querySelector('#walkie[role=dialog]')?.remove(); document.getElementById('wk-ring')?.remove(); // (niet de knop #walkie van test/monster.html)
  const el = document.createElement('div'); el.id = 'walkie';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Walkietalkie met Mecha-Pof');
  el.innerHTML = `
    <div class="wk-top">
      <div class="wk-topline"><span class="wk-live"><i class="wk-led wait" aria-hidden="true"></i><span class="wk-livetxt">Verbinden</span></span><span class="wk-ch">Kanaal 07 · 446.09 MHz</span><span class="wk-time">00:00</span><span class="wk-sig wait" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>
      <h1 class="wk-title">${escH(title || (incoming ? '📞 Oproep van Mecha-Pof' : '📻 Radio Mecha-Pof'))}</h1>
      <div class="wk-subt">${escH(sub)}</div>
    </div>
    <div class="wk-turn wait" aria-live="polite"><b><span>···</span></b><div class="wk-turntxt">Verbinden…</div></div>
    <div class="wk-screen">
      <span class="wk-tag" aria-hidden="true">CAM-01 · MECHA-POF</span>
      <div class="wk-pip" aria-label="Jouw microfoon"><span class="wk-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="wk-pip-lbl">Jij</span></div>
      <div class="wk-stage"><div class="mslot" data-size="lg"></div></div>
      <div class="wk-foot"><div class="wk-state">Verbinden…</div><div class="wk-tool" aria-live="polite"></div></div>
      <canvas class="wk-scope" aria-hidden="true"></canvas>
      <div class="wk-diag" aria-hidden="true"></div>
    </div>
    <div class="wk-msg">
      <div class="wk-msghead"><span class="wk-msgno">Bericht van Mecha-Pof</span><button class="wk-rep" data-a="repeat" disabled aria-label="Laat Mecha-Pof zijn bericht herhalen">↻ Herhaal</button></div>
      <div class="wk-msgtxt" aria-live="polite"></div>
      <div class="wk-you"></div>
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
  const stateEl = $('.wk-state'), ptt = $('.wk-ptt'), toolEl = $('.wk-tool'), modeBtn = $('.wk-mode');
  const turnEl = $('.wk-turn'), turnTxt = $('.wk-turntxt'), msgBox = $('.wk-msg'), msgTxt = $('.wk-msgtxt'), msgNo = $('.wk-msgno'), youEl = $('.wk-you'), rep = $('.wk-rep'), scope = $('.wk-scope');
  // Berichtvak: het laatste bericht van Mecha-Pof blijft als tekst staan (meelezen als er doorheen gepraat wordt).
  let msgN = 0, lastMsg = '', failed = false, repeating = false, msgAt = 0, msgDur = 0, msgHeld = false;
  const clean = t => String(t || '').replace(/\[[^\]]{1,30}\]\s*/g, '').replace(/\bEevie\b/g, 'Evy').replace(/\bMekka-Pof\b/g, 'Mecha-Pof').trim(); // stemregie zoals [playful] niet tonen; namen weer in gewone spelling
  function showMsg(text, { fresh = true } = {}) {
    const t = clean(text); if (!t) return;
    if (fresh) msgN++;
    lastMsg = t; msgTxt.textContent = t; msgTxt.scrollTop = 0;
    msgAt = 0; msgDur = Math.max(4000, t.split(/\s+/).length / 2.6 * 1000); msgHeld = false; // de tekst schuift mee terwijl hij praat
    msgNo.textContent = 'Bericht #' + String(Math.max(1, msgN)).padStart(2, '0') + ' · Mecha-Pof';
  }
  // Beurtbalk: één blik = weten wie er praat. Volgt de echte stand (frame()), niet losse teksten.
  const TURN = {
    wait:  ['···', 'Verbinden met Mecha-Pof…', ''],
    rx:    ['RX', 'Mecha-Pof praat', 'Stil zijn en luisteren'],
    go:    ['TX', 'Jullie beurt: praat maar', 'Eindig met “over”'],
    hold:  ['TX', 'Jullie beurt', 'Houd de knop vast en praat'],
    mute:  ['MIC', 'Microfoon staat uit', 'Tik op de groene knop'],
    tx:    ['TX', 'Jullie zenden…', 'Laat los als je klaar bent'],
    think: ['···', 'Mecha-Pof denkt na…', ''],
    end:   ['END', 'Over en sluiten', ''],
    off:   ['---', 'Geen verbinding', ''],
  };
  let turnKind = '';
  function setTurn(k) {
    if (k === turnKind) return; turnKind = k;
    const [code, big, small] = TURN[k] || TURN.wait;
    turnEl.className = 'wk-turn ' + ({ hold: 'go', mute: 'wait', end: 'think', off: '' }[k] ?? k);
    turnEl.firstElementChild.firstElementChild.textContent = code;
    turnTxt.innerHTML = big + (small ? `<small>${small}</small>` : '');
  }
  const sctx = scope.getContext?.('2d'); let scopeW = 0;
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
    $('.wk-rules').classList.toggle('zeg', !!zeg);
    $('.wk-rules').innerHTML = zeg ? `Zeg nu samen: <b>“${String(zeg).replace(/[<>&]/g, '')}”</b>` // oproep met een vast antwoord (briefing bij aankomst)
      : o ? 'Gewoon praten · eindig met <b>“over”</b> · klaar? <b>“over en sluiten”</b>' : 'Eindig met <b>“over”</b> · klaar? Zeg <b>“over en sluiten”</b>';
    if (conv && !ending && hush) { try { conv.setMicMuted(true); } catch {} ptt.disabled = true; rep.disabled = true; setState(repeating ? '↻ Mecha-Pof herhaalt zijn bericht…' : '🤫 Luister eerst naar Mecha-Pof…'); return; }
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
    setTurn(failed ? 'off' : !conv ? 'wait' : ending ? 'end' : pressing ? 'tx' : (hush || mode === 'speaking') ? 'rx' : thinkingSince ? 'think' : open() ? (micOn ? 'go' : 'mute') : 'hold');
    if (sctx) { // scoop: de golf volgt wie er praat (cyaan = Mecha-Pof, groen/rood = jullie)
      const w = scope.clientWidth, h = scope.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
      if (w && w !== scopeW) { scopeW = w; scope.width = w * dpr; scope.height = h * dpr; }
      if (w) {
        const amp = Math.max(mouth, tx ? ear : 0), col = mouth >= (tx ? ear : 0) ? '#7FE8FF' : pressing ? '#FF5A4E' : '#4ADE80';
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0); sctx.clearRect(0, 0, w, h);
        sctx.strokeStyle = 'rgba(127,232,255,.18)'; sctx.lineWidth = 1; sctx.beginPath(); sctx.moveTo(0, h / 2); sctx.lineTo(w, h / 2); sctx.stroke();
        sctx.strokeStyle = col; sctx.lineWidth = 2; sctx.shadowColor = col; sctx.shadowBlur = 6; sctx.beginPath();
        for (let x = 0; x <= w; x += 4) { const k = x / w, env = Math.sin(Math.PI * k); const y = h / 2 + Math.sin(k * 26 + t / 70) * Math.sin(k * 7 - t / 190) * env * (1.5 + amp * (h / 2 - 3)); x ? sctx.lineTo(x, y) : sctx.moveTo(x, y); }
        sctx.stroke(); sctx.shadowBlur = 0;
      }
    }
    if (mode === 'speaking' && lastMsg && !msgHeld) { // meelezen: het bericht schuift mee op spreektempo (aanraken = zelf scrollen)
      if (!msgAt) msgAt = t;
      const max = msgTxt.scrollHeight - msgTxt.clientHeight; if (max > 0) msgTxt.scrollTop = max * Math.max(0, Math.min(1, (t - msgAt - 2500) / Math.max(1, msgDur - 5000)));
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
  el.addEventListener('click', e => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'close') close(); if (a === 'retry') connect(); if (a === 'mode') toggleMode(); if (a === 'repeat') repeat(); });
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
    $('.wk-err')?.remove(); $('.wk-retry')?.remove(); ptt.hidden = false; failed = false;
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
      let firstShown = false; const eerste = begroeting;
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
            if (/^Herhaal je vorige bericht/.test(message)) return; // ons eigen herhaalverzoek, geen kind
            youEl.textContent = 'Jullie: “' + message + '”';
            if (saysSluiten(message) && !ending) { // netjes afgesloten: monster zegt gedag, dan hangen we op
              ending = true; endSpoke = false; ptt.disabled = true; setState('👋 Over en sluiten…');
              if (open()) { micOn = false; try { conv?.setMicMuted(true); } catch {} applyMode(); }
              clearTimeout(endTimer); endTimer = setTimeout(() => close({ force: true }), 9000); // vangnet als er geen gedag komt
            }
          }
          if ((source === 'ai' || source === 'agent') && message) { showMsg(message, { fresh: firstShown }); firstShown = true; } // de openingszin stond er al (zie onder)
        },
        onError: (msg) => { console.warn('[walkie]', msg); conn = 'fout: ' + String(msg).slice(0, 60); },
        onDisconnect: () => { if (!live() || closed || ending || switching) return; fail('De verbinding is verbroken.'); },
      });
      if (closed) { try { await conv.endSession(); } catch {} return; }
      if (!firstShown) showMsg(eerste); // openingszin meteen in beeld: meelezen terwijl hij praat
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
    hush = false; repeating = false; clearTimeout(hushIdle); clearTimeout(hushStart); clearTimeout(hushMax);
    if (closed || !conv || ending) return;
    rep.disabled = !lastMsg;
    micOn = open(); ptt.disabled = false;
    audio.play('zend'); audio.buzz(25); // piepje: nu mogen jullie praten
    applyMode();
    setState(open() ? '🎧 Jullie beurt! Praat maar.' : 'Jullie beurt! Houd de knop vast om iets te zeggen');
  }
  msgTxt.addEventListener('pointerdown', () => { msgHeld = true; });
  // ↻ Herhaal: microfoon dicht (zodat niemand erdoorheen praat), Mecha-Pof zegt zijn laatste bericht nog een keer, daarna weer jullie beurt.
  function repeat() {
    if (!conv || ending || hush || !lastMsg) return;
    if (pressing) up();
    audio.play('zend'); audio.buzz(20); kickPlayback(conv);
    msgBox.classList.remove('flash'); void msgBox.offsetWidth; msgBox.classList.add('flash');
    hush = true; repeating = true; hushSpoke = false; micOn = false; msgAt = 0; msgHeld = false; msgTxt.scrollTop = 0;
    clearTimeout(tailTimer); clearTimeout(hushIdle); clearTimeout(hushStart); clearTimeout(hushMax);
    hushStart = setTimeout(unhush, 10_000); hushMax = setTimeout(unhush, 60_000);
    duck(false); applyMode();
    thinkingSince = performance.now();
    try { conv.sendUserMessage('Herhaal je vorige bericht nog één keer, woord voor woord en rustig. Zeg er niets anders bij. Over.'); }
    catch (e) { console.warn('[walkie] herhaal', e); unhush(); }
  }
  function fail(msg) {
    failed = true; repeating = false; rep.disabled = true;
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
    setState('📞 Tring tring… Mecha-Pof belt terug!'); youEl.textContent = 'Ophangen doe je met “over en sluiten”.';
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
      <span class="rg-eye">📡 Inkomende oproep · kanaal 07</span>
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
      const w = openWalkie({ mon, context, greeting: text, tools, incoming: true, zeg, sub, onClose });
      onAnswer?.(w);
    }
  });
  return { close() { finish(); onClose?.(); }, get open() { return !closed; }, get answered() { return answered; } };
}
