/* Taller PDF · Elementos que se colocan sobre las páginas: textos, formas, resaltados, imágenes y firmas. */
'use strict';

const FONTS = {
  helv: { css: 'Helvetica, Arial, "Liberation Sans", sans-serif', asc: .905, desc: .212, std: ['Helvetica', 'HelveticaBold'], label: 'Sans' },
  times: { css: '"Times New Roman", Times, "Liberation Serif", serif', asc: .891, desc: .216, std: ['TimesRoman', 'TimesRomanBold'], label: 'Serif' },
  cour: { css: '"Courier New", Courier, "Liberation Mono", monospace', asc: .833, desc: .300, std: ['Courier', 'CourierBold'], label: 'Mono' }
};
const baseOff = it => { const f = FONTS[it.font]; return ((it.lh - (f.asc + f.desc)) / 2 + f.asc) * it.size; };
const INK = ['#111111', '#1a3d8f', '#c62828', '#2e7d32', '#6b6b6b'];
const HLC = ['#ffe14d', '#8ef0a0', '#ffa3d1', '#8fd3ff'];
const fmtN = n => (Math.round(n * 100) / 100).toString();
function ellipseD(cx, cy, rx, ry) {
  const k = 0.5523, f = fmtN;
  return 'M' + f(cx + rx) + ' ' + f(cy) + 'C' + f(cx + rx) + ' ' + f(cy + k * ry) + ' ' + f(cx + k * rx) + ' ' + f(cy + ry) + ' ' + f(cx) + ' ' + f(cy + ry) +
    'C' + f(cx - k * rx) + ' ' + f(cy + ry) + ' ' + f(cx - rx) + ' ' + f(cy + k * ry) + ' ' + f(cx - rx) + ' ' + f(cy) +
    'C' + f(cx - rx) + ' ' + f(cy - k * ry) + ' ' + f(cx - k * rx) + ' ' + f(cy - ry) + ' ' + f(cx) + ' ' + f(cy - ry) +
    'C' + f(cx + k * rx) + ' ' + f(cy - ry) + ' ' + f(cx + rx) + ' ' + f(cy - k * ry) + ' ' + f(cx + rx) + ' ' + f(cy) + 'Z';
}
const rectD = (x, y, w, h) => 'M' + fmtN(x) + ' ' + fmtN(y) + 'H' + fmtN(x + w) + 'V' + fmtN(y + h) + 'H' + fmtN(x) + 'Z';
function pathOf(it) {
  switch (it.type) {
    case 'whiteout': case 'highlight': case 'rect': return rectD(it.x, it.y, it.w, it.h);
    case 'ellipse': return ellipseD(it.x + it.w / 2, it.y + it.h / 2, Math.abs(it.w / 2), Math.abs(it.h / 2));
    case 'line': return 'M' + fmtN(it.x1) + ' ' + fmtN(it.y1) + 'L' + fmtN(it.x2) + ' ' + fmtN(it.y2);
    case 'ink': return it.pts.map((p, i) => (i ? 'L' : 'M') + fmtN(p[0]) + ' ' + fmtN(p[1])).join('');
    case 'mark': {
      const { x, y, size: s } = it; const f = fmtN;
      if (it.kind === 'check') return 'M' + f(x + .12 * s) + ' ' + f(y + .55 * s) + 'L' + f(x + .4 * s) + ' ' + f(y + .82 * s) + 'L' + f(x + .88 * s) + ' ' + f(y + .18 * s);
      if (it.kind === 'cross') return 'M' + f(x + .2 * s) + ' ' + f(y + .2 * s) + 'L' + f(x + .8 * s) + ' ' + f(y + .8 * s) + 'M' + f(x + .8 * s) + ' ' + f(y + .2 * s) + 'L' + f(x + .2 * s) + ' ' + f(y + .8 * s);
      return ellipseD(x + s / 2, y + s / 2, s * .3, s * .3);
    }
  }
  return '';
}
const filled = it => it.type === 'whiteout' || it.type === 'highlight' || (it.type === 'mark' && it.kind === 'dot');
const strokeW = it => it.type === 'mark' ? it.size * 0.13 : it.sw;
function bbox(it) {
  switch (it.type) {
    case 'line': return { x: Math.min(it.x1, it.x2), y: Math.min(it.y1, it.y2), w: Math.abs(it.x2 - it.x1), h: Math.abs(it.y2 - it.y1) };
    case 'ink': { const xs = it.pts.map(p => p[0]), ys = it.pts.map(p => p[1]); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
    case 'mark': return { x: it.x, y: it.y, w: it.size, h: it.size };
    case 'text': return { x: it.x, y: it.y, w: it._w || textW(it), h: it._h || textLines(it).length * it.lh * it.size };
    default: return { x: it.x, y: it.y, w: it.w, h: it.h };
  }
}
const textLines = it => it.text.replace(/\n$/, '').split('\n');
function textW(it) {
  const lines = textLines(it); const f = mfont && mfont[it.font + (it.bold ? 'b' : '')];
  return Math.max(4, ...lines.map(l => f ? f.widthOfTextAtSize(winAnsi(l), it.size) : l.length * it.size * .55));
}
function moveItem(it, dx, dy) {
  if (it.type === 'line') { it.x1 += dx; it.x2 += dx; it.y1 += dy; it.y2 += dy; }
  else if (it.type === 'ink') it.pts = it.pts.map(p => [p[0] + dx, p[1] + dy]);
  else { it.x += dx; it.y += dy; if (it.cover) { it.cover = { ...it.cover, x: it.cover.x + dx, y: it.cover.y + dy }; } }
}

function vecHtml(it, interactive) {
  const id = interactive ? ' data-id="' + it.id + '"' : '';
  if (it.type === 'image') return '<image' + id + ' href="' + it.src + '" x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" preserveAspectRatio="none"/>';
  const d = pathOf(it);
  if (it.type === 'whiteout') return '<path' + id + ' d="' + d + '" fill="' + it.color + '"/>';
  if (it.type === 'highlight') return '<path' + id + ' d="' + d + '" fill="' + it.color + '" fill-opacity=".42" style="mix-blend-mode:multiply"/>';
  if (filled(it)) return '<path' + id + ' d="' + d + '" fill="' + it.color + '"/>';
  let s = '<path d="' + d + '" fill="none" stroke="' + it.color + '" stroke-width="' + strokeW(it) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  if (interactive) s += '<path class="hit"' + id + ' d="' + d + '" stroke-width="' + Math.max(10, strokeW(it) + 8) + '"/>';
  return s;
}
function textHtml(it, interactive) {
  const f = FONTS[it.font];
  return '<div class="tx"' + (interactive ? ' data-id="' + it.id + '"' : '') + ' style="left:calc(var(--s) * ' + it.x + 'px);top:calc(var(--s) * ' + it.y + 'px);font-size:calc(var(--s) * ' + it.size + 'px);line-height:' + it.lh + ';font-family:' + esc(f.css) + ';font-weight:' + (it.bold ? 700 : 400) + ';color:' + it.color + (it.bg ? ';background:' + it.bg : '') + '">' + esc(it.text) + '</div>';
}
function layersHtml(pg, interactive, extra) {
  const [Dw, Dh] = dispDims(pg); const items = extra ? pg.items.concat(extra) : pg.items;
  let svg = '<svg class="vec" viewBox="0 0 ' + Dw + ' ' + Dh + '" preserveAspectRatio="none" aria-hidden="true">';
  let html = '';
  for (const it of items) {
    if (it.type === 'text') { if (it.cover) svg += '<path d="' + rectD(it.cover.x, it.cover.y, it.cover.w, it.cover.h) + '" fill="' + (it.bg || '#fff') + '"/>'; html += textHtml(it, interactive); }
    else if (it.type === 'certstamp') html += certStampHtml(it, interactive);
    else svg += vecHtml(it, interactive);
  }
  return svg + '</svg>' + html;
}
