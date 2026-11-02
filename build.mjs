// Arma el sitio en docs/ (lo sirve GitHub Pages).
// Cada juego está escrito como página de Artifact (sin <!doctype>, <html> ni <head>),
// así que acá se envuelve en un documento completo y los links a Artifacts pasan a ser locales.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';

const GAMES = [
  { src: 'cubo-escalador.html', out: 'index.html', artifact: '8XTQcjA7JDfch6hagViFmv',
    desc: 'Subí escalones en zigzag con izquierda y derecha, del cielo hasta el espacio.' },
  { src: 'modo-lluvia.html', out: 'lluvia.html', artifact: 'PD7XSSyMrYj1LS6D68heH9',
    desc: 'Movete entre carriles y esquivá los bloques que caen.' },
  { src: 'modo-clasificador.html', out: 'clasificador.html', artifact: 'WsuNKM3Hwdy44b4mnL7Vqs',
    desc: 'Mandá cada cubo a la caja de su color, cada vez más rápido.' },
  { src: 'modo-equilibrio.html', out: 'equilibrio.html', artifact: 'PQxgrHb4RC3JWBntopFU7t',
    desc: 'Mantené el equilibrio con izquierda y derecha para que no te tire el viento.' },
];

const ICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="3" y="3" width="26" height="26" rx="6" fill="#ffcc29" stroke="#1d2340" stroke-width="3"/><rect x="10" y="10" width="4" height="7" rx="2" fill="#1d2340"/><rect x="18" y="10" width="4" height="7" rx="2" fill="#1d2340"/></svg>');

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

rmSync('docs', { recursive: true, force: true });
mkdirSync('docs');

for (const g of GAMES) {
  if (!existsSync(g.src)) { console.warn(`Falta ${g.src}, lo salteo`); continue; }
  let body = readFileSync(g.src, 'utf8');
  for (const other of GAMES) {
    body = body.replaceAll(`https://claude.ai/artifact/${other.artifact}`, other.out);
  }
  const title = (body.match(/<title>([^<]*)<\/title>/) || [, 'Juego'])[1];
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="${esc(g.desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(g.desc)}">
<meta name="theme-color" content="#62c6ff">
<link rel="icon" href="${ICON}">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${body}
</body>
</html>
`;
  writeFileSync(`docs/${g.out}`, html);
  console.log(`docs/${g.out}  <-  ${g.src}`);
}
writeFileSync('docs/.nojekyll', '');
