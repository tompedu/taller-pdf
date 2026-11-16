/* Taller PDF · Modo organizar: miniaturas, selección, reordenar, girar, duplicar y eliminar páginas. */
'use strict';

const SIZES = [['A4', 210, 297], ['A3', 297, 420], ['A5', 148, 210], ['Carta', 216, 279], ['Legal', 216, 356]];
function sizeLabel(pg) {
  const [Dw, Dh] = dispDims(pg); const a = Math.min(Dw, Dh) * MM, b = Math.max(Dw, Dh) * MM;
  const hit = SIZES.find(([, w, h]) => Math.abs(a - w) < 3 && Math.abs(b - h) < 3);
  return (hit ? hit[0] : Math.round(Dw * MM) + '×' + Math.round(Dh * MM) + ' mm') + ' · ' + (Dw > Dh ? 'horizontal' : 'vertical');
}
const thumbQ = []; let thumbBusy = 0;
const thumbIO = new IntersectionObserver(ents => { for (const e of ents) { e.target._vis = e.isIntersecting; if (e.isIntersecting) wantThumb(e.target); } }, { rootMargin: '500px 0px' });
const sheetRO = new ResizeObserver(ents => { for (const e of ents) { const dw = +e.target.dataset.dw; if (dw && e.target.clientWidth) e.target.style.setProperty('--s', e.target.clientWidth / dw); } });
function wantThumb(el) { const pg = pageByKey(el.dataset.key); if (!pg || el._rot === totalRot(pg) || el._q) return; el._q = true; thumbQ.push(el); pumpThumbs(); }
function pumpThumbs() {
  while (thumbBusy < 3 && thumbQ.length) { const el = thumbQ.shift(); el._q = false; thumbBusy++; renderThumb(el).catch(() => { }).finally(() => { thumbBusy--; pumpThumbs(); }); }
}
async function renderThumb(el) {
  const pg = pageByKey(el.dataset.key); if (!pg || !el.isConnected) return;
  const R = totalRot(pg); if (el._rot === R) return;
  const p = await state.sources.get(pg.srcId).doc.getPage(pg.idx + 1);
  const v1 = p.getViewport({ scale: 1, rotation: R }); const target = (el._px || 240) * Math.min(2, devicePixelRatio || 1);
  const vp = p.getViewport({ scale: target / Math.max(v1.width, v1.height), rotation: R });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  if (totalRot(pg) !== R || !el.isConnected) return;
  const sh = el.querySelector('.sheet'); sh.querySelector('canvas')?.remove(); sh.prepend(c); el._rot = R;
}
function setupSheet(el, pg, ratio) {
  const [Dw, Dh] = dispDims(pg); const sh = el.querySelector('.sheet');
  sh.dataset.dw = Dw; sh.style.aspectRatio = Dw + ' / ' + Dh; sh.className = 'sheet ' + (Dw / Dh > ratio ? 'land' : 'port');
  if (sh.clientWidth) sh.style.setProperty('--s', sh.clientWidth / Dw);
  if (el._rot !== undefined && el._rot !== totalRot(pg)) { sh.querySelector('canvas')?.remove(); el._rot = undefined; }
  if (el._vis) wantThumb(el);
}

/* ---- organizar ---- */
const ICON = {
  rotl: '<svg class="i" viewBox="0 0 24 24"><path d="M3 4v6h6"/><path d="M3.5 15a9 9 0 1 0 2.2-9.4L3 10"/></svg>',
  rotr: '<svg class="i" viewBox="0 0 24 24"><path d="M21 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.2-9.4L21 10"/></svg>',
  edit: '<svg class="i" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  del: '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  plus: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  copy: '<svg class="i" viewBox="0 0 24 24"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
  minus: '<svg class="i" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>'
};
const cardEls = new Map();
let addCard = null;
function makeCard(pg) {
  const el = document.createElement('div'); el.className = 'card'; el.dataset.key = pg.key; el.tabIndex = 0; el.setAttribute('role', 'button');
  el.innerHTML = '<span class="check" aria-hidden="true"><svg class="i" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></span><span class="badge" hidden></span>' +
    '<button class="ins" title="Insertar páginas aquí" aria-label="Insertar páginas antes de esta">' + ICON.plus + '</button>' +
    '<div class="stage"><div class="sheet"><div class="ov"></div></div></div>' +
    '<div class="meta"><span class="num"></span><span class="info"></span></div><div class="srcl"></div>' +
    '<div class="pbtns"><button class="pbtn" data-act="rotl" title="Girar a la izquierda" aria-label="Girar a la izquierda">' + ICON.rotl + '</button><button class="pbtn" data-act="rotr" title="Girar a la derecha" aria-label="Girar a la derecha">' + ICON.rotr + '</button><button class="pbtn" data-act="edit" title="Editar esta página" aria-label="Editar esta página">' + ICON.edit + '</button><button class="pbtn del" data-act="del" title="Eliminar página" aria-label="Eliminar página">' + ICON.del + '</button></div>' +
    '<span class="gtag"><span></span></span>';
  sheetRO.observe(el.querySelector('.sheet')); thumbIO.observe(el);
  return el;
}
function renderGrid(st, groups) {
  const grid = $('#grid'); const n = state.pages.length;
  const keys = new Set(state.pages.map(p => p.key));
  for (const [k, el] of cardEls) if (!keys.has(k)) { thumbIO.unobserve(el); sheetRO.unobserve(el.querySelector('.sheet')); el.remove(); cardEls.delete(k); }
  if (!addCard) {
    addCard = document.createElement('button'); addCard.className = 'addcard'; addCard.setAttribute('aria-haspopup', 'menu');
    addCard.innerHTML = ICON.plus + '<span>Añadir páginas</span><span class="help">PDF, fotos o una página en blanco</span>';
    addCard.onclick = () => openAddMenu(addCard, state.pages.length);
  }
  state.pages.forEach((pg, i) => {
    let el = cardEls.get(pg.key); if (!el) { el = makeCard(pg); cardEls.set(pg.key, el); }
    if (grid.children[i] !== el) grid.insertBefore(el, grid.children[i] || null);
    const on = state.sel.has(pg.key); el.classList.toggle('sel', on); el.setAttribute('aria-pressed', on);
    el.setAttribute('aria-label', 'Página ' + (i + 1));
    el.querySelector('.num').textContent = i + 1;
    el.querySelector('.info').textContent = sizeLabel(pg);
    const src = state.sources.get(pg.srcId);
    el.querySelector('.srcl').textContent = src.isBlank ? 'Página en blanco' : src.name + ' · p. ' + (pg.idx + 1);
    el.querySelector('.srcl').title = src.name;
    const nIt = pg.items.length, b = el.querySelector('.badge'); b.hidden = !nIt;
    b.textContent = pg.items.some(x => x.secure) ? 'Borrado seguro' : nIt === 1 ? '1 cambio' : nIt + ' cambios';
    setupSheet(el, pg, 1 / 1.24);
    el.querySelector('.ov').innerHTML = layersHtml(pg, false) + stampsHtml(pg, i, n, st);
    const g = groups && groups[i];
    if (g) { el.dataset.g = g; el.style.setProperty('--gc', 'var(--g' + (((g - 1) % 6) + 1) + ')'); el.querySelector('.gtag span').textContent = 'Archivo ' + g; }
    else { delete el.dataset.g; el.style.removeProperty('--gc'); }
  });
  grid.append(addCard);
}
$('#grid').addEventListener('click', e => {
  const ins = e.target.closest('.ins');
  const card = e.target.closest('.card'); if (!card) return; const key = card.dataset.key;
  if (ins) { e.stopPropagation(); openAddMenu(ins, state.pages.findIndex(p => p.key === key)); return; }
  const act = e.target.closest('[data-act]');
  if (act) {
    e.stopPropagation(); const a = act.dataset.act;
    if (a === 'rotl') rotatePages([key], -90); else if (a === 'rotr') rotatePages([key], 90);
    else if (a === 'del') removePages([key]); else if (a === 'edit') { setMode('edit'); scrollToPage(key); }
    return;
  }
  if (e.shiftKey && state.last) {
    const ks = state.pages.map(p => p.key); let a = ks.indexOf(state.last), b = ks.indexOf(key);
    if (a > -1) { if (a > b) [a, b] = [b, a]; for (let i = a; i <= b; i++) state.sel.add(ks[i]); }
  } else if (state.sel.has(key)) state.sel.delete(key); else state.sel.add(key);
  state.last = key; renderAll();
});
$('#grid').addEventListener('dblclick', e => { const c = e.target.closest('.card'); if (c && !e.target.closest('button')) { setMode('edit'); scrollToPage(c.dataset.key); } });
$('#grid').addEventListener('keydown', e => { const c = e.target.closest('.card'); if (c && e.target === c && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); c.click(); } });
if (window.Sortable) Sortable.create($('#grid'), {
  animation: 160, ghostClass: 'ghost', draggable: '.card', filter: 'button', preventOnFilter: false, delay: 180, delayOnTouchOnly: true,
  onEnd: ev => {
    if (ev.oldIndex === ev.newIndex) return; pushHist();
    const order = $$('#grid .card').map(c => c.dataset.key); const m = new Map(state.pages.map(p => [p.key, p]));
    state.pages = order.map(k => m.get(k)).filter(Boolean); renderAll();
  }
});
function rotatePages(keys, d) { if (!keys.length) return; pushHist(); for (const k of keys) { const p = pageByKey(k); if (p) { p.rot = ((p.rot + d) % 360 + 360) % 360; } } renderAll(); }
function removePages(keys) {
  if (!keys.length) return; pushHist(); const ks = new Set(keys);
  state.pages = state.pages.filter(p => !ks.has(p.key)); keys.forEach(k => state.sel.delete(k)); renderAll();
  toast(ks.size === 1 ? 'Página eliminada.' : ks.size + ' páginas eliminadas.', { action: 'Deshacer', onAction: undo });
}
function duplicatePages(keys) {
  pushHist(); const ks = new Set(keys); const out = [];
  for (const p of state.pages) { out.push(p); if (ks.has(p.key)) out.push({ ...structuredClone(p), key: nid('p'), items: p.items.map(i => ({ ...structuredClone(i), id: nid('i') })) }); }
  state.pages = out; renderAll();
}
const selKeys = () => state.pages.filter(p => state.sel.has(p.key)).map(p => p.key);
$('#bAll').onclick = () => { state.pages.forEach(p => state.sel.add(p.key)); renderAll(); };
$('#bNone').onclick = () => { state.sel.clear(); renderAll(); };
$('#bRotL').onclick = () => rotatePages(selKeys(), -90);
$('#bRotR').onclick = () => rotatePages(selKeys(), 90);
$('#bDup').onclick = () => duplicatePages(selKeys());
$('#bDel').onclick = () => removePages(selKeys());
$('#bRev').onclick = () => { pushHist(); state.pages.reverse(); renderAll(); };

/* inspector */
const TABS = { dl: ['#tDl', '#pDl'], split: ['#tSplit', '#pSplit'], stamp: ['#tStamp', '#pStamp'] };
function setTab(t) { state.tab = t; for (const [k, [tb, p]] of Object.entries(TABS)) { $(tb).setAttribute('aria-selected', k === t); $(p).hidden = k !== t; } renderAll(); }
$('#tDl').onclick = () => setTab('dl'); $('#tSplit').onclick = () => setTab('split'); $('#tStamp').onclick = () => setTab('stamp');
for (const [tog, sec] of [['#wmOn', '#sWm'], ['#numOn', '#sNum']]) $(tog).addEventListener('change', e => { $(sec).toggleAttribute('data-off', !e.target.checked); renderAll(); });
for (const id of ['#wmText', '#wmColor', '#wmAngle', '#wmSize', '#wmOp', '#numFmt', '#numPos', '#numStart', '#numSkip']) $(id).addEventListener('input', () => { $('#wmSizeO').textContent = $('#wmSize').value + ' pt'; $('#wmOpO').textContent = $('#wmOp').value + ' %'; renderAll(); });
const splitModeVal = () => $('input[name=sm]:checked').value;
$('#splitMode').addEventListener('change', () => renderAll());
$('#everyN').addEventListener('focus', () => { $('input[name=sm][value=every]').checked = true; renderAll(); });
$('#everyN').addEventListener('input', () => renderAll());
$('#ranges').addEventListener('input', () => renderAll());

function parseRanges(str, n) {
  const out = [];
  for (const part of str.split(/[,;]+/)) {
    const s = part.trim(); if (!s) continue;
    const m = s.match(/^(\d+)\s*(?:-\s*(\d*))?$/);
    if (!m) throw new Error('No se entiende «' + s + '». Escribe rangos como 1-3, 5, 8-10.');
    const a = +m[1], b = m[2] ? +m[2] : (s.includes('-') ? n : a);
    if (a < 1 || b > n || a > b) throw new Error('El rango «' + s + '» no existe: el documento tiene ' + n + ' páginas.');
    out.push([a, b]);
  }
  if (!out.length) throw new Error('Escribe al menos un rango, por ejemplo 1-3, 4-6.');
  return out;
}
function splitRanges() {
  const n = state.pages.length, mode = splitModeVal();
  if (mode === 'each') return state.pages.map((_, i) => [i + 1, i + 1]);
  if (mode === 'every') { const k = Math.max(1, parseInt($('#everyN').value, 10) || 1); const r = []; for (let a = 1; a <= n; a += k) r.push([a, Math.min(n, a + k - 1)]); return r; }
  return parseRanges($('#ranges').value, n);
}
function splitGroups() {
  if (state.tab !== 'split' || !state.pages.length) return null;
  let ranges; try { ranges = splitRanges(); } catch (e) { return { err: e.message }; }
  const g = new Array(state.pages.length).fill(0);
  ranges.forEach(([a, b], k) => { for (let i = a; i <= b; i++) if (!g[i - 1]) g[i - 1] = k + 1; });
  return { g, count: ranges.length };
}
function updateOrgChrome(groups) {
  const n = state.pages.length, s = state.sel.size;
  $('#selCount').textContent = s ? s + ' de ' + n + ' seleccionadas' : n === 1 ? '1 página' : n + ' páginas';
  for (const id of ['#bRotL', '#bRotR', '#bDup', '#bDel']) $(id).disabled = !s;
  $('#bAll').hidden = !n || s === n; $('#bNone').hidden = !s; $('#bRev').disabled = n < 2;
  $('#empty').hidden = n > 0; $('#grid').hidden = n === 0; $('#selbar').hidden = n === 0;
  $('#bSave').disabled = !n; $('#bDownload').disabled = !n; $('#bSplit').disabled = !n;
  $('#bSaveSel').disabled = !s; $('#bSaveSel').textContent = s ? 'Descargar solo las seleccionadas (' + s + ')' : 'Descargar solo las seleccionadas';
  const files = new Set(state.pages.map(p => p.srcId).filter(id => !state.sources.get(id).isBlank)).size;
  const edits = state.pages.reduce((a, p) => a + p.items.length, 0);
  $('#dlStat').textContent = n ? (n === 1 ? '1 página' : n + ' páginas') + (files > 1 ? ' de ' + files + ' archivos' : '') + (edits ? ' · ' + edits + (edits === 1 ? ' cambio' : ' cambios') : '') : 'Todavía no hay páginas.';
  const sec = state.pages.filter(p => p.items.some(i => i.secure)).length;
  $('#secureNote').hidden = !sec;
  $('#secureNote').textContent = sec ? (sec === 1 ? '1 página tiene' : sec + ' páginas tienen') + ' borrado seguro: se guardará como imagen para que lo tapado desaparezca del archivo. Su texto dejará de poder seleccionarse.' : '';
  const ss = $('#splitStat');
  if (groups && groups.err) { ss.textContent = groups.err; ss.style.color = 'var(--danger)'; }
  else if (groups) { ss.textContent = 'Saldrán ' + groups.count + (groups.count === 1 ? ' archivo PDF.' : ' archivos PDF.'); ss.style.color = ''; }
  $('#rangesWrap').hidden = splitModeVal() !== 'ranges';
}
