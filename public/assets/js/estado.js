/* Taller PDF · Estado de la aplicación e historial de deshacer y rehacer. */
'use strict';

const state = {
  sources: new Map(), pages: [], sel: new Set(), last: null,
  hist: [], redo: [], view: 'home', pendingTask: null, mode: 'org', tool: 'select', shape: 'rect', markKind: 'check', wmode: 'cover',
  item: null,        // {key, id} elemento seleccionado
  editing: null,     // {key, id, snap}
  zoom: 1, fit: true, current: null, tab: 'dl', insertAt: null
};
const pageByKey = k => state.pages.find(p => p.key === k);
const totalRot = pg => (pg.base + pg.rot) % 360;
const dispDims = pg => totalRot(pg) % 180 ? [pg.h, pg.w] : [pg.w, pg.h];
const itemById = (pg, id) => pg && pg.items.find(i => i.id === id);

/* historial */
const snap = () => structuredClone(state.pages.map(p => ({ ...p })));
function pushHist(s) { state.hist.push(s || snap()); if (state.hist.length > 80) state.hist.shift(); state.redo = []; syncUndo(); }
function restore(s) {
  state.pages = s; const keys = new Set(s.map(p => p.key));
  for (const k of [...state.sel]) if (!keys.has(k)) state.sel.delete(k);
  if (state.item && !itemById(pageByKey(state.item.key), state.item.id)) state.item = null;
  renderAll();
}
function undo() { finishEdit(); const s = state.hist.pop(); if (!s) { toast('No hay nada que deshacer.'); return; } state.redo.push(snap()); restore(s); syncUndo(); }
function redo() { finishEdit(); const s = state.redo.pop(); if (!s) return; state.hist.push(snap()); restore(s); syncUndo(); }
function syncUndo() { $('#bUndo').disabled = !state.hist.length; $('#bRedo').disabled = !state.redo.length; }
$('#bUndo').onclick = undo; $('#bRedo').onclick = redo;
