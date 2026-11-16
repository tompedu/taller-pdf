/* Taller PDF · Firma con certificado digital mediante AutoFirma. */
'use strict';

function certStampLines(it) {
  const k = it.w / 190, c = state.cert || {};
  const lines = [{ t: 'Firmado digitalmente por', size: 6.8 * k, bold: false }, { t: '(titular del certificado)', size: 8.6 * k, bold: true }, { t: 'Fecha: (al firmar)', size: 6.8 * k, bold: false }];
  if (c.reason) lines.push({ t: 'Motivo: ' + c.reason, size: 6.8 * k, bold: false });
  if (c.location) lines.push({ t: 'Lugar: ' + c.location, size: 6.8 * k, bold: false });
  return lines;
}
const certStampH = it => { const k = it.w / 190; return 12 * k + certStampLines(it).reduce((a, l) => a + l.size * 1.25, 0); };
function certStampHtml(it, interactive) {
  const lines = certStampLines(it);
  return '<div class="cst"' + (interactive ? ' data-id="' + it.id + '"' : '') + ' style="left:calc(var(--s) * ' + it.x + 'px);top:calc(var(--s) * ' + it.y + 'px);width:calc(var(--s) * ' + it.w + 'px);height:calc(var(--s) * ' + it.h + 'px);padding:calc(var(--s) * ' + (6 * it.w / 190) + 'px)">' +
    lines.map(l => '<div style="font-size:calc(var(--s) * ' + l.size + 'px);font-weight:' + (l.bold ? 700 : 400) + '">' + esc(l.t) + '</div>').join('') + '</div>';
}
// AutoFirma dibuja el sello visible: aquí solo se calcula su posición en la página
async function drawCertStamp(out, p, it, fr, rot, cache) {
  const { Dh, map } = fr; const a = map(it.x, Dh - it.y - it.h), b = map(it.x + it.w, Dh - it.y);
  cache.sigWidget = { pageIndex: cache.pageIndex, R: cache.R, k: it.w / 190, rect: [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)] };
}
const IS_MOBILE_OS = IS_IOS || /Android/i.test(navigator.userAgent);
const AFIRMA_OK = !!window.AutoScript && !(window.claude && typeof window.claude.use === 'function') && !IS_MOBILE_OS;
// en móviles AutoFirma no existe: no se inicializa (evita el aviso «Acceda desde un PC» al abrir la app)
if (window.AutoScript && !IS_MOBILE_OS) { try { AutoScript.setAppName && AutoScript.setAppName('Taller PDF'); AutoScript.cargarAppAfirma(); } catch (e) { console.error(e); } }
const certModal = $('#certModal');
function openCert() {
  if (!state.pages.length) { toast('Abre primero el PDF que quieres firmar.'); return; }
  const c = state.cert;
  $('#afReason').value = c ? c.reason : ''; $('#afLoc').value = c ? c.location : ''; $('#afVisible').checked = c ? c.visible : true;
  if (IS_MOBILE_OS) $('#afirmaOff').textContent = 'La firma con certificado necesita AutoFirma, que solo existe para ordenadores (Windows, Mac o Linux). Abre Taller PDF en un ordenador para firmar con tu certificado. Desde aquí puedes usar «Firmar» con tu firma a mano.';
  $('#afirmaOff').hidden = AFIRMA_OK; $('#certErr').textContent = ''; $('#certNext').disabled = !AFIRMA_OK; syncCertNext();
  certModal.hidden = false; document.body.classList.add('noscroll');
}
function closeCert() { certModal.hidden = true; document.body.classList.remove('noscroll'); }
function syncCertNext() { $('#certNext').textContent = $('#afVisible').checked ? 'Colocar el sello' : 'Firmar con AutoFirma'; }
$('#afVisible').addEventListener('change', syncCertNext);
$('#certClose').onclick = closeCert; $('#certCancel').onclick = closeCert;
certModal.addEventListener('pointerdown', e => { if (e.target === certModal) closeCert(); });
$('#certNext').onclick = () => {
  if (!AFIRMA_OK) return;
  if (pwState().on) { $('#certErr').textContent = 'La firma con certificado no se puede combinar con la contraseña. Desactiva «Proteger con contraseña» para firmar.'; return; }
  const had = state.cert;
  state.cert = { reason: $('#afReason').value.trim(), location: $('#afLoc').value.trim(), visible: $('#afVisible').checked };
  closeCert();
  const stamps = state.pages.filter(p => p.items.some(i => i.type === 'certstamp'));
  if (!state.cert.visible) {
    if (stamps.length) { pushHist(); stamps.forEach(p => p.items = p.items.filter(i => i.type !== 'certstamp')); }
    syncCertUI(); renderAll(); exportList(state.pages, baseName() + '-firmado.pdf'); return;
  }
  if (stamps.length) { stamps.forEach(p => p.items.forEach(i => { if (i.type === 'certstamp') i.h = certStampH(i); })); syncCertUI(); renderAll(); if (had) { toast('Datos de la firma actualizados.'); return; } }
  if (state.mode !== 'edit' || state.view !== 'work') setMode('edit');
  if (state.tool !== 'select') setTool('select');
  const key = state.current || state.pages[state.pages.length - 1].key; const pg = pageByKey(key); const [Dw, Dh] = dispDims(pg);
  if (!stamps.length) {
    const it = { type: 'certstamp', w: 190, x: 0, y: 0, h: 0 }; it.h = certStampH(it); it.x = Dw - it.w - 40; it.y = Dh - it.h - 60;
    addItem(key, it);
  }
  syncCertUI();
  requestAnimationFrame(() => { const el = $('.epage .cst[data-id]'); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(placeFtb, 450); } });
  toast('Arrastra el sello a su sitio y pulsa «Descargar firmado».');
};
function syncCertUI() {
  const c = state.cert; $('#sCert').hidden = !c;
  if (c) { $('#certMiniName').textContent = 'Con AutoFirma'; $('#certMiniInfo').textContent = 'Elegirás el certificado al descargar' + (c.visible ? ' · con sello visible' : ' · sin sello visible'); }
  syncPw();
}
$('#certRemove').onclick = () => {
  const had = state.pages.some(p => p.items.some(i => i.type === 'certstamp'));
  if (had) { pushHist(); state.pages.forEach(p => p.items = p.items.filter(i => i.type !== 'certstamp')); }
  state.cert = null; syncCertUI(); renderAll(); toast('Firma con certificado quitada.');
};
$('#certEdit').onclick = openCert;

/* ---- AutoFirma ---- */
let lastSig = null;
function propEsc(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[^\x20-\x7e]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
}
function u8ToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function b64ToU8(b64) { const s = atob(b64.replace(/[^A-Za-z0-9+/=]/g, '')); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function afirmaParams() {
  const c = state.cert, w = lastSig, P = ['signatureSubFilter=ETSI.CAdES.detached', 'headless=true', 'filter=nonexpired:'];
  if (c.reason) P.push('signReason=' + propEsc(c.reason));
  if (c.location) P.push('signatureProductionCity=' + propEsc(c.location));
  if (c.visible && w) {
    const r = w.rect.map(v => Math.round(v));
    P.push('signaturePage=' + (w.pageIndex + 1), 'signaturePositionOnPageLowerLeftX=' + r[0], 'signaturePositionOnPageLowerLeftY=' + r[1], 'signaturePositionOnPageUpperRightX=' + r[2], 'signaturePositionOnPageUpperRightY=' + r[3]);
    let txt = 'Firmado digitalmente por\n$$SUBJECTCN$$\nFecha: $$SIGNDATE=dd/MM/yyyy HH:mm:ss$$';
    if (c.reason) txt += '\nMotivo: ' + c.reason;
    if (c.location) txt += '\nLugar: ' + c.location;
    P.push('layer2Text=' + propEsc(txt), 'layer2FontFamily=1', 'layer2FontSize=' + Math.max(5, Math.round(7 * (w.k || 1))), 'layer2FontColor=black');
    if (w.R) P.push('signatureRotation=' + w.R);
  }
  return P.join('\n');
}
function afirmaSign(bytes) {
  return new Promise((resolve, reject) => {
    if (!AFIRMA_OK) { reject(new Error('AutoFirma no está disponible en esta vista.')); return; }
    $('#busyMsg').textContent = 'Esperando a AutoFirma… Elige tu certificado en su ventana.';
    try {
      AutoScript.sign(u8ToB64(bytes), 'SHA256withRSA', 'PAdES', afirmaParams(),
        sigB64 => resolve(b64ToU8(sigB64)),
        (type, msg) => {
          const t = String(type || ''), m = String(msg || '');
          let text;
          if (/Cancel/i.test(t)) text = 'Firma cancelada.';
          else if (/ApplicationNotFound|Connection|Timeout/i.test(t)) text = 'No se ha podido abrir AutoFirma. Comprueba que está instalada (firmaelectronica.gob.es) y que el navegador tiene permiso para abrirla.';
          else text = 'AutoFirma no ha podido firmar' + (m ? ': ' + m : '.');
          const e = new Error(text); e.quiet = /Cancel/i.test(t); reject(e);
        });
    } catch (e) { reject(new Error('No se ha podido iniciar AutoFirma: ' + (e.message || e))); }
  });
}
