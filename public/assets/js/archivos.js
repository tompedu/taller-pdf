/* Taller PDF · Entrada de archivos: abrir PDF y fotos, contraseñas de apertura, arrastrar y soltar y menú «Añadir». */
'use strict';

async function addPdfSource(name, bytes, flags = {}) {
  let doc, password, wrong = false;
  for (;;) {
    try { doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, password, standardFontDataUrl: STD_FONTS }).promise; break; }
    catch (e) {
      if (e && e.name === 'PasswordException') {
        const wasBusy = !busyEl.hidden; unbusy();
        password = await askOpenPassword(name, wrong || password !== undefined); wrong = true;
        if (wasBusy) await busy('Abriendo el archivo…');
        if (password == null) throw new Error('No se ha abierto «' + name + '» porque hace falta su contraseña.');
        continue;
      }
      throw new Error('No se ha podido abrir «' + name + '». Puede que el archivo esté dañado o no sea un PDF.');
    }
  }
  const id = nid('s');
  let perms = null; try { perms = await doc.getPermissions(); } catch { }
  state.sources.set(id, { id, name, bytes, doc, lib: null, password, encrypted: password != null || perms != null, ...flags });
  const out = [];
  for (let i = 0; i < doc.numPages; i++) {
    const p = await doc.getPage(i + 1); const [x1, y1, x2, y2] = p.view;
    out.push({ key: nid('p'), srcId: id, idx: i, base: ((p.rotate || 0) % 360 + 360) % 360, rot: 0, w: x2 - x1, h: y2 - y1, items: [] });
  }
  return out;
}
async function getLib(sid) {
  const s = state.sources.get(sid);
  if (s.broken) throw new Error('dañado');
  if (!s.lib) {
    try { s.lib = s.encrypted ? await PDFDocument.load(s.bytes, { password: s.password || '', updateMetadata: false }) : await PDFDocument.load(s.bytes, { updateMetadata: false }); }
    catch (e) { s.broken = true; console.warn('No se puede leer la estructura de', s.name, e); throw e; }
  }
  return s.lib;
}
function askOpenPassword(name, wrong) {
  return new Promise(res => {
    const m = $('#openPwModal'), inp = $('#opwInput');
    $('#opwName').textContent = '«' + name + '» está protegido. Escribe su contraseña para abrirlo.';
    $('#opwErr').textContent = wrong ? 'La contraseña no es correcta. Revisa mayúsculas y minúsculas.' : '';
    inp.value = ''; m.hidden = false; setTimeout(() => inp.focus(), 30);
    const done = v => { m.hidden = true; $('#opwOk').onclick = $('#opwCancel').onclick = inp.onkeydown = null; res(v); };
    $('#opwOk').onclick = () => { if (inp.value) done(inp.value); else $('#opwErr').textContent = 'Escribe la contraseña.'; };
    $('#opwCancel').onclick = () => done(null);
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#opwOk').click(); } if (e.key === 'Escape') done(null); };
  });
}
// --- lectura de fotos compatible con iPhone/iPad (Safari): createImageBitmap con opciones falla en algunas versiones
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function freeCanvas(c) { if (c && c.getContext) { c.width = 0; c.height = 0; } }
async function decodeImage(file) {
  const wrap = (src, w, h, close) => ({ src, width: w, height: h, close: close || (() => {}) });
  if (!IS_IOS) { try { const b = await createImageBitmap(file, { imageOrientation: 'from-image' }); return wrap(b, b.width, b.height, () => b.close && b.close()); } catch {} }
  try {
    const url = URL.createObjectURL(file), img = new Image(); img.decoding = 'async';
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
    try { await img.decode(); } catch {}
    if (img.naturalWidth) return wrap(img, img.naturalWidth, img.naturalHeight, () => { URL.revokeObjectURL(url); img.src = ''; });
    URL.revokeObjectURL(url);
  } catch {}
  try { const b = await createImageBitmap(file); return wrap(b, b.width, b.height, () => b.close && b.close()); } catch {}
  throw new Error(/hei[cf]/i.test((file.type || '') + (file.name || '')) ? 'La foto está en formato HEIC. En el iPhone/iPad ve a Ajustes › Cámara › Formatos y elige «Más compatible», o comparte la foto como JPG.' : 'No se ha podido leer la imagen «' + (file.name || 'foto') + '». Usa JPG, PNG o WEBP.');
}
async function imageToPdf(file, mode) {
  const bmp = await decodeImage(file);
  const k = Math.min(1, (IS_IOS ? 2000 : 2400) / Math.max(bmp.width, bmp.height)); const cw = Math.round(bmp.width * k), ch = Math.round(bmp.height * k);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); g.drawImage(bmp.src, 0, 0, cw, ch); bmp.close();
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88)); freeCanvas(c);
  if (!blob) throw new Error('No hay memoria suficiente para procesar «' + file.name + '». Prueba con menos fotos a la vez.');
  const pdf = await PDFDocument.create(); const img = await pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
  if (mode === 'fit') { const s = 842 / Math.max(cw, ch); pdf.addPage([cw * s, ch * s]).drawImage(img, { x: 0, y: 0, width: cw * s, height: ch * s }); }
  else {
    const land = cw > ch, pw = land ? 841.89 : 595.28, ph = land ? 595.28 : 841.89, m = 28;
    const s = Math.min((pw - 2 * m) / cw, (ph - 2 * m) / ch);
    pdf.addPage([pw, ph]).drawImage(img, { x: (pw - cw * s) / 2, y: (ph - ch * s) / 2, width: cw * s, height: ch * s });
  }
  return new Uint8Array(await pdf.save());
}
async function blankPage(w = 595.28, h = 841.89) {
  const pdf = await PDFDocument.create(); pdf.addPage([w, h]);
  const [pg] = await addPdfSource('Página en blanco', new Uint8Array(await pdf.save()), { isBlank: true });
  return pg;
}
async function handleFiles(files, at) {
  files = [...files]; if (!files.length) return;
  const onlySample = state.pages.length > 0 && state.pages.every(p => state.sources.get(p.srcId).isSample);
  const mode = $('#imgMode').value; const added = []; let errors = 0;
  await busy(files.length > 1 ? 'Abriendo ' + files.length + ' archivos…' : 'Abriendo el archivo…');
  for (const f of files) {
    try {
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      const isImg = f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|hei[cf])$/i.test(f.name);
      if (isPdf) added.push(...await addPdfSource(f.name, new Uint8Array(await f.arrayBuffer())));
      else if (isImg) added.push(...await addPdfSource(f.name, await imageToPdf(f, mode)));
      else throw new Error('«' + f.name + '» no es un PDF ni una imagen, así que no se ha añadido.');
    } catch (e) { errors++; toast(e.message || String(e), { err: true }); }
  }
  unbusy(); if (!added.length) return;
  if (onlySample) { state.pages = []; state.sel.clear(); state.hist = []; state.redo = []; state.item = null; at = 0; }
  else pushHist();
  const pos = at == null ? state.pages.length : clamp(at, 0, state.pages.length);
  state.pages.splice(pos, 0, ...added);
  const names = [...new Set(state.pages.map(p => state.sources.get(p.srcId)).filter(s => !s.isSample && !s.isBlank).map(s => s.name))];
  if (onlySample || $('#docName').dataset.touched !== '1') $('#docName').value = names.length === 1 ? names[0].replace(/\.[^.]+$/, '') : 'documento-unido';
  syncUndo(); renderAll();
  toast((added.length === 1 ? '1 página añadida' : added.length + ' páginas añadidas') + (errors ? '. ' + errors + ' archivo(s) no se han podido abrir.' : '.'));
  const t = state.pendingTask; state.pendingTask = null;
  if (t) applyTask(t); else if (state.view !== 'work') applyTask('organize');
}
$('#docName').addEventListener('input', e => { e.target.dataset.touched = '1'; });
$$('.fileIn').forEach(i => i.addEventListener('change', e => { handleFiles(e.target.files); e.target.value = ''; }));

/* soltar archivos en cualquier sitio */
const dropov = $('#dropov'); let dragDepth = 0;
const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
addEventListener('dragenter', e => { if (hasFiles(e)) { dragDepth++; dropov.hidden = false; } });
addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; dropov.hidden = true; } });
addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('drop', e => { if (hasFiles(e)) { e.preventDefault(); dragDepth = 0; dropov.hidden = true; handleFiles(e.dataTransfer.files); } });

/* menú añadir */
const addMenu = $('#addMenu');
function openAddMenu(anchor, at) {
  state.insertAt = at; addMenu.hidden = false;
  const r = anchor.getBoundingClientRect(); const mw = addMenu.offsetWidth, mh = addMenu.offsetHeight;
  let left = clamp(r.left, 8, innerWidth - mw - 8), top = r.bottom + 6; if (top + mh > innerHeight - 8) top = r.top - mh - 6;
  addMenu.style.left = left + 'px'; addMenu.style.top = top + 'px';
}
document.addEventListener('pointerdown', e => { if (!addMenu.hidden && !addMenu.contains(e.target) && !e.target.closest('[aria-haspopup],.ins,.addcard')) addMenu.hidden = true; });
$('#bAddTop').onclick = e => openAddMenu(e.currentTarget, state.mode === 'edit' && state.current ? state.pages.findIndex(p => p.key === state.current) + 1 : null);
$('#menuFile').addEventListener('change', e => { addMenu.hidden = true; handleFiles(e.target.files, state.insertAt); e.target.value = ''; });
$('#miBlank').onclick = async () => {
  addMenu.hidden = true; const at = state.insertAt == null ? state.pages.length : state.insertAt;
  const ref = state.pages[at - 1] || state.pages[at]; const [w, h] = ref ? dispDims(ref) : [595.28, 841.89];
  const pg = await blankPage(w, h); pushHist(); state.pages.splice(at, 0, pg); renderAll(); toast('Página en blanco añadida en la posición ' + (at + 1) + '.');
  if (state.mode === 'edit') scrollToPage(pg.key);
};
