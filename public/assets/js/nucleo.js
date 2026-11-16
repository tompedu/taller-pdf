/* Taller PDF · Utilidades comunes: selectores, avisos, descarga de archivos y funciones de apoyo. */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ================= utilidades ================= */
const toastsEl = $('#toasts');
function toast(msg, opt = {}) {
  const t = document.createElement('div'); t.className = 'toast' + (opt.err ? ' err' : '');
  const s = document.createElement('span'); s.textContent = msg; t.append(s);
  if (opt.action) { const b = document.createElement('button'); b.textContent = opt.action; b.onclick = () => { t.remove(); opt.onAction(); }; t.append(b); }
  toastsEl.append(t); setTimeout(() => t.remove(), opt.ms || (opt.err ? 8000 : opt.action ? 6000 : 3600));
}
if (!window.PDFLib || !window.pdfjsLib) { toast('No se han podido cargar las herramientas de PDF. Revisa la conexión y recarga la página.', { err: true }); throw new Error('Taller PDF: no se han cargado las librerías de PDF'); }
const { PDFDocument, StandardFonts, rgb, degrees, LineCapStyle, BlendMode } = PDFLib;
const pdfjs = window.pdfjsLib;
pdfjs.GlobalWorkerOptions.workerSrc = window.TALLER_WORKER || 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const STD_FONTS = window.TALLER_STD_FONTS || undefined;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const winAnsi = s => String(s).replace(/[^\x20-\x7E\xA0-\xFF€‘’“”–—•\n]/g, '?');
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const r2 = n => Math.round(n * 100) / 100;
let uid = 0; const nid = p => p + (++uid) + Math.random().toString(36).slice(2, 5);
const today = () => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); };
const MM = 25.4 / 72;
const isTyping = () => { const a = document.activeElement; return a && (/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) || a.isContentEditable); };

const busyEl = $('#busy');
const TIPS = ['Consejo: haz doble clic en una página para editarla.', 'Consejo: con Mayús + clic seleccionas varias páginas seguidas.', 'Consejo: «Censurar datos» elimina de verdad lo que tapas, no solo lo oculta.', 'Consejo: el botón + entre páginas inserta archivos justo en ese punto.', 'Consejo: Ctrl+Z deshace cualquier cambio.'];
async function busy(msg) { $('#busyMsg').textContent = msg; $('#busyTip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)]; busyEl.hidden = false; await new Promise(r => setTimeout(r, 30)); }
const unbusy = () => { busyEl.hidden = true; };

let dlP = null;
const mimeOf = n => ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', zip: 'application/zip' })[(n.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
let shareFileObj = null;
function shareReady(f) { shareFileObj = f; $('#shareName').textContent = f.name; $('#shareModal').hidden = false; }
function shareClose() { $('#shareModal').hidden = true; shareFileObj = null; }
$('#shareCancel').onclick = shareClose;
$('#shareOk').onclick = () => {
  const f = shareFileObj; if (!f) return; shareClose();
  navigator.share({ files: [f], title: f.name }).then(() => toast('Listo: ' + f.name)).catch(e => {
    if (e && e.name === 'AbortError') return;
    const url = URL.createObjectURL(f); const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
};
function getDownloads() {
  if (!dlP) dlP = (window.claude && typeof window.claude.use === 'function') ? Promise.resolve(window.claude.use('downloads')).catch(() => null) : Promise.resolve(undefined);
  return dlP;
}
getDownloads();
async function offerFile(filename, data) {
  const blob = data instanceof Blob ? data : new Blob([data]);
  const dl = await getDownloads();
  if (dl === undefined) {
    if (IS_IOS && isStandalone() && navigator.canShare) {
      const f = new File([blob], filename, { type: blob.type || mimeOf(filename) });
      if (navigator.canShare({ files: [f] })) { shareReady(f); return; }
    }
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast('Descargado: ' + filename); return;
  }
  if (!dl) { toast('Esta vista no permite descargar archivos. Abre la página directamente en claude.ai para guardarlos.', { err: true }); return; }
  try { await dl.save({ filename, data: blob }); toast('Guardado: ' + filename); }
  catch (e) {
    const c = e && e.code;
    if (c === 'declined') toast('Descarga cancelada.');
    else if (c === 'rate_limited') toast('Ya hay una descarga esperando tu confirmación.');
    else toast('No se ha podido guardar el archivo. Inténtalo de nuevo (' + (c || 'error') + ').', { err: true });
  }
}
