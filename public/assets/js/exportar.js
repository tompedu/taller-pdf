/* Taller PDF · Exportar: construye el PDF final, aplica sellos y contraseña, separa en varios archivos y crea el .zip. */
'use strict';

function frameOf(p, R, box) {
  const cb = box || p.getCropBox(); const W = cb.width, H = cb.height;
  const Dw = R % 180 ? H : W, Dh = R % 180 ? W : H;
  const map = (dx, dy) => { // punto visto en pantalla (origen abajo-izquierda) -> espacio PDF
    const u = dx / Dw, v = 1 - dy / Dh; let x, y;
    if (R === 0) { x = u * W; y = (1 - v) * H; } else if (R === 90) { x = v * W; y = u * H; }
    else if (R === 180) { x = (1 - u) * W; y = v * H; } else { x = (1 - v) * W; y = (1 - u) * H; }
    return { x: x + cb.x, y: y + cb.y };
  };
  return { Dw, Dh, map };
}
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
function dataUrlBytes(u) { const b = atob(u.split(',')[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
async function drawItems(out, p, pg, R, fr, cache) {
  const { Dh, map } = fr; const rot = degrees(R); const origin = map(0, Dh);
  const font = async (k, b) => { const key = k + (b ? 'b' : ''); if (!cache.fonts[key]) cache.fonts[key] = await out.embedFont(StandardFonts[FONTS[k].std[b ? 1 : 0]]); return cache.fonts[key]; };
  const svg = (d, o) => p.drawSvgPath(d, { x: origin.x, y: origin.y, rotate: rot, ...o });
  const vec = pg.items.filter(i => i.type !== 'text' && i.type !== 'certstamp'), txt = pg.items.filter(i => i.type === 'text');
  const stamps = state.cert ? pg.items.filter(i => i.type === 'certstamp') : [];
  for (const it of vec) {
    if (it.type === 'image') {
      let img = cache.imgs.get(it.src); if (!img) { const b = dataUrlBytes(it.src); img = it.src.startsWith('data:image/png') ? await out.embedPng(b) : await out.embedJpg(b); cache.imgs.set(it.src, img); }
      const o = map(it.x, Dh - (it.y + it.h)); p.drawImage(img, { x: o.x, y: o.y, width: it.w, height: it.h, rotate: rot }); continue;
    }
    const d = pathOf(it); if (!d) continue;
    if (it.type === 'highlight') svg(d, { color: hexRgb(it.color), opacity: 0.42, blendMode: BlendMode.Multiply });
    else if (filled(it)) svg(d, { color: hexRgb(it.color) });
    else svg(d, { borderColor: hexRgb(it.color), borderWidth: strokeW(it), borderLineCap: LineCapStyle.Round });
  }
  for (const it of txt) {
    const f = await font(it.font, it.bold); const lines = textLines(it).map(winAnsi);
    if (it.cover) svg(rectD(it.cover.x, it.cover.y, it.cover.w, it.cover.h), { color: hexRgb(it.bg || '#ffffff') });
    if (it.bg) { const w = Math.max(...lines.map(l => f.widthOfTextAtSize(l, it.size))); svg(rectD(it.x, it.y, w, lines.length * it.lh * it.size), { color: hexRgb(it.bg) }); }
    const b0 = baseOff(it);
    lines.forEach((l, i) => { if (!l) return; const o = map(it.x, Dh - (it.y + b0 + i * it.lh * it.size)); p.drawText(l, { x: o.x, y: o.y, size: it.size, font: f, color: hexRgb(it.color), rotate: rot }); });
  }
  for (const it of stamps) await drawCertStamp(out, p, it, fr, rot, cache);
}

async function rasterize(pg) {
  const R = totalRot(pg); const p = await state.sources.get(pg.srcId).doc.getPage(pg.idx + 1);
  const [Dw, Dh] = dispDims(pg); let sc = 200 / 72; if (Dw * Dh * sc * sc > 24e6) sc = Math.sqrt(24e6 / (Dw * Dh));
  const vp = p.getViewport({ scale: sc, rotation: R }); const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await p.render({ canvasContext: g, viewport: vp }).promise;
  const kx = c.width / Dw, ky = c.height / Dh;
  for (const it of pg.items) {
    const b = it.type === 'whiteout' ? it : it.cover; if (!b) continue;
    g.fillStyle = it.type === 'whiteout' ? it.color : (it.bg || '#fff'); g.fillRect(b.x * kx, b.y * ky, b.w * kx, b.h * ky);
  }
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), Dw, Dh };
}
async function buildPdf(list) {
  const st = settings(); const out = await PDFDocument.create(); const cache = { fonts: {}, imgs: new Map(), signDate: new Date(), sigWidget: null, rebuilt: 0 };
  const helv = await out.embedFont(StandardFonts.Helvetica), helvB = await out.embedFont(StandardFonts.HelveticaBold); cache.fonts.helv = helv; cache.fonts.helvb = helvB;
  const raster = list.map(pg => pg.items.some(i => i.secure));
  const copied = new Array(list.length); const bySrc = new Map();
  list.forEach((pg, i) => { if (raster[i]) return; if (!bySrc.has(pg.srcId)) bySrc.set(pg.srcId, []); bySrc.get(pg.srcId).push(i); });
  for (const [sid, idxs] of bySrc) {
    let lib; try { lib = await getLib(sid); } catch { idxs.forEach(i => { raster[i] = true; }); cache.rebuilt += idxs.length; continue; }
    const first = new Map(); const extra = [];
    for (const i of idxs) { const pi = list[i].idx; if (!first.has(pi)) first.set(pi, i); else extra.push(i); }
    const uniq = [...first.keys()]; const pages = await out.copyPages(lib, uniq);
    uniq.forEach((pi, k) => { copied[first.get(pi)] = pages[k]; });
    for (const i of extra) { const [p] = await out.copyPages(lib, [list[i].idx]); copied[i] = p; }
  }
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const pg = list[i]; let p, R, fr;
    if (raster[i]) {
      const r = await rasterize(pg); p = out.addPage([r.Dw, r.Dh]); const img = await out.embedJpg(r.bytes);
      p.drawImage(img, { x: 0, y: 0, width: r.Dw, height: r.Dh }); R = 0; fr = frameOf(p, 0, { x: 0, y: 0, width: r.Dw, height: r.Dh });
      cache.pageIndex = i; cache.R = 0;
      await drawItems(out, p, { items: pg.items.filter(it => !(it.type === 'whiteout' && it.secure)) }, 0, fr, cache);
    } else {
      p = copied[i]; out.addPage(p); R = totalRot(pg); p.setRotation(degrees(R)); fr = frameOf(p, R);
      cache.pageIndex = i; cache.R = R;
      await drawItems(out, p, pg, R, fr, cache);
    }
    const { Dw, Dh, map } = fr;
    if (st.wm.on && st.wm.text) {
      const t = winAnsi(st.wm.text); const S = wmFit(st.wm.text, st.wm.size, st.wm.angle, Dw, Dh);
      const tw = helvB.widthOfTextAtSize(t, S), th = S * 0.7, a = st.wm.angle * Math.PI / 180;
      const o = map(Dw / 2 - Math.cos(a) * tw / 2 + Math.sin(a) * th / 2, Dh / 2 - Math.sin(a) * tw / 2 - Math.cos(a) * th / 2); const c = WM_COLORS[st.wm.color];
      p.drawText(t, { x: o.x, y: o.y, size: S, font: helvB, color: rgb(c[0], c[1], c[2]), opacity: st.wm.op, rotate: degrees(R + st.wm.angle) });
    }
    if (st.num.on) {
      const label = numLabel(st.num, i, n);
      if (label) {
        const t = winAnsi(label), tw = helv.widthOfTextAtSize(t, PN_SIZE);
        const o = map(st.num.pos === 'bc' ? (Dw - tw) / 2 : Dw - PN_MARGIN - tw, st.num.pos === 'tr' ? Dh - PN_BASE - PN_SIZE * 0.72 : PN_BASE);
        p.drawText(t, { x: o.x, y: o.y, size: PN_SIZE, font: helv, color: rgb(0.17, 0.17, 0.17), rotate: degrees(R) });
      }
    }
  }
  out.setProducer('Taller PDF'); out.setCreator('Taller PDF'); out.setTitle(baseName());
  lastBuild = { rebuilt: cache.rebuilt, saved: 0 };
  if ($('#cmpOn').checked) { $('#busyMsg').textContent = 'Reduciendo las imágenes…'; lastBuild.saved = await compressImages(out, CMP[$('input[name=cl]:checked').value]); }
  lastSig = cache.sigWidget ? { pageIndex: cache.sigWidget.pageIndex, rect: cache.sigWidget.rect, R: cache.sigWidget.R, k: cache.sigWidget.k } : null;
  if (state.cert) return afirmaSign(await out.save());
  const pw = pwState();
  if (pw.on) {
    const noCopy = $('#pwNoCopy').checked;
    const owner = noCopy ? Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, '0')).join('') : pw.pw;
    out.encrypt({ userPassword: pw.pw, ownerPassword: owner, permissions: noCopy
      ? { printing: 'highResolution', modifying: false, copying: false, annotating: false, fillingForms: true, contentAccessibility: true, documentAssembly: false }
      : { printing: 'highResolution', modifying: true, copying: true, annotating: true, fillingForms: true, contentAccessibility: true, documentAssembly: true } });
  }
  return out.save();
}
const baseName = () => ($('#docName').value.trim() || 'documento').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '-');
function pwState() {
  const on = $('#pwOn').checked, a = $('#pw1').value, b = $('#pw2').value;
  if (!on) return { on: false, ok: true };
  if (!a) return { on, ok: false, msg: 'Escribe una contraseña o desactiva la protección.' };
  if (a.length < 6) return { on, ok: false, msg: 'Usa al menos 6 caracteres.' };
  if (a !== b) return { on, ok: false, msg: b ? 'Las dos contraseñas no coinciden.' : 'Repite la contraseña para confirmarla.' };
  return { on, ok: true, pw: a };
}
function pwGuard() {
  const s = pwState();
  if (s.on && state.cert) { toast('La firma con certificado no se puede combinar con la contraseña. Desactiva una de las dos.', { err: true }); if (state.view !== 'work' || state.mode !== 'org') setMode('org'); setTab('dl'); return false; }
  if (s.ok) return true;
  if (state.mode !== 'org' || state.view !== 'work') setMode('org');
  setTab('dl'); $('#pwMsg').textContent = s.msg; $('#pwMsg').className = 'pwmsg bad';
  toast('No se ha descargado: ' + s.msg.charAt(0).toLowerCase() + s.msg.slice(1), { err: true });
  setTimeout(() => { $('#sPw').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#pw1').focus({ preventScroll: true }); }, 80);
  return false;
}
function syncPw() {
  const s = pwState(); const m = $('#pwMsg');
  if (!s.on) m.textContent = ''; else if (s.ok) { m.textContent = 'Lista: los PDF se descargarán protegidos.'; m.className = 'pwmsg good'; }
  else if ($('#pw1').value || $('#pw2').value) { m.textContent = s.msg; m.className = 'pwmsg bad'; } else m.textContent = '';
  const signed = !!state.cert;
  $('#bSave').innerHTML = '<svg class="i" viewBox="0 0 24 24">' + (signed ? '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="m9 12 2 2 4-4"/>' : s.on ? '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>' : '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>') + '</svg>' + (signed ? 'Descargar PDF firmado' : s.on ? 'Descargar PDF protegido' : 'Descargar PDF');
  $('.dllbl').textContent = signed ? 'Descargar firmado' : s.on ? 'Descargar protegido' : 'Descargar';
}
$('#pwOn').addEventListener('change', e => { $('#sPw').toggleAttribute('data-off', !e.target.checked); syncPw(); if (e.target.checked) setTimeout(() => $('#pw1').focus(), 30); });
$('#pw1').addEventListener('input', syncPw); $('#pw2').addEventListener('input', syncPw);
$('#pwEye').onclick = () => { const show = $('#pw1').type === 'password'; $('#pw1').type = $('#pw2').type = show ? 'text' : 'password'; $('#pwEye').setAttribute('aria-label', show ? 'Ocultar la contraseña' : 'Mostrar la contraseña'); };
async function exportList(list, filename) {
  finishEdit(); if (!list.length) return; if (!pwGuard()) return;
  await busy(list.length > 20 ? 'Preparando ' + list.length + ' páginas…' : 'Preparando el PDF…');
  let bytes; try { bytes = await buildPdf(list); } catch (e) { unbusy(); if (!e.quiet) console.error(e); if (e.quiet) toast(e.message); else toast((state.cert ? '' : 'No se ha podido crear el PDF. ') + (e.message || e), { err: true }); return; }
  unbusy(); await offerFile(filename, bytes);
  if (lastBuild.rebuilt) toast((lastBuild.rebuilt === 1 ? '1 página dañada se ha guardado' : lastBuild.rebuilt + ' páginas dañadas se han guardado') + ' como imagen para poder recuperarla' + (lastBuild.rebuilt === 1 ? '' : 's') + '.');
  if ($('#cmpOn').checked) {
    const orig = [...new Set(list.map(p => p.srcId))].reduce((a, id) => a + state.sources.get(id).bytes.length, 0);
    toast(bytes.length < orig ? 'Tamaño: ' + fmtSize(orig) + ' → ' + fmtSize(bytes.length) + ' (' + Math.round((1 - bytes.length / orig) * 100) + ' % menos).' : 'Este PDF ya estaba optimizado: no se ha podido reducir más (' + fmtSize(bytes.length) + ').');
  }
}
const outName = (suffix = '') => baseName() + suffix + (state.cert ? '-firmado' : '') + '.pdf';
$('#bSave').onclick = () => exportList(state.pages, outName());
$('#bDownload').onclick = () => exportList(state.pages, outName());
$('#bSaveSel').onclick = () => exportList(state.pages.filter(p => state.sel.has(p.key)), outName('-seleccion'));
$('#bSplit').onclick = async () => {
  const n = state.pages.length; if (!n) return; if (!pwGuard()) return; let ranges;
  try { ranges = splitRanges(); } catch (e) { toast(e.message, { err: true }); return; }
  const base = baseName(), pad = String(n).length, files = [];
  try {
    for (let r = 0; r < ranges.length; r++) {
      const [a, b] = ranges[r]; await busy('Creando el archivo ' + (r + 1) + ' de ' + ranges.length + '…');
      const pa = String(a).padStart(pad, '0'), pb = String(b).padStart(pad, '0');
      files.push({ name: base + '_' + (a === b ? 'p' + pa : 'p' + pa + '-' + pb) + (state.cert ? '-firmado' : '') + '.pdf', data: await buildPdf(state.pages.slice(a - 1, b)) });
    }
  } catch (e) { unbusy(); console.error(e); toast('No se ha podido separar el documento. ' + (e.message || e), { err: true }); return; }
  unbusy();
  if (files.length === 1) await offerFile(files[0].name, files[0].data); else await offerFile(base + '_separado.zip', makeZip(files));
};
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder(); const parts = [], central = []; let off = 0; const d = new Date();
  const tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const nm = enc.encode(f.name), data = f.data, crc = crc32(data); const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(10, tm, true); h.setUint16(12, dt, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(12, tm, true); c.setUint16(14, dt, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + data.length;
  }
  const cs = central.reduce((s, x) => s + x.length, 0); const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
