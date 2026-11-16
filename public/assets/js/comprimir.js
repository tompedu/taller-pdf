/* Taller PDF · Compresión de las imágenes del PDF y exportación de páginas como JPG. */
'use strict';

/* ---- comprimir ---- */
let lastBuild = { rebuilt: 0, saved: 0 };
const CMP = { low: { max: 2400, q: 0.85 }, mid: { max: 1750, q: 0.72 }, high: { max: 1200, q: 0.55 } };
const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
async function compressImages(doc, lv) {
  const { PDFName, PDFRawStream, PDFNumber, PDFArray, PDFDict, decodePDFRawStream } = PDFLib;
  const N = n => PDFName.of(n); const ctx = doc.context; let saved = 0;
  const num = v => (v && v.asNumber) ? v.asNumber() : 0;
  const objs = ctx.enumerateIndirectObjects();
  const masks = new Set();
  for (const [, o] of objs) if (o instanceof PDFRawStream) { const m = o.dict.get(N('SMask')) || o.dict.get(N('Mask')); if (m && m.tag) masks.add(m.tag); }
  for (const [ref, o] of objs) {
    try {
      if (!(o instanceof PDFRawStream) || masks.has(ref.tag)) continue;
      const d = o.dict; if (String(d.get(N('Subtype'))) !== '/Image') continue;
      if (String(d.lookup(N('ImageMask')) || '') === 'true' || d.has(N('Decode'))) continue;
      const w = num(d.lookup(N('Width'))), h = num(d.lookup(N('Height'))), bpc = num(d.lookup(N('BitsPerComponent')));
      if (!w || !h || w * h < 250000) continue;
      const f = d.lookup(N('Filter')); const filters = f instanceof PDFArray ? f.asArray().map(String) : f ? [String(f)] : [];
      const cs = d.lookup(N('ColorSpace')); let comps = 0;
      if (cs instanceof PDFArray && String(cs.get(0)) === '/ICCBased') { const icc = cs.lookup(1); comps = num(icc && icc.dict && icc.dict.lookup(N('N'))); }
      else if (String(cs) === '/DeviceRGB') comps = 3; else if (String(cs) === '/DeviceGray') comps = 1;
      if (comps !== 1 && comps !== 3) continue;
      const scale = Math.min(1, lv.max / Math.max(w, h)); const nw = Math.max(1, Math.round(w * scale)), nh = Math.max(1, Math.round(h * scale));
      const c = document.createElement('canvas'); c.width = nw; c.height = nh; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, nw, nh);
      const PRE = ['/ASCII85Decode', '/ASCIIHexDecode', '/FlateDecode', '/LZWDecode', '/RunLengthDecode'];
      const decodeWith = fl => { const td = ctx.obj({}); if (fl.length) td.set(N('Filter'), ctx.obj(fl.map(x => N(x.slice(1))))); return decodePDFRawStream(PDFRawStream.of(td, o.contents)).decode(); };
      const last = filters[filters.length - 1], before = filters.slice(0, -1);
      if (last === '/DCTDecode' && before.every(x => PRE.includes(x)) && !d.has(N('DecodeParms'))) {
        const jpg = before.length ? decodeWith(before) : o.contents;
        const bmp = await decodeImage(new Blob([jpg], { type: 'image/jpeg' })); g.drawImage(bmp.src, 0, 0, nw, nh); bmp.close();
      } else if (filters.length && filters.every(x => PRE.includes(x)) && bpc === 8 && !d.has(N('DecodeParms'))) {
        const raw = decodeWith(filters); if (raw.length < w * h * comps) continue;
        const src = document.createElement('canvas'); src.width = w; src.height = h; const sg = src.getContext('2d'); const id = sg.createImageData(w, h); const px = id.data;
        for (let i = 0, j = 0; i < w * h; i++, j += comps) { const k = i * 4; if (comps === 3) { px[k] = raw[j]; px[k + 1] = raw[j + 1]; px[k + 2] = raw[j + 2]; } else { px[k] = px[k + 1] = px[k + 2] = raw[j]; } px[k + 3] = 255; }
        sg.putImageData(id, 0, 0); g.drawImage(src, 0, 0, nw, nh);
      } else continue;
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', lv.q)); freeCanvas(c); if (!blob) continue;
      const nb = new Uint8Array(await blob.arrayBuffer());
      if (nb.length >= o.contents.length * 0.9) continue;
      const nd = ctx.obj({ Type: 'XObject', Subtype: 'Image', ColorSpace: 'DeviceRGB', Filter: 'DCTDecode' });
      nd.set(N('Width'), PDFNumber.of(nw)); nd.set(N('Height'), PDFNumber.of(nh)); nd.set(N('BitsPerComponent'), PDFNumber.of(8)); nd.set(N('Length'), PDFNumber.of(nb.length));
      for (const k of ['SMask', 'Mask', 'Interpolate', 'Intent']) { const v = d.get(N(k)); if (v) nd.set(N(k), v); }
      ctx.assign(ref, PDFRawStream.of(nd, nb)); saved += o.contents.length - nb.length;
    } catch (e) { console.warn('Imagen sin comprimir', e); }
  }
  return saved;
}
$('#cmpOn').addEventListener('change', e => { $('#sCmp').toggleAttribute('data-off', !e.target.checked); });

/* ---- páginas como imágenes ---- */
async function exportImages(list) {
  finishEdit(); if (!list.length) return;
  const base = baseName(), pad = String(list.length).length, files = [];
  try {
    for (let i = 0; i < list.length; i++) {
      await busy('Convirtiendo la página ' + (i + 1) + ' de ' + list.length + '…');
      const pg = list[i]; const p = await state.sources.get(pg.srcId).doc.getPage(pg.idx + 1);
      const [Dw, Dh] = dispDims(pg); let sc = 150 / 72; if (Dw * Dh * sc * sc > 20e6) sc = Math.sqrt(20e6 / (Dw * Dh));
      const vp = p.getViewport({ scale: sc, rotation: totalRot(pg) }); const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await p.render({ canvasContext: g, viewport: vp }).promise;
      if (pg.items.length) { // añadir lo editado encima, dibujado por el propio motor de exportación
        const tmp = await PDFDocument.create(); const tp = tmp.addPage([Dw, Dh]);
        await drawItems(tmp, tp, pg, 0, frameOf(tp, 0, { x: 0, y: 0, width: Dw, height: Dh }), { fonts: { helv: await tmp.embedFont(StandardFonts.Helvetica), helvb: await tmp.embedFont(StandardFonts.HelveticaBold) }, imgs: new Map() });
        const td = await pdfjs.getDocument({ data: await tmp.save(), isEvalSupported: false }).promise; const tpage = await td.getPage(1);
        const oc = document.createElement('canvas'); oc.width = c.width; oc.height = c.height;
        await tpage.render({ canvasContext: oc.getContext('2d'), viewport: tpage.getViewport({ scale: c.width / Dw }), background: 'rgba(0,0,0,0)' }).promise;
        g.drawImage(oc, 0, 0);
      }
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
      files.push({ name: base + '_p' + String(i + 1).padStart(pad, '0') + '.jpg', data: new Uint8Array(await blob.arrayBuffer()) });
    }
  } catch (e) { unbusy(); console.error(e); toast('No se han podido crear las imágenes. ' + (e.message || e), { err: true }); return; }
  unbusy();
  if (files.length === 1) await offerFile(files[0].name, files[0].data); else await offerFile(base + '_imagenes.zip', makeZip(files));
}
$('#bToImg').onclick = () => exportImages(state.pages);
