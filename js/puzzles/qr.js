// qr.js — scan het QR-kaartje van Mecha-Pof met de camera (BarcodeDetector, anders jsQR), of typ de code die eronder staat.
// De goede code staat in stop_secret.geheim.qr (tekst of lijst) en is dus niet zichtbaar voor de telefoons.
// De server (puzzle_move) controleert elke zet { t:'scan', v } en zet er ok:true|false bij; bij een goede scan haalt hij v weg.
// Staat er geen geheim, dan zet de server ok:null en valt de puzzel terug op config.answer (als die er is).
// Werkt op 1 telefoon; met meer telefoons mag iedereen scannen. Config: { type:'qr', question?, image?, note? (regel onder het typvak; '' = weg), answer? (reserve), hint? }

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Zelfde normalisatie als de server: kleine letters, alleen a-z en 0-9. */
export const normCode = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
/** Uit een gescande tekst de code halen (een URL met ?code= of #code= mag ook). */
export const extractCode = raw => { const s = String(raw ?? '').trim(); const m = s.match(/[?#&]code=([^&#\s]+)/i); return (m ? decodeURIComponent(m[1]) : s).slice(0, 80); };
const JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm';
const WRONG = [
  'Bzzzt! Die code past niet in mijn sleuf. Zoek het goede kaartje!',
  'Krrr… mijn processor zegt: verkeerde code. Nog een keer!',
  'Bliep-bloep, foutmelding 404: onderdeel niet gevonden. Probeer opnieuw!',
];

export default {
  type: 'qr',

  init(config) {
    const answers = String(config.answer ?? '').split('|').map(normCode).filter(Boolean);
    return { answers, tries: [], solved: false, checking: false };
  },

  reduce(data, move) {
    if (move.t !== 'scan' || data.solved) return data;
    const v = String(move.v ?? '').slice(0, 80), how = move.typed ? 'getypt' : 'gescand';
    if (!('ok' in move) && !move.at) return { ...data, checking: true }; // nog niet terug van de server (alleen op deze telefoon)
    let ok = 'ok' in move ? move.ok : null; // server zonder QR-controle (migratie nog niet uitgerold): zelfde als geen geheim
    if (ok === null) { if (!data.answers.length) return { ...data, checking: false, tries: [...data.tries, { v, how, unknown: true }] }; ok = data.answers.includes(normCode(v)); }
    return ok ? { ...data, solved: true, checking: false, by: move.by }
      : { ...data, checking: false, tries: [...data.tries, { v, how }] };
  },

  isSolved(data) { return data.solved; },

  render(el, data, api) {
    style();
    const c = api.config || {};
    if (!el._qr) {
      el._qr = { stop: null };
      el.innerHTML = `${c.image ? `<img class="pimg" src="${esc(c.image)}" alt="Zoek deze plek">` : ''}
        <p class="question">${esc(c.question || 'Ergens hier hangt een kaartje met een QR-code van Mecha-Pof. Vind het en scan het, dan klikt het onderdeel vast!')}</p>
        <div class="qr-act">
          <button class="berry wide big-btn" data-a="scan">📷 Scan de code</button>
          <div class="qr-cam" hidden><video playsinline muted autoplay></video><i class="qr-frame"></i><p class="qr-cam-msg">Richt op de QR-code…</p><button class="plain" data-a="stop">✕ Stop camera</button></div>
          <form class="qr-type row" autocomplete="off" novalidate>
            <input class="big grow" type="text" placeholder="of typ de code" aria-label="Code onder de QR" autocapitalize="characters" autocorrect="off" spellcheck="false">
            <button class="ok" type="submit">Check</button>
          </form>
          ${c.note === '' ? '' : `<p class="note qr-note">${esc(c.note || 'Lukt scannen niet? Onder de QR staat de code in letters. Typ die hierboven.')}</p>`}
        </div>
        <p class="feedback" aria-live="polite"></p><ul class="tries"></ul>`;
      el.querySelector('[data-a=scan]').onclick = () => startCam(el, v => api.move({ t: 'scan', v }));
      el.querySelector('[data-a=stop]').onclick = () => stopCam(el);
      el.querySelector('form').addEventListener('submit', e => {
        e.preventDefault(); const inp = el.querySelector('form input'), v = extractCode(inp.value);
        if (!normCode(v)) return; inp.value = ''; api.move({ t: 'scan', v, typed: true });
      });
    }
    const fb = el.querySelector('.feedback'), wrong = data.tries.filter(t => !t.unknown), last = data.tries[data.tries.length - 1];
    el.querySelector('.qr-act').hidden = data.solved;
    if (data.solved) stopCam(el);
    fb.classList.toggle('ok', data.solved);
    fb.textContent = data.solved ? '✓ Code geaccepteerd! Klik-klak, onderdeel vergrendeld. Bliep!'
      : data.checking ? '🔍 Mecha-Pof leest de code…'
      : last?.unknown ? 'Hmm, ik heb geen geheime code voor deze plek. Vraag de begeleider om hem goed te keuren.'
      : wrong.length ? WRONG[(wrong.length - 1) % WRONG.length] : '';
    el.querySelector('.tries').innerHTML = wrong.slice(-4).map(t => `<li title="${t.how}">${esc(t.v.length > 18 ? t.v.slice(0, 16) + '…' : t.v)}</li>`).join('');
  },

  destroy(el) { stopCam(el); delete el._qr; },
};

// ---------------------------------------------------------------- camera
async function startCam(el, onCode) {
  const box = el.querySelector('.qr-cam'), video = box.querySelector('video'), msg = box.querySelector('.qr-cam-msg'), st = el._qr;
  if (st.stream) return;
  box.hidden = false; el.querySelector('[data-a=scan]').hidden = true; msg.textContent = 'Camera wordt wakker…';
  try {
    st.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
  } catch (e) {
    msg.textContent = e?.name === 'NotAllowedError' ? 'De camera mag niet. Sta de camera toe (aA in de adresbalk → Camera), of typ de code.' : 'Geen camera gevonden. Typ de code hieronder.';
    st.stream = null; setTimeout(() => { if (!st.stream) { box.hidden = true; el.querySelector('[data-a=scan]').hidden = false; } }, 4000); return;
  }
  video.srcObject = st.stream; try { await video.play(); } catch {}
  msg.textContent = 'Richt op de QR-code…';
  const detect = await detector().catch(() => null);
  if (!detect) { msg.textContent = 'Deze telefoon kan geen QR lezen. Typ de code hieronder.'; return; }
  let busy = false;
  st.timer = setInterval(async () => {
    if (busy || !st.stream || video.readyState < 2) return; busy = true;
    try {
      const raw = await detect(video);
      if (raw) { navigator.vibrate?.(80); stopCam(el); onCode(extractCode(raw)); }
    } catch {} finally { busy = false; }
  }, 180);
}
function stopCam(el) {
  const st = el._qr; if (!st) return;
  clearInterval(st.timer); st.timer = null;
  st.stream?.getTracks().forEach(t => t.stop()); st.stream = null;
  const box = el.querySelector('.qr-cam'); if (box) { box.hidden = true; box.querySelector('video').srcObject = null; }
  const b = el.querySelector('[data-a=scan]'); if (b) b.hidden = false;
}
let detectorP = null;
function detector() {
  return detectorP ||= (async () => {
    if ('BarcodeDetector' in globalThis) {
      try {
        const fmts = await globalThis.BarcodeDetector.getSupportedFormats?.() ?? ['qr_code'];
        if (fmts.includes('qr_code')) { const bd = new globalThis.BarcodeDetector({ formats: ['qr_code'] }); return async v => (await bd.detect(v))[0]?.rawValue || null; }
      } catch {}
    }
    // iPhone (Safari) kent geen BarcodeDetector: jsQR van de CDN, op een verkleind beeld
    const { default: jsQR } = await import(JSQR);
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
    return async v => {
      const s = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight)); cv.width = Math.round(v.videoWidth * s); cv.height = Math.round(v.videoHeight * s);
      cx.drawImage(v, 0, 0, cv.width, cv.height);
      const img = cx.getImageData(0, 0, cv.width, cv.height);
      return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data || null;
    };
  })().catch(e => { detectorP = null; throw e; });
}

let styled = false;
function style() {
  if (styled || typeof document === 'undefined') return; styled = true;
  const s = document.createElement('style'); s.id = 'pz-qr';
  s.textContent = `
.qr-act{display:flex;flex-direction:column;gap:10px}
.qr-cam{position:relative;border-radius:16px;overflow:hidden;border:2px solid var(--led,#7FE8FF);background:#000;aspect-ratio:1;box-shadow:0 0 18px rgba(127,232,255,.3)}
.qr-cam video{width:100%;height:100%;object-fit:cover;display:block}
.qr-frame{position:absolute;inset:18%;border:3px solid var(--led,#7FE8FF);border-radius:18px;box-shadow:0 0 0 999px rgba(5,7,12,.45),0 0 18px var(--led,#7FE8FF);animation:qrpulse 1.4s ease-in-out infinite}
@keyframes qrpulse{50%{inset:16%}}
.qr-cam-msg{position:absolute;left:0;right:0;top:10px;text-align:center;font-weight:900;text-shadow:0 1px 4px #000;padding:0 12px}
.qr-cam button{position:absolute;right:10px;bottom:10px;min-height:44px}
.qr-type input{text-transform:uppercase;letter-spacing:.08em}
@media (prefers-reduced-motion:reduce){.qr-frame{animation:none}}`;
  document.head.appendChild(s);
}
