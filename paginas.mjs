// Las páginas del sitio y su descripción (la usan build.mjs y og.mjs).
export const PAGES = [
  { src: 'hub.html', out: 'index.html',
    desc: 'Juegos de navegador que se juegan con dos flechas. Subí de nivel, desbloqueá personajes y competí en el ranking.' },
  { src: 'cubo-escalador.html', out: 'escalador.html',
    desc: 'Subí escalones en zigzag con izquierda y derecha, del cielo hasta el espacio.' },
  { src: 'modo-lluvia.html', out: 'lluvia.html',
    desc: 'Movete entre carriles y esquivá los bloques que caen.' },
  { src: 'modo-clasificador.html', out: 'clasificador.html',
    desc: 'Mandá cada cubo a la caja de su misma forma, cada vez más rápido.' },
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

// nombre corto de cada página: el de su imagen para compartir (og/<id>.png)
export const idDe = p => (p.out === 'index.html' ? 'hub' : p.out.replace(/\.html$/, ''));
