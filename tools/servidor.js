// Servidor mínimo para probar Taller PDF en local: sirve la carpeta public/.
// Uso: npm start   (o: node tools/servidor.js [puerto])
const http = require('http'), fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..', 'public');
const PUERTO = Number(process.argv[2] || process.env.PORT || 8080);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8', '.ttf': 'font/ttf', '.pfb': 'application/octet-stream' };

http.createServer((req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = path.normalize(path.join(RAIZ, ruta));
  if (!archivo.startsWith(RAIZ)) { res.writeHead(403).end(); return; }
  fs.readFile(archivo, (err, datos) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(datos);
  });
}).listen(PUERTO, () => console.log('Taller PDF en http://localhost:' + PUERTO));
