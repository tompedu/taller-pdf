// Pruebas de extremo a extremo de las operaciones principales de Taller PDF.
// Cada prueba abre la app en un navegador real, hace la operación y comprueba el archivo descargado.
const { test, expect } = require('@playwright/test');
const { PDFDocument, crearPdf, PNG_1X1, abrirApp, abrirArchivos, descargar, leerZip, textoDePaginas } = require('./ayudas');

test('la portada carga sin errores', async ({ page }) => {
  const errores = await abrirApp(page);
  await expect(page).toHaveTitle('Taller PDF');
  await expect(page.locator('h1')).toContainText('Edita tus PDF');
  expect(await page.evaluate(() => [!!window.PDFLib, !!window.pdfjsLib, !!window.Sortable])).toEqual([true, true, true]);
  expect(errores).toEqual([]);
});

test('unir: dos PDF se descargan como uno, con las páginas en orden', async ({ page }) => {
  const errores = await abrirApp(page);
  await abrirArchivos(page, [{ nombre: 'a.pdf', datos: await crearPdf(2, 'A') }, { nombre: 'b.pdf', datos: await crearPdf(3, 'B') }], 5);
  const { nombre, datos } = await descargar(page, () => page.click('#bSave'));
  expect(nombre).toMatch(/\.pdf$/);
  expect((await PDFDocument.load(datos)).getPageCount()).toBe(5);
  expect(await textoDePaginas(page, datos)).toEqual(['A 1', 'A 2', 'B 1', 'B 2', 'B 3']);
  expect(errores).toEqual([]);
});

test('separar: una página por archivo', async ({ page }) => {
  await abrirApp(page);
  await abrirArchivos(page, [{ nombre: 'doc.pdf', datos: await crearPdf(3) }], 3);
  await page.click('#tSplit');
  const { nombre, datos } = await descargar(page, () => page.click('#bSplit'));
  expect(nombre).toMatch(/_separado\.zip$/);
  const archivos = leerZip(datos);
  expect(archivos).toHaveLength(3);
  for (const a of archivos) expect((await PDFDocument.load(a.datos)).getPageCount()).toBe(1);
});

test('separar: cada 2 páginas', async ({ page }) => {
  await abrirApp(page);
  await abrirArchivos(page, [{ nombre: 'doc.pdf', datos: await crearPdf(5) }], 5);
  await page.click('#tSplit');
  await page.check('input[name="sm"][value="every"]');
  await page.fill('#everyN', '2');
  const { datos } = await descargar(page, () => page.click('#bSplit'));
  const paginas = [];
  for (const a of leerZip(datos)) paginas.push((await PDFDocument.load(a.datos)).getPageCount());
  expect(paginas).toEqual([2, 2, 1]);
});

test('separar: por rangos', async ({ page }) => {
  await abrirApp(page);
  await abrirArchivos(page, [{ nombre: 'doc.pdf', datos: await crearPdf(6) }], 6);
  await page.click('#tSplit');
  await page.check('input[name="sm"][value="ranges"]');
  await page.fill('#ranges', '1-4, 5-6');
  const { datos } = await descargar(page, () => page.click('#bSplit'));
  const paginas = [];
  for (const a of leerZip(datos)) paginas.push((await PDFDocument.load(a.datos)).getPageCount());
  expect(paginas).toEqual([4, 2]);
});

test('girar: las páginas seleccionadas se guardan giradas 90°', async ({ page }) => {
  await abrirApp(page);
  await abrirArchivos(page, [{ nombre: 'doc.pdf', datos: await crearPdf(2) }], 2);
  await page.click('#bAll');
  await page.click('#bRotR');
  const { datos } = await descargar(page, () => page.click('#bSave'));
  const doc = await PDFDocument.load(datos);
  const giros = doc.getPages().map(p => { const { width, height } = p.getSize(); const g = p.getRotation().angle % 180; return g === 90 || width > height; });
  expect(giros).toEqual([true, true]);
});

test('eliminar: la página borrada no aparece en la descarga', async ({ page }) => {
  await abrirApp(page);
  await abrirArchivos(page, [{ nombre: 'doc.pdf', datos: await crearPdf(3) }], 3);
  await page.locator('#grid .card[data-key]').nth(1).click();
  await page.click('#bDel');
  await page.waitForFunction(() => document.querySelectorAll('#grid .card[data-key]').length === 2);
  const { datos } = await descargar(page, () => page.click('#bSave'));
  expect(await textoDePaginas(page, datos)).toEqual(['Pagina 1', 'Pagina 3']);
});

test('proteger: el PDF descargado pide contraseña', async ({ page }) => {
  await abrirApp(page);
  await abrirArchivos(page, [{ nombre: 'doc.pdf', datos: await crearPdf(1) }], 1);
  await page.locator('#pwOn').check({ force: true });
  await page.fill('#pw1', 'clave-de-prueba');
  await page.fill('#pw2', 'clave-de-prueba');
  const { datos } = await descargar(page, () => page.click('#bSave'));
  await expect(PDFDocument.load(datos)).rejects.toThrow();
  const abierto = await PDFDocument.load(datos, { password: 'clave-de-prueba' });
  expect(abierto.getPageCount()).toBe(1);
});

test('proteger: no deja descargar si las contraseñas no coinciden', async ({ page }) => {
  await abrirApp(page);
  await abrirArchivos(page, [{ nombre: 'doc.pdf', datos: await crearPdf(1) }], 1);
  await page.locator('#pwOn').check({ force: true });
  await page.fill('#pw1', 'una');
  await page.fill('#pw2', 'otra');
  let descargas = 0;
  page.on('download', () => descargas++);
  await page.click('#bSave');
  await page.waitForTimeout(1500);
  expect(descargas).toBe(0);
});

test('numerar: añade «Página n de total» a cada página', async ({ page }) => {
  await abrirApp(page);
  await abrirArchivos(page, [{ nombre: 'doc.pdf', datos: await crearPdf(2, 'Hoja') }], 2);
  await page.click('#tStamp');
  await page.locator('#numOn').check({ force: true });
  await page.click('#tDl');
  const { datos } = await descargar(page, () => page.click('#bSave'));
  const textos = await textoDePaginas(page, datos);
  expect(textos[0]).toContain('Página 1 de 2');
  expect(textos[1]).toContain('Página 2 de 2');
});

test('marca de agua: el texto aparece en todas las páginas', async ({ page }) => {
  await abrirApp(page);
  await abrirArchivos(page, [{ nombre: 'doc.pdf', datos: await crearPdf(2, 'Hoja') }], 2);
  await page.click('#tStamp');
  await page.locator('#wmOn').check({ force: true });
  await page.fill('#wmText', 'BORRADOR');
  await page.click('#tDl');
  const { datos } = await descargar(page, () => page.click('#bSave'));
  for (const t of await textoDePaginas(page, datos)) expect(t).toContain('BORRADOR');
});

test('PDF a imágenes: un JPG por página dentro de un .zip', async ({ page }) => {
  await abrirApp(page);
  await abrirArchivos(page, [{ nombre: 'doc.pdf', datos: await crearPdf(2) }], 2);
  const { nombre, datos } = await descargar(page, () => page.click('#bToImg'));
  expect(nombre).toMatch(/_imagenes\.zip$/);
  const archivos = leerZip(datos);
  expect(archivos).toHaveLength(2);
  for (const a of archivos) {
    expect(a.nombre).toMatch(/\.jpg$/);
    expect(a.datos.slice(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  }
});

test('fotos: una imagen se convierte en un PDF de una página', async ({ page }) => {
  await abrirApp(page);
  await abrirArchivos(page, [{ nombre: 'foto.png', tipo: 'image/png', datos: PNG_1X1 }], 1);
  const { datos } = await descargar(page, () => page.click('#bSave'));
  expect((await PDFDocument.load(datos)).getPageCount()).toBe(1);
});

test('deshacer: recupera una página eliminada', async ({ page }) => {
  await abrirApp(page);
  await abrirArchivos(page, [{ nombre: 'doc.pdf', datos: await crearPdf(2) }], 2);
  await page.locator('#grid .card[data-key]').first().click();
  await page.click('#bDel');
  await page.waitForFunction(() => document.querySelectorAll('#grid .card[data-key]').length === 1);
  await page.click('#bUndo');
  await page.waitForFunction(() => document.querySelectorAll('#grid .card[data-key]').length === 2);
});

test('modo editar: abre el editor sin errores', async ({ page }) => {
  const errores = await abrirApp(page);
  await abrirArchivos(page, [{ nombre: 'doc.pdf', datos: await crearPdf(2) }], 2);
  await page.click('#mEdit');
  await expect(page.locator('#dock')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(errores).toEqual([]);
});

test('accesos directos: ?accion=escanear abre el escáner', async ({ page }) => {
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.goto('/?accion=escanear');
  await expect(page.locator('#scanModal')).toBeVisible();
  expect(errores).toEqual([]);
});

for (const accion of ['firmar', 'unir', 'editar']) {
  test(`accesos directos: ?accion=${accion} pide el archivo`, async ({ page }) => {
    const errores = [];
    page.on('pageerror', e => errores.push(String(e)));
    await page.goto('/?accion=' + accion);
    await expect(page.locator('#taskModal')).toBeVisible();
    expect(errores).toEqual([]);
  });
}

test('editar: el texto escrito sobre la página aparece en la descarga', async ({ page }) => {
  const errores = await abrirApp(page);
  await abrirArchivos(page, [{ nombre: 'doc.pdf', datos: await crearPdf(1) }], 1);
  await page.click('#mEdit');
  const hoja = page.locator('#pages .epage').first();
  await hoja.waitFor();
  await page.click('[data-tool="text"]');
  const caja = await hoja.boundingBox();
  await page.mouse.click(caja.x + caja.width / 2, caja.y + 300);
  await page.keyboard.type('Hola mundo');
  await page.keyboard.press('Escape');
  const { datos } = await descargar(page, () => page.click('#bDownload'));
  expect((await textoDePaginas(page, datos))[0]).toContain('Hola mundo');
  expect(errores).toEqual([]);
});

test('quitar contraseña: un PDF protegido se abre con su clave y se descarga sin ella', async ({ page }) => {
  await abrirApp(page);
  await abrirArchivos(page, [{ nombre: 'doc.pdf', datos: await crearPdf(2) }], 2);
  await page.locator('#pwOn').check({ force: true });
  await page.fill('#pw1', 'secreto');
  await page.fill('#pw2', 'secreto');
  const protegido = await descargar(page, () => page.click('#bSave'));

  await page.goto('/');
  await page.setInputFiles('#hubFile', [{ name: 'protegido.pdf', mimeType: 'application/pdf', buffer: protegido.datos }]);
  await expect(page.locator('#openPwModal')).toBeVisible();
  await page.fill('#opwInput', 'secreto');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('#grid .card[data-key]').length === 2);
  const libre = await descargar(page, () => page.click('#bSave'));
  expect((await PDFDocument.load(libre.datos)).getPageCount()).toBe(2);
});

test('carga lenta: la app arranca bien aunque los archivos lleguen despacio', async ({ page }) => {
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.route('**/assets/js/*.js*', async ruta => { await new Promise(r => setTimeout(r, 150)); await ruta.continue(); });
  await page.goto('/');
  await abrirArchivos(page, [{ nombre: 'doc.pdf', datos: await crearPdf(2) }], 2);
  const { datos } = await descargar(page, () => page.click('#bSave'));
  expect((await PDFDocument.load(datos)).getPageCount()).toBe(2);
  expect(errores).toEqual([]);
});
