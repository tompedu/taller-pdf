/* Taller PDF · Aplicación instalable (PWA): aviso de instalación, accesos directos y archivos compartidos. */
'use strict';

const PWA = !!window.TALLER_PWA;
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
let instEvt = null;
function syncInstall() {
  const off = +(lsGet('tp-inst-off') || 0), recent = Date.now() - off < 30 * 864e5;
  $('#instCard').hidden = !(PWA && !isStandalone() && !recent && (instEvt || IS_MOBILE_OS));
}
const K = (ico, txt) => '<span class="k">' + ico + txt + '</span>';
const I_SHARE = '<svg class="i" viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
const I_ADD = '<svg class="i" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
const I_DOTS = '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/></svg>';
function openInstallHelp() {
  const ipad = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let steps, note;
  if (IS_IOS) {
    steps = ['Pulsa el botón ' + K(I_SHARE, 'Compartir') + (ipad ? ' arriba a la derecha de Safari.' : ' de Safari, en la barra de abajo (o dentro del menú «···»).'),
      'Desliza hacia abajo y elige ' + K(I_ADD, 'Añadir a pantalla de inicio') + '.',
      'Si aparece «Abrir como app web», déjalo activado y pulsa <b>Añadir</b>.'];
    note = 'Después, abre Taller PDF desde su icono en la pantalla de inicio. Si usas Chrome en el ' + (ipad ? 'iPad' : 'iPhone') + ', el botón Compartir está en la barra de direcciones.';
  } else {
    steps = ['Abre el menú ' + K(I_DOTS, '') + ' del navegador (arriba a la derecha).',
      'Elige <b>Instalar aplicación</b> o <b>Añadir a pantalla de inicio</b>.',
      'Confirma con <b>Instalar</b>.'];
    note = 'Después, abre Taller PDF desde su icono. También podrás enviarle PDF desde otras apps con «Compartir».';
  }
  $('#instSteps').innerHTML = steps.map(t => '<li><span>' + t + '</span></li>').join('');
  $('#instNote').textContent = note;
  $('#instModal').hidden = false; document.body.classList.add('noscroll');
}
const closeInstallHelp = () => { $('#instModal').hidden = true; document.body.classList.remove('noscroll'); };
$('#instClose').onclick = closeInstallHelp; $('#instOk').onclick = closeInstallHelp;
$('#instModal').addEventListener('pointerdown', e => { if (e.target === $('#instModal')) closeInstallHelp(); });
$('#instBtn').onclick = async () => {
  if (instEvt) { const ev = instEvt; instEvt = null; ev.prompt(); try { await ev.userChoice; } catch {} syncInstall(); return; }
  openInstallHelp();
};
$('#instX').onclick = () => { lsSet('tp-inst-off', String(Date.now())); syncInstall(); };
// accesos directos del icono de la app (Android: mantener pulsado el icono)
const SHORTCUTS = {
  escanear: { task: 'scan' },
  firmar: { task: 'sign', title: 'Firmar un PDF', text: 'Elige el PDF que quieres firmar. Después podrás dibujar tu firma, escribirla o usar una foto.', go: 'Elegir el PDF' },
  unir: { task: 'merge', title: 'Unir varios PDF', text: 'Elige los PDF que quieres juntar en uno. Puedes seleccionar varios a la vez y ordenarlos después.', go: 'Elegir los PDF' },
  editar: { task: 'edit', title: 'Editar un PDF', text: 'Elige el PDF que quieres modificar: podrás cambiar el texto, escribir encima o añadir imágenes.', go: 'Elegir el PDF' },
};
const taskModal = $('#taskModal'); let taskPending = null;
const closeTaskModal = () => { taskModal.hidden = true; document.body.classList.remove('noscroll'); taskPending = null; };
function startShortcut(acc) {
  const sc = SHORTCUTS[acc]; if (!sc) return;
  if (sc.task === 'scan') { openScanner(); return; }
  const card = $('#tools [data-task="' + sc.task + '"]'); if (!card) return;
  if (state.pages.length) { card.click(); return; }
  // el selector de archivos solo se puede abrir tras un toque, así que lo pedimos con un botón
  taskPending = card; $('#taskTitle').textContent = sc.title; $('#taskText').textContent = sc.text; $('#taskGo').textContent = sc.go;
  taskModal.hidden = false; document.body.classList.add('noscroll'); $('#taskGo').focus();
}
$('#taskGo').onclick = () => { const c = taskPending; closeTaskModal(); if (c) c.click(); };
$('#taskClose').onclick = closeTaskModal; $('#taskCancel').onclick = closeTaskModal;
taskModal.addEventListener('pointerdown', e => { if (e.target === taskModal) closeTaskModal(); });
if (PWA) {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); instEvt = e; syncInstall(); });
  addEventListener('appinstalled', () => { instEvt = null; syncInstall(); toast('Taller PDF se ha instalado. Ya puedes abrirlo desde su icono.'); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
  syncInstall();
  // abrir desde un acceso directo o al compartir un archivo con la app (Android)
  const qs = new URLSearchParams(location.search);
  if (qs.has('accion') || qs.has('compartido')) history.replaceState(null, '', location.pathname);
  const acc = qs.get('accion');
  if (acc) setTimeout(() => startShortcut(acc), 300);
  if (qs.has('compartido') && window.caches) setTimeout(async () => {
    try {
      const c = await caches.open('taller-compartido'), keys = await c.keys(), files = [];
      for (const k of keys) { const r = await c.match(k); const b = await r.blob(); files.push(new File([b], decodeURIComponent(r.headers.get('X-Nombre') || 'documento.pdf'), { type: b.type })); await c.delete(k); }
      if (files.length) handleFiles(files); else toast('No ha llegado ningún archivo. Prueba a compartirlo otra vez.', { err: true });
    } catch (e) { console.error(e); toast('No se ha podido abrir el archivo compartido.', { err: true }); }
  }, 300);
  // abrir PDF con la app instalada (ordenador)
  if ('launchQueue' in window) launchQueue.setConsumer(async p => { if (p.files && p.files.length) handleFiles(await Promise.all(p.files.map(h => h.getFile()))); });
}
