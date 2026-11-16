/* Taller PDF · Escáner de documentos: detección de bordes, enderezado y acabado en color o blanco y negro. */
'use strict';

/* ---- escáner de documentos ---- */
const scan = { mode: 'color', pages: [], src: null, quad: null, view: 1 };
const scanModal = $('#scanModal');


function openScanner() { scan.pages = []; scanModal.hidden = false; document.body.classList.add('noscroll'); scanStep('start'); }
function closeScanner(force) {
  if (!force && scan.pages.length) { scanStep('confirmClose'); return; }
  scanModal.hidden = true; document.body.classList.remove('noscroll');
  scan.pages.forEach(p => { if (p.src && p.src !== scan.src) freeCanvas(p.src); }); if (!scan.pages.length) freeCanvas(scan.src); scan.src = null;
}
function scanCountText() { $('#scanCount').textContent = scan.pages.length ? (scan.pages.length === 1 ? '1 página' : scan.pages.length + ' páginas') : ''; }
function modeSeg() { return '<span class="seg scanmode" role="group" aria-label="Tipo de escaneo">' + [['color', 'Color'], ['gray', 'Grises'], ['bw', 'Blanco y negro']].map(([v, l]) => '<button data-smode="' + v + '" aria-pressed="' + (scan.mode === v) + '">' + l + '</button>').join('') + '</span>'; }
function scanStep(st) {
  scan.step = st; scanCountText();
  $('#scanStart').hidden = st !== 'start'; $('#scanAdj').hidden = st !== 'adjust'; $('#scanRes').hidden = !(st === 'result' || st === 'confirmClose');
  $$('#scanStart [data-smode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.smode === scan.mode));
  const f = $('#scanFoot');
  if (st === 'start') f.innerHTML = scan.pages.length ? '<button class="btn" data-sact="back">Volver</button>' : '';
  else if (st === 'adjust') f.innerHTML = '<button class="btn" data-sact="retake">Repetir foto</button><button class="btn" data-sact="rotate" title="Girar 90°"><svg class="i" viewBox="0 0 24 24"><path d="M21 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.2-9.4L21 10"/></svg>Girar</button>' + modeSeg() + '<span class="sp"></span><button class="btn primary" data-sact="apply">Recortar</button>';
  else if (st === 'result') f.innerHTML = '<button class="btn" data-sact="redo">Ajustar de nuevo</button>' + modeSeg() + '<span class="sp"></span><label class="btn filebtn"><svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Otra página<input type="file" accept="image/*" capture="environment" data-sinput="cam"></label><button class="btn primary" data-sact="finish">Terminar y editar</button>';
  else if (st === 'confirmClose') f.innerHTML = '<span style="font-size:13.5px;margin-right:auto">¿Salir sin guardar ' + (scan.pages.length === 1 ? 'la página escaneada' : 'las ' + scan.pages.length + ' páginas escaneadas') + '?</span><button class="btn" data-sact="stay">Seguir escaneando</button><button class="btn danger" data-sact="discard">Salir sin guardar</button>';
  if (st === 'result') renderScanThumbs();
}
function renderScanThumbs() {
  const cur = scan.pages[scan.pages.length - 1]; if (cur) $('#scanOut').src = cur.url;
  $('#scanThumbs').innerHTML = scan.pages.map((p, i) => '<img src="' + p.url + '" alt="Página ' + (i + 1) + '" class="' + (i === scan.pages.length - 1 ? 'cur' : '') + '">').join('');
}
async function loadScanSource(file) {
  const bmp = await decodeImage(file);
  const k = Math.min(1, (IS_IOS ? 2400 : 3200) / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp.src, 0, 0, c.width, c.height); bmp.close();
  return c;
}
// --- detección del documento: umbral de Otsu + mayor zona clara + envolvente convexa reducida a 4 esquinas
function detectQuad(src) {
  const W = src.width, H = src.height, k = 420 / Math.max(W, H), w = Math.round(W * k), h = Math.round(H * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data; let gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const blur = a => { const o = new Float32Array(w * h), r = 2; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) { s += a[y * w + xx]; n++; } } o[y * w + x] = s / n; } const o2 = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy >= 0 && yy < h) { s += o[yy * w + x]; n++; } } o2[y * w + x] = s / n; } return o2; };
  gray = blur(gray);
  const hist = new Array(256).fill(0); for (const v of gray) hist[Math.min(255, v | 0)]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, t = 128; const N = w * h;
  for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = N - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; t = i; } }
  // umbral más bajo para no perder las zonas del papel que están en sombra
  { let n0 = 0, s0 = 0; for (let i = 0; i <= t; i++) { n0 += hist[i]; s0 += i * hist[i]; } const mDark = n0 ? s0 / n0 : 0; t = Math.round(mDark + (t - mDark) * 0.45); }
  const lab = new Int32Array(N).fill(-1); let bestLab = -1, bestSize = 0; const q = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    if (lab[i] !== -1 || gray[i] <= t) continue;
    let head = 0, tail = 0, size = 0; q[tail++] = i; lab[i] = i;
    while (head < tail) { const p = q[head++]; size++; const x = p % w, y = (p / w) | 0;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const n of nb) if (n >= 0 && lab[n] === -1 && gray[n] > t) { lab[n] = i; q[tail++] = n; } }
    if (size > bestSize) { bestSize = size; bestLab = i; }
  }
  if (bestSize < N * 0.12 || bestSize > N * 0.97) return null;
  const pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (lab[p] !== bestLab) continue; if (x === 0 || x === w - 1 || y === 0 || y === h - 1 || lab[p - 1] !== bestLab || lab[p + 1] !== bestLab || lab[p - w] !== bestLab || lab[p + w] !== bestLab) pts.push([x, y]); }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = []; for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  let hull = lo.slice(0, -1).concat(up.slice(0, -1)); if (hull.length < 4) return null;
  while (hull.length > 4) { let mi = 0, ma = Infinity; for (let i = 0; i < hull.length; i++) { const a = hull[(i - 1 + hull.length) % hull.length], b = hull[i], c2 = hull[(i + 1) % hull.length]; const ar = Math.abs(cross(a, b, c2)); if (ar < ma) { ma = ar; mi = i; } } hull.splice(mi, 1); }
  const area = Math.abs(hull.reduce((a, p, i) => a + p[0] * hull[(i + 1) % 4][1] - hull[(i + 1) % 4][0] * p[1], 0)) / 2;
  if (area < N * 0.12) return null;
  const cx = hull.reduce((a, p) => a + p[0], 0) / 4, cy = hull.reduce((a, p) => a + p[1], 0) / 4;
  return orderQuad(hull.map(p => [(p[0] + (cx - p[0]) * 0.012) / k, (p[1] + (cy - p[1]) * 0.012) / k]));
}
function orderQuad(p) {
  const s = p.map(a => a[0] + a[1]), df = p.map(a => a[0] - a[1]);
  const tl = p[s.indexOf(Math.min(...s))], br = p[s.indexOf(Math.max(...s))], tr = p[df.indexOf(Math.max(...df))], bl = p[df.indexOf(Math.min(...df))];
  return [tl, tr, br, bl];
}
const defaultQuad = (W, H) => [[W * .06, H * .06], [W * .94, H * .06], [W * .94, H * .94], [W * .06, H * .94]];
// --- homografía y enderezado
function homography(src, dst) { // matriz que lleva dst -> src
  const A = [], b = [];
  for (let i = 0; i < 4; i++) { const [x, y] = dst[i], [u, v] = src[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
  for (let c = 0; c < 8; c++) { let piv = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r; [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k2 = c; k2 < 8; k2++) A[r][k2] -= f * A[c][k2]; b[r] -= f * b[c]; } }
  return b.map((v, i) => v / A[i][i]);
}
function warp(srcCanvas, quad) {
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let ow = Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2])), oh = Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]));
  const k = Math.min(1, (IS_IOS ? 2200 : 2480) / Math.max(ow, oh)); ow = Math.max(10, Math.round(ow * k)); oh = Math.max(10, Math.round(oh * k));
  const Hm = homography(quad, [[0, 0], [ow, 0], [ow, oh], [0, oh]]);
  const sw = srcCanvas.width, sh = srcCanvas.height, sd = srcCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
  const out = document.createElement('canvas'); out.width = ow; out.height = oh; const og = out.getContext('2d'); const od = og.createImageData(ow, oh); const o = od.data;
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const den = Hm[6] * x + Hm[7] * y + 1, sx = (Hm[0] * x + Hm[1] * y + Hm[2]) / den, sy = (Hm[3] * x + Hm[4] * y + Hm[5]) / den;
    const x0 = Math.max(0, Math.min(sw - 2, sx | 0)), y0 = Math.max(0, Math.min(sh - 2, sy | 0)), fx = Math.min(1, Math.max(0, sx - x0)), fy = Math.min(1, Math.max(0, sy - y0));
    const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4, j = (y * ow + x) * 4;
    for (let ch = 0; ch < 3; ch++) o[j + ch] = (sd[i00 + ch] * (1 - fx) + sd[i10 + ch] * fx) * (1 - fy) + (sd[i01 + ch] * (1 - fx) + sd[i11 + ch] * fx) * fy;
    o[j + 3] = 255;
  }
  og.putImageData(od, 0, 0); return out;
}
// --- acabado: color realzado o blanco y negro (umbral adaptativo)
// Fondo del papel: se reduce la imagen, se borra el texto con un filtro de máximo y se suaviza.
// Dividir por ese fondo quita sombras y luz desigual y deja el papel blanco.
function paperBackground(c) {
  const w = c.width, h = c.height, f = Math.max(4, Math.round(Math.max(w, h) / 160));
  const sw = Math.max(8, Math.round(w / f)), sh = Math.max(8, Math.round(h / f));
  const sc = document.createElement('canvas'); sc.width = sw; sc.height = sh; const sg = sc.getContext('2d', { willReadFrequently: true });
  sg.imageSmoothingQuality = 'high'; sg.drawImage(c, 0, 0, sw, sh);
  const id = sg.getImageData(0, 0, sw, sh), d = id.data, tmp = new Uint8ClampedArray(d.length);
  const maxPass = (src, dst, r, horiz) => { for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const j = (y * sw + x) * 4; let m0 = 0, m1 = 0, m2 = 0;
    for (let k = -r; k <= r; k++) { const xx = horiz ? Math.min(sw - 1, Math.max(0, x + k)) : x, yy = horiz ? y : Math.min(sh - 1, Math.max(0, y + k)); const i = (yy * sw + xx) * 4; if (src[i] > m0) m0 = src[i]; if (src[i + 1] > m1) m1 = src[i + 1]; if (src[i + 2] > m2) m2 = src[i + 2]; }
    dst[j] = m0; dst[j + 1] = m1; dst[j + 2] = m2; dst[j + 3] = 255; } };
  const r = 3; maxPass(d, tmp, r, true); maxPass(tmp, d, r, false);
  // desenfoque en JavaScript (3 pasadas de caja ≈ gaussiano); ctx.filter no existe en Safari antiguo
  const br = Math.max(1, Math.round(Math.max(2, Math.round(sw / 70)) * 0.9));
  const boxPass = (src, dst, r, horiz) => { const len = horiz ? sw : sh, lines = horiz ? sh : sw;
    for (let l = 0; l < lines; l++) for (let ch = 0; ch < 3; ch++) { let acc = 0;
      const at = q => { q = q < 0 ? 0 : q >= len ? len - 1 : q; return ((horiz ? l * sw + q : q * sw + l) * 4) + ch; };
      for (let q = -r; q <= r; q++) acc += src[at(q)];
      for (let q = 0; q < len; q++) { dst[at(q)] = acc / (2 * r + 1); acc += src[at(q + r + 1)] - src[at(q - r)]; } } };
  for (let it = 0; it < 3; it++) { boxPass(d, tmp, br, true); boxPass(tmp, d, br, false); }
  sg.putImageData(id, 0, 0);
  const big = document.createElement('canvas'); big.width = w; big.height = h; const g = big.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(sc, 0, 0, w, h);
  const out = g.getImageData(0, 0, w, h).data; freeCanvas(big); freeCanvas(sc);
  return out;
}
function finish(c, mode) {
  const w = c.width, h = c.height, g = c.getContext('2d', { willReadFrequently: true }), id = g.getImageData(0, 0, w, h), d = id.data, N = w * h;
  const bgd = paperBackground(c);
  // 1) normalizar la iluminación (papel -> blanco)
  for (let i = 0; i < N; i++) { const j = i * 4; for (let ch = 0; ch < 3; ch++) { const b = Math.max(40, bgd[j + ch]); d[j + ch] = Math.min(255, d[j + ch] * 255 / b * 1.02); } }
  if (mode === 'bw') {
    const gray = new Uint8ClampedArray(N); const hist = new Uint32Array(256);
    for (let i = 0; i < N; i++) { const v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; gray[i] = v; hist[gray[i]]++; }
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, t = 170; for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = N - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; t = i; } }
    t = Math.min(215, Math.max(140, t + 12)); const lo = t - 22, hi = t + 10;
    const out = new Uint8ClampedArray(N);
    for (let i = 0; i < N; i++) { const v = gray[i]; out[i] = v <= lo ? 0 : v >= hi ? 255 : (v - lo) * 255 / (hi - lo); }
    // quitar motas sueltas
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (out[i] < 128) { let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && out[i + dy * w + dx] < 128) n++; if (n === 0) out[i] = 255; } }
    for (let i = 0; i < N; i++) { const j = i * 4; d[j] = d[j + 1] = d[j + 2] = out[i]; }
  } else {
    // 2) niveles: blancos limpios, texto más negro
    const BP = 55, WP = 236, gam = 1.35, lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(Math.min(1, Math.max(0, (v - BP) / (WP - BP))), gam);
    for (let i = 0; i < N; i++) { const j = i * 4;
      let r = lut[d[j]], gg = lut[d[j + 1]], b = lut[d[j + 2]];
      if (mode === 'gray') { const y = 0.299 * r + 0.587 * gg + 0.114 * b; r = gg = b = y; }
      else { const y = 0.299 * r + 0.587 * gg + 0.114 * b, sat = 1.25; r = y + (r - y) * sat; gg = y + (gg - y) * sat; b = y + (b - y) * sat; }
      d[j] = r; d[j + 1] = gg; d[j + 2] = b; }
    // 3) enfoque suave (máscara de desenfoque 3x3)
    const src = new Uint8ClampedArray(d), amt = 0.55;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const j = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) { let s9 = 0; for (let dy = -1; dy <= 1; dy++) { const r0 = j + dy * w * 4 + ch; s9 += src[r0 - 4] + src[r0] + src[r0 + 4]; } d[j + ch] = src[j + ch] + amt * (src[j + ch] - s9 / 9); } }
  }
  g.putImageData(id, 0, 0); return c;
}
// --- vista de ajuste
function drawScanAdjust() {
  const cv = $('#scanCanvas'), src = scan.src, stage = $('#scanStage');
  const maxW = Math.max(200, stage.clientWidth - 28), maxH = Math.max(200, stage.clientHeight - 28);
  const k = Math.min(1, maxW / src.width, maxH / src.height, 1400 / Math.max(src.width, src.height));
  cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k); cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px';
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height); scan.view = k; drawQuad();
}
function drawQuad() {
  const k = scan.view, p = scan.quad.map(a => [a[0] * k, a[1] * k]); const svg = $('#scanSvg');
  svg.setAttribute('viewBox', '0 0 ' + $('#scanCanvas').width + ' ' + $('#scanCanvas').height);
  svg.innerHTML = '<path d="M0 0H' + $('#scanCanvas').width + 'V' + $('#scanCanvas').height + 'H0Z M' + p.map(a => a.join(' ')).join(' L') + 'Z" fill="rgba(10,16,30,.45)" fill-rule="evenodd"/>' +
    '<polygon points="' + p.map(a => a.join(',')).join(' ') + '" fill="rgba(47,111,237,.10)" stroke="#2F6FED" stroke-width="2.5"/>' +
    p.map((a, i) => '<g class="hdl" data-c="' + i + '"><circle cx="' + a[0] + '" cy="' + a[1] + '" r="22" fill="transparent"/><circle cx="' + a[0] + '" cy="' + a[1] + '" r="9" fill="#fff" stroke="#2F6FED" stroke-width="3"/></g>').join('');
}
let sdrag = null;
$('#scanSvg').addEventListener('pointerdown', e => {
  const h = e.target.closest('.hdl'); if (!h) return; e.preventDefault();
  sdrag = { i: +h.dataset.c }; $('#scanSvg').setPointerCapture(e.pointerId); $('#scanLoupe').hidden = false; moveHandle(e);
});
function moveHandle(e) {
  const cv = $('#scanCanvas'), r = cv.getBoundingClientRect(); const sx = cv.width / r.width;
  const x = clamp((e.clientX - r.left) * sx, 0, cv.width), y = clamp((e.clientY - r.top) * sx, 0, cv.height);
  scan.quad[sdrag.i] = [x / scan.view, y / scan.view]; drawQuad();
  const L = $('#scanLoupe'), lg = L.getContext('2d'), z = 2.5, half = 120 / z;
  lg.fillStyle = '#000'; lg.fillRect(0, 0, 240, 240);
  lg.drawImage(cv, x - half / 1, y - half / 1, half * 2, half * 2, 0, 0, 240, 240);
  lg.strokeStyle = '#2F6FED'; lg.lineWidth = 3; lg.beginPath(); lg.moveTo(120, 96); lg.lineTo(120, 144); lg.moveTo(96, 120); lg.lineTo(144, 120); lg.stroke();
  const ly = (y / sx) > 150 ? (y / sx) - 150 : (y / sx) + 40; L.style.left = clamp(x / sx - 60, 0, r.width - 120) + 'px'; L.style.top = ly + 'px';
}
$('#scanSvg').addEventListener('pointermove', e => { if (sdrag) moveHandle(e); });
const endSdrag = () => { sdrag = null; $('#scanLoupe').hidden = true; };
$('#scanSvg').addEventListener('pointerup', endSdrag); $('#scanSvg').addEventListener('pointercancel', endSdrag);
// --- flujo
async function scanFiles(files) {
  files = [...files].filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(f.name)); if (!files.length) return;
  scan.queue = files.slice(1); await scanLoad(files[0]);
}
async function scanLoad(file) {
  await busy('Buscando el documento…');
  try { scan.src = await loadScanSource(file); }
  catch (err) { unbusy(); toast(err && /HEIC/.test(err.message) ? err.message : 'No se ha podido leer la foto. Prueba de nuevo o elige otra.', { err: true }); return; }
  const q = detectQuad(scan.src); scan.quad = q || defaultQuad(scan.src.width, scan.src.height);
  unbusy(); scanStep('adjust'); requestAnimationFrame(drawScanAdjust);
  $('#scanHint').textContent = q ? 'Revisa las esquinas azules: si no coinciden con el documento, arrástralas.' : 'No hemos encontrado los bordes: arrastra las esquinas azules hasta las esquinas del documento.';
}
async function scanApply() {
  await busy('Enderezando la página…');
  await new Promise(r => setTimeout(r, 20));
  let out, blob;
  try {
    const flat = warp(scan.src, scan.quad);
    $('#busyMsg').textContent = 'Mejorando la imagen…'; await new Promise(r => setTimeout(r, 20));
    out = finish(flat, scan.mode);
    blob = await new Promise(r => scan.mode === 'bw' ? out.toBlob(r, 'image/png') : out.toBlob(r, 'image/jpeg', 0.88));
    if (!blob) throw new Error('sin memoria');
  } catch (err) { console.error(err); unbusy(); toast('No se ha podido procesar la foto en este dispositivo. Prueba con una foto más pequeña o termina el PDF con las páginas que ya tienes.', { err: true }); return; }
  // en iPhone/iPad la memoria para lienzos es limitada: solo la última página conserva la foto original
  if (scan.replace == null) scan.pages.forEach(p => { if (p.src && p.src !== scan.src) freeCanvas(p.src); p.src = null; });
  const page = { blob, url: URL.createObjectURL(blob), w: out.width, h: out.height, src: scan.src, quad: scan.quad.map(a => a.slice()), mode: scan.mode };
  if (scan.replace != null) { URL.revokeObjectURL(scan.pages[scan.replace].url); scan.pages[scan.replace] = page; scan.replace = null; } else scan.pages.push(page);
  freeCanvas(out); unbusy();
  if (scan.queue && scan.queue.length) { const f = scan.queue.shift(); await scanLoad(f); return; }
  scanStep('result');
}
async function scanFinish() {
  if (!scan.pages.length) return;
  await busy('Creando el PDF…');
  try {
    const pdf = await PDFDocument.create();
    for (const p of scan.pages) {
      const bytes = new Uint8Array(await p.blob.arrayBuffer()); const img = p.blob.type === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes); const ar = p.w / p.h;
      let pw, ph; if (ar > 0.55 && ar < 0.92) { pw = 595.28; ph = 841.89; } else if (ar > 1.09 && ar < 1.8) { pw = 841.89; ph = 595.28; } else if (ar < 1) { pw = 595.28; ph = pw / ar; } else { ph = 595.28; pw = ph * ar; }
      pdf.addPage([pw, ph]).drawImage(img, { x: 0, y: 0, width: pw, height: ph });
    }
    const d = new Date(), name = 'escaneo-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const added = await addPdfSource(name + '.pdf', new Uint8Array(await pdf.save()));
    const first = !state.pages.length; if (!first) pushHist();
    state.pages.push(...added); if (first || $('#docName').dataset.touched !== '1') $('#docName').value = first ? name : 'documento-unido';
    unbusy(); scan.pages.forEach(p => URL.revokeObjectURL(p.url)); scan.pages = []; closeScanner(true);
    setMode('edit'); renderAll(); state.current = added[0].key; setTimeout(() => scrollToPage(added[0].key), 120);
    toast(added.length === 1 ? 'Página escaneada. Ya puedes editarla, firmarla o descargarla.' : added.length + ' páginas escaneadas. Ya puedes editarlas, firmarlas o descargarlas.');
  } catch (e) { unbusy(); console.error(e); toast('No se ha podido crear el PDF del escaneo. ' + (e.message || e), { err: true }); }
}
scanModal.addEventListener('click', async e => {
  const m = e.target.closest('[data-smode]');
  if (m) { scan.mode = m.dataset.smode; $$('[data-smode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.smode === scan.mode));
    if (scan.step === 'result' && scan.pages.length) { const p = scan.pages[scan.pages.length - 1]; scan.src = p.src; scan.quad = p.quad.map(a => a.slice()); scan.replace = scan.pages.length - 1; await scanApply(); }
    return; }
  const a = e.target.closest('[data-sact]'); if (!a) return; const act = a.dataset.sact;
  if (act === 'retake') { scan.src = null; scanStep('start'); setTimeout(() => $('#scanCam').click(), 50); }
  else if (act === 'rotate') { const s = scan.src, c = document.createElement('canvas'); c.width = s.height; c.height = s.width; const g = c.getContext('2d'); g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(s, 0, 0); scan.src = c; scan.quad = detectQuad(c) || defaultQuad(c.width, c.height); drawScanAdjust(); }
  else if (act === 'apply') scanApply();
  else if (act === 'redo') { const p = scan.pages[scan.pages.length - 1]; scan.src = p.src; scan.quad = p.quad.map(q => q.slice()); scan.replace = scan.pages.length - 1; scanStep('adjust'); requestAnimationFrame(drawScanAdjust); }
  else if (act === 'finish') scanFinish();
  else if (act === 'back') scanStep('result');
  else if (act === 'stay') scanStep('result');
  else if (act === 'discard') { scan.pages.forEach(p => URL.revokeObjectURL(p.url)); scan.pages = []; closeScanner(true); }
});
scanModal.addEventListener('change', e => { const i = e.target.closest('input[type=file]'); if (!i) return; const f = i.files; if (f && f.length) scanFiles(f); i.value = ''; });
$('#scanClose').onclick = () => closeScanner();
addEventListener('resize', () => { if (!scanModal.hidden && scan.step === 'adjust') drawScanAdjust(); });
$('#bScanHome').onclick = openScanner;
$('#miScan').onclick = () => { addMenu.hidden = true; openScanner(); };
