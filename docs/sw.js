// Generado por build.mjs
const CACHE = 'cubo-010e81512d';
const ARCHIVOS = ["./","index.html","escalador.html","lluvia.html","clasificador.html","equilibrio.html","ritmo.html","voley.html","paseo.html","cohete.html","esqui.html","pulseada.html","cubo-comun.js","cubo-duelo.js","icono-180.png","icono-192.png","icono-512.png","manifest.webmanifest"];
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
