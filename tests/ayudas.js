// Utilidades comunes de las pruebas: crear PDF de ejemplo, abrir archivos en la app y leer lo descargado.
const fs = require('fs');
const { PDFDocument } = require('../public/vendor/pdf-lib.min.js');

/** Crea un PDF de `n` páginas A4 con el texto «<etiqueta> <número>» en cada una. */
async function crearPdf(n, etiqueta = 'Pagina') {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([595, 842]).drawText(`${etiqueta} ${i + 1}`, { x: 50, y: 700, size: 24 });
  return Buffer.from(await doc.save());
}

/** PNG de 1 × 1 píxel. */
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** Abre la app, registra los errores de la página y devuelve la lista donde se van guardando. */
async function abrirApp(page) {
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await page.goto('/');
  return errores;
}

/** Añade archivos desde la pantalla de inicio y espera a que aparezcan `paginas` miniaturas. */
async function abrirArchivos(page, archivos, paginas) {
  await page.setInputFiles('#hubFile', archivos.map(a => ({ name: a.nombre, mimeType: a.tipo || 'application/pdf', buffer: a.datos })));
  await page.waitForFunction(n => document.querySelectorAll('#grid .card[data-key]').length === n, paginas);
}

/** Pulsa algo que provoca una descarga y devuelve { nombre, datos }. */
async function descargar(page, accion) {
  const [descarga] = await Promise.all([page.waitForEvent('download'), accion()]);
  return { nombre: descarga.suggestedFilename(), datos: fs.readFileSync(await descarga.path()) };
}

/** Lee un .zip sin compresión (el que genera la app) y devuelve [{ nombre, datos }]. */
function leerZip(buf) {
  const salida = [];
  let p = 0;
  while (p + 30 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const tam = buf.readUInt32LE(p + 18), nNombre = buf.readUInt16LE(p + 26), nExtra = buf.readUInt16LE(p + 28);
    const nombre = buf.slice(p + 30, p + 30 + nNombre).toString('utf8');
    const ini = p + 30 + nNombre + nExtra;
    salida.push({ nombre, datos: buf.slice(ini, ini + tam) });
    p = ini + tam;
  }
  return salida;
}

/** Texto de cada página de un PDF, leído con el pdf.js de la propia app. */
async function textoDePaginas(page, datos) {
  return page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const textos = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const contenido = await (await pdf.getPage(i)).getTextContent();
      textos.push(contenido.items.map(x => x.str).join(' '));
    }
    return textos;
  }, datos.toString('base64'));
}

module.exports = { PDFDocument, crearPdf, PNG_1X1, abrirApp, abrirArchivos, descargar, leerZip, textoDePaginas };
