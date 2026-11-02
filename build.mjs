// Arma el sitio en docs/ (lo sirve GitHub Pages).
// Cada página está escrita como página de Artifact (sin <!doctype>, <html> ni <head>),
// así que acá se envuelve en un documento completo. cubo-comun.js se copia tal cual.
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';

const PAGES = [
  { src: 'hub.html', out: 'index.html',
    desc: 'Juegos de navegador que se juegan con dos flechas. Subí de nivel y desbloqueá personajes.' },
  { src: 'cubo-escalador.html', out: 'escalador.html',
    desc: 'Subí escalones en zigzag con izquierda y derecha, del cielo hasta el espacio.' },
  { src: 'modo-lluvia.html', out: 'lluvia.html',
    desc: 'Movete entre carriles y esquivá los bloques que caen.' },
  { src: 'modo-clasificador.html', out: 'clasificador.html',
    desc: 'Mandá cada cubo a la caja de su color, cada vez más rápido.' },
  { src: 'modo-equilibrio.html', out: 'equilibrio.html',
    desc: 'Mantené el equilibrio con izquierda y derecha para que no te tire el viento.' },
  { src: 'modo-ritmo.html', out: 'ritmo.html',
    desc: 'Tocá izquierda o derecha justo cuando la flecha llega a la línea, al ritmo de la música.' },
];
const ASSETS = ['cubo-comun.js'];

const ICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="3" y="3" width="26" height="26" rx="6" fill="#ffcc29" stroke="#1d2340" stroke-width="3"/><rect x="10" y="10" width="4" height="7" rx="2" fill="#1d2340"/><rect x="18" y="10" width="4" height="7" rx="2" fill="#1d2340"/></svg>');

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

rmSync('docs', { recursive: true, force: true });
mkdirSync('docs');

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
<link rel="icon" href="${ICON}">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${body}
</body>
</html>
`;
  writeFileSync(`docs/${p.out}`, html);
  console.log(`docs/${p.out}  <-  ${p.src}`);
}
for (const a of ASSETS) { copyFileSync(a, `docs/${a}`); console.log(`docs/${a}`); }
writeFileSync('docs/.nojekyll', '');
