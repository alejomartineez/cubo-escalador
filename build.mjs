// Arma el sitio en docs/ (lo sirve GitHub Pages).
// Cada página está escrita como página de Artifact (sin <!doctype>, <html> ni <head>),
// así que acá se envuelve en un documento completo. cubo-comun.js se copia tal cual.
// También arma lo necesario para instalarlo como app y jugar sin conexión: manifest, íconos y service worker.
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const PAGES = [
  { src: 'hub.html', out: 'index.html',
    desc: 'Juegos de navegador que se juegan con dos flechas. Subí de nivel, desbloqueá personajes y competí en el ranking.' },
  { src: 'cubo-escalador.html', out: 'escalador.html',
    desc: 'Subí escalones en zigzag con izquierda y derecha, del cielo hasta el espacio.' },
  { src: 'modo-lluvia.html', out: 'lluvia.html',
    desc: 'Movete entre carriles y esquivá los bloques que caen.' },
  { src: 'modo-clasificador.html', out: 'clasificador.html',
    desc: 'Mandá cada cubo a la caja de su color, cada vez más rápido.' },
  { src: 'modo-equilibrio.html', out: 'equilibrio.html',
    desc: 'Mantené el equilibrio con izquierda y derecha para que no te tire el viento.' },
  { src: 'modo-ritmo.html', out: 'ritmo.html',
    desc: 'Tocá izquierda o derecha justo cuando la nota llega a la línea, al ritmo de la música.' },
  { src: 'modo-voley.html', out: 'voley.html',
    desc: 'Vóley con dos flechas: movete, devolvé la pelota y ganale a rivales cada vez mejores.' },
  { src: 'modo-paseo.html', out: 'paseo.html',
    desc: 'Sacá a pasear a tu mascota alternando izquierda y derecha sin que se te escape.' },
  { src: 'modo-serpiente.html', out: 'serpiente.html',
    desc: 'La serpiente de siempre, pero doblás con izquierda y derecha.' },
  { src: 'modo-cohete.html', out: 'cohete.html',
    desc: 'Cada flecha prende un propulsor. Esquivá asteroides y no te estrelles.' },
  { src: 'modo-esqui.html', out: 'esqui.html',
    desc: 'Bajá en slalom entre las banderas, cada vez más rápido.' },
  { src: 'modo-pulseada.html', out: 'pulseada.html',
    desc: 'Alterná izquierda y derecha lo más rápido que puedas para ganar la pulseada.' },
];
const ASSETS = ['cubo-comun.js'];
const NOMBRE = 'Cubo Escalador';

const ICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="3" y="3" width="26" height="26" rx="6" fill="#ffcc29" stroke="#1d2340" stroke-width="3"/><rect x="10" y="10" width="4" height="7" rx="2" fill="#1d2340"/><rect x="18" y="10" width="4" height="7" rx="2" fill="#1d2340"/></svg>');

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

rmSync('docs', { recursive: true, force: true });
mkdirSync('docs');

const salida = [];
for (const p of PAGES) {
  if (!existsSync(p.src)) { console.warn(`Falta ${p.src}, lo salteo`); continue; }
  const body = readFileSync(p.src, 'utf8');
  const title = (body.match(/<title>([^<]*)<\/title>/) || [, 'Juego'])[1];
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="${esc(p.desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta name="theme-color" content="#62c6ff">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${NOMBRE}">
<link rel="icon" href="${ICON}">
<link rel="apple-touch-icon" href="icono-180.png">
<link rel="manifest" href="manifest.webmanifest">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
<script>if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}))</script>
</head>
<body>
${body}
</body>
</html>
`;
  writeFileSync(`docs/${p.out}`, html);
  salida.push(p.out);
  console.log(`docs/${p.out}  <-  ${p.src}`);
}
for (const a of ASSETS) { copyFileSync(a, `docs/${a}`); salida.push(a); console.log(`docs/${a}`); }

// ---------- íconos PNG (el cubo amarillo sobre celeste), dibujados píxel por píxel ----------
function png(n) {
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const FONDO = hex('#62c6ff'), CUBO = hex('#ffcc29'), TINTA = hex('#1d2340'), CACHETE = hex('#ff8fa6');
  // distancia a un rectángulo redondeado centrado en (cx, cy)
  const caja = (x, y, cx, cy, w, h, r) => {
    const qx = Math.abs(x - cx) - w / 2 + r, qy = Math.abs(y - cy) - h / 2 + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
  const filas = [];
  for (let py = 0; py < n; py++) {
    const fila = [0];
    for (let px = 0; px < n; px++) {
      const x = (px + 0.5) / n, y = (py + 0.5) / n;
      let c = FONDO;
      const d = caja(x, y, 0.5, 0.52, 0.56, 0.56, 0.12);
      if (d < 0) c = d > -0.035 ? TINTA : CUBO;
      if (d < -0.035) {
        if (caja(x, y, 0.5, 0.33, 0.4, 0.06, 0.03) < 0) c = [255, 236, 160];
        for (const ex of [0.39, 0.61]) if (caja(x, y, ex, 0.47, 0.06, 0.11, 0.03) < 0) c = TINTA;
        for (const ex of [0.33, 0.67]) if (Math.hypot((x - ex) / 0.05, (y - 0.6) / 0.03) < 1) c = CACHETE;
        const r = Math.hypot(x - 0.5, y - 0.56);
        if (r > 0.07 && r < 0.1 && y > 0.6) c = TINTA;
      }
      fila.push(...c, 255);
    }
    filas.push(Buffer.from(fila));
  }
  const crcTabla = Array.from({ length: 256 }, (_, k) => { let c = k; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTabla[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const trozo = (tipo, datos) => {
    const t = Buffer.concat([Buffer.from(tipo), datos]);
    const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(t));
    return Buffer.concat([largo, t, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(Buffer.concat(filas))), trozo('IEND', Buffer.alloc(0))]);
}
for (const n of [180, 192, 512]) { writeFileSync(`docs/icono-${n}.png`, png(n)); salida.push(`icono-${n}.png`); }

writeFileSync('docs/manifest.webmanifest', JSON.stringify({
  name: NOMBRE, short_name: 'Cubo', lang: 'es', start_url: './', scope: './', display: 'standalone',
  orientation: 'portrait', background_color: '#62c6ff', theme_color: '#62c6ff',
  description: PAGES[0].desc,
  icons: [
    { src: 'icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));
salida.push('manifest.webmanifest');

// ---------- service worker: guarda todo el sitio para jugar sin conexión ----------
// El nombre de la caché cambia con el contenido, así una versión nueva reemplaza a la vieja.
const version = createHash('sha256').update(salida.map(f => readFileSync('docs/' + f)).reduce((a, b) => Buffer.concat([a, b]))).digest('hex').slice(0, 10);
writeFileSync('docs/sw.js', `// Generado por build.mjs
const CACHE = 'cubo-${version}';
const ARCHIVOS = ${JSON.stringify(['./', ...salida])};
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('cubo-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  // Fuentes de Google: de la caché si ya están, y se guardan la primera vez.
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE + '-fuentes').then(async c => {
      const hit = await c.match(r);
      if (hit) return hit;
      const res = await fetch(r);
      if (res.ok || res.type === 'opaque') c.put(r, res.clone());
      return res;
    }));
    return;
  }
  if (u.origin !== location.origin) return;
  // Páginas y archivos propios: primero la red (para tener lo último), y si no hay conexión, la caché.
  e.respondWith(fetch(r).then(res => {
    if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(r, copia)); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: true }).then(hit => hit || caches.match('./'))));
});
`);
console.log(`docs/sw.js  (caché ${version}, ${salida.length + 1} archivos)`);
writeFileSync('docs/.nojekyll', '');
