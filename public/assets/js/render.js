/* Taller PDF · Render general: decide qué vista se dibuja (inicio, organizar o editar). */
'use strict';

function renderAll() {
  if (!state.pages.length && state.view !== 'home') { goHome(); syncUndo(); return; }
  if (state.view === 'home') { renderHome(); syncUndo(); return; }
  const st = settings();
  if (state.mode === 'org') { const groups = splitGroups(); renderGrid(st, groups && !groups.err ? groups.g : null); updateOrgChrome(groups); }
  else { renderEdit(); updateOrgChrome(null); }
  syncUndo();
}
