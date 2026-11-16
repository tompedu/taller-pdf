/* Taller PDF · service worker: guarda la app en el dispositivo para que abra rápido y funcione sin conexión.
   Los documentos del usuario nunca se envían ni se guardan aquí (salvo, un instante, el archivo que se
   comparte con la app desde otra aplicación de Android, que se entrega a la página y se borra). */
const VERSION = '202611161200-modulos';
const CACHE = 'taller-pdf-' + VERSION;
const ASSETS = [
 "./",
 "assets/fonts.css?v=202611161200",
 "assets/app.css?v=202611161200",
 "vendor/pdf-lib.min.js",
 "vendor/pdf.min.js",
 "vendor/Sortable.min.js",
 "vendor/autoscript.js",
 "assets/js/config.js?v=202611161200",
 "assets/js/nucleo.js?v=202611161200",
 "assets/js/estado.js?v=202611161200",
 "assets/js/archivos.js?v=202611161200",
 "assets/js/ajustes.js?v=202611161200",
 "assets/js/elementos.js?v=202611161200",
 "assets/js/organizar.js?v=202611161200",
 "assets/js/editor.js?v=202611161200",
 "assets/js/firma.js?v=202611161200",
 "assets/js/autofirma.js?v=202611161200",
 "assets/js/escaner.js?v=202611161200",
 "assets/js/comprimir.js?v=202611161200",
 "assets/js/exportar.js?v=202611161200",
 "assets/js/render.js?v=202611161200",
 "assets/js/instalable.js?v=202611161200",
 "assets/js/inicio.js?v=202611161200",
 "favicon.svg",
 "manifest.webmanifest",
 "icons/sc-escanear.png",
 "icons/maskable-512.png",
 "icons/sc-firmar.png",
 "icons/sc-unir.png",
 "icons/sc-editar.png",
 "icons/icon-192.png",
 "icons/apple-touch-icon.png",
 "icons/icon-512.png",
 "fonts/caveat-latin-600-normal.woff2",
 "fonts/ibm-plex-mono-latin-ext-400-normal.woff2",
 "fonts/ibm-plex-mono-latin-400-normal.woff2",
 "fonts/plus-jakarta-sans-latin-ext-400-normal.woff2",
 "fonts/allura-latin-400-normal.woff2",
 "fonts/ibm-plex-mono-latin-ext-500-normal.woff2",
 "fonts/plus-jakarta-sans-latin-ext-700-normal.woff2",
 "fonts/plus-jakarta-sans-latin-500-normal.woff2",
 "fonts/dancing-script-latin-ext-600-normal.woff2",
 "fonts/plus-jakarta-sans-latin-400-normal.woff2",
 "fonts/plus-jakarta-sans-latin-600-normal.woff2",
 "fonts/ibm-plex-mono-latin-500-normal.woff2",
 "fonts/plus-jakarta-sans-latin-ext-500-normal.woff2",
 "fonts/plus-jakarta-sans-latin-ext-800-normal.woff2",
 "fonts/plus-jakarta-sans-latin-ext-600-normal.woff2",
 "fonts/plus-jakarta-sans-latin-700-normal.woff2",
 "fonts/plus-jakarta-sans-latin-800-normal.woff2",
 "fonts/dancing-script-latin-600-normal.woff2",
 "fonts/allura-latin-ext-400-normal.woff2",
 "fonts/caveat-latin-ext-600-normal.woff2",
 "vendor/pdf.worker.min.js",
 "vendor/standard_fonts/FoxitSerifBoldItalic.pfb",
 "vendor/standard_fonts/FoxitSerifItalic.pfb",
 "vendor/standard_fonts/LiberationSans-BoldItalic.ttf",
 "vendor/standard_fonts/FoxitSerif.pfb",
 "vendor/standard_fonts/FoxitSerifBold.pfb",
 "vendor/standard_fonts/FoxitFixed.pfb",
 "vendor/standard_fonts/FoxitSymbol.pfb",
 "vendor/standard_fonts/LiberationSans-Italic.ttf",
 "vendor/standard_fonts/LiberationSans-Bold.ttf",
 "vendor/standard_fonts/FoxitDingbats.pfb",
 "vendor/standard_fonts/FoxitFixedBoldItalic.pfb",
 "vendor/standard_fonts/FoxitFixedItalic.pfb",
 "vendor/standard_fonts/LICENSE_LIBERATION",
 "vendor/standard_fonts/LICENSE_FOXIT",
 "vendor/standard_fonts/FoxitFixedBold.pfb",
 "vendor/standard_fonts/LiberationSans-Regular.ttf"
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('taller-pdf-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const SCOPE = new URL('./', self.location).pathname;
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (u.origin !== self.location.origin) return;
  // Android: «Compartir» un PDF o una foto con Taller PDF
  if (r.method === 'POST' && u.pathname === SCOPE + 'compartir') {
    e.respondWith((async () => {
      try {
        const fd = await r.formData(), c = await caches.open('taller-compartido');
        for (const k of await c.keys()) await c.delete(k);
        let i = 0;
        for (const f of fd.getAll('files')) {
          if (!f || typeof f === 'string') continue;
          await c.put(SCOPE + '__compartido/' + (i++), new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Nombre': encodeURIComponent(f.name || 'documento') } }));
        }
      } catch (err) {}
      return Response.redirect(SCOPE + '?compartido=1', 303);
    })());
    return;
  }
  if (r.method !== 'GET') return;
  // páginas: primero la red (siempre la última versión); sin conexión, la copia guardada
  if (r.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
        const res = await fetch(r, { signal: ctl.signal }); clearTimeout(t); return res;
      } catch (err) {
        return (await caches.match('./', { cacheName: CACHE })) || (await caches.match(r, { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }
  // archivos de la app: copia guardada (las URL llevan versión) y, si no está, la red
  e.respondWith((async () => {
    const hit = await caches.match(r, { cacheName: CACHE });
    if (hit) return hit;
    const res = await fetch(r);
    if (res.ok && res.type === 'basic' && !u.pathname.startsWith(SCOPE + '__compartido')) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); }
    return res;
  })());
});
