/* Taller PDF · Ajustes de salida: lee del panel las opciones elegidas (compresión, contraseña, marca de agua, numeración, separación). */
'use strict';

function settings() {
  return {
    wm: { on: $('#wmOn').checked, text: $('#wmText').value.trim(), color: $('#wmColor').value, angle: +$('#wmAngle').value, size: +$('#wmSize').value, op: +$('#wmOp').value / 100 },
    num: { on: $('#numOn').checked, fmt: $('#numFmt').value, pos: $('#numPos').value, start: parseInt($('#numStart').value, 10) || 0, skip: $('#numSkip').checked }
  };
}
const WM_COLORS = { gray: [0.42, 0.44, 0.46], red: [0.76, 0.16, 0.12], blue: [0.13, 0.3, 0.66] };
const rgbCss = a => 'rgb(' + a.map(v => Math.round(v * 255)).join(',') + ')';
function numLabel(st, i, n) {
  if (st.skip && i === 0) return '';
  const k = st.start + i - (st.skip ? 1 : 0), tot = st.start + n - 1 - (st.skip ? 1 : 0);
  return ({ n: '' + k, pn: 'Página ' + k, pnt: 'Página ' + k + ' de ' + tot, nt: k + ' / ' + tot })[st.fmt];
}
let mfont = null; // fuentes estándar para medir

function wmFit(text, size, angle, Dw, Dh) {
  if (!mfont || !text) return size;
  const tw = mfont.helvb.widthOfTextAtSize(winAnsi(text), size);
  const max = angle ? 0.82 * Math.min(Dw, Dh) * Math.SQRT2 : 0.88 * Dw;
  return tw > max ? size * max / tw : size;
}
const PN_SIZE = 10, PN_MARGIN = 36, PN_BASE = 26;
function stampsHtml(pg, i, n, st) {
  const [Dw, Dh] = dispDims(pg); let h = '';
  if (st.wm.on && st.wm.text) {
    const sz = wmFit(st.wm.text, st.wm.size, st.wm.angle, Dw, Dh);
    h += '<div class="wm" style="--a:' + (-st.wm.angle) + 'deg;font-size:calc(var(--s) * ' + sz + 'px);color:' + rgbCss(WM_COLORS[st.wm.color]) + ';opacity:' + st.wm.op + '">' + esc(st.wm.text) + '</div>';
  }
  if (st.num.on) {
    const label = numLabel(st.num, i, n);
    if (label) {
      let css = 'font-size:calc(var(--s) * ' + PN_SIZE + 'px);';
      css += st.num.pos === 'tr' ? 'top:calc(var(--s) * ' + (PN_BASE - 0.126 * PN_SIZE) + 'px);' : 'bottom:calc(var(--s) * ' + (PN_BASE - 0.154 * PN_SIZE) + 'px);';
      css += st.num.pos === 'bc' ? 'left:50%;transform:translateX(-50%);' : 'right:calc(var(--s) * ' + PN_MARGIN + 'px);';
      h += '<div class="pn" style="' + css + '">' + esc(label) + '</div>';
    }
  }
  return h;
}
