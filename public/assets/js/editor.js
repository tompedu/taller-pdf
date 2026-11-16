/* Taller PDF · Modo editar: herramientas, puntero, edición de texto, barra flotante, teclado e imágenes. */
'use strict';

const pagesEl = $('#pages'), stripEl = $('#strip');
const epEls = new Map(), stEls = new Map();
const pageQ = []; let pageBusy = 0;
const pageIO = new IntersectionObserver(ents => {
  for (const e of ents) { e.target._vis = e.isIntersecting; if (e.isIntersecting) { wantPage(e.target); if (state.tool === 'edittext') renderBlocks(e.target.dataset.key); } }
}, { rootMargin: '600px 0px' });
const curIO = new IntersectionObserver(ents => {
  for (const e of ents) e.target._ratio = e.intersectionRatio;
  let best = null, br = 0; for (const [k, el] of epEls) if ((el._ratio || 0) > br) { br = el._ratio; best = k; }
  if (best && best !== state.current) { state.current = best; markStrip(); }
}, { threshold: [0, .1, .25, .5, .75, 1] });
function wantPage(el) {
  const pg = pageByKey(el.dataset.key); if (!pg) return;
  const want = totalRot(pg) + ':' + state.zoom.toFixed(3); if (el._done === want || el._q) return;
  el._q = true; pageQ.push(el); pumpPages();
}
function pumpPages() {
  while (pageBusy < 2 && pageQ.length) { const el = pageQ.shift(); el._q = false; pageBusy++; renderPage(el).catch(() => { }).finally(() => { pageBusy--; pumpPages(); }); }
}
async function renderPage(el) {
  const pg = pageByKey(el.dataset.key); if (!pg || !el.isConnected) return;
  const R = totalRot(pg), z = state.zoom, want = R + ':' + z.toFixed(3);
  if (el._done === want) return;
  const p = await state.sources.get(pg.srcId).doc.getPage(pg.idx + 1);
  const [Dw, Dh] = dispDims(pg); let sc = z * Math.min(2, devicePixelRatio || 1);
  const maxPx = 14e6; if (Dw * Dh * sc * sc > maxPx) sc = Math.sqrt(maxPx / (Dw * Dh));
  const vp = p.getViewport({ scale: sc, rotation: R });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  if (!el.isConnected || totalRot(pg) !== R || state.zoom !== z) return;
  el.querySelector('canvas')?.remove(); el.prepend(c); el._done = want;
}
function computeFit() {
  const wrapW = ($('.ewrap').clientWidth || innerWidth) - 40;
  const maxDw = Math.max(...state.pages.map(p => dispDims(p)[0]), 595);
  return clamp(wrapW / maxDw, 0.35, 1.6);
}
function setZoom(z, fit) {
  state.fit = !!fit; const old = state.zoom; state.zoom = clamp(z, 0.3, 4);
  const anchor = state.current;
  renderEdit();
  if (anchor && old !== state.zoom) scrollToPage(anchor, true);
}
$('#zIn').onclick = () => setZoom(state.zoom * 1.2);
$('#zOut').onclick = () => setZoom(state.zoom / 1.2);
$('#zLbl').onclick = () => setZoom(computeFit(), true);
$('#zLbl').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setZoom(computeFit(), true); } };
addEventListener('resize', () => { if (state.mode === 'edit' && state.fit) { const z = computeFit(); if (Math.abs(z - state.zoom) > .01) setZoom(z, true); } placeFtb(); });

function renderEdit() {
  if (state.mode !== 'edit') return;
  const keys = new Set(state.pages.map(p => p.key)); const st = settings(); const n = state.pages.length;
  for (const [k, el] of epEls) if (!keys.has(k)) { pageIO.unobserve(el); curIO.unobserve(el); el.parentElement.remove(); epEls.delete(k); }
  for (const [k, el] of stEls) if (!keys.has(k)) { thumbIO.unobserve(el); sheetRO.unobserve(el.querySelector('.sheet')); el.remove(); stEls.delete(k); }
  const z = state.zoom; $('#zLbl').textContent = Math.round(z / (96 / 72) * 100) + ' %';
  state.pages.forEach((pg, i) => {
    let el = epEls.get(pg.key);
    if (!el) {
      const w = document.createElement('div'); w.className = 'pwrap';
      w.innerHTML = '<span class="plabel"></span><div class="epage"><div class="ov"></div><div class="tl"></div></div>';
      el = w.querySelector('.epage'); el.dataset.key = pg.key; epEls.set(pg.key, el); pageIO.observe(el); curIO.observe(el);
    }
    const w = el.parentElement; if (pagesEl.children[i] !== w) pagesEl.insertBefore(w, pagesEl.children[i] || null);
    const [Dw, Dh] = dispDims(pg);
    el.style.width = Dw * z + 'px'; el.style.height = Dh * z + 'px'; el.style.setProperty('--s', z); el.dataset.tool = state.tool;
    w.querySelector('.plabel').textContent = 'Página ' + (i + 1) + ' de ' + n;
    el._i = i; el._n = n;
    if (el._vis) wantPage(el);
    if (!(state.editing && state.editing.key === pg.key)) renderLayers(pg.key, st);
    // tira
    let s = stEls.get(pg.key);
    if (!s) {
      s = document.createElement('button'); s.className = 'sitem'; s.dataset.key = pg.key; s._px = 120;
      s.innerHTML = '<span class="frame"><span class="sheet"><span class="ov"></span></span></span><span class="sn"></span>';
      s.onclick = () => scrollToPage(pg.key); stEls.set(pg.key, s); sheetRO.observe(s.querySelector('.sheet')); thumbIO.observe(s);
    }
    if (stripEl.children[i] !== s) stripEl.insertBefore(s, stripEl.children[i] || null);
    s.querySelector('.sn').textContent = i + 1; s.setAttribute('aria-label', 'Ir a la página ' + (i + 1));
    setupSheet(s, pg, 1 / 1.3);
    s.querySelector('.ov').innerHTML = layersHtml(pg, false) + stampsHtml(pg, i, n, st);
  });
  if (state.tool === 'edittext') for (const k of keys) { const el = epEls.get(k); if (el && el._vis) renderBlocks(k); }
  markStrip(); placeFtb();
}
function markStrip() { for (const [k, s] of stEls) s.setAttribute('aria-current', k === state.current); }
function scrollToPage(key, instant) {
  if (state.mode !== 'edit') return;
  const el = epEls.get(key); if (!el) return; state.current = key; markStrip();
  el.scrollIntoView({ block: 'start', behavior: instant ? 'auto' : 'smooth' });
}
function renderLayers(key, st, draft) {
  const el = epEls.get(key); const pg = pageByKey(key); if (!el || !pg) return;
  st = st || settings();
  const ov = el.querySelector('.ov');
  ov.innerHTML = layersHtml(pg, true, draft) + stampsHtml(pg, el._i || 0, el._n || 1, st);
  for (const t of ov.querySelectorAll('.tx[data-id]')) { const it = itemById(pg, t.dataset.id); if (it) { it._w = t.offsetWidth / state.zoom; it._h = t.offsetHeight / state.zoom; } }
  if (state.item && state.item.key === key && !(state.editing && state.editing.id === state.item.id)) {
    const it = itemById(pg, state.item.id);
    if (it) {
      const z = state.zoom;
      if (it.type === 'line') {
        ov.insertAdjacentHTML('beforeend', '<span class="hd pt" data-h="p1" style="left:' + it.x1 * z + 'px;top:' + it.y1 * z + 'px"></span><span class="hd pt" data-h="p2" style="left:' + it.x2 * z + 'px;top:' + it.y2 * z + 'px"></span>');
      } else {
        const b = bbox(it); const pad = it.type === 'ink' ? strokeW(it) / 2 : 0;
        const canResize = ['whiteout', 'highlight', 'rect', 'ellipse', 'image', 'mark', 'certstamp'].includes(it.type);
        ov.insertAdjacentHTML('beforeend', '<div class="selbox" style="left:' + (b.x - pad) * z + 'px;top:' + (b.y - pad) * z + 'px;width:' + (b.w + 2 * pad) * z + 'px;height:' + (b.h + 2 * pad) * z + 'px">' + (canResize ? '<span class="hd se" data-h="se"></span>' : '') + '</div>');
      }
    }
  }
}
function refreshPage(key) {
  renderLayers(key);
  const pg = pageByKey(key); const i = state.pages.indexOf(pg); const st = settings(); const n = state.pages.length;
  const s = stEls.get(key); if (s) s.querySelector('.ov').innerHTML = layersHtml(pg, false) + stampsHtml(pg, i, n, st);
  placeFtb();
}

/* herramientas */
const HINTS = {
  select: () => 'Haz clic en lo que hayas añadido para moverlo o cambiarlo. <kbd>Supr</kbd> lo elimina.',
  text: () => 'Haz clic donde quieras escribir. Sirve también para rellenar formularios.',
  edittext: () => 'Haz clic en un párrafo del PDF para reescribirlo. El original queda tapado.',
  whiteout: () => (state.wmode === 'censor' ? 'Arrastra sobre los datos que quieras censurar: se taparán en negro y se eliminarán del archivo al descargar. ' : 'Arrastra sobre lo que quieras tapar con blanco. ') + subseg('wmode', [['cover', 'Tapar', '<rect x="4" y="7" width="16" height="10" rx="1"/>'], ['censor', 'Censurar', '<rect x="4" y="7" width="16" height="10" rx="1" fill="currentColor"/>']]),
  highlight: () => 'Arrastra sobre el texto que quieras resaltar.',
  ink: () => 'Dibuja con el ratón, el dedo o un lápiz.',
  shape: () => 'Arrastra para dibujar. ' + subseg('shape', [['rect', 'Rectángulo', '<rect x="4" y="6" width="16" height="12" rx="1"/>'], ['ellipse', 'Elipse', '<ellipse cx="12" cy="12" rx="8" ry="6"/>'], ['line', 'Línea', '<path d="M5 19 19 5"/>']]),
  mark: () => 'Haz clic en una casilla para marcarla. ' + subseg('markKind', [['check', 'Visto', '<path d="m5 12.5 4.5 4.5L19 7"/>'], ['cross', 'Aspa', '<path d="M6 6l12 12M18 6 6 18"/>'], ['dot', 'Punto', '<circle cx="12" cy="12" r="4" fill="currentColor"/>']]),
  date: () => 'Haz clic donde quieras poner la fecha de hoy (' + today() + ').'
};
function subseg(prop, opts) {
  return '<span class="subseg">' + opts.map(([v, l, svg]) => '<button data-sub="' + prop + '" data-v="' + v + '" aria-pressed="' + (state[prop] === v) + '"><svg class="i" viewBox="0 0 24 24">' + svg + '</svg>' + l + '</button>').join('') + '</span>';
}
$('#hint').addEventListener('click', e => { const b = e.target.closest('[data-sub]'); if (b) { state[b.dataset.sub] = b.dataset.v; renderHint(); } });
function renderHint() { $('#hint').innerHTML = '<span>' + (HINTS[state.tool] || HINTS.select)() + '</span>'; }
function setTool(t) {
  if (t === 'sign') { openSig(); return; }
  if (t === 'image') { $('#imgPick').click(); return; }
  finishEdit(); state.tool = t;
  $$('#dock .tool').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t));
  for (const el of epEls.values()) el.dataset.tool = t;
  if (t !== 'select' && t !== 'text') selectItem(null);
  renderHint();
  if (t === 'edittext') for (const [k, el] of epEls) { if (el._vis) renderBlocks(k); } else for (const el of epEls.values()) { const tl = el.querySelector('.tl'); tl.innerHTML = ''; tl.classList.remove('show'); }
}
$('#dock').addEventListener('click', e => { const b = e.target.closest('.tool'); if (b) setTool(b.dataset.tool); });

function setMode(m) {
  const fromHome = state.view !== 'work';
  if (state.mode === m && !fromHome) return;
  state.view = 'work'; document.body.dataset.view = 'work'; $('#homeView').hidden = true;
  finishEdit(); selectItem(null); state.mode = m;
  $('#mOrg').setAttribute('aria-pressed', m === 'org'); $('#mEdit').setAttribute('aria-pressed', m === 'edit');
  $('#orgView').hidden = m !== 'org'; $('#editView').hidden = m !== 'edit';
  if (m === 'edit') {
    if (!state.current) state.current = state.pages[0] && state.pages[0].key;
    state.zoom = state.fit ? computeFit() : state.zoom; renderEdit(); renderHint();
    requestAnimationFrame(() => { if (state.fit) { const z = computeFit(); if (Math.abs(z - state.zoom) > .01) setZoom(z, true); } });
  } else renderAll();
  scrollTo({ top: 0 });
}
$('#mOrg').onclick = () => setMode('org'); $('#mEdit').onclick = () => setMode('edit');
function goHome() {
  finishEdit(); selectItem(null); state.view = 'home'; document.body.dataset.view = 'home';
  $('#homeView').hidden = false; $('#orgView').hidden = true; $('#editView').hidden = true; ftb.hidden = true;
  renderHome(); scrollTo({ top: 0 });
}
function renderHome() {
  const n = state.pages.length; $('#resume').hidden = !n;
  if (n) { $('#resumeName').textContent = baseName() + '.pdf'; $('#resumeInfo').textContent = (n === 1 ? '1 página' : n + ' páginas') + ' abiertas. Elige otra tarea para seguir con este documento.'; }
}
$('#bHome').onclick = goHome;
$('#bBack').onclick = () => setMode(state.mode);
$('#bClose').onclick = () => { pushHist(); state.pages = []; state.sel.clear(); state.item = null; state.current = null; $('#docName').value = 'documento'; delete $('#docName').dataset.touched; renderAll(); toast('Documento cerrado.', { action: 'Deshacer', onAction: () => { undo(); setMode(state.mode); } }); };
const NEEDS_FILE = new Set(['merge', 'img']);
$('#tools').addEventListener('click', e => {
  const b = e.target.closest('[data-task]'); if (!b) return; const t = b.dataset.task;
  if (t === 'scan') { openScanner(); return; }
  if (!state.pages.length || NEEDS_FILE.has(t)) {
    state.pendingTask = t; const inp = $('#hubFile');
    inp.accept = t === 'img' ? 'image/*' : ['merge', 'unlock', 'repair', 'compress', 'toimg'].includes(t) ? '.pdf,application/pdf' : '.pdf,application/pdf,image/*';
    inp.click(); return;
  }
  applyTask(t);
});
$('#hubFile').addEventListener('change', e => { const f = e.target.files; if (f.length) handleFiles(f); e.target.value = ''; });
async function repairCheck() {
  const ids = [...new Set(state.pages.map(p => p.srcId))]; let bad = 0;
  for (const id of ids) { try { await getLib(id); } catch { bad++; } }
  toast(bad ? 'El archivo tenía daños importantes. Al descargar, las páginas se guardarán como imagen para recuperarlas: se verán igual, pero su texto no se podrá seleccionar.' : 'Archivo leído y reconstruido. Pulsa «Descargar PDF» para guardar la copia reparada.');
}
function applyTask(t) {
  if (!state.pages.length) return;
  const org = ['merge', 'split', 'organize', 'rotate', 'wm', 'num', 'img', 'protect', 'compress', 'unlock', 'repair', 'toimg'];
  if (org.includes(t)) {
    setMode('org');
    if (t === 'split') setTab('split');
    else if (t === 'wm' || t === 'num') {
      setTab('stamp'); const tog = t === 'wm' ? $('#wmOn') : $('#numOn');
      if (!tog.checked) { tog.checked = true; tog.dispatchEvent(new Event('change')); }
    } else setTab('dl');
    if (t === 'protect') { if (!$('#pwOn').checked) { $('#pwOn').checked = true; $('#pwOn').dispatchEvent(new Event('change')); } setTimeout(() => { $('#sPw').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#pw1').focus({ preventScroll: true }); }, 120); }
    if (t === 'compress') { if (!$('#cmpOn').checked) { $('#cmpOn').checked = true; $('#cmpOn').dispatchEvent(new Event('change')); } setTimeout(() => $('#sCmp').scrollIntoView({ behavior: 'smooth', block: 'center' }), 120); toast('Elige cuánto reducir y pulsa «Descargar PDF».'); }
    if (t === 'unlock') {
      if ($('#pwOn').checked) { $('#pwOn').checked = false; $('#pwOn').dispatchEvent(new Event('change')); }
      const locked = state.pages.some(p => state.sources.get(p.srcId).encrypted);
      toast(locked ? 'Contraseña quitada. Pulsa «Descargar PDF» para guardar la copia sin contraseña.' : 'Este PDF no tiene contraseña: ya se puede abrir sin ella.');
    }
    if (t === 'repair') { repairCheck(); }
    if (t === 'toimg') exportImages(state.pages);
    if (t === 'merge') toast('Arrastra las páginas para ordenarlas y pulsa «Descargar».');
    if (t === 'img') toast('Listo. Añade más fotos con «Añadir» o pulsa «Descargar».');
    if (t === 'rotate') { state.pages.forEach(p => state.sel.add(p.key)); renderAll(); toast('Todas las páginas están seleccionadas: usa «Girar» o el botón de giro de cada página.'); }
    if (innerWidth <= 1000 && ['split', 'wm', 'num'].includes(t)) setTimeout(() => $('.insp').scrollIntoView({ behavior: 'smooth' }), 100);
    return;
  }
  setMode('edit');
  if (t === 'sign') openSig();
  else if (t === 'edit') setTool('edittext');
  else if (t === 'fill') setTool('text');
  else if (t === 'annotate') setTool('highlight');
  else if (t === 'censor') { state.wmode = 'censor'; setTool('whiteout'); }
  else if (t === 'cert') openCert();
}

/* puntero en las páginas */
let drag = null;
const toPt = (e, el) => { const r = el.getBoundingClientRect(); return [(e.clientX - r.left) / state.zoom, (e.clientY - r.top) / state.zoom]; };
function selectItem(sel) {
  const prev = state.item; state.item = sel;
  if (prev && (!sel || prev.key !== sel.key)) renderLayers(prev.key);
  if (sel) renderLayers(sel.key);
  placeFtb();
}
function addItem(key, it, opts = {}) {
  const pg = pageByKey(key); if (!pg) return; if (!opts.noHist) pushHist();
  it.id = it.id || nid('i'); pg.items.push(it); state.item = { key, id: it.id }; refreshPage(key);
  return it;
}
pagesEl.addEventListener('pointerdown', e => {
  const el = e.target.closest('.epage'); if (!el || e.button > 0) return;
  if (e.target.closest('[contenteditable]')) return;
  const key = el.dataset.key, pg = pageByKey(key); const [px, py] = toPt(e, el);
  const hitId = e.target.closest('[data-id]')?.dataset.id; const handle = e.target.closest('[data-h]')?.dataset.h;
  const blk = e.target.closest('.blk'); const tool = state.tool;
  const wasEditing = state.editing; finishEdit();
  const hitIt = hitId && itemById(pg, hitId);
  if (handle && state.item) { e.preventDefault(); startDrag(e, el, key, 'resize', handle, px, py); return; }
  if (tool === 'edittext' && blk) { e.preventDefault(); convertBlock(key, +blk.dataset.b); return; }
  if ((tool === 'text' || tool === 'edittext') && hitIt && hitIt.type === 'text') { e.preventDefault(); state.item = { key, id: hitId }; beginEdit(key, hitId); return; }
  if (tool === 'select' || ((tool === 'text' || tool === 'edittext') && hitIt)) {
    if (hitIt) { e.preventDefault(); state.item = { key, id: hitId }; refreshPage(key); startDrag(e, el, key, 'move', null, px, py); }
    else selectItem(null);
    return;
  }
  if (tool === 'text') {
    if (wasEditing) return; // el primer clic fuera solo termina la edición
    e.preventDefault(); const it = { type: 'text', x: px, y: py - 12 * 0.65, text: '', size: 12, font: 'helv', bold: false, color: '#111111', lh: 1.2 };
    it.id = nid('i'); pg.items.push(it); state.item = { key, id: it.id }; renderLayers(key); beginEdit(key, it.id, true); return;
  }
  if (tool === 'date') { e.preventDefault(); addItem(key, { type: 'text', x: px, y: py - 7, text: today(), size: 11, font: 'helv', bold: false, color: '#111111', lh: 1.2 }); return; }
  if (tool === 'mark') { e.preventDefault(); const s = 12; addItem(key, { type: 'mark', kind: state.markKind, x: px - s / 2, y: py - s / 2, size: s, color: '#111111' }); return; }
  if (['whiteout', 'highlight', 'ink', 'shape'].includes(tool)) { e.preventDefault(); startDrag(e, el, key, 'draw', null, px, py); }
});
function startDrag(e, el, key, kind, handle, px, py) {
  const pg = pageByKey(key);
  drag = { el, key, kind, handle, sx: px, sy: py, lx: px, ly: py, snap: snap(), moved: false };
  if (kind === 'draw') {
    const t = state.tool === 'shape' ? state.shape : state.tool;
    const base = { id: nid('i'), type: t };
    if (t === 'whiteout') Object.assign(base, { x: px, y: py, w: 0, h: 0, color: state.wmode === 'censor' ? '#111111' : '#ffffff', secure: state.wmode === 'censor' });
    else if (t === 'highlight') Object.assign(base, { x: px, y: py, w: 0, h: 0, color: HLC[0] });
    else if (t === 'rect' || t === 'ellipse') Object.assign(base, { x: px, y: py, w: 0, h: 0, color: INK[2], sw: 2 });
    else if (t === 'line') Object.assign(base, { x1: px, y1: py, x2: px, y2: py, color: INK[2], sw: 2 });
    else if (t === 'ink') Object.assign(base, { pts: [[px, py]], color: INK[1], sw: 2 });
    drag.draft = base;
  } else if (kind === 'resize') drag.orig = structuredClone(itemById(pg, state.item.id));
  try { el.setPointerCapture(e.pointerId); } catch { }
  $('#ftb').hidden = true;
}
let rafId = 0;
pagesEl.addEventListener('pointermove', e => {
  if (!drag) return; const [px, py] = toPt(e, drag.el); const pg = pageByKey(drag.key);
  const [Dw, Dh] = dispDims(pg); const cx = clamp(px, 0, Dw), cy = clamp(py, 0, Dh);
  if (Math.abs(px - drag.sx) + Math.abs(py - drag.sy) > 1.5) drag.moved = true;
  if (drag.kind === 'move') { const it = itemById(pg, state.item.id); moveItem(it, px - drag.lx, py - drag.ly); drag.lx = px; drag.ly = py; }
  else if (drag.kind === 'resize') {
    const it = itemById(pg, state.item.id), o = drag.orig, dx = px - drag.sx, dy = py - drag.sy;
    if (drag.handle === 'p1') { it.x1 = o.x1 + dx; it.y1 = o.y1 + dy; }
    else if (drag.handle === 'p2') { it.x2 = o.x2 + dx; it.y2 = o.y2 + dy; }
    else if (it.type === 'mark') it.size = Math.max(6, o.size + Math.max(dx, dy));
    else if (it.type === 'image') { it.w = Math.max(10, o.w + dx); it.h = it.w * (o.h / o.w); }
    else if (it.type === 'certstamp') { it.w = clamp(o.w + dx, 120, 420); it.h = certStampH(it); }
    else { it.w = Math.max(3, o.w + dx); it.h = Math.max(3, o.h + dy); }
  } else if (drag.kind === 'draw') {
    const d = drag.draft;
    if (d.type === 'ink') d.pts.push([r2(cx), r2(cy)]);
    else if (d.type === 'line') { d.x2 = cx; d.y2 = cy; }
    else { d.x = Math.min(drag.sx, cx); d.y = Math.min(drag.sy, cy); d.w = Math.abs(cx - drag.sx); d.h = Math.abs(cy - drag.sy); }
  }
  if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; if (drag) renderLayers(drag.key, null, drag.kind === 'draw' ? [drag.draft] : null); });
});
function endDrag() {
  if (!drag) return; const d = drag; drag = null; const pg = pageByKey(d.key);
  if (d.kind === 'draw') {
    const it = d.draft; let ok = true;
    if (it.type === 'ink') { if (it.pts.length < 2) it.pts.push([it.pts[0][0] + .1, it.pts[0][1] + .1]); }
    else if (it.type === 'line') ok = Math.hypot(it.x2 - it.x1, it.y2 - it.y1) > 3;
    else ok = it.w > 3 && it.h > 3;
    if (ok) { state.hist.push(d.snap); state.redo = []; syncUndo(); pg.items.push(it); state.item = it.type === 'ink' ? null : { key: d.key, id: it.id }; }
    else if (it.type !== 'ink') toast('Arrastra para dibujar: mantén pulsado y mueve.');
  } else if (d.moved) { state.hist.push(d.snap); state.redo = []; syncUndo(); }
  refreshPage(d.key);
}
pagesEl.addEventListener('pointerup', endDrag); pagesEl.addEventListener('pointercancel', endDrag);
pagesEl.addEventListener('dblclick', e => {
  const t = e.target.closest('.tx[data-id]'); const el = e.target.closest('.epage');
  if (t && el && !t.isContentEditable) { state.item = { key: el.dataset.key, id: t.dataset.id }; beginEdit(el.dataset.key, t.dataset.id); }
});

/* edición de texto en línea */
const PTO = (() => { const d = document.createElement('div'); try { d.contentEditable = 'plaintext-only'; return d.contentEditable === 'plaintext-only'; } catch { return false; } })();
function beginEdit(key, id, isNew) {
  const pg = pageByKey(key); const it = itemById(pg, id); if (!it) return;
  state.editing = { key, id, snap: isNew ? null : snap(), isNew };
  if (!isNew) state.editing.prev = it.text;
  renderLayers(key); const el = epEls.get(key).querySelector('.tx[data-id="' + id + '"]'); if (!el) return;
  el.contentEditable = PTO ? 'plaintext-only' : 'true'; el.spellcheck = true; el.focus();
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  placeFtb();
}
function finishEdit() {
  const ed = state.editing; if (!ed) return; state.editing = null;
  const pg = pageByKey(ed.key); const it = itemById(pg, ed.id);
  const el = epEls.get(ed.key)?.querySelector('.tx[data-id="' + ed.id + '"]');
  if (it && el) it.text = el.innerText.replace(/ /g, ' ').replace(/\n$/, '');
  if (it && !it.text.trim() && !it.cover) {
    pg.items = pg.items.filter(x => x !== it); if (state.item && state.item.id === ed.id) state.item = null;
    if (!ed.isNew) { state.hist.push(ed.snap); state.redo = []; }
  } else if (it) {
    if (ed.isNew) { const s = snap(); s.find(p => p.key === ed.key).items = s.find(p => p.key === ed.key).items.filter(x => x.id !== ed.id); state.hist.push(s); state.redo = []; }
    else if (it.text !== ed.prev || ed.dirty) { state.hist.push(ed.snap); state.redo = []; }
  }
  syncUndo(); if (state.mode === 'edit') refreshPage(ed.key);
}
pagesEl.addEventListener('input', e => { const t = e.target.closest('.tx[contenteditable]'); if (t && state.editing) { const it = itemById(pageByKey(state.editing.key), state.editing.id); if (it) it.text = t.innerText; placeFtb(); } });
pagesEl.addEventListener('paste', e => { const t = e.target.closest('.tx[contenteditable]'); if (t && !PTO) { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); } });
pagesEl.addEventListener('focusout', e => {
  if (!state.editing || !e.target.closest('.tx')) return;
  if (e.relatedTarget && $('#ftb').contains(e.relatedTarget)) return;
  setTimeout(() => { if (state.editing && !(document.activeElement && document.activeElement.isContentEditable)) finishEdit(); }, 0);
});

/* texto existente del PDF: bloques por párrafo */
const blockCache = new Map();
async function getBlocks(pg) {
  const R = totalRot(pg); const ck = pg.srcId + ':' + pg.idx + ':' + R; if (blockCache.has(ck)) return blockCache.get(ck);
  const p = await state.sources.get(pg.srcId).doc.getPage(pg.idx + 1);
  const vp = p.getViewport({ scale: 1, rotation: R });
  let tc; try { tc = await p.getTextContent(); } catch { tc = { items: [], styles: {} }; }
  const runs = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const t = pdfjs.Util.transform(vp.transform, it.transform);
    if (Math.abs(t[1]) > Math.abs(t[0]) * 0.05 || t[0] <= 0) continue;
    const size = Math.hypot(t[2], t[3]); if (size < 3) continue;
    let fam = (tc.styles[it.fontName] && tc.styles[it.fontName].fontFamily) || 'sans-serif', name = '';
    try { if (p.commonObjs.has(it.fontName)) name = p.commonObjs.get(it.fontName).name || ''; } catch { }
    const font = /courier|mono/i.test(name + fam) ? 'cour' : (/times|serif|roman|georgia|garamond|cambria|minion/i.test(name + fam) && !/sans/i.test(name + fam)) ? 'times' : 'helv';
    const bold = /bold|black|heavy|semibold|demi/i.test(name);
    runs.push({ x: t[4], y: t[5], w: it.width * vp.scale, size, str: it.str, font, bold });
  }
  runs.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const r of runs) {
    const L = lines.find(l => Math.abs(l.y - r.y) < r.size * 0.35 && Math.abs(l.size - r.size) < r.size * .3 && r.x - l.x2 < r.size * 2.5 && r.x > l.x - 1);
    if (L) { const gap = r.x - L.x2; L.text += (gap > r.size * 0.15 && !/\s$/.test(L.text) && !/^\s/.test(r.str) ? ' ' : '') + r.str; L.x2 = Math.max(L.x2, r.x + r.w); }
    else lines.push({ x: r.x, x2: r.x + r.w, y: r.y, size: r.size, text: r.str, font: r.font, bold: r.bold });
  }
  lines.sort((a, b) => a.y - b.y || a.x - b.x);
  const blocks = [];
  for (const l of lines) {
    const B = blocks.find(b => {
      const last = b.lines[b.lines.length - 1]; const gap = l.y - last.y;
      return Math.abs(l.size - b.size) < b.size * .12 && gap > b.size * .85 && gap < b.size * 1.9 && Math.abs(l.x - b.x) < b.size * 1.5 && l.font === b.font && l.bold === b.bold && (!b.gap || Math.abs(gap - b.gap) < b.size * .35);
    });
    if (B) { B.gap = B.gap || (l.y - B.lines[B.lines.length - 1].y); B.lines.push(l); B.x = Math.min(B.x, l.x); B.x2 = Math.max(B.x2, l.x2); }
    else blocks.push({ lines: [l], x: l.x, x2: l.x2, size: l.size, font: l.font, bold: l.bold, gap: 0 });
  }
  const out = blocks.map(b => {
    const f = FONTS[b.font]; const first = b.lines[0], last = b.lines[b.lines.length - 1];
    const lh = b.gap ? clamp(b.gap / b.size, 1, 2.2) : 1.2;
    const top = first.y - f.asc * b.size, bottom = last.y + f.desc * b.size;
    return { x: b.x, y: top, w: b.x2 - b.x, h: bottom - top, size: Math.round(b.size * 2) / 2, rawSize: b.size, font: b.font, bold: b.bold, lh, base: first.y, text: b.lines.map(l => l.text.trim()).join('\n') };
  });
  blockCache.set(ck, out); return out;
}
async function renderBlocks(key) {
  const el = epEls.get(key); const pg = pageByKey(key); if (!el || !pg) return;
  const blocks = await getBlocks(pg); if (state.tool !== 'edittext') return;
  const used = new Set(pg.items.filter(i => i.blockId != null).map(i => i.blockId));
  const tl = el.querySelector('.tl'); tl.classList.add('show');
  tl.innerHTML = blocks.map((b, i) => used.has(i) ? '' : '<div class="blk" data-b="' + i + '" title="Haz clic para editar" style="left:calc(var(--s) * ' + (b.x - 2) + 'px);top:calc(var(--s) * ' + (b.y - 1) + 'px);width:calc(var(--s) * ' + (b.w + 4) + 'px);height:calc(var(--s) * ' + (b.h + 2) + 'px)"></div>').join('');
  if (!blocks.length && el._i === state.pages.findIndex(p => p.key === state.current) && !el._warned) { el._warned = true; toast('Esta página no tiene texto editable. Puede ser una imagen escaneada: usa «Tapar» y «Texto».'); }
}
async function convertBlock(key, bi) {
  const pg = pageByKey(key); const b = (await getBlocks(pg))[bi]; if (!b) return;
  const it = { id: nid('i'), type: 'text', text: b.text, size: b.size, font: b.font, bold: b.bold, color: '#1a1a1a', lh: b.lh, bg: '#ffffff', blockId: bi, x: b.x, y: 0, cover: { x: b.x - 1.5, y: b.y - 1, w: b.w + 3, h: b.h + 2 } };
  it.y = b.base - baseOff(it);
  pushHist(); pg.items.push(it); state.item = { key, id: it.id };
  renderBlocks(key); renderLayers(key); beginEdit(key, it.id);
}

/* barra flotante */
const ftb = $('#ftb');
const ftbIcon = { dup: ICON.copy, del: ICON.trash };
function swatches(list, cur, attr) { return list.map(c => '<button class="sw" data-' + attr + '="' + c + '" style="background:' + c + '" aria-label="Color ' + c + '" aria-pressed="' + (c.toLowerCase() === (cur || '').toLowerCase()) + '"></button>').join(''); }
function placeFtb() {
  const sel = state.item; const pg = sel && pageByKey(sel.key); const it = sel && itemById(pg, sel.id);
  if (!it || state.mode !== 'edit' || drag) { ftb.hidden = true; return; }
  let h = '';
  if (it.type === 'text') {
    h += Object.entries(FONTS).map(([k, f]) => '<button data-font="' + k + '" aria-pressed="' + (it.font === k) + '" style="font-family:' + esc(f.css) + '">' + f.label + '</button>').join('');
    h += '<span class="v"></span><button data-size="-1" aria-label="Letra más pequeña">' + ICON.minus + '</button><span class="sz">' + it.size + '</span><button data-size="1" aria-label="Letra más grande">' + ICON.plus + '</button>';
    h += '<button data-bold aria-pressed="' + !!it.bold + '" aria-label="Negrita" style="font-weight:700">B</button><span class="v"></span>' + swatches(INK, it.color, 'color');
    if (it.cover) h += '<span class="v"></span><button data-secure aria-pressed="' + !!it.secure + '" title="Elimina del archivo el texto original (la página se guarda como imagen)">Borrado seguro</button>';
  } else if (it.type === 'whiteout') {
    h += swatches(['#ffffff', '#111111'], it.color, 'color') + '<span class="v"></span><button data-secure aria-pressed="' + !!it.secure + '" title="Elimina del archivo lo que hay debajo (la página se guarda como imagen)">Borrado seguro</button>';
  } else if (it.type === 'highlight') h += swatches(HLC, it.color, 'color');
  else if (it.type === 'image' || it.type === 'certstamp') h += '';
  else {
    h += swatches(INK, it.color, 'color');
    if (it.type !== 'mark') h += '<span class="v"></span>' + [1, 2, 4].map(w => '<button data-sw="' + w + '" aria-pressed="' + (it.sw === w) + '" aria-label="Grosor ' + w + '"><svg viewBox="0 0 24 24"><path d="M4 12h16" stroke="currentColor" stroke-width="' + (w + .5) + '" stroke-linecap="round"/></svg></button>').join('');
  }
  if (it.type === 'certstamp') h += '<span style="padding:0 8px;font-size:12.5px">Sello de la firma digital</span><span class="v"></span><button data-del class="danger" aria-label="Quitar el sello" title="Quitar el sello (la firma se mantiene, sin sello visible)">' + ftbIcon.del + '</button>';
  else h += (h ? '<span class="v"></span>' : '') + '<button data-dup aria-label="Duplicar" title="Duplicar">' + ftbIcon.dup + '</button><button data-del class="danger" aria-label="Eliminar" title="Eliminar (Supr)">' + ftbIcon.del + '</button>';
  ftb.innerHTML = h; ftb.hidden = false;
  const el = epEls.get(sel.key); if (!el) { ftb.hidden = true; return; }
  const target = el.querySelector('.tx[data-id="' + it.id + '"]') || el.querySelector('.selbox') || el.querySelector('[data-h]');
  const r = target ? target.getBoundingClientRect() : el.getBoundingClientRect();
  const fw = ftb.offsetWidth, fh = ftb.offsetHeight; const topLimit = ($('.dockwrap').getBoundingClientRect().bottom || 120) + 6;
  let top = r.top - fh - 12; if (top < topLimit) top = r.bottom + 12;
  ftb.style.left = clamp(r.left + r.width / 2 - fw / 2, 12, innerWidth - fw - 12) + 'px'; ftb.style.top = clamp(top, topLimit, innerHeight - fh - 12) + 'px';
}
addEventListener('scroll', () => { if (!ftb.hidden) placeFtb(); }, { passive: true });
ftb.addEventListener('pointerdown', e => e.preventDefault());
ftb.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const sel = state.item; const pg = pageByKey(sel.key); const it = itemById(pg, sel.id); if (!it) return;
  if (b.hasAttribute('data-del')) { deleteItem(); return; }
  if (b.hasAttribute('data-dup')) { finishEdit(); const c = structuredClone(it); delete c.blockId; c.id = nid('i'); moveItem(c, 10, 10); if (c.cover) { delete c.cover; delete c.bg; } addItem(sel.key, c); return; }
  const editingThis = state.editing && state.editing.id === it.id;
  if (!editingThis) pushHist(); else state.editing.dirty = true;
  if (b.dataset.font) it.font = b.dataset.font;
  if (b.dataset.size) it.size = clamp(it.size + (+b.dataset.size) * (it.size >= 20 ? 2 : 1), 5, 96);
  if (b.hasAttribute('data-bold')) it.bold = !it.bold;
  if (b.dataset.color) it.color = b.dataset.color;
  if (b.dataset.sw) it.sw = +b.dataset.sw;
  if (b.hasAttribute('data-secure')) { it.secure = !it.secure; toast(it.secure ? 'Borrado seguro activado: al descargar, esta página se guardará como imagen y lo tapado desaparecerá del archivo.' : 'Borrado seguro desactivado.'); }
  if (editingThis) {
    const el = epEls.get(sel.key).querySelector('.tx[data-id="' + it.id + '"]'); const f = FONTS[it.font];
    Object.assign(el.style, { fontFamily: f.css, fontSize: 'calc(var(--s) * ' + it.size + 'px)', fontWeight: it.bold ? 700 : 400, color: it.color });
    placeFtb();
  } else refreshPage(sel.key);
});
function deleteItem() {
  const sel = state.item; if (!sel) return; const pg = pageByKey(sel.key);
  if (state.editing) { state.editing = null; }
  pushHist(); pg.items = pg.items.filter(i => i.id !== sel.id); state.item = null; refreshPage(sel.key);
  if (state.tool === 'edittext') renderBlocks(sel.key);
}

/* teclado */
document.addEventListener('keydown', e => {
  if (!$('#sigModal').hidden) { if (e.key === 'Escape') closeSig(); return; }
  if (!$('#certModal').hidden) { if (e.key === 'Escape') closeCert(); return; }
  if (!$('#scanModal').hidden) { if (e.key === 'Escape') closeScanner(); return; }
  if (!$('#openPwModal').hidden) return;
  if (e.key === 'Escape') { addMenu.hidden = true; if (state.editing) { finishEdit(); return; } if (state.item) { selectItem(null); return; } if (state.mode === 'edit' && state.tool !== 'select') setTool('select'); return; }
  const mod = e.ctrlKey || e.metaKey;
  if (isTyping()) return;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (state.mode === 'org') {
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.sel.size) { e.preventDefault(); removePages(selKeys()); }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); state.pages.forEach(p => state.sel.add(p.key)); renderAll(); }
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.item) { e.preventDefault(); deleteItem(); return; }
  if (state.item && e.key.startsWith('Arrow')) {
    e.preventDefault(); const d = e.shiftKey ? 10 : 1; const it = itemById(pageByKey(state.item.key), state.item.id);
    pushHist(); moveItem(it, e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0); refreshPage(state.item.key); return;
  }
  if (mod) return;
  const map = { v: 'select', t: 'text', e: 'edittext', w: 'whiteout', h: 'highlight', d: 'ink', f: 'shape', m: 'mark' };
  if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
});

/* imagen */
$('#imgPick').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const bmp = await decodeImage(f); const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const png = f.type === 'image/png'; const g = c.getContext('2d'); if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
    g.drawImage(bmp.src, 0, 0, c.width, c.height); bmp.close();
    placeImage(png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88), c.width / c.height, 0.45, 'Imagen añadida. Arrástrala a su sitio o tira de la esquina para cambiar el tamaño.'); freeCanvas(c);
  } catch (err) { toast(err && /HEIC|memoria/.test(err.message) ? err.message : 'No se ha podido leer esa imagen. Prueba con un JPG o un PNG.', { err: true }); }
});
function placeImage(src, ratio, widthFrac, msg, sig) {
  if (state.mode !== 'edit') setMode('edit');
  const key = state.current || (state.pages[0] && state.pages[0].key); if (!key) { toast('Añade primero un PDF.'); return; }
  const pg = pageByKey(key); const [Dw, Dh] = dispDims(pg);
  let w = Dw * widthFrac, h = w / ratio; if (h > Dh * 0.4) { h = Dh * 0.4; w = h * ratio; }
  const it = { type: 'image', src, x: sig ? Dw * 0.56 : (Dw - w) / 2, y: sig ? Dh * 0.84 - h : (Dh - h) / 2, w, h };
  if (state.tool !== 'select') setTool('select');
  addItem(key, it); toast(msg);
}
