// Dibuja las imágenes para compartir (og/<id>.png, 1200×630) con Chrome sin ventana, a partir de og/plantilla.html.
// Se corre a mano cuando cambia un juego o su descripción: node og.mjs. build.mjs después las copia a docs/og/.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PAGES, idDe } from './paginas.mjs';

const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(p => p && existsSync(p));
if (!CHROME) throw new Error('No encontré Chrome. Pasá la ruta con CHROME=...');

const plantilla = pathToFileURL(resolve('og/plantilla.html')).href;

for (const p of PAGES) {
  const id = idDe(p), salida = resolve(`og/${id}.png`);
  const url = `${plantilla}?id=${id}&d=${encodeURIComponent(p.desc)}`;
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1200,630', '--virtual-time-budget=10000', '--allow-file-access-from-files', `--screenshot=${salida}`, url], { stdio: 'ignore' });
  console.log(`og/${id}.png`);
}
