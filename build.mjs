// Arma el sitio en docs/ (lo sirve GitHub Pages).
// Cada página está escrita como página de Artifact (sin <!doctype>, <html> ni <head>),
// así que acá se envuelve en un documento completo. cubo-comun.js se copia tal cual.
// También arma lo necesario para instalarlo como app y jugar sin conexión: manifest, íconos y service worker.
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

import { PAGES, idDe } from './paginas.mjs';
const ASSETS = ['cubo-comun.js', 'cubo-duelo.js'];
const NOMBRE = 'Cubo Escalador';
const SITIO = 'https://alejomartineez.github.io/cubo-escalador/';   // los links para compartir tienen que ser completos

const ICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="3" y="3" width="26" height="26" rx="6" fill="#ffcc29" stroke="#1d2340" stroke-width="3"/><rect x="10" y="10" width="4" height="7" rx="2" fill="#1d2340"/><rect x="18" y="10" width="4" height="7" rx="2" fill="#1d2340"/></svg>');

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Pantalla de carga: aparece al instante (va en el <head>) y se va cuando la página y las fuentes están listas.
// Las fuentes de Google se cargan sin frenar el dibujo de la página (antes la dejaban en blanco hasta bajarlas).
const CARGA_CSS = `#cargando{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
background:#62c6ff;transition:opacity .3s ease,visibility .3s}
#cargando.fuera{opacity:0;visibility:hidden}
#cargando i{position:relative;width:64px;height:64px;border-radius:14px;background:#ffcc29;border:4px solid #1d2340;box-shadow:0 6px 0 #1d2340;animation:cc-salto .6s cubic-bezier(.3,0,.4,1) infinite alternate}
#cargando i::before,#cargando i::after{content:"";position:absolute;top:16px;width:9px;height:14px;border-radius:5px;background:#1d2340}
#cargando i::before{left:14px}#cargando i::after{right:14px}
#cargando b{font:800 15px system-ui,sans-serif;color:#1d2340;letter-spacing:.04em}
#cargando s{display:block;width:120px;height:8px;border-radius:99px;border:2.5px solid #1d2340;background:#fffaf0;overflow:hidden;text-decoration:none}
#cargando s::after{content:"";display:block;height:100%;width:40%;background:#ff5d7d;border-radius:99px;animation:cc-barra 1s ease-in-out infinite}
@keyframes cc-salto{from{transform:translateY(0) scale(1.06,.94)}to{transform:translateY(-26px) rotate(8deg)}}
@keyframes cc-barra{from{transform:translateX(-100%)}to{transform:translateX(260%)}}
@media (prefers-reduced-motion:reduce){#cargando i,#cargando s::after{animation:none}}`;
const CARGA_HTML = '<div id="cargando" aria-hidden="true"><i></i><s></s><b>Cargando…</b></div>';
const CARGA_JS = `<script>(function(){var el=document.getElementById('cargando');if(!el)return;
function fuera(){if(!el)return;el.classList.add('fuera');var e=el;el=null;setTimeout(function(){e.remove()},400)}
var l=document.querySelector('link[data-fuentes]'),esperas=[];
if(l)esperas.push(new Promise(function(r){if(l.sheet)r();l.addEventListener('load',r);l.addEventListener('error',r)}).then(function(){return document.fonts&&document.fonts.ready}));
Promise.race([Promise.all(esperas),new Promise(function(r){setTimeout(r,2500)})]).then(function(){setTimeout(fuera,60)});})();</script>`;
const FUENTES = /<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/[^"]+)">/;

rmSync('docs', { recursive: true, force: true });
mkdirSync('docs');

const salida = [];
for (const p of PAGES) {
  if (!existsSync(p.src)) { console.warn(`Falta ${p.src}, lo salteo`); continue; }
  let body = readFileSync(p.src, 'utf8');
  body = body.replace(FUENTES, (_, href) => `<link rel="stylesheet" media="print" data-fuentes href="${href}" onload="this.onload=null;this.media='all'">` +
    `<noscript><link rel="stylesheet" href="${href}"></noscript>`);
  const title = (body.match(/<title>([^<]*)<\/title>/) || [, 'Juego'])[1];
  const titulo = title === NOMBRE ? NOMBRE : `${title} · ${NOMBRE}`;
  const url = SITIO + (p.out === 'index.html' ? '' : p.out), imagen = `${SITIO}og/${idDe(p)}.png`;
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="description" content="${esc(p.desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${NOMBRE}">
<meta property="og:locale" content="es_AR">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta property="og:image" content="${imagen}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(titulo)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(p.desc)}">
<meta name="twitter:image" content="${imagen}">
<meta name="theme-color" content="#62c6ff">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${NOMBRE}">
<link rel="icon" href="${ICON}">
<link rel="apple-touch-icon" href="icono-180.png">
<link rel="manifest" href="manifest.webmanifest">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}
${CARGA_CSS}</style>
<script>if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}))</script>
</head>
<body>
${CARGA_HTML}
${body}
${CARGA_JS}
</body>
</html>
`;
  writeFileSync(`docs/${p.out}`, html);
  salida.push(p.out);
  console.log(`docs/${p.out}  <-  ${p.src}`);
}
for (const a of ASSETS) { copyFileSync(a, `docs/${a}`); salida.push(a); console.log(`docs/${a}`); }

// canciones de Ritmo: no van a la caché del arranque; se bajan cuando las jugás y ahí quedan guardadas
if (existsSync('musica')) { mkdirSync('docs/musica'); for (const f of readdirSync('musica')) copyFileSync(`musica/${f}`, `docs/musica/${f}`); }

// imágenes para compartir el link (las dibuja og.mjs). No van a la caché del service worker: solo las piden las redes.
mkdirSync('docs/og');
for (const p of PAGES) { const f = `og/${idDe(p)}.png`; if (existsSync(f)) copyFileSync(f, `docs/${f}`); else console.warn(`Falta ${f}: corré node og.mjs`); }

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
  // Páginas y archivos propios: primero la red (para tener lo último). Si tarda más de 1,5 s o no hay conexión,
  // se usa lo guardado y la respuesta de la red queda guardada para la próxima.
  const red = fetch(r).then(res => {
    if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(r, copia)); }
    return res;
  });
  const guardado = () => caches.match(r, { ignoreSearch: true });
  e.respondWith(new Promise(ok => {
    let listo = false;
    const dar = res => { if (!listo && res) { listo = true; ok(res); } };
    red.then(dar, () => guardado().then(hit => dar(hit || caches.match('./'))));
    setTimeout(() => guardado().then(dar), 1500);
  }));
});
`);
console.log(`docs/sw.js  (caché ${version}, ${salida.length + 1} archivos)`);
writeFileSync('docs/.nojekyll', '');
