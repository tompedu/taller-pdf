/* Taller PDF · Arranque de la aplicación: carga las tipografías de medida y dibuja la primera pantalla. */
'use strict';

const tbEl = $('.topbar'); new ResizeObserver(() => document.documentElement.style.setProperty('--tbh', tbEl.offsetHeight + 'px')).observe(tbEl);
setTool('select');
document.body.dataset.view = 'home';
renderAll();

PDFDocument.create().then(async d => { mfont = {}; for (const [k, f] of Object.entries(FONTS)) { mfont[k] = await d.embedFont(StandardFonts[f.std[0]]); mfont[k + 'b'] = await d.embedFont(StandardFonts[f.std[1]]); } renderAll(); });
