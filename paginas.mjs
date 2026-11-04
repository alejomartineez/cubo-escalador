// Las páginas del sitio y su descripción (la usan build.mjs y og.mjs).
export const PAGES = [
  { src: 'hub.html', out: 'index.html',
    desc: 'Juegos de navegador que se juegan con dos flechas. Subí de nivel, desbloqueá personajes y competí en el ranking.' },
  { src: 'cubo-escalador.html', out: 'escalador.html',
    desc: 'Subí escalones en zigzag con izquierda y derecha, del cielo hasta el espacio.' },
  { src: 'modo-lluvia.html', out: 'lluvia.html',
    desc: 'Movete entre carriles y esquivá los bloques que caen.' },
  { src: 'modo-ritmo.html', out: 'ritmo.html',
    desc: 'Tocá izquierda o derecha justo cuando la nota llega a la línea, al ritmo de la música.' },
  { src: 'modo-voley.html', out: 'voley.html',
    desc: 'Vóley con dos flechas: movete, devolvé la pelota y ganale a rivales cada vez mejores.' },
  { src: 'modo-paleta.html', out: 'paleta.html',
    desc: 'Paleta con dos flechas: devolvé la pelota contra rivales cada vez mejores, o jugá de a dos en el mismo celu.' },
  { src: 'modo-esqui.html', out: 'esqui.html',
    desc: 'Bajá en slalom entre las banderas, cada vez más rápido.' },
  { src: 'modo-pulseada.html', out: 'pulseada.html',
    desc: 'Alterná izquierda y derecha lo más rápido que puedas para ganar la pulseada.' },
  { src: 'modo-esgrima.html', out: 'esgrima.html',
    desc: 'Duelo de esgrima con dos flechas: leé el ataque, pará arriba o abajo y contraatacá con la parada perfecta.' },
];

// nombre corto de cada página: el de su imagen para compartir (og/<id>.png)
export const idDe = p => (p.out === 'index.html' ? 'hub' : p.out.replace(/\.html$/, ''));
