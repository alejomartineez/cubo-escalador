// Generado por build.mjs
const CACHE = 'cubo-72f75c8182';
const ARCHIVOS = ["./","index.html","escalador.html","lluvia.html","ritmo.html","voley.html","paleta.html","esqui.html","pulseada.html","guardia.html","esgrima.html","pasadizo.html","cubo-comun.js","cubo-duelo.js","icono-180.png","icono-192.png","icono-512.png","manifest.webmanifest"];
// Cloudflare Pages redirige escalador.html → /escalador. Una respuesta que vino de una redirección no se puede
// usar para abrir una página, así que se guarda una copia limpia.
const limpia = res => res.redirected ? new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers }) : res;
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ARCHIVOS.map(a => fetch(a, { cache: 'reload' }).then(res => {
    if (!res.ok) throw new Error(a + ': ' + res.status);
    return c.put(a, limpia(res));
  })))).then(() => self.skipWaiting()));
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
    res = limpia(res);
    if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(r, copia)); }
    return res;
  });
  // /escalador (la dirección sin .html que deja Cloudflare) también encuentra escalador.html guardado.
  const guardado = () => caches.match(r, { ignoreSearch: true })
    .then(hit => hit || (/\/[^/.]+$/.test(u.pathname) ? caches.match(u.pathname + '.html', { ignoreSearch: true }) : undefined));
  e.respondWith(new Promise(ok => {
    let listo = false;
    const dar = res => { if (!listo && res) { listo = true; ok(res); } };
    red.then(dar, () => guardado().then(hit => dar(hit || caches.match('./'))));
    setTimeout(() => guardado().then(dar), 1500);
  }));
});
