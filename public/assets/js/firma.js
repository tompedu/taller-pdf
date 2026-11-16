/* Taller PDF · Firma a mano: dibujada, escrita o a partir de una foto. */
'use strict';

const sigModal = $('#sigModal'); let sigTab = 'draw', padColor = '#14246b', padDirty = false, sigFont = 'Caveat', upCanvas = null;
const recentSigs = [];
const SIG_FONTS = ['Caveat', 'Dancing Script', 'Allura'];
function openSig() { sigModal.hidden = false; document.body.classList.add('noscroll'); setSigTab(sigTab); renderRecent(); renderFontOpts(); }
function closeSig() { sigModal.hidden = true; document.body.classList.remove('noscroll'); }
$('#sigClose').onclick = closeSig; $('#sigCancel').onclick = closeSig;
sigModal.addEventListener('pointerdown', e => { if (e.target === sigModal) closeSig(); });
function setSigTab(t) {
  sigTab = t; $$('[data-sig]').forEach(b => b.setAttribute('aria-selected', b.dataset.sig === t)); $$('[data-sigp]').forEach(p => p.hidden = p.dataset.sigp !== t);
  syncSigUse(); if (t === 'type') setTimeout(() => $('#sigName').focus(), 30);
}
$$('[data-sig]').forEach(b => b.onclick = () => setSigTab(b.dataset.sig));
function syncSigUse() { $('#sigUse').disabled = sigTab === 'draw' ? !padDirty : sigTab === 'type' ? !$('#sigName').value.trim() : !upCanvas; }
const pad = $('#pad'), pctx = pad.getContext('2d'); let pdraw = null;
const padPt = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
pad.addEventListener('pointerdown', e => {
  e.preventDefault(); pad.setPointerCapture(e.pointerId); pdraw = padPt(e); padDirty = true; $('#padPh').hidden = true; syncSigUse();
  pctx.fillStyle = padColor; pctx.beginPath(); pctx.arc(pdraw[0], pdraw[1], 3, 0, Math.PI * 2); pctx.fill();
});
pad.addEventListener('pointermove', e => {
  if (!pdraw) return; const p = padPt(e); const pr = e.pressure && e.pointerType === 'pen' ? e.pressure : 0.5;
  pctx.strokeStyle = padColor; pctx.lineWidth = 3.5 + pr * 5; pctx.lineCap = 'round'; pctx.lineJoin = 'round';
  pctx.beginPath(); pctx.moveTo(pdraw[0], pdraw[1]); pctx.lineTo(p[0], p[1]); pctx.stroke(); pdraw = p;
});
pad.addEventListener('pointerup', () => { pdraw = null; }); pad.addEventListener('pointercancel', () => { pdraw = null; });
$('#padClear').onclick = () => { pctx.clearRect(0, 0, pad.width, pad.height); padDirty = false; $('#padPh').hidden = false; syncSigUse(); };
$$('[data-pc]').forEach(b => b.onclick = () => { padColor = b.dataset.pc; $$('[data-pc]').forEach(x => x.setAttribute('aria-pressed', x === b)); renderFontOpts(); });
function renderFontOpts() {
  const name = $('#sigName').value.trim() || 'Tu nombre';
  $('#fontOpts').innerHTML = SIG_FONTS.map(f => '<button data-sf="' + f + '" aria-pressed="' + (sigFont === f) + '" style="font-family:\'' + f + '\',cursive;color:' + padColor + '">' + esc(name) + '</button>').join('');
}
$('#sigName').addEventListener('input', () => { renderFontOpts(); syncSigUse(); });
$('#fontOpts').addEventListener('click', e => { const b = e.target.closest('[data-sf]'); if (b) { sigFont = b.dataset.sf; renderFontOpts(); } });
$('#sigFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const bmp = await decodeImage(f); const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d'); g.drawImage(bmp.src, 0, 0, c.width, c.height); bmp.close();
    const d = g.getImageData(0, 0, c.width, c.height); const a = d.data;
    for (let i = 0; i < a.length; i += 4) { const l = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]; if (l > 225) a[i + 3] = 0; else if (l > 180) a[i + 3] = Math.round(a[i + 3] * (225 - l) / 45); }
    g.putImageData(d, 0, 0); upCanvas = trimCanvas(c) || c;
    $('#upImg').src = upCanvas.toDataURL('image/png'); $('#upImg').hidden = false; $('#upMsg').textContent = 'Lista. Puedes elegir otra imagen si quieres.';
    syncSigUse();
  } catch { toast('No se ha podido leer esa imagen. Usa PNG o JPG.', { err: true }); }
});
function trimCanvas(c) {
  const g = c.getContext('2d'); const { width: w, height: h } = c; const d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null; const m = 8; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1; o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height); return o;
}
async function typedSig() {
  const name = $('#sigName').value.trim(); try { await document.fonts.load('120px "' + sigFont + '"'); } catch { }
  const c = document.createElement('canvas'); c.width = 1600; c.height = 360; const g = c.getContext('2d');
  g.font = '150px "' + sigFont + '", cursive'; g.fillStyle = padColor; g.textBaseline = 'middle'; g.fillText(name, 30, 180, 1540);
  return trimCanvas(c);
}
$('#sigUse').onclick = async () => {
  let c = null;
  if (sigTab === 'draw') c = padDirty && trimCanvas(pad); else if (sigTab === 'type') c = await typedSig(); else c = upCanvas;
  if (!c) { toast('Primero crea la firma: dibújala, escríbela o sube una imagen.'); return; }
  const src = c.toDataURL('image/png'); const ratio = c.width / c.height;
  if (!recentSigs.some(r => r.src === src)) recentSigs.unshift({ src, ratio }); recentSigs.length = Math.min(recentSigs.length, 4);
  closeSig(); placeImage(src, ratio, 0.28, 'Firma colocada. Arrástrala a la línea de firma.', true);
};
function renderRecent() {
  $('#recentWrap').hidden = !recentSigs.length;
  $('#recent').innerHTML = recentSigs.map((r, i) => '<button data-rs="' + i + '" aria-label="Usar esta firma"><img src="' + r.src + '" alt=""></button>').join('');
}
$('#recent').addEventListener('click', e => { const b = e.target.closest('[data-rs]'); if (!b) return; const r = recentSigs[+b.dataset.rs]; closeSig(); placeImage(r.src, r.ratio, 0.28, 'Firma colocada. Arrástrala a la línea de firma.', true); });
