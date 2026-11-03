// Cubo Escalador: lo que comparten todos los juegos.
// Perfil (nivel, XP, personaje, efecto, logros, récords), ranking online, dificultades y el dibujo del cubo.
//
// Uso desde un juego (cargá este archivo antes del script del juego):
//   const CC = window.CuboComun;                       // puede no existir: el juego tiene que andar igual
//   CC.dibujarCubo(ctx, x, pie, lado, { mirar: -1|0|1, mareado: bool, t: performance.now() });
//
//   // Menú: selector de dificultad común (Fácil, Normal, Difícil, Extremo, Maestro). Recuerda la última elegida.
//   const sel = CC.selectorDif(elemento, { juego: 'lluvia', alCambiar: id => ... });   sel.valor() → 'normal'
//   // En la pantalla de fin, el mismo selector en chiquito (comparte la elección con el del menú):
//   CC.selectorDif(otroElemento, { juego: 'lluvia', compacto: true, alCambiar: id => ... });
//   // Teclas: en el MENÚ se elige con ↑ ↓ (sel.siguiente(±1)); ← → quedan solo para jugar.
//   CC.leyendaTeclas(elemento, { jugar: 'moverte' });     // leyenda "En el juego / En el menú" (se oculta en el celu)
//   // En la compu los paneles se agrandan solos: usá `zoom: var(--ui, 1)` en menú, fin y HUD (nunca en el canvas).
//
//   // Fin de partida: UNA llamada. Suma XP (con el multiplicador de dificultad y bonus por récord),
//   // guarda el récord, revisa logros, sube al ranking y muestra los carteles.
//   const r = CC.partida({ juego: 'lluvia', tabla: 'normal', valor: 1234, texto: '1.234 pts',
//                          xp: CC.xpEscala(1234, 200, 3000), datos: { ... } });
//   // r → { xp, base, nivel, subio, record, anterior, logros: [nombres], dif }
//
//   CC.verRanking({ juego: 'lluvia', tabla: 'normal' });  // ventana con el ranking online
//   CC.volver();                                          // vuelve a la pantalla de juegos
//   CC.vibrar(15);                                        // vibración corta en el celu, si se puede
(() => {
  'use strict';
  const KEY = 'cubo-perfil';
  const INK = '#1d2340', CREMA = '#fffaf0';

  // Ranking online (Supabase). La clave es la pública (publishable): solo deja leer el ranking y usar enviar_puntaje (ver supabase.sql).
  const RANKING = { url: 'https://gxdzuucgnozostryprkj.supabase.co', clave: 'sb_publishable_jxyT2zN6QwYD_zomchXL_A_pL3ibaY6' };

  // ---------- dificultades ----------
  const DIFS = [
    { id: 'facil', nombre: 'Fácil', xp: 1 },
    { id: 'normal', nombre: 'Normal', xp: 1.5 },
    { id: 'dificil', nombre: 'Difícil', xp: 2 },
    { id: 'extremo', nombre: 'Extremo', xp: 3 },
    { id: 'maestro', nombre: 'Maestro', xp: 4 },
  ];
  const DURAS = ['extremo', 'maestro'];
  function iconoDif(id, tam = 22) {
    if (id === 'maestro') {
      // sabio de capucha violeta y barba blanca, con los ojos cerrados
      return `<svg class="cc-ico" viewBox="0 0 24 24" width="${tam}" height="${tam}" aria-hidden="true">` +
        `<circle cx="12" cy="3" r="1.7" fill="#ffcc29" stroke="${INK}" stroke-width="1.1"/>` +
        `<path d="M12 4.6C6.4 4.6 3.6 9.6 3.6 15.4V22h16.8v-6.6C20.4 9.6 17.6 4.6 12 4.6z" fill="#8f6bff" stroke="${INK}" stroke-width="1.7" stroke-linejoin="round"/>` +
        `<path d="M6.9 13.2c0-3.4 2.2-5.6 5.1-5.6s5.1 2.2 5.1 5.6v2.2H6.9z" fill="#ffd9b3" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>` +
        `<path d="M8.6 11.6q1 .9 2 0M13.4 11.6q1 .9 2 0" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>` +
        `<path d="M6.6 13.6q5.4 2.2 10.8 0Q17.6 19.4 12 22.6 6.4 19.4 6.6 13.6z" fill="${CREMA}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>` +
        `<path d="M10.2 14.6q1.8 1 3.6 0" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/></svg>`;
    }
    if (id === 'extremo') {
      return `<svg class="cc-ico" viewBox="0 0 24 24" width="${tam}" height="${tam}" aria-hidden="true">` +
        `<path d="M6.2 9.2 3.4 2.6l6 3.6zM17.8 9.2l2.8-6.6-6 3.6z" fill="#ff3b3b" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
        `<circle cx="12" cy="13.6" r="8" fill="#ff3b3b" stroke="${INK}" stroke-width="1.8"/>` +
        `<path d="M7.6 10.8l3 1.6M16.4 10.8l-3 1.6" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/>` +
        `<path d="M7.8 15.6q4.2 4 8.4 0z" fill="${CREMA}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>` +
        `<path d="M9.6 16.6l.8 1.4.8-1.1M12.8 16.9l.8 1.1.8-1.4" fill="none" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/></svg>`;
    }
    const n = { facil: 1, normal: 2, dificil: 3 }[id] || 1;
    let bars = '';
    for (let k = 0; k < 3; k++) {
      const h = 7 + k * 5, x = 3 + k * 7;
      bars += `<rect x="${x}" y="${21 - h}" width="5" height="${h}" rx="1.5" fill="${k < n ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6"/>`;
    }
    return `<svg class="cc-ico" viewBox="0 0 24 24" width="${tam}" height="${tam}" aria-hidden="true">${bars}</svg>`;
  }

  // ---------- personajes ----------
  // Se desbloquean por nivel o por logro.
  const SKINS = [
    { id: 'clasico', nombre: 'Clásico', nivel: 1, cuerpo: '#ffcc29' },
    { id: 'sandia', nombre: 'Sandía', nivel: 2, cuerpo: '#ff6b8b', extra: 'semillas' },
    { id: 'menta', nombre: 'Menta', nivel: 3, cuerpo: '#6be0b5' },
    { id: 'gorra', nombre: 'Gorra', nivel: 4, cuerpo: '#ffcc29', extra: 'gorra', color2: '#ff5d7d' },
    { id: 'gato', nombre: 'Gato', nivel: 5, cuerpo: '#ffad4d', extra: 'orejas' },
    { id: 'panda', nombre: 'Panda', nivel: 6, cuerpo: '#f4f6fb', extra: 'panda' },
    { id: 'robot', nombre: 'Robot', nivel: 7, cuerpo: '#b8c4d6', extra: 'antena', ojos: 'cuadrados', sinCachetes: true },
    { id: 'rana', nombre: 'Rana', nivel: 8, cuerpo: '#7bd36a', extra: 'rana', sinOjos: true },
    { id: 'dj', nombre: 'DJ', nivel: 9, cuerpo: '#c08bff', extra: 'auriculares', color2: '#ff5d7d' },
    { id: 'abeja', nombre: 'Abeja', nivel: 10, cuerpo: '#ffcc29', extra: 'abeja' },
    { id: 'pinguino', nombre: 'Pingüino', nivel: 11, cuerpo: '#2b3470', extra: 'pinguino' },
    { id: 'astronauta', nombre: 'Astronauta', nivel: 12, cuerpo: '#f4f6fb', extra: 'casco' },
    { id: 'ninja', nombre: 'Ninja', nivel: 13, cuerpo: '#3a3f5c', extra: 'ninja', sinBoca: true, sinCachetes: true },
    { id: 'vaquero', nombre: 'Vaquero', nivel: 14, cuerpo: '#ffad4d', extra: 'sombrero' },
    { id: 'rey', nombre: 'Rey', nivel: 15, cuerpo: '#ffcc29', extra: 'corona', color2: '#f5b301' },
    { id: 'chef', nombre: 'Chef', nivel: 16, cuerpo: '#ffd9b3', extra: 'chef' },
    { id: 'pirata', nombre: 'Pirata', nivel: 17, cuerpo: '#ffad4d', extra: 'pirata' },
    { id: 'noche', nombre: 'Noche', nivel: 18, cuerpo: '#2b3470', ojo: CREMA, extra: 'estrellitas' },
    { id: 'vikingo', nombre: 'Vikingo', nivel: 19, cuerpo: '#ffcc29', extra: 'vikingo' },
    { id: 'zombie', nombre: 'Zombi', nivel: 20, cuerpo: '#9ccf8a', extra: 'zombie', sinCachetes: true },
    { id: 'oro', nombre: 'Oro', nivel: 22, cuerpo: '#f5c518', extra: 'brillos' },
    { id: 'mago', nombre: 'Mago', nivel: 24, cuerpo: '#c08bff', extra: 'mago' },
    { id: 'lava', nombre: 'Lava', nivel: 27, cuerpo: '#5a2030', ojo: '#ffcc29', extra: 'lava', sinCachetes: true },
    { id: 'arcoiris', nombre: 'Arcoíris', nivel: 30, cuerpo: '#ff6b8b', extra: 'arcoiris' },
    { id: 'galaxia', nombre: 'Galaxia', nivel: 35, cuerpo: '#2a1a5e', ojo: CREMA, extra: 'galaxia' },
    { id: 'diablito', nombre: 'Diablito', logro: 'extremo1', cuerpo: '#ff3b3b', extra: 'diablito' },
    { id: 'diamante', nombre: 'Diamante', logro: 'leyenda', cuerpo: '#7fe3ff', extra: 'diamante' },
    { id: 'sabio', nombre: 'Sabio', logro: 'maestro1', cuerpo: '#8f6bff', extra: 'sabio', sinBoca: true },
    // Premios grandes del camino de nivel (`pase: true` = se destacan en el camino). No brillan, salvo Campeón.
    { id: 'cristal', nombre: 'Cristal', pase: true, nivel: 23, cuerpo: '#b5e8ff', ojo: '#1d4f7a', extra: 'cristal' },
    { id: 'tigre', nombre: 'Tigre', pase: true, nivel: 28, cuerpo: '#ff9a2e', extra: 'tigre' },
    { id: 'caballero', nombre: 'Caballero', pase: true, nivel: 33, cuerpo: '#ffcf9e', extra: 'caballero' },
    { id: 'dragon', nombre: 'Dragón', pase: true, nivel: 40, cuerpo: '#5cc96a', extra: 'dragon' },
    { id: 'campeon', nombre: 'Campeón', pase: true, nivel: 50, cuerpo: '#ffc21f', extra: 'campeon', glow: '#ff9a2e' },
    { id: 'guerrero', nombre: 'Guerrero', pase: true, nivel: 30, cuerpo: '#f5c49a', extra: 'guerrero',
      formas: ['guerrero-dorado', 'guerrero-carmesi', 'guerrero-celeste', 'guerrero-plateado'] },
    { id: 'guerrero-dorado', nombre: 'Llama dorada', pase: true, nivel: 36, de: 'guerrero', cuerpo: '#ffcf3a', extra: 'guerreroDorado' },
    { id: 'guerrero-carmesi', nombre: 'Bestia carmesí', pase: true, nivel: 42, de: 'guerrero', cuerpo: '#c8233a', extra: 'guerreroCarmesi' },
    { id: 'guerrero-celeste', nombre: 'Celeste divino', pase: true, nivel: 46, de: 'guerrero', cuerpo: '#9fd8ff', extra: 'guerreroCeleste' },
    { id: 'guerrero-plateado', nombre: 'Instinto plateado', pase: true, nivel: 49, de: 'guerrero', cuerpo: '#e6ebf5', extra: 'guerreroPlateado', glow: '#d9e6ff' },
    // Pase 51-100: exclusivas del pase. Brillan las de nivel 74 en adelante.
    { id: 'astronomo', nombre: 'Astrónomo', pase: true, nivel: 55, cuerpo: '#26336e', ojo: CREMA, extra: 'astronomo' },
    { id: 'pulpo', nombre: 'Pulpo', pase: true, nivel: 62, cuerpo: '#d66fd0', extra: 'pulpo' },
    { id: 'samurai', nombre: 'Samurái', pase: true, nivel: 68, cuerpo: '#f6cfa4', extra: 'samurai', sinCachetes: true },
    { id: 'robotx', nombre: 'Mecha', pase: true, nivel: 74, cuerpo: '#eef1f6', extra: 'mecha', glow: '#ffb24d', sinOjos: true, sinBoca: true, sinCachetes: true },
    { id: 'cosmico', nombre: 'Cósmico', pase: true, nivel: 80, cuerpo: '#170e3a', ojo: CREMA, extra: 'cosmico', glow: '#9f7bff' },
    { id: 'dragonrey', nombre: 'Dragón real', pase: true, nivel: 86, cuerpo: '#f6c232', extra: 'dragonRey', glow: '#ffcf4d' },
    { id: 'fenixazul', nombre: 'Fénix de hielo', pase: true, nivel: 92, cuerpo: '#8fd8ff', ojo: '#123a66', extra: 'fenixAzul', glow: '#7fe3ff', sinBoca: true },
    { id: 'leyenda', nombre: 'Leyenda', pase: true, nivel: 100, cuerpo: '#fff3fb', extra: 'leyenda', glow: '#ffffff' },
    // Premios de cada juego: se ganan con el logro más difícil de ese juego.
    { id: 'turbo', nombre: 'Turbo', logro: 'escalador-10', cuerpo: '#2f86ff', extra: 'turbo' },
    { id: 'paraguas', nombre: 'Paraguas', logro: 'lluvia-4', cuerpo: '#8fd8ff', extra: 'paraguas' },
    { id: 'caja', nombre: 'Cajita', logro: 'clasificador-4', cuerpo: '#dba268', extra: 'caja' },
    { id: 'equilibrista', nombre: 'Equilibrista', logro: 'equilibrio-4', cuerpo: '#c7a6ff', extra: 'equilibrista' },
    { id: 'playero', nombre: 'Playero', logro: 'voley-4', cuerpo: '#f0ae7c', extra: 'playero' },
    { id: 'esquiador', nombre: 'Esquiador', logro: 'esqui-4', cuerpo: '#fdf4ee', extra: 'esquiador' },
    { id: 'luchador', nombre: 'Luchador', logro: 'pulseada-4', cuerpo: '#ffc79a', extra: 'luchador', sinCachetes: true },
    // Legendarias: brillan. Se consiguen con un código o con un secreto (logro oculto). `pista` se muestra bloqueada.
    { id: 'fantasma', nombre: 'Fantasma', legendaria: true, logro: 'secreto-fantasma', cuerpo: '#eef3ff', extra: 'fantasma', glow: '#bfe0ff',
      pista: 'Los botones de la pantalla principal esconden una combinación.' },
    { id: 'fenix', nombre: 'Fénix', legendaria: true, logro: 'secreto-fenix', cuerpo: '#ff7a3d', extra: 'fenix', glow: '#ffad4d',
      pista: 'Escapá muy, muy lejos de la lava.' },
    { id: 'glitch', nombre: 'Glitch', legendaria: true, logro: 'secreto-espejo', cuerpo: '#2b3470', ojo: '#5ff5ff', extra: 'glitch', glow: '#ff3bd4',
      pista: 'Hay minutos que se leen igual al derecho y al revés. Terminá una partida en uno.' },
    { id: 'holograma', nombre: 'Holograma', legendaria: true, codigo: true, cuerpo: '#9fe8ff', extra: 'holograma', glow: '#9fe8ff',
      pista: 'Se consigue con un código.' },
    { id: 'sombra', nombre: 'Sombra', legendaria: true, codigo: true, cuerpo: '#14152a', ojo: '#c08bff', extra: 'sombra', glow: '#8f6bff', sinCachetes: true,
      pista: 'Se consigue con un código.' },
    { id: 'dev', nombre: 'Dev', legendaria: true, exclusiva: true, codigo: true, cuerpo: '#12142a', ojo: '#5ff5ff', extra: 'dev', glow: '#5ff5ff', sinCachetes: true, sinBoca: true,
      pista: 'Solo la tiene quien hizo el juego.' },
    { id: 'sonrisa', nombre: 'Sonrisa de metal', legendaria: true, exclusiva: true, codigo: true, cuerpo: '#3a3550', extra: 'sonrisa', glow: '#ffb070', sinBoca: true, sinCachetes: true,
      pista: 'Hecha a pedido para un solo jugador.' },
    // muerte: al perder se parte en pedazos con una onda expansiva (ver morir). radio: esquinas casi rectas.
    { id: 'geo', nombre: 'Geo', legendaria: true, codigo: true, cuerpo: '#ffb52e', extra: 'geo', glow: '#5ff5ff', radio: 0.07, muerte: 'pedazos',
      sinOjos: true, sinBoca: true, sinCachetes: true, pista: 'Se consigue con un código.' },
  ];
  // Códigos (se guarda solo el hash: sha256('cubo:' + CÓDIGO en mayúsculas, sin espacios ni guiones)).
  // Cada uno da una o más cosas: el id de una skin, o 'fx:<id>' para un efecto.
  const CODIGOS = {
    '21ac801523d41ca2afdae55295d358cec55e7b078b52c4cb30635342c2e5469c': ['dev', 'fx:codigo'],
    '84c0cefa4e4958365252de6bce1d43f433b042cc385b04b95f8a25017d803b2f': ['holograma'],
    'f84cf38b4df650d7c292d2a23967e20fe305e40099116526a7e6dd642ba675ff': ['sombra'],
    '4fc29aadc1cb4782ab3fb16750ccad73b99b72b671b49c69bcc46650dce3fb5d': ['fx:aurora'],
    '586d6eb5df7242531b10f2f102171007645ef9a21b08272eab5ffd8acc409a88': ['fx:alas'],
    'b1f396b676c2285c8ceb19b6406265dd4afae29521f9253a86de66a025bfca04': ['sonrisa'],   // exclusiva de nacho
    'b96e9678392994a52ed4be7e7282ee2f6cbc80679de2c7410b85c9526afe9e23': ['geo'],
  };

  // Efectos: se dibujan alrededor del cubo en todos los juegos.
  const EFECTOS = [
    { id: 'ninguno', nombre: 'Sin efecto', nivel: 1 },
    { id: 'chispas', nombre: 'Chispas', nivel: 3 },
    { id: 'burbujas', nombre: 'Burbujas', nivel: 6 },
    { id: 'corazones', nombre: 'Corazones', nivel: 8 },
    { id: 'confeti', nombre: 'Confeti', nivel: 11 },
    { id: 'arcoiris', nombre: 'Arcoíris', nivel: 14 },
    { id: 'fuego', nombre: 'Fuego', nivel: 17 },
    { id: 'aura', nombre: 'Órbita', nivel: 21 },
    { id: 'estrellas', nombre: 'Estrellas', nivel: 25 },
    { id: 'cometa', nombre: 'Cometa', logro: 'explorador' },
    { id: 'rayos', nombre: 'Rayos', logro: 'escalador-11' },
    { id: 'infierno', nombre: 'Infierno', logro: 'extremo5' },
    { id: 'halo', nombre: 'Halo', logro: 'maestro3' },
    // Premios de juegos
    { id: 'notas', nombre: 'Notas musicales', logro: 'ritmo-4' },
    { id: 'huellitas', nombre: 'Huellitas', logro: 'paseo-4' },
    { id: 'estela', nombre: 'Estela espacial', logro: 'cohete-4' },
    // Premios grandes del camino de nivel
    { id: 'nieve', nombre: 'Nieve', pase: true, nivel: 31 },
    { id: 'ki', nombre: 'Aura de ki', pase: true, nivel: 38 },
    { id: 'fuegos', nombre: 'Fuegos artificiales', pase: true, nivel: 45 },
    { id: 'hojas', nombre: 'Hojas al viento', pase: true, nivel: 52 },
    { id: 'burbujasx', nombre: 'Burbujas de jabón', pase: true, nivel: 58 },
    { id: 'relampago', nombre: 'Electricidad', pase: true, nivel: 64 },
    { id: 'petalos', nombre: 'Pétalos', pase: true, nivel: 70 },
    { id: 'galaxiafx', nombre: 'Espiral galáctica', pase: true, nivel: 77 },
    { id: 'pixeles', nombre: 'Pixeles', pase: true, nivel: 83 },
    { id: 'corona', nombre: 'Corona de luz', pase: true, nivel: 89 },
    { id: 'supernova', nombre: 'Supernova', pase: true, nivel: 96 },
    // Legendarios
    { id: 'aurora', nombre: 'Aurora', legendaria: true, codigo: 'fx:aurora',
      pista: 'Se consigue con un código.' },
    { id: 'alas', nombre: 'Alas de luz', legendaria: true, codigo: 'fx:alas',
      pista: 'Se consigue con un código.' },
    { id: 'agujero', nombre: 'Agujero negro', legendaria: true, logro: 'secreto-maestro11',
      pista: 'Un verdadero maestro no deja ningún juego sin probar en su dificultad más alta.' },
    { id: 'tormenta', nombre: 'Tormenta', legendaria: true, logro: 'secreto-cosquillas',
      pista: 'Al cubo le dan cosquillas. Hacele muchas seguidas y vas a ver cómo se pone.' },
    { id: 'codigo', nombre: 'Lluvia de código', legendaria: true, exclusiva: true, codigo: 'fx:codigo',
      pista: 'Solo la tiene quien hizo el juego.' },
  ];

  // Títulos: se ganan subiendo de nivel y se ven debajo de tu apodo (en el ranking también).
  const TITULOS = [
    { id: 'novato', nombre: 'Novato', nivel: 1 }, { id: 'saltarin', nombre: 'Saltarín', nivel: 5 },
    { id: 'constante', nombre: 'Constante', nivel: 10 }, { id: 'veterano', nombre: 'Veterano', nivel: 15 },
    { id: 'experto', nombre: 'Experto', nivel: 20 }, { id: 'as', nombre: 'As de las flechas', nivel: 26 },
    { id: 'imparable', nombre: 'Imparable', nivel: 29 }, { id: 'reflejos', nombre: 'Reflejos de gato', nivel: 32 },
    { id: 'sinfrenos', nombre: 'Sin frenos', nivel: 34 }, { id: 'inalcanzable', nombre: 'Inalcanzable', nivel: 36 },
    { id: 'cabezafria', nombre: 'Cabeza fría', nivel: 37 }, { id: 'dedos', nombre: 'Dedos de oro', nivel: 38 },
    { id: 'mito', nombre: 'Mito', nivel: 39 }, { id: 'titan', nombre: 'Titán', nivel: 41 },
    { id: 'rayo', nombre: 'Rayo', nivel: 42 }, { id: 'fenomeno', nombre: 'Fenómeno', nivel: 43 },
    { id: 'imbatible', nombre: 'Imbatible', nivel: 44 }, { id: 'granmaestro', nombre: 'Gran maestro', nivel: 46 },
    { id: 'inmortal', nombre: 'Inmortal', nivel: 47 }, { id: 'supremo', nombre: 'Supremo', nivel: 48 },
    { id: 'leyendaviva', nombre: 'Leyenda viviente', nivel: 49 }, { id: 'campeon', nombre: 'Gran campeón', nivel: 50, pase: true },
    ...[[51, 'Incansable'], [53, 'Maratonista'], [54, 'Ojo de halcón'], [56, 'Pulso de acero'], [57, 'Sin pestañear'], [59, 'Tormenta'],
      [60, 'Sesenta y contando'], [61, 'Indomable'], [63, 'Sabio de las flechas'], [66, 'Cometa'], [67, 'Implacable'], [69, 'Hechicero'],
      [71, 'Coloso'], [72, 'Fuera de serie'], [73, 'Estratega'], [76, 'Prodigio'], [78, 'Invencible'], [79, 'Astro'], [81, 'Héroe'],
      [82, 'Titánico'], [84, 'Elegido'], [87, 'Majestad'], [88, 'Ocho infinito'], [90, 'Noventa y pico'], [91, 'Semidiós'], [93, 'Deidad'],
      [94, 'Eterno'], [97, 'Casi leyenda'], [98, 'Al borde'], [99, 'Uno más'], [100, 'Centenario']]
      .map(([nivel, nombre]) => ({ id: 't' + nivel, nombre, nivel, pase: nivel === 100 })),
  ];
  const PASE_MAX = 100;
  // Brillos de nivel: un marco que se suma a cualquier personaje y sube de rango con el nivel.
  const MARCOS = [
    { id: 'ninguno', nombre: 'Sin brillo', nivel: 1 },
    { id: 'bronce', nombre: 'Bronce', nivel: 55, pase: true }, { id: 'plata', nombre: 'Plata', nivel: 65, pase: true },
    { id: 'oro', nombre: 'Oro', nivel: 75, pase: true }, { id: 'platino', nombre: 'Platino', nivel: 85, pase: true },
    { id: 'diamante', nombre: 'Diamante', nivel: 95, pase: true }, { id: 'cosmico', nombre: 'Cósmico', nivel: 100, pase: true },
  ];

  // ---------- juegos y tablas de récords ----------
  // formato 'ms' → 10.61 s · 'num' → 1.234 + unidad. orden 'menor' = gana el número más chico.
  const tablasDif = (orden, formato, unidad) => DIFS.map(d => ({ id: d.id, nombre: d.nombre, orden, formato, unidad, dif: d.id }));
  const JUEGOS = [
    { id: 'escalador', nombre: 'Escalador', archivo: 'escalador.html', color: '#62c6ff', tablas: [
      { id: 'sprint', nombre: 'Sprint 100', orden: 'menor', formato: 'ms', dif: 'normal' },
      { id: 'time', nombre: '30 segundos', orden: 'mayor', formato: 'num', unidad: 'esc.', dif: 'normal' },
      { id: 'free', nombre: 'Libre', orden: 'mayor', formato: 'num', unidad: 'esc.', dif: 'normal' },
      { id: 'sprint-x', nombre: 'Sprint 100 Extremo', orden: 'menor', formato: 'ms', dif: 'extremo' },
      { id: 'time-x', nombre: '30 segundos Extremo', orden: 'mayor', formato: 'num', unidad: 'esc.', dif: 'extremo' },
      { id: 'free-x', nombre: 'Libre Extremo', orden: 'mayor', formato: 'num', unidad: 'esc.', dif: 'extremo' },
      { id: 'lava', nombre: 'Lava', orden: 'mayor', formato: 'num', unidad: 'esc.', dif: 'normal' },
      { id: 'lava-x', nombre: 'Lava Extremo', orden: 'mayor', formato: 'num', unidad: 'esc.', dif: 'extremo' },
      { id: 'sprint-m', nombre: 'Sprint 100 Maestro', orden: 'menor', formato: 'ms', dif: 'maestro' },
      { id: 'time-m', nombre: '30 segundos Maestro', orden: 'mayor', formato: 'num', unidad: 'esc.', dif: 'maestro' },
      { id: 'free-m', nombre: 'Libre Maestro', orden: 'mayor', formato: 'num', unidad: 'esc.', dif: 'maestro' },
      { id: 'lava-m', nombre: 'Lava Maestro', orden: 'mayor', formato: 'num', unidad: 'esc.', dif: 'maestro' },
    ] },
    { id: 'lluvia', nombre: 'Lluvia', archivo: 'lluvia.html', color: '#3fc1c9', tablas: tablasDif('mayor', 'num', 'pts') },
    { id: 'clasificador', nombre: 'Clasificador', archivo: 'clasificador.html', color: '#ffad4d', tablas: tablasDif('mayor', 'num', 'cubos') },
    { id: 'equilibrio', nombre: 'Equilibrio', archivo: 'equilibrio.html', color: '#6be0b5', tablas: tablasDif('mayor', 'num', 'm') },
    { id: 'ritmo', nombre: 'Ritmo', archivo: 'ritmo.html', color: '#8f6bff', tablas: tablasDif('mayor', 'num', 'pts') },
    { id: 'voley', nombre: 'Vóley', archivo: 'voley.html', color: '#ff7a59', nuevo: true, tablas: tablasDif('mayor', 'num', 'pts') },
    { id: 'paseo', nombre: 'Paseo', archivo: 'paseo.html', color: '#e98fd0', nuevo: true, tablas: tablasDif('mayor', 'num', 'm') },
    { id: 'cohete', nombre: 'Cohete', archivo: 'cohete.html', color: '#ff5d7d', nuevo: true, tablas: tablasDif('mayor', 'num', 'pts') },
    { id: 'esqui', nombre: 'Esquí', archivo: 'esqui.html', color: '#5b8cff', nuevo: true, tablas: tablasDif('mayor', 'num', 'm') },
    { id: 'pulseada', nombre: 'Pulseada', archivo: 'pulseada.html', color: '#f5b84a', nuevo: true, tablas: tablasDif('mayor', 'num', 'rivales') },
  ];
  const juego = id => JUEGOS.find(j => j.id === id);
  const tablaDe = (j, t) => (juego(j) || { tablas: [] }).tablas.find(x => x.id === t);
  function formato(valor, tb) {
    if (valor == null || !isFinite(valor)) return '—';
    if (tb && tb.formato === 'ms') return (valor / 1000).toFixed(2) + ' s';
    return Math.round(valor).toLocaleString('es-AR') + (tb && tb.unidad ? ' ' + tb.unidad : '');
  }
  const mejor = (tb, a, b) => (b == null ? true : tb && tb.orden === 'menor' ? a < b : a > b);

  // ---------- logros ----------
  const MEDALLAS = {
    bronce: { nombre: 'Bronce', xp: 25, color: '#e0a070' },
    plata: { nombre: 'Plata', xp: 60, color: '#c9d3e3' },
    oro: { nombre: 'Oro', xp: 150, color: '#ffcc29' },
    diamante: { nombre: 'Diamante', xp: 400, color: '#7fe3ff' },
  };
  // Umbrales de cada juego para bronce, plata, oro y diamante, pensados para un jugador promedio:
  // bronce sale en las primeras partidas, plata con práctica, oro es muy bueno y diamante es para pocos.
  // Cuentan las partidas en Normal o más difícil.
  const UMBRALES = {
    lluvia: [100, 300, 700, 1500],
    clasificador: [15, 35, 65, 100],
    equilibrio: [40, 100, 200, 350],
    ritmo: [5000, 25000, 70000, 160000],
    voley: [5, 12, 20, 32],
    paseo: [100, 250, 500, 1000],
    cohete: [200, 800, 2000, 4500],
    esqui: [250, 1000, 2500, 5000],
    pulseada: [2, 5, 9, 14],
  };
  const NOMBRES_TIER = ['Primeros pasos', 'Le agarraste la mano', 'Crack', 'Leyenda'];
  const TIERS = ['bronce', 'plata', 'oro', 'diamante'];

  const mejorEnJuego = (p, jid, desdeNormal) => {
    const j = juego(jid); let m = null;
    for (const tb of j.tablas) {
      if (desdeNormal && tb.dif === 'facil') continue;
      const v = p.mejores[jid + ':' + tb.id];
      if (v != null && mejor(tb, v, m)) m = v;
    }
    return m;
  };
  const mejorTabla = (p, jid, tid) => p.mejores[jid + ':' + tid];
  const lavaMax = p => Math.max(0, ...['lava', 'lava-x', 'lava-m'].map(t => mejorTabla(p, 'escalador', t) || 0));
  // Escalador: tu mejor marca de un modo contando Normal, Extremo y Maestro (en más difícil también vale).
  const escMejor = (p, modo) => {
    const vs = ['', '-x', '-m'].map(s => mejorTabla(p, 'escalador', modo + s)).filter(v => v != null);
    return !vs.length ? undefined : modo === 'sprint' ? Math.min(...vs) : Math.max(...vs);
  };

  const LOGROS = [
    { id: 'primera', nombre: 'Arrancamos', desc: 'Jugá tu primera partida.', medalla: 'bronce', prueba: p => p.total >= 1 },
    { id: 'explorador', nombre: 'Explorador', desc: 'Jugá a todos los juegos al menos una vez.', medalla: 'plata',
      progreso: p => [JUEGOS.filter(j => p.partidas[j.id]).length, JUEGOS.length] },
    { id: 'partidas50', nombre: 'Constante', desc: 'Jugá 50 partidas.', medalla: 'plata', progreso: p => [p.total, 50] },
    { id: 'partidas300', nombre: 'No paro más', desc: 'Jugá 300 partidas.', medalla: 'oro', progreso: p => [p.total, 300] },
    { id: 'nivel10', nombre: 'Nivel 10', desc: 'Llegá al nivel 10.', medalla: 'plata', progreso: p => [nivelDe(p.xp).nivel, 10] },
    { id: 'nivel25', nombre: 'Nivel 25', desc: 'Llegá al nivel 25.', medalla: 'oro', progreso: p => [nivelDe(p.xp).nivel, 25] },
    { id: 'extremo1', nombre: 'Pacto con el diablo', desc: 'Terminá una partida en Extremo.', medalla: 'plata',
      prueba: p => Object.keys(p.extremo).length >= 1 },
    { id: 'extremo5', nombre: 'Sin miedo', desc: 'Jugá en Extremo en 5 juegos distintos.', medalla: 'oro',
      progreso: p => [Object.keys(p.extremo).length, 5] },
    { id: 'maestro1', nombre: 'Iluminado', desc: 'Terminá una partida en Maestro.', medalla: 'oro',
      prueba: p => Object.keys(p.maestro).length >= 1 },
    { id: 'maestro3', nombre: 'Gran maestro', desc: 'Jugá en Maestro en 3 juegos distintos.', medalla: 'diamante',
      progreso: p => [Object.keys(p.maestro).length, 3] },
    { id: 'logros10', nombre: 'Coleccionista', desc: 'Conseguí 10 logros.', medalla: 'plata',
      progreso: p => [Object.keys(p.logros).length, 10] },
    { id: 'leyenda', nombre: 'Leyenda viva', desc: 'Conseguí una medalla de diamante en cualquier juego.', medalla: 'diamante',
      prueba: p => LOGROS.some(l => l.medalla === 'diamante' && l.id !== 'leyenda' && p.logros[l.id]) },

    // Escalador: Sprint 100. Un jugador promedio toca unas 6 o 7 flechas por segundo.
    { id: 'escalador-20', juego: 'escalador', nombre: 'Primer sprint', desc: 'Sprint 100 en menos de 20 s.', medalla: 'bronce',
      prueba: p => escMejor(p, 'sprint') < 20000 },
    { id: 'escalador-14', juego: 'escalador', nombre: 'Dedos rápidos', desc: 'Sprint 100 en menos de 14 s.', medalla: 'plata',
      prueba: p => escMejor(p, 'sprint') < 14000 },
    { id: 'escalador-12', juego: 'escalador', nombre: 'Velocista', desc: 'Sprint 100 en menos de 12 s.', medalla: 'oro',
      prueba: p => escMejor(p, 'sprint') < 12000 },
    { id: 'escalador-11', juego: 'escalador', nombre: 'Dedos de rayo', desc: 'Sprint 100 en menos de 11 s. Muy pocos llegan.', medalla: 'diamante',
      prueba: p => escMejor(p, 'sprint') < 11000 },
    { id: 'escalador-10', juego: 'escalador', nombre: 'Inhumano', desc: 'Sprint 100 en menos de 10.5 s.', medalla: 'diamante',
      prueba: p => escMejor(p, 'sprint') < 10500 },
    { id: 'escalador-limpio', juego: 'escalador', nombre: 'Sin un error', desc: 'Sprint 100 sin equivocarte ni una vez.', medalla: 'plata',
      prueba: p => !!p.marcas['escalador-limpio'] },
    { id: 'escalador-30', juego: 'escalador', nombre: 'Medio minuto', desc: 'Más de 200 escalones en 30 segundos.', medalla: 'oro',
      prueba: p => escMejor(p, 'time') > 200 },
    { id: 'escalador-espacio', juego: 'escalador', nombre: 'Houston', desc: 'Llegá al espacio en Libre (escalón 330).', medalla: 'plata',
      prueba: p => (escMejor(p, 'free') || 0) >= 330 },
    // Pulseada: alternando con dos dedos un promedio hace 6 a 8 toques por segundo; 10 sostenidos es de muy buenos.
    { id: 'pulseada-tps10', juego: 'pulseada', nombre: 'Diez por segundo', desc: 'Sostené 10 toques por segundo en la Pulseada.', medalla: 'oro',
      prueba: p => !!p.marcas['tps10'] },
    { id: 'escalador-x', juego: 'escalador', nombre: 'Escalera del infierno', desc: 'Sprint 100 en Extremo en menos de 15 s.', medalla: 'oro',
      prueba: p => mejorTabla(p, 'escalador', 'sprint-x') < 15000 },
    { id: 'escalador-lava', juego: 'escalador', nombre: 'Pies calientes', desc: 'Escapá de la lava por 150 escalones.', medalla: 'bronce',
      prueba: p => lavaMax(p) >= 150 },
    { id: 'escalador-lava2', juego: 'escalador', nombre: 'Volcanólogo', desc: 'Escapá de la lava por 300 escalones.', medalla: 'oro',
      prueba: p => lavaMax(p) >= 300 },
    // Ocultos: no se ven en la lista hasta que salen.
    { id: 'secreto-fantasma', oculto: true, nombre: 'Combinación secreta', desc: 'Encontraste la combinación de los botones.', medalla: 'oro',
      prueba: p => !!p.marcas['fantasma'] },
    { id: 'secreto-fenix', oculto: true, juego: 'escalador', nombre: 'Renacer', desc: 'Escapaste de la lava por 450 escalones.', medalla: 'diamante',
      prueba: p => lavaMax(p) >= 450 },
    { id: 'secreto-espejo', oculto: true, nombre: 'Hora espejo', desc: 'Terminaste una partida a una hora capicúa, como las 12:21.', medalla: 'oro',
      prueba: p => !!p.marcas['espejo'] },
    { id: 'secreto-cosquillas', oculto: true, nombre: 'Cosquillas', desc: 'Le hiciste cosquillas a tu personaje.', medalla: 'oro',
      prueba: p => !!p.marcas['cosquillas'] },
    { id: 'secreto-maestro11', oculto: true, nombre: 'Maestro de todo', desc: 'Jugaste todos los juegos en Maestro.', medalla: 'diamante',
      prueba: p => JUEGOS.every(j => p.maestro[j.id]) },
  ];
  for (const [jid, u] of Object.entries(UMBRALES)) {
    const j = juego(jid), tb = j.tablas[1];
    u.forEach((v, k) => LOGROS.push({
      id: `${jid}-${k + 1}`, juego: jid, nombre: `${j.nombre}: ${NOMBRES_TIER[k]}`, medalla: TIERS[k],
      desc: `Hacé ${formato(v, tb)} o más en Normal o más difícil.`,
      prueba: p => (mejorEnJuego(p, jid, true) || 0) >= v,
    }));
  }
  const tieneLogro = (p, l) => (l.prueba ? l.prueba(p) : (() => { const [a, b] = l.progreso(p); return a >= b; })());

  // XP para pasar del nivel n al n+1
  const xpPara = n => 80 + 40 * (n - 1);

  // ---------- perfil guardado ----------
  function leer() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!p || typeof p !== 'object') p = {};
    const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    return {
      xp: Math.max(0, +p.xp || 0),
      skin: typeof p.skin === 'string' ? p.skin : 'clasico',
      efecto: typeof p.efecto === 'string' ? p.efecto : 'ninguno',
      records: obj(p.records),
      mejores: obj(p.mejores),
      partidas: obj(p.partidas),
      total: +p.total || 0,
      logros: obj(p.logros),
      marcas: obj(p.marcas),
      extremo: obj(p.extremo),
      maestro: obj(p.maestro),
      codigos: Array.isArray(p.codigos) ? p.codigos.filter(c => typeof c === 'string') : [],
      vistos: Array.isArray(p.vistos) ? p.vistos : null,
      apodo: typeof p.apodo === 'string' ? p.apodo : '',
      id: typeof p.id === 'string' ? p.id : '',
      clave: typeof p.clave === 'string' ? p.clave : '',
      skinSubida: typeof p.skinSubida === 'string' ? p.skinSubida : '',
      apodoPerdido: typeof p.apodoPerdido === 'string' ? p.apodoPerdido : '',
      titulo: typeof p.titulo === 'string' ? p.titulo : 'novato',
      marco: typeof p.marco === 'string' ? p.marco : '',
      codigoAmigo: typeof p.codigoAmigo === 'string' ? p.codigoAmigo : '',
      amigos: Array.isArray(p.amigos) ? p.amigos.filter(a => a && typeof a.codigo === 'string' && typeof a.huella === 'string').slice(0, 50) : [],
      pendientes: Array.isArray(p.pendientes) ? p.pendientes.slice(-40) : [],
    };
  }
  let datos = leer();
  const guardar = () => { try { localStorage.setItem(KEY, JSON.stringify(datos)); } catch (e) {} };
  if (!datos.id) {
    datos.id = crypto.randomUUID ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
    guardar();
  }

  function nivelDe(xp) {
    let n = 1, resto = xp;
    while (resto >= xpPara(n)) { resto -= xpPara(n); n++; }
    return { nivel: n, enNivel: resto, paraSiguiente: xpPara(n) };
  }
  // Un código guarda el id de la skin, o 'fx:<id>' si es un efecto (algunos ids se repiten entre skins y efectos).
  const claveCodigo = item => (item.codigo === true ? item.id : item.codigo);
  const libre = (item, p = datos) => (item.codigo ? p.codigos.includes(claveCodigo(item))
    : item.logro ? !!p.logros[item.logro] : nivelDe(p.xp).nivel >= (item.nivel || 1));
  // Lo desbloqueado que todavía no se vio en la pantalla de personajes, para marcarlo como nuevo.
  function nuevos() {
    datos = leer();
    const todos = [...SKINS, ...EFECTOS.map(e => ({ ...e, id: 'fx:' + e.id }))].filter(i => libre(i));
    if (!datos.vistos) { datos.vistos = todos.map(i => i.id); guardar(); return []; }
    return todos.filter(i => !datos.vistos.includes(i.id)).map(i => i.id);
  }
  function marcarVistos() { datos = leer(); datos.vistos = null; guardar(); nuevos(); }

  function skin() {
    const s = SKINS.find(k => k.id === datos.skin);
    return s && libre(s) ? s : SKINS[0];
  }
  function efecto() {
    const e = EFECTOS.find(k => k.id === datos.efecto);
    return e && libre(e) ? e : EFECTOS[0];
  }
  // sin elegir, se usa el mejor brillo que tengas
  function marco() {
    const libres = MARCOS.filter(m => libre(m));
    const x = MARCOS.find(k => k.id === datos.marco);
    return x && libre(x) ? x : libres[libres.length - 1];
  }
  function elegirMarco(id) {
    datos = leer();
    const x = MARCOS.find(k => k.id === id);
    if (!x || !libre(x)) return false;
    datos.marco = id; guardar();
    return true;
  }
  function titulo() {
    const x = TITULOS.find(k => k.id === datos.titulo);
    return x && libre(x) ? x : TITULOS[0];
  }
  // El camino de nivel: qué da cada nivel, del 1 al PASE_MAX (skins, efectos, brillos y títulos que salen por nivel).
  function pase() {
    const n = nivelDe(leer().xp).nivel;
    const porNivelDe = (lista, tipo) => lista.filter(i => i.nivel && !i.logro && !i.codigo && i.id !== 'ninguno').map(it => ({ tipo, it }));
    const todos = [...porNivelDe(SKINS, 'skin'), ...porNivelDe(EFECTOS, 'efecto'), ...porNivelDe(MARCOS, 'marco'), ...porNivelDe(TITULOS, 'titulo')];
    return Array.from({ length: PASE_MAX }, (_, k) => ({ nivel: k + 1, listo: n >= k + 1, premios: todos.filter(x => x.it.nivel === k + 1) }));
  }
  function perfil() {
    datos = leer(); // otro juego pudo haberlo cambiado
    return {
      xp: datos.xp, ...nivelDe(datos.xp), skin: skin(), efecto: efecto(), records: { ...datos.records },
      mejores: { ...datos.mejores }, partidas: { ...datos.partidas }, total: datos.total,
      logros: { ...datos.logros }, extremo: { ...datos.extremo }, maestro: { ...datos.maestro }, marcas: { ...datos.marcas },
      codigos: [...datos.codigos], apodo: datos.apodo, id: datos.id, titulo: titulo(), marco: marco(),
      codigoAmigo: datos.codigoAmigo, amigos: datos.amigos.map(a => ({ ...a })),
    };
  }
  function elegirSkin(id) {
    datos = leer();
    const s = SKINS.find(k => k.id === id);
    if (!s || !libre(s)) return false;
    datos.skin = id; guardar();
    subirPendientes();   // el ranking muestra tu skin actual
    return true;
  }
  // Canjea un código. Devuelve { ok, skin } o { ok: false, msg }.
  async function canjear(texto) {
    const limpio = String(texto || '').toUpperCase().replace(/[\s-]/g, '');
    if (!limpio) return { ok: false, msg: 'Escribí un código.' };
    let hash = '';
    try {
      const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('cubo:' + limpio));
      hash = [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { return { ok: false, msg: 'No se pudo revisar el código en este navegador.' }; }
    const ids = CODIGOS[hash] || [];
    const deCodigo = k => (k.startsWith('fx:') ? EFECTOS.find(e => e.codigo === k) : SKINS.find(x => x.id === k));
    const items = ids.map(deCodigo).filter(Boolean);
    if (!items.length) return { ok: false, msg: 'Ese código no existe.' };
    const sk = items.find(i => SKINS.includes(i)), fx = items.find(i => EFECTOS.includes(i));
    datos = leer();
    const faltan = ids.filter(k => !datos.codigos.includes(k));
    if (!faltan.length) return { ok: true, items, skin: sk, efecto: fx, ya: true };
    datos.codigos.push(...faltan);
    if (sk) datos.skin = sk.id;
    if (fx) datos.efecto = fx.id;
    guardar();
    subirPendientes();
    avisar(`<canvas width="96" height="104" style="width:48px;height:52px;flex:none"></canvas><div><b>¡${items.map(i => i.nombre).join(' y ')}!</b><span>${sk ? 'Personaje' : 'Efecto'} legendario desbloqueado</span></div>`, 4200);
    const cv = document.querySelector('#cc-avisos .cc-aviso:last-child canvas');
    if (cv) { const c = cv.getContext('2d'); c.scale(2, 2); dibujarCubo(c, 24, 46, 28, { skin: sk || skin(), t: 900, efecto: fx ? fx.id : false }); }
    return { ok: true, items, skin: sk, efecto: fx };
  }
  // Para secretos que se descubren fuera de una partida (por ejemplo, en la pantalla principal).
  function marcar(m) {
    datos = leer();
    if (datos.marcas[m]) return [];
    datos.marcas[m] = 1; guardar();
    return revisarLogros();
  }
  function elegirEfecto(id) {
    datos = leer();
    const e = EFECTOS.find(k => k.id === id);
    if (!e || !libre(e)) return false;
    datos.efecto = id; guardar();
    return true;
  }
  function elegirTitulo(id) {
    datos = leer();
    const x = TITULOS.find(k => k.id === id);
    if (!x || !libre(x)) return false;
    datos.titulo = id; guardar();
    subirPendientes();   // el ranking muestra tu título
    return true;
  }
  // Lo que desbloquea pasar del nivel a al b
  const porNivel = (a, b) => [...SKINS, ...EFECTOS, ...TITULOS, ...MARCOS].filter(i => i.nivel > a && i.nivel <= b && !i.logro && !i.codigo);

  // Suma XP sin pasar por partida(). Devuelve { ganada, nivel, subio, desbloqueadas }.
  function sumarXP(n, silencioso) {
    const r = sumarSolo(n, silencioso);
    if (r.subio) revisarLogros();
    return r;
  }
  function sumarSolo(n, silencioso) {
    datos = leer();
    n = Math.max(0, Math.round(+n || 0));
    const antes = nivelDe(datos.xp).nivel;
    datos.xp += n; guardar();
    const ahora = nivelDe(datos.xp).nivel;
    const nuevas = porNivel(antes, ahora);
    if (ahora > antes && !silencioso) avisoNivel(ahora, nuevas);
    return { ganada: n, nivel: ahora, subio: ahora > antes, desbloqueadas: nuevas.map(s => s.nombre) };
  }
  function anotarRecord(jid, texto) {
    datos = leer(); datos.records[jid] = String(texto); guardar();
  }
  function revisarLogros() {
    datos = leer();
    const ganados = [];
    // Un logro puede destrabar otro (por ejemplo, Coleccionista): se repite hasta que no cambia nada.
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      let hubo = false;
      for (const l of LOGROS) {
        if (datos.logros[l.id]) continue;
        let ok = false;
        try { ok = tieneLogro(datos, l); } catch (e) {}
        if (ok) { datos.logros[l.id] = Date.now(); ganados.push(l); hubo = true; }
      }
      if (!hubo) break;
    }
    if (!ganados.length) return [];
    const antes = nivelDe(datos.xp).nivel;
    datos.xp += ganados.reduce((a, l) => a + MEDALLAS[l.medalla].xp, 0);
    guardar();
    for (const l of ganados) avisoLogro(l);
    const ahora = nivelDe(datos.xp).nivel;
    if (ahora > antes) avisoNivel(ahora, porNivel(antes, ahora));
    return ganados;
  }

  // XP según qué tan bien jugaste: `malo` da `min`, `experto` da `max` y por encima sigue subiendo un poco.
  // Sirve igual si gana el número más chico (por ejemplo un tiempo): pasá malo > experto.
  function xpEscala(valor, malo, experto, min = 6, max = 60) {
    const f = Math.max(0, Math.min(1.35, (valor - malo) / (experto - malo || 1)));
    return Math.round(min + (max - min) * Math.pow(f, 1.3));
  }

  // Fin de partida. Ver el comentario de arriba.
  function partida(o) {
    datos = leer();
    const nivelAntes = nivelDe(datos.xp).nivel;
    const tb = tablaDe(o.juego, o.tabla);
    const clave = o.juego + ':' + o.tabla;
    const dif = DIFS.find(d => d.id === (o.dif || (tb && tb.dif))) || null;
    const valor = +o.valor;
    const anterior = datos.mejores[clave];
    const valido = isFinite(valor) && valor > 0 && !o.sinRecord;
    const record = valido && mejor(tb, valor, anterior);
    if (record) {
      datos.mejores[clave] = valor;
      if (o.texto) datos.records[o.juego] = String(o.texto);
      if (datos.apodo) encolar(o.juego, o.tabla, valor);
    }
    datos.partidas[o.juego] = (datos.partidas[o.juego] || 0) + 1;
    datos.total++;
    if (dif && DURAS.includes(dif.id)) datos.extremo[o.juego] = 1;
    if (dif && dif.id === 'maestro') datos.maestro[o.juego] = 1;
    // hora capicúa (se lee igual al revés): 11:11, 12:21, 20:02… son 16 minutos por día
    const ahora = new Date(), hhmm = String(ahora.getHours()).padStart(2, '0') + String(ahora.getMinutes()).padStart(2, '0');
    if (hhmm === [...hhmm].reverse().join('')) datos.marcas['espejo'] = 1;
    for (const m of o.marcas || []) datos.marcas[m] = 1;
    const base = Math.max(0, Math.round(+o.xp || 0));
    let xp = Math.round(base * (dif ? dif.xp : 1));
    if (record && anterior != null) xp = Math.round(xp * 1.25);
    guardar();
    const r = sumarSolo(xp);
    const logros = revisarLogros();
    if (record) subirPendientes();
    return {
      xp: r.ganada + logros.reduce((a, l) => a + MEDALLAS[l.medalla].xp, 0), base, nivel: perfil().nivel, subio: perfil().nivel > nivelAntes,
      record, primera: record && anterior == null, anterior: anterior ?? null,
      logros: logros.map(l => l.nombre), dif: dif ? dif.id : null,
      texto: formato(valor, tb), textoAnterior: anterior != null ? formato(anterior, tb) : null,
    };
  }

  // Para juegos que ya guardaban récords antes: los pasa al perfil (y al ranking) sin sumar partidas ni XP.
  function importarRecord(jid, tid, valor) {
    datos = leer();
    const tb = tablaDe(jid, tid), clave = jid + ':' + tid;
    valor = +valor;
    if (!tb || !isFinite(valor) || valor <= 0 || !mejor(tb, valor, datos.mejores[clave])) return false;
    datos.mejores[clave] = valor;
    if (datos.apodo) encolar(jid, tid, valor);
    guardar();
    return true;
  }

  // ---------- ranking online ----------
  const rankingActivo = () => !!(RANKING.url && RANKING.clave);
  function encolar(jid, tid, valor) {
    datos.pendientes = datos.pendientes.filter(x => !(x.j === jid && x.t === tid));
    datos.pendientes.push({ j: jid, t: tid, v: valor });
  }
  async function api(ruta, opciones = {}) {
    const r = await fetch(RANKING.url.replace(/\/$/, '') + '/rest/v1/' + ruta, {
      ...opciones,
      headers: { apikey: RANKING.clave, 'Content-Type': 'application/json', ...(opciones.headers || {}) },
    });
    if (!r.ok) throw new Error('ranking ' + r.status);
    return r.status === 204 ? null : r.json();
  }
  // La subida va por detrás; `subiendo` es la promesa en curso, así el ranking espera a que termine antes de cargar.
  let subiendo = null;
  function subirPendientes() {
    if (!subiendo) subiendo = subir().finally(() => { subiendo = null; });
    return subiendo;
  }
  // Tu apodo y tu skin se guardan una sola vez en el servidor, y el ranking los muestra en todas tus filas.
  const registrar = apodo => api('rpc/registrar_jugador', { method: 'POST', body: JSON.stringify({ p_jugador: datos.id, p_apodo: apodo, p_skin: skin().id, p_titulo: titulo().nombre }) });
  const firma = () => skin().id + '|' + titulo().id;   // lo que el servidor ya sabe de vos
  async function asegurarJugador() {
    datos = leer();
    const f = firma();
    if (datos.clave && datos.codigoAmigo && datos.skinSubida === f) return;
    const r = await registrar(datos.apodo);
    datos = leer();
    if (r && r.estado === 'ok') { datos.clave = r.clave; datos.codigoAmigo = r.codigo || ''; datos.skinSubida = f; }
    // el apodo ya era de otra persona (o de vos en otro dispositivo): hay que elegir otro o usar la clave
    else if (r && r.estado === 'ocupado') { datos.apodoPerdido = datos.apodo; datos.apodo = ''; datos.clave = ''; }
    guardar();
  }
  async function subir() {
    datos = leer();
    if (!rankingActivo() || !datos.apodo || navigator.onLine === false) return;
    try {
      await asegurarJugador();
      if (!datos.apodo) return;
      while (true) {
        datos = leer();
        const x = datos.pendientes[0];
        if (!x) break;
        await api('rpc/enviar_puntaje', { method: 'POST', body: JSON.stringify({
          p_tabla: x.j + ':' + x.t, p_jugador: datos.id, p_apodo: datos.apodo, p_valor: x.v, p_skin: skin().id,
        }) });
        datos = leer(); datos.pendientes = datos.pendientes.filter(y => y !== x && !(y.j === x.j && y.t === x.t && y.v === x.v)); guardar();
      }
    } catch (e) { /* sin conexión o servidor caído: queda en la cola */ }
  }
  // Espera la subida en curso (o la arranca si quedó algo en la cola), como mucho `ms`.
  const esperarSubida = (ms = 5000) => Promise.race([subirPendientes(), new Promise(r => setTimeout(r, ms))]);
  addEventListener('online', subirPendientes);
  setTimeout(subirPendientes, 1500);

  async function huella() {
    try {
      const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(datos.id));
      return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
    } catch (e) { return ''; }
  }
  // Top de una tabla: [{ apodo, valor, skin, yo }] más tu puesto si no estás en la lista.
  async function top(jid, tid, n = 50, o = {}) {
    const tb = tablaDe(jid, tid);
    const orden = tb && tb.orden === 'menor' ? 'asc' : 'desc';
    const t = encodeURIComponent(jid + ':' + tid);
    const mia = await huella();
    // solo amigos: vos y los que agregaste
    const filtro = o.amigos ? `&huella=in.(${[mia, ...leer().amigos.map(a => a.huella)].filter(Boolean).join(',')})` : '';
    const filas = await api(`ranking?tabla=eq.${t}${filtro}&select=apodo,valor,skin,huella,titulo&order=valor.${orden},creado.asc&limit=${n}`);
    const lista = filas.map((f, k) => ({ puesto: k + 1, apodo: f.apodo, valor: +f.valor, skin: f.skin, titulo: f.titulo || '', yo: !!mia && f.huella === mia }));
    let yo = lista.find(f => f.yo) || null;
    const mio = leer().mejores[jid + ':' + tid];
    if (!yo && !o.amigos && mio != null && leer().apodo) {
      try {
        const op = orden === 'asc' ? 'lt' : 'gt';
        const r = await fetch(RANKING.url.replace(/\/$/, '') + `/rest/v1/ranking?tabla=eq.${t}&valor=${op}.${mio}&select=huella`, {
          method: 'HEAD', headers: { apikey: RANKING.clave, Prefer: 'count=exact' },
        });
        const total = +(r.headers.get('content-range') || '').split('/')[1];
        if (isFinite(total)) yo = { puesto: total + 1, apodo: leer().apodo, valor: mio, skin: skin().id, titulo: titulo().nombre, yo: true, afuera: true };
      } catch (e) {}
    }
    return { lista, yo };
  }
  function limpiarApodo(s) {
    return String(s || '').normalize('NFC').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  }
  const sinRed = () => (!rankingActivo() || navigator.onLine === false ? { ok: false, msg: 'Necesitás internet para esto.' } : null);
  function subirTodo() {
    for (const [k, v] of Object.entries(datos.mejores)) { const [j, t] = k.split(':'); if (tablaDe(j, t)) encolar(j, t, v); }
  }
  // Elegir o cambiar el apodo. Cada apodo es de una sola persona: si ya lo tiene otra, no se puede.
  // Devuelve false si el apodo no sirve, o una promesa con { ok, msg }.
  function ponerApodo(s) {
    const a = limpiarApodo(s);
    if (a.length < 3) return false;
    const err = sinRed();
    if (err) return Promise.resolve(err);
    return (async () => {
      let r;
      try { await subiendo; datos = leer(); r = await registrar(a); }
      catch (e) { return { ok: false, msg: 'No se pudo guardar el apodo. Probá de nuevo en un rato.' }; }
      if (r && r.estado === 'ocupado') return { ok: false, msg: `«${a}» ya es de otra persona. Elegí otro, o si es tuyo, entrá con tu clave.` };
      if (!r || r.estado !== 'ok') return { ok: false, msg: 'El apodo tiene que tener entre 3 y 14 letras o números.' };
      datos = leer();
      datos.apodo = a; datos.clave = r.clave; datos.codigoAmigo = r.codigo || ''; datos.skinSubida = firma(); datos.apodoPerdido = '';
      subirTodo();   // al estrenar el apodo se suben todos tus récords
      guardar();
      await subirPendientes();
      return { ok: true };
    })();
  }
  // Usar en este dispositivo el apodo que ya tenés en otro, con su clave. Lo de acá se suma a lo tuyo.
  async function vincular(apodo, clave) {
    const a = limpiarApodo(apodo);
    if (a.length < 3 || !String(clave || '').trim()) return { ok: false, msg: 'Escribí tu apodo y tu clave.' };
    const err = sinRed();
    if (err) return err;
    let r;
    try {
      await subiendo; datos = leer();
      r = await api('rpc/vincular_jugador', { method: 'POST', body: JSON.stringify({ p_apodo: a, p_clave: clave, p_viejo: datos.id }) });
    } catch (e) { return { ok: false, msg: 'No se pudo conectar. Probá de nuevo en un rato.' }; }
    if (!r || !r.id) return { ok: false, msg: 'El apodo y la clave no coinciden.' };
    datos = leer();
    datos.id = r.id; datos.apodo = r.apodo; datos.clave = r.clave; datos.skinSubida = ''; datos.codigoAmigo = ''; datos.apodoPerdido = '';
    subirTodo();
    guardar();
    await subirPendientes();
    return { ok: true, apodo: r.apodo };
  }
  const claveLinda = c => (c && c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c);

  // ---------- amigos ----------
  // Cada jugador con apodo tiene un código de amigo (6 letras). Los amigos se guardan en este dispositivo.
  const limpiarCodigo = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const buscarAmigo = c => api('rpc/buscar_amigo', { method: 'POST', body: JSON.stringify({ p_codigo: c }) });
  async function agregarAmigo(codigo) {
    const c = limpiarCodigo(codigo);
    if (c.length !== 6) return { ok: false, msg: 'El código de amigo tiene 6 letras y números.' };
    const err = sinRed();
    if (err) return err;
    datos = leer();
    if (c === datos.codigoAmigo) return { ok: false, msg: 'Ese es tu propio código. Pasáselo a tus amigos.' };
    if (datos.amigos.some(a => a.codigo === c)) return { ok: false, msg: 'Ya lo tenés en tus amigos.' };
    let r;
    try { r = await buscarAmigo(c); } catch (e) { return { ok: false, msg: 'No se pudo conectar. Probá de nuevo en un rato.' }; }
    if (!r || !r.huella) return { ok: false, msg: 'No hay nadie con ese código.' };
    datos = leer();
    const a = { codigo: c, apodo: r.apodo, huella: r.huella, skin: r.skin, titulo: r.titulo || '' };
    datos.amigos.push(a); guardar();
    return { ok: true, amigo: a };
  }
  function quitarAmigo(codigo) {
    datos = leer(); datos.amigos = datos.amigos.filter(a => a.codigo !== codigo); guardar();
  }
  // Trae el apodo, la skin y el título actuales de cada amigo.
  async function refrescarAmigos() {
    if (sinRed()) return leer().amigos;
    const lista = leer().amigos;
    const nuevos = await Promise.all(lista.map(a => buscarAmigo(a.codigo).then(r => (r ? { ...a, apodo: r.apodo, skin: r.skin, titulo: r.titulo || '' } : a), () => a)));
    datos = leer();
    datos.amigos = datos.amigos.map(a => nuevos.find(n => n.codigo === a.codigo) || a); guardar();
    return datos.amigos;
  }
  // Versus: tu mejor marca contra la de un amigo en cada modo que jugaron los dos.
  async function versus(amigo) {
    const mia = await huella();
    const filas = await api(`ranking?huella=in.(${mia},${amigo.huella})&select=tabla,valor,huella`);
    const mejores = leer().mejores, porTabla = {};
    for (const f of filas) (porTabla[f.tabla] ??= {})[f.huella === mia ? 'yo' : 'el'] = +f.valor;
    for (const [k, v] of Object.entries(mejores)) if (v != null) (porTabla[k] ??= {}).yo = v;   // lo tuyo, aunque no se haya subido
    const lista = [];
    for (const [k, v] of Object.entries(porTabla)) {
      const [jid, tid] = k.split(':'), tb = tablaDe(jid, tid);
      if (!tb) continue;
      let gana = null;
      if (v.yo != null && v.el != null && v.yo !== v.el) gana = (tb.orden === 'menor' ? v.yo < v.el : v.yo > v.el) ? 'yo' : 'el';
      lista.push({ juego: jid, tabla: tid, tb, yo: v.yo ?? null, el: v.el ?? null, gana });
    }
    const orden = JUEGOS.map(j => j.id);
    lista.sort((a, b) => orden.indexOf(a.juego) - orden.indexOf(b.juego) || juego(a.juego).tablas.indexOf(a.tb) - juego(b.juego).tablas.indexOf(b.tb));
    return { lista, yo: lista.filter(x => x.gana === 'yo').length, el: lista.filter(x => x.gana === 'el').length };
  }

  // ---------- estilos de lo que dibuja esta librería en la página ----------
  function estilos() {
    if (document.getElementById('cc-estilos')) return;
    const st = document.createElement('style');
    st.id = 'cc-estilos';
    st.textContent = `
.cc-difs{display:grid;grid-template-columns:repeat(var(--n,5),minmax(0,1fr));gap:3px;width:100%;box-sizing:border-box;padding:4px;
  background:#ece8dc;border:2.5px solid ${INK};border-radius:16px}
.cc-dif{appearance:none;font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-height:60px;min-width:0;
  padding:7px 2px 6px;border:0;border-radius:11px;background:transparent;color:${INK};box-shadow:none;
  font-family:"Lilita One","Trebuchet MS",sans-serif;font-size:clamp(12px,3.5vw,15px);line-height:1;transition:background .15s,transform .08s}
.cc-dif small{font-family:"Rubik",system-ui,sans-serif;font-weight:700;font-size:10.5px;opacity:.7;white-space:nowrap}
.cc-dif:hover{background:rgba(255,255,255,.65)}
.cc-dif:active{transform:scale(.95)}
.cc-dif[aria-checked="true"]{background:#ffcc29;box-shadow:inset 0 0 0 2.5px ${INK}}
.cc-dif[data-d="extremo"]{color:#b3122a}
.cc-dif[data-d="extremo"][aria-checked="true"]{background:#ff6b6b;color:${INK}}
.cc-dif[data-d="maestro"]{color:#5b2bbf}
.cc-dif[data-d="maestro"][aria-checked="true"]{background:#b49bff;color:${INK}}
.cc-difs.compacto{padding:3px;border-radius:14px}
.cc-difs.compacto .cc-dif{min-height:42px;padding:4px 2px;border-radius:10px;font-size:12px}
.cc-difs.compacto .cc-dif small{display:none}
/* casita para volver a los juegos: a la izquierda del nombre del juego, o arriba a la izquierda de la tarjeta */
.card button.cc-casa{position:relative!important;flex:none;z-index:3;display:grid!important;place-items:center;
  width:46px!important;height:46px!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;
  border:2.5px solid ${INK}!important;border-radius:14px!important;background:#fff!important;color:${INK}!important;
  box-shadow:0 3px 0 ${INK}!important;cursor:pointer;opacity:1!important;transition:transform .08s}
.card button.cc-casa.esquina{position:absolute!important;top:12px!important;left:12px!important}
.card button.cc-casa[hidden]{display:none!important}
.cc-cabeza{display:flex;align-items:center;gap:10px}
.cc-cabeza>.brand{flex:1;min-width:0}
.cc-con-casa .result h2{padding-inline:50px}
.card button.cc-casa svg{width:25px;height:25px;margin:0}
.card button.cc-casa:hover{background:#fff4c7!important}
.card button.cc-casa:active{transform:translateY(2px);box-shadow:0 1px 0 ${INK}!important}
.card button.cc-casa:focus-visible{outline:3px solid #ff5d7d;outline-offset:2px}
/* leyenda de teclas: información, no botones (sin sombra, más tenue) */
.cc-teclas{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 14px;margin:0;font:600 12px/1.2 "Rubik",system-ui,sans-serif;color:${INK};opacity:.8}
.cc-teclas .g{display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:center}
.cc-teclas .t{font:800 9.5px/1 "Rubik",system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:3px 5px;border-radius:5px;background:${INK};color:${CREMA};margin-right:2px}
.cc-teclas .g.menu .t{background:transparent;color:${INK};border:1.5px dashed ${INK}}
.cc-teclas kbd{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 4px;border:1.5px solid ${INK};border-radius:5px;
  background:transparent;box-shadow:none;font:800 11px/1 "Rubik",system-ui,sans-serif;color:${INK}}
.cc-teclas .g.juego kbd.f{background:#ffe27a}
@media (pointer:coarse){.cc-teclas{display:none}}
#cc-avisos{zoom:var(--ui,1)}
.cc-dif:focus-visible{outline:3px solid #ff5d7d;outline-offset:2px}
.cc-difs-nota{grid-column:1/-1;margin:2px 0 0;font:600 12px/1.35 "Rubik",system-ui,sans-serif;color:inherit;opacity:.85;text-align:center;min-height:16px}
#cc-avisos{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 76px);transform:translateX(-50%);z-index:9999;
  display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:max-content;max-width:calc(100vw - 32px)}
.cc-aviso{display:flex;align-items:center;gap:12px;background:${CREMA};color:${INK};border:3px solid ${INK};border-radius:16px;
  box-shadow:0 5px 0 ${INK};padding:9px 15px 9px 10px;font-family:"Rubik",system-ui,sans-serif}
.cc-aviso b{display:block;font-family:"Lilita One","Trebuchet MS",sans-serif;font-weight:400;font-size:21px;line-height:1.05}
.cc-aviso span{display:block;font-size:13px;font-weight:600;margin-top:2px}
.cc-medalla{flex:none;width:40px;height:40px;border-radius:50%;border:3px solid ${INK};display:grid;place-items:center;
  font-family:"Lilita One","Trebuchet MS",sans-serif;font-size:18px;color:${INK}}
#cc-rank{position:fixed;inset:0;z-index:9998;display:flex;align-items:flex-end;justify-content:center;background:rgba(29,35,64,.55);box-sizing:border-box;
  padding:12px 12px calc(12px + env(safe-area-inset-bottom,0px));font-family:"Rubik",system-ui,sans-serif;color:${INK}}
@media (min-width:600px) and (min-height:560px){#cc-rank{align-items:center}}
#cc-rank *{box-sizing:border-box}
#cc-rank .cc-rk{zoom:var(--ui,1);width:100%;max-width:440px;max-height:min(680px,calc((100dvh - 24px) / var(--ui,1)));display:flex;flex-direction:column;
  background:${CREMA};border:3px solid ${INK};border-radius:22px;box-shadow:0 6px 0 ${INK};overflow:hidden;animation:cc-sube .2s ease-out}
@keyframes cc-sube{from{transform:translateY(16px);opacity:0}}
#cc-rank header{display:flex;align-items:center;gap:8px;padding:14px 10px 10px 18px}
#cc-rank header > div{flex:1;min-width:0}
#cc-rank h2{margin:0;font:400 26px/1 "Lilita One","Trebuchet MS",sans-serif}
#cc-rank header small{display:block;margin-top:3px;font-size:13px;font-weight:700;opacity:.6}
#cc-rank .x{appearance:none;flex:none;width:44px;height:44px;border-radius:12px;border:2.5px solid ${INK};background:#fff;box-shadow:0 3px 0 ${INK};
  font:700 20px/1 system-ui;color:${INK};cursor:pointer}
#cc-rank .x:hover{background:#fff4c7}
#cc-rank .x:active{transform:translateY(2px);box-shadow:0 1px 0 ${INK}}
#cc-rank .seg{display:grid;grid-template-columns:repeat(var(--n,4),minmax(0,1fr));gap:3px;margin:0 14px 8px;padding:3px;background:#ece8dc;border:2.5px solid ${INK};border-radius:14px}
#cc-rank .seg button{appearance:none;display:flex;align-items:center;justify-content:center;gap:4px;min-width:0;min-height:38px;padding:4px 2px;border:0;border-radius:10px;
  background:transparent;color:${INK};font:800 12.5px "Rubik",system-ui,sans-serif;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cc-rank .seg.modos{grid-template-columns:repeat(var(--n,4),auto)}
#cc-rank .seg.modos button{padding-inline:6px}
#cc-rank .seg.difs button{flex-direction:column;gap:2px;min-height:46px;font-size:11px}
#cc-rank .seg button:hover{background:rgba(255,255,255,.65)}
#cc-rank .seg button[aria-pressed="true"]{background:#ffcc29;box-shadow:inset 0 0 0 2px ${INK}}
#cc-rank .seg button[data-d="extremo"][aria-pressed="true"]{background:#ff6b6b}
#cc-rank .seg button[data-d="maestro"][aria-pressed="true"]{background:#b49bff}
#cc-rank ol{list-style:none;margin:0;padding:6px 10px 8px;overflow-y:auto;flex:1;min-height:150px;border-top:2px solid rgba(29,35,64,.1)}
#cc-rank li{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:12px;font-weight:600}
#cc-rank li.yo{background:#ffcc29;box-shadow:inset 0 0 0 2.5px ${INK}}
#cc-rank li .p{flex:none;width:30px;height:30px;display:grid;place-items:center;border-radius:50%;font:400 16px "Lilita One","Trebuchet MS",sans-serif}
#cc-rank li .p.m1{background:#ffcc29;border:2.5px solid ${INK}}
#cc-rank li .p.m2{background:#d7deea;border:2.5px solid ${INK}}
#cc-rank li .p.m3{background:#e9b48a;border:2.5px solid ${INK}}
#cc-rank li .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cc-rank li .n .tt{display:block;font-size:10.5px;font-weight:700;opacity:.6;line-height:1.1;overflow:hidden;text-overflow:ellipsis}
#cc-rank li .v{font-variant-numeric:tabular-nums;font-weight:800}
#cc-rank li canvas{width:26px;height:30px;flex:none}
#cc-rank li.msg{display:block;padding:26px 18px;text-align:center;font-weight:600;line-height:1.45}
#cc-rank li.sep{display:block;padding:0;text-align:center;font-weight:800;opacity:.4;letter-spacing:.2em}
#cc-rank .pie{padding:10px 14px 14px;border-top:2px dashed rgba(29,35,64,.22)}
#cc-rank .yo-txt{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;min-height:32px}
#cc-rank .yo-txt b{font-weight:800;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
#cc-rank .link{appearance:none;flex:none;margin-left:auto;min-height:40px;border:2px solid ${INK};background:transparent;padding:6px 14px;border-radius:999px;
  box-shadow:0 2px 0 ${INK};font:800 13px "Rubik",system-ui,sans-serif;color:${INK};cursor:pointer}
#cc-rank .link:hover{background:#fff}
#cc-rank .link:active{transform:translateY(2px);box-shadow:none}
#cc-rank form{display:flex;gap:8px}
#cc-rank input{flex:1;min-width:0;height:44px;border-radius:12px;border:2.5px solid ${INK};padding:0 12px;font:600 16px "Rubik",system-ui,sans-serif;color:${INK};background:#fff}
#cc-rank form button{appearance:none;height:44px;padding:0 16px;border-radius:12px;border:2.5px solid ${INK};background:#ffcc29;color:${INK};
  font:400 18px "Lilita One","Trebuchet MS",sans-serif;box-shadow:0 3px 0 ${INK};cursor:pointer}
#cc-rank form button:active{transform:translateY(2px);box-shadow:0 1px 0 ${INK}}
#cc-rank .ayuda{margin:8px 2px 0;font-size:12px;font-weight:600;opacity:.75;line-height:1.35}
#cc-rank .ayuda .clave{font:800 15px ui-monospace,Consolas,monospace;letter-spacing:.08em;user-select:all;white-space:nowrap}
#cc-rank .f-clave input[name="c"]{flex:0 0 8.6em;text-transform:uppercase;letter-spacing:.06em}
#cc-rank form button:disabled,#cc-rank input:disabled{opacity:.6}
#cc-rank form button:disabled{cursor:not-allowed;box-shadow:none;transform:none}
#cc-rank .pie .otro{display:block;margin:10px 0 0;font-size:12px}
#cc-rank button:focus-visible{outline:3px solid #ff5d7d;outline-offset:2px}
/* nombres de quien usa una legendaria: con el color de su personaje */
.cc-leg{font-weight:800}
.cc-leg-fantasma{color:#3f6fd1;text-shadow:0 0 8px rgba(120,170,255,.75)}
.cc-leg-fenix{background:linear-gradient(90deg,#e0203a,#ff7a3d,#f5a000);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 4px rgba(255,122,61,.6))}
.cc-leg-glitch{color:#2b3470;text-shadow:-1.5px 0 #ff3bd4,1.5px 0 #00c8e0;animation:cc-glitch 1.6s steps(1) infinite}
@keyframes cc-glitch{0%,86%,100%{text-shadow:-1.5px 0 #ff3bd4,1.5px 0 #00c8e0}90%{text-shadow:2.5px 0 #ff3bd4,-2.5px 0 #00c8e0}}
.cc-leg-holograma{background:linear-gradient(90deg,#ff5d7d,#ffad4d,#3fcf8e,#3fa6ff,#a06bff,#ff5d7d);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:cc-holo 3s linear infinite}
@keyframes cc-holo{to{background-position:200% 0}}
.cc-leg-sombra{color:#5a2fc8;text-shadow:0 0 8px rgba(143,107,255,.85)}
.cc-leg-geo{background:linear-gradient(180deg,#ffd21f,#ff8a1c);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 3px rgba(95,245,255,.95))}
.cc-leg-dev{background:linear-gradient(90deg,#00b4c8,#ff3bd4);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 5px rgba(95,245,255,.9))}
@media (prefers-reduced-motion:reduce){.cc-leg-glitch,.cc-leg-holograma{animation:none}}
`;
    document.head.appendChild(st);
  }

  // ---------- selector de dificultad ----------
  const NOTAS_DIF = {
    facil: 'Más lento y con más margen. Ideal para aprender.',
    normal: 'La experiencia de siempre.',
    dificil: 'Arranca rápido desde el primer segundo.',
    extremo: 'Para dedos de acero: todo al máximo y sin perdón. XP ×3.',
    maestro: 'Más allá de Extremo. Casi nadie lo termina. XP ×4.',
  };
  // o.difs: subconjunto de ids (por ejemplo ['normal', 'extremo', 'maestro']). o.compacto: versión chica para la pantalla de fin.
  // Todos los selectores del mismo juego en la página comparten la elección.
  const selectores = [];
  function selectorDif(el, o = {}) {
    estilos();
    const key = 'cubo-dif-' + (o.juego || 'x');
    const lista = o.difs ? DIFS.filter(d => o.difs.includes(d.id)) : DIFS;
    let v = o.valor;
    if (!v) { try { v = localStorage.getItem(key); } catch (e) {} }
    if (!lista.some(d => d.id === v)) v = lista.some(d => d.id === 'normal') ? 'normal' : lista[0].id;
    el.classList.add('cc-difs');
    el.classList.toggle('compacto', !!o.compacto);
    el.style.setProperty('--n', lista.length);
    el.setAttribute('role', 'radiogroup');
    el.setAttribute('aria-label', 'Dificultad');
    el.innerHTML = lista.map(d => `<button type="button" class="cc-dif" role="radio" data-d="${d.id}" aria-checked="${d.id === v}">` +
      `${iconoDif(d.id, o.compacto ? 20 : 24)}${d.nombre}<small>XP ×${String(d.xp).replace('.', ',')}</small></button>`).join('') +
      (o.sinNota || o.compacto ? '' : '<p class="cc-difs-nota" aria-live="polite"></p>');
    const nota = el.querySelector('.cc-difs-nota');
    function pintar(id) {
      v = id;
      for (const b of el.querySelectorAll('.cc-dif')) b.setAttribute('aria-checked', String(b.dataset.d === id));
      if (nota) nota.textContent = (o.notas && o.notas[id]) || NOTAS_DIF[id];
    }
    function poner(id, avisar) {
      if (!lista.some(d => d.id === id)) return;
      pintar(id);
      try { localStorage.setItem(key, id); } catch (e) {}
      for (const s of selectores) if (s.key === key && s !== yo && s.lista.some(d => d.id === id)) s.pintar(id);
      if (avisar && o.alCambiar) o.alCambiar(id);
    }
    el.addEventListener('click', e => { const b = e.target.closest('.cc-dif'); if (b) { poner(b.dataset.d, true); vibrar(8); } });
    const yo = { key, lista, pintar };
    selectores.push(yo);
    poner(v, false);
    return { valor: () => v, poner: id => poner(id, true), siguiente(paso = 1) {
      const k = lista.findIndex(d => d.id === v); poner(lista[Math.max(0, Math.min(lista.length - 1, k + paso))].id, true);
    } };
  }

  // Leyenda de teclas para la compu: qué se usa EN EL JUEGO y qué EN EL MENÚ. En el celu no se muestra.
  // o.jugar: qué hacen ← → ('moverte'). o.menu: false para no mostrar la parte del menú. o.extra: [['R', 'reiniciar']].
  function leyendaTeclas(el, o = {}) {
    estilos();
    el.classList.add('cc-teclas');
    const extra = (o.extra || [['R', 'reiniciar']]).map(([k, t]) => `<kbd>${k}</kbd>${t}`).join(' ');
    el.innerHTML = `<span class="g juego"><span class="t">En el juego</span><kbd class="f">←</kbd><kbd class="f">→</kbd>${o.jugar || 'moverte'} ${extra}</span>` +
      (o.menu === false ? '' : `<span class="g menu"><span class="t">En el menú</span><kbd>↑</kbd><kbd>↓</kbd>${o.elegir || 'dificultad'} <kbd>Enter</kbd>jugar <kbd>Esc</kbd>salir</span>`);
  }

  // En pantallas grandes los paneles se agrandan con `zoom: var(--ui, 1)`.
  function escalaUI() {
    const w = innerWidth, h = innerHeight;
    const k = w >= 820 && h >= 600 ? Math.max(1, Math.min(1.7, w / 640, h / 700)) : 1;
    document.documentElement.style.setProperty('--ui', k.toFixed(3));
  }
  escalaUI();
  addEventListener('resize', escalaUI);

  // Sin zoom con dos dedos ni doble toque: es un juego, no una página para leer.
  (function sinZoom() {
    const st = document.createElement('style');
    st.textContent = 'html{touch-action:manipulation;-webkit-text-size-adjust:100%;text-size-adjust:100%}';
    (document.head || document.documentElement).appendChild(st);
    const no = e => e.preventDefault();
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, no, { passive: false });
    document.addEventListener('touchmove', e => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
    let ultimo = 0;
    document.addEventListener('touchend', e => {
      const t = Date.now();
      if (t - ultimo < 320 && !e.target.closest('input,textarea,select')) e.preventDefault();
      ultimo = t;
    }, { passive: false });
    addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  })();

  // El botón "Juegos" del menú y del final se convierte en una casita en la esquina de la tarjeta (el texto chiquito no se veía).
  // Sigue siendo el mismo botón, así que lo que hace al tocarlo, y cuándo se esconde, lo sigue manejando cada juego.
  const CASA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.8v9.7h5V14h3v5.5h5V9.8"/></svg>';
  function casita() {
    for (const b of document.querySelectorAll('.overlay .card button')) {
      if (!/Juegos\s*$/.test(b.textContent)) continue;
      estilos();
      const card = b.closest('.card'), fila = b.parentElement, brand = card.querySelector(':scope > .brand');
      b.className = 'cc-casa';
      b.innerHTML = CASA;
      b.setAttribute('aria-label', 'Volver a los juegos');
      b.title = 'Volver a los juegos';
      if (fila !== card && fila === card.firstElementChild) continue;   // ya está en la fila de arriba, con Ranking y Sonido
      if (brand) {
        // menú: la casita a la izquierda del nombre del juego, en la misma fila
        const cabeza = document.createElement('div');
        cabeza.className = 'cc-cabeza';
        cabeza.style.margin = getComputedStyle(brand).margin;   // el espacio que tenía el nombre lo toma la fila
        brand.style.margin = '0';
        brand.before(cabeza);
        cabeza.append(b, brand);
      } else {
        // final: en la esquina de la tarjeta
        if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
        b.classList.add('esquina');
        card.classList.add('cc-con-casa');
        card.prepend(b);
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', casita); else casita();

  // Al abrir cualquier página se revisan los logros: así aparecen los que ya cumplías con una regla vieja.
  setTimeout(() => { try { revisarLogros(); } catch (e) {} }, 1200);

  // ---------- avisos (nivel y logros), uno debajo del otro ----------
  function avisar(html, ms = 3200) {
    if (!document.body) return;
    estilos();
    let box = document.getElementById('cc-avisos');
    if (!box) { box = document.createElement('div'); box.id = 'cc-avisos'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'cc-aviso'; el.innerHTML = html;
    box.appendChild(el);
    const n = box.children.length - 1;
    if (el.animate) {
      el.animate([
        { opacity: 0, transform: 'translateY(-12px) scale(.9)' },
        { opacity: 1, transform: 'none', offset: 0.1 },
        { opacity: 1, transform: 'none', offset: 0.88 },
        { opacity: 0, transform: 'translateY(-8px)' },
      ], { duration: ms, delay: n * 250, easing: 'ease', fill: 'both' }).onfinish = () => el.remove();
    } else setTimeout(() => el.remove(), ms);
    return el;
  }
  function avisoNivel(nivel, nuevas) {
    const nueva = [...nuevas].reverse().find(i => SKINS.includes(i));
    const el = avisar((nueva ? '<canvas width="96" height="104" style="width:48px;height:52px;flex:none"></canvas>' : '') +
      `<div><b>¡Nivel ${nivel}!</b>` + (nuevas.length ? `<span>Desbloqueaste: ${nuevas.map(s => s.nombre).join(', ')}</span>` : '') + '</div>', 3600);
    const cv = el && el.querySelector('canvas');
    if (cv) { const c = cv.getContext('2d'); c.scale(2, 2); dibujarCubo(c, 24, 46, 28, { skin: nueva, t: 0, efecto: false }); }
  }
  function avisoLogro(l) {
    const m = MEDALLAS[l.medalla];
    const premio = [...SKINS, ...EFECTOS].filter(i => i.logro === l.id).map(i => i.nombre);
    avisar(`<div class="cc-medalla" style="background:${m.color}">★</div><div><b>${l.nombre}</b>` +
      `<span>Logro ${m.nombre.toLowerCase()} · +${m.xp} XP${premio.length ? ' · Desbloqueaste ' + premio.join(', ') : ''}</span></div>`, 3800);
  }

  // Clase CSS para pintar un apodo con el color de su personaje (solo legendarias; si no, '').
  const claseNombre = sk => (sk && sk.legendaria ? 'cc-leg cc-leg-' + sk.id : '');

  // ---------- ventana de ranking ----------
  function verRanking(o = {}) {
    estilos();
    const j = juego(o.juego) || JUEGOS[0];
    let tid = o.tabla && tablaDe(j.id, o.tabla) ? o.tabla : (j.tablas.find(t => t.dif === 'normal') || j.tablas[0]).id;
    // Juegos con varios modos (Escalador): una fila de modos y otra de dificultades. Los demás: solo dificultades.
    const modoDe = tb => (tb.id === tb.dif ? '' : tb.id.replace(/-(x|m)$/, ''));
    const modos = [...new Set(j.tablas.map(modoDe))];
    const conModos = modos.length > 1;
    const nombreModo = m => (j.tablas.find(t => modoDe(t) === m && t.dif === 'normal') || j.tablas.find(t => modoDe(t) === m)).nombre.replace(/ (Extremo|Maestro)$/, '');
    const previo = document.activeElement;
    const box = document.createElement('div');
    box.id = 'cc-rank';
    box.innerHTML = `<div class="cc-rk" role="dialog" aria-modal="true" aria-labelledby="cc-rank-t">
      <header><div><h2 id="cc-rank-t">Ranking</h2><small>${j.nombre}</small></div><button class="x" type="button" aria-label="Cerrar">✕</button></header>
      <div class="seg quien" role="group" aria-label="Quiénes" hidden><button type="button" data-q="todos" aria-pressed="true">🌎 Todos</button><button type="button" data-q="amigos" aria-pressed="false">👥 Amigos</button></div>
      ${conModos ? '<div class="seg modos" role="group" aria-label="Modo"></div>' : ''}<div class="seg difs" role="group" aria-label="Dificultad"></div>
      <ol aria-live="polite"></ol>
      <div class="pie"><div class="yo-txt"></div>
        <form class="f-apodo"><input name="a" maxlength="14" autocomplete="nickname" placeholder="Tu apodo (3 a 14 letras)" aria-label="Tu apodo"><button type="submit">Guardar</button></form>
        <form class="f-clave" hidden><input name="a" maxlength="14" autocomplete="nickname" placeholder="Tu apodo" aria-label="Tu apodo">
          <input name="c" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Clave" aria-label="Tu clave"><button type="submit">Entrar</button></form>
        <p class="ayuda"></p><button class="link otro" type="button"></button></div></div>`;
    document.body.appendChild(box);
    const $ = s => box.querySelector(s);
    const segModos = $('.seg.modos'), segDifs = $('.seg.difs'), ol = $('ol'), ayuda = $('.ayuda'), yoTxt = $('.yo-txt'), otro = $('.otro');
    const form = $('.f-apodo'), input = form.querySelector('input'), formClave = $('.f-clave');
    let editando = false, conClave = false, verClave = false, soloAmigos = !!o.amigos && leer().amigos.length > 0;
    const segQuien = $('.seg.quien');
    segQuien.hidden = !leer().amigos.length;
    segQuien.style.setProperty('--n', 2);
    segQuien.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; soloAmigos = b.dataset.q === 'amigos'; cargar(); });
    // modos del pie: con apodo (y tu clave a mano), eligiendo apodo, o entrando con la clave de otro dispositivo
    function pintarPie(aviso) {
      const p = leer(), con = !!p.apodo && !editando;
      yoTxt.hidden = !con; form.hidden = con || conClave; formClave.hidden = con || !conClave;
      if (con) {
        yoTxt.innerHTML = 'Jugás como <b></b><button class="link" type="button">Cambiar apodo</button>';
        const b = yoTxt.querySelector('b'); b.textContent = p.apodo; b.className = claseNombre(skin());
        yoTxt.querySelector('.link').addEventListener('click', () => { editando = true; verClave = false; pintarPie(); input.focus(); });
        otro.textContent = verClave ? 'Ocultar clave' : 'Jugar en otro dispositivo';
        if (verClave) {
          ayuda.innerHTML = p.clave
            ? `Tu clave es <b class="clave"></b>. En el otro celu o compu abrí un ranking, tocá «Ya tengo apodo» y poné tu apodo y esta clave. No se la pases a nadie.`
            : 'Conectate a internet para ver tu clave.';
          const c = ayuda.querySelector('.clave'); if (c) c.textContent = claveLinda(p.clave);
        } else ayuda.textContent = aviso || 'Tu mejor marca de cada modo se sube sola al terminar la partida.';
      } else {
        if (!input.value) input.value = p.apodo || p.apodoPerdido;
        otro.textContent = conClave ? 'Elegir un apodo nuevo' : 'Ya tengo apodo en otro dispositivo';
        ayuda.textContent = aviso || (conClave ? 'La clave está en el ranking del dispositivo donde ya tenés tu apodo.'
          : p.apodoPerdido ? `«${p.apodoPerdido}» ya es de otra persona. Si es tuyo, entrá con tu clave; si no, elegí otro.`
          : 'Poné un apodo para aparecer en el ranking. Es solo tuyo y tus récords se suben solos.');
      }
    }
    otro.addEventListener('click', () => {
      if (leer().apodo && !editando) verClave = !verClave;
      else { conClave = !conClave; const f = conClave ? formClave : form; setTimeout(() => f.querySelector('input').focus()); }
      pintarPie();
    });
    pintarPie();
    function pintarSegs() {
      const tb = tablaDe(j.id, tid), modo = modoDe(tb);
      if (segModos) {
        segModos.style.setProperty('--n', modos.length);
        segModos.innerHTML = modos.map(m => `<button type="button" data-m="${m}" aria-pressed="${m === modo}">${nombreModo(m)}</button>`).join('');
      }
      const difs = DIFS.filter(d => j.tablas.some(t => modoDe(t) === modo && t.dif === d.id));
      segDifs.style.setProperty('--n', difs.length);
      segDifs.innerHTML = difs.map(d => `<button type="button" data-d="${d.id}" aria-pressed="${d.id === tb.dif}">${iconoDif(d.id, 18)}${d.nombre}</button>`).join('');
    }
    const tablaPara = (modo, dif) => j.tablas.find(t => modoDe(t) === modo && t.dif === dif) || j.tablas.find(t => modoDe(t) === modo && t.dif === 'normal')
      || j.tablas.find(t => modoDe(t) === modo);
    if (segModos) segModos.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; tid = tablaPara(b.dataset.m, tablaDe(j.id, tid).dif).id; cargar(); });
    segDifs.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; tid = tablaPara(modoDe(tablaDe(j.id, tid)), b.dataset.d).id; cargar(); });
    const msg = t => { ol.innerHTML = `<li class="msg">${t}</li>`; };
    let pedido = 0;
    async function cargar() {
      pintarSegs();
      for (const b of segQuien.querySelectorAll('button')) b.setAttribute('aria-pressed', String((b.dataset.q === 'amigos') === soloAmigos));
      const tb = tablaDe(j.id, tid), mio = leer().mejores[j.id + ':' + tid];
      const tuyo = `Tu mejor marca: <strong>${formato(mio, tb)}</strong>`;
      if (!rankingActivo()) { msg(`El ranking online se está preparando.<br>${tuyo}`); return; }
      if (navigator.onLine === false) { msg(`Sin conexión. Tus récords se suben cuando vuelvas a tener internet.<br>${tuyo}`); return; }
      msg('Cargando…');
      const n = ++pedido;
      try {
        await esperarSubida();
        if (n !== pedido) return;
        const { lista, yo } = await top(j.id, tid, 50, { amigos: soloAmigos });
        if (n !== pedido) return;
        if (!lista.length) { msg(soloAmigos ? `Ni vos ni tus amigos jugaron este modo todavía.<br>${tuyo}` : `Todavía nadie jugó este modo. ¡Sé el primero!<br>${tuyo}`); return; }
        ol.innerHTML = '';
        const fila = f => {
          const li = document.createElement('li'); if (f.yo) li.className = 'yo';
          li.innerHTML = `<span class="p${f.puesto <= 3 ? ' m' + f.puesto : ''}">${f.puesto}</span><canvas width="52" height="60"></canvas><span class="n"></span><span class="v">${formato(f.valor, tb)}</span>`;
          const nm = li.querySelector('.n'), sk = SKINS.find(s => s.id === f.skin);
          if (sk && sk.legendaria) { const t = document.createElement('span'); t.className = claseNombre(sk); t.textContent = f.apodo; nm.appendChild(t); }
          else nm.textContent = f.apodo;
          if (f.yo) nm.append(' (vos)');
          if (f.titulo) { const tt = document.createElement('small'); tt.className = 'tt'; tt.textContent = f.titulo; nm.appendChild(tt); }
          const c = li.querySelector('canvas').getContext('2d'); c.scale(2, 2);
          dibujarCubo(c, 13, 28, 18, { skin: sk || SKINS[0], t: 0, efecto: false });
          ol.appendChild(li);
          return li;
        };
        lista.forEach(fila);
        if (yo && yo.afuera) { const sep = document.createElement('li'); sep.className = 'sep'; sep.textContent = '···'; ol.appendChild(sep); fila(yo); }
        const mia = ol.querySelector('.yo'); if (mia) mia.scrollIntoView({ block: 'nearest' });
      } catch (e) { if (n === pedido) msg(`No se pudo cargar el ranking. Probá de nuevo en un rato.<br>${tuyo}`); }
    }
    function cerrar() { box.remove(); removeEventListener('keydown', tecla, true); if (previo && previo.focus) previo.focus(); if (o.alCerrar) o.alCerrar(); }
    function tecla(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); } else if (e.target.tagName !== 'INPUT') e.stopPropagation(); }
    addEventListener('keydown', tecla, true);
    $('.x').addEventListener('click', cerrar);
    box.addEventListener('click', e => { if (e.target === box) cerrar(); });
    const esperando = (f, si) => { for (const el of f.elements) el.disabled = si; };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const r = ponerApodo(input.value);
      if (!r) { ayuda.textContent = 'El apodo tiene que tener entre 3 y 14 letras o números.'; input.focus(); return; }
      esperando(form, true); ayuda.textContent = 'Guardando…';
      const res = await r;
      esperando(form, false);
      if (!res.ok) { ayuda.textContent = res.msg; input.focus(); return; }
      editando = false; input.blur(); pintarPie();
      cargar();
    });
    formClave.addEventListener('submit', async e => {
      e.preventDefault();
      esperando(formClave, true); ayuda.textContent = 'Revisando…';
      const res = await vincular(formClave.elements.a.value, formClave.elements.c.value);
      esperando(formClave, false);
      if (!res.ok) { ayuda.textContent = res.msg; formClave.elements.c.focus(); return; }
      conClave = false; editando = false; document.activeElement.blur && document.activeElement.blur();
      pintarPie(`¡Listo! Ahora jugás como ${res.apodo} también en este dispositivo.`);
      cargar();
    });
    cargar();
    $('.x').focus();
    return cerrar;
  }

  // ---------- dibujo ----------
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function estrella(ctx, cx, cy, r, puntas = 5) {
    ctx.beginPath();
    for (let k = 0; k < puntas * 2; k++) {
      const a = -Math.PI / 2 + k * Math.PI / puntas, rad = k % 2 ? r * 0.45 : r;
      ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
  }
  function corazon(ctx, x, y, r) {
    ctx.beginPath(); ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.4, y - r * 0.2, x - r * 0.6, y - r * 1.2, x, y - r * 0.4);
    ctx.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.2, x, y + r * 0.9);
    ctx.closePath();
  }
  const fase = (t, periodo, k = 0) => (((t / periodo) + k) % 1 + 1) % 1;
  const ARCO = ['#ff5d7d', '#ffad4d', '#ffe14d', '#6be0b5', '#5cb0ff', '#c08bff'];

  // Copos para el efecto 'nieve'. capa 0 = detrás del cubo; capa 1 = adelante, solo a los costados (no tapa la cara).
  // Uno de cada tres es un copo con brazos; el resto, bolitas de nieve.
  function nieve(ctx, s, t, capa) {
    ctx.lineCap = 'round'; ctx.strokeStyle = INK;
    for (let k = capa; k < 12; k += 2) {
      const f = fase(t, 2600 + (k * 233) % 900, k * 0.29), lado = k % 4 < 2 ? -1 : 1;
      const x0 = capa ? lado * s * (0.62 + 0.3 * ((k * 0.37) % 1)) : Math.sin(k * 12.9) * s * 0.95;
      const x = x0 + Math.sin(t / 500 + k * 1.7) * s * 0.08, y = -s * 1.7 + f * s * 1.75;
      const borde = Math.max(1, s * 0.025);
      ctx.globalAlpha = f > 0.85 ? (1 - f) / 0.15 : Math.min(1, f * 6);
      if (k % 3 === 0) {
        const r = s * 0.13, w = Math.max(1.5, s * 0.05);
        ctx.save(); ctx.translate(x, y); ctx.rotate(t / 1500 + k);
        for (const [col, ancho] of [[INK, w + borde * 2], ['#fff', w]]) {
          ctx.strokeStyle = col; ctx.lineWidth = ancho; ctx.beginPath();
          for (let a = 0; a < 3; a++) { const ca = Math.cos(a * Math.PI / 3) * r, sa = Math.sin(a * Math.PI / 3) * r; ctx.moveTo(-ca, -sa); ctx.lineTo(ca, sa); }
          ctx.stroke();
        }
        ctx.restore();
      } else {
        ctx.fillStyle = '#fff'; ctx.lineWidth = borde;
        ctx.beginPath(); ctx.arc(x, y, s * (0.045 + 0.02 * (k % 2)), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Gotita de lluvia con la punta para arriba (la usa la skin Paraguas).
  function gota(ctx, x, y, r) {
    ctx.beginPath(); ctx.moveTo(x, y - r * 1.9);
    ctx.bezierCurveTo(x + r * 0.35, y - r * 1.1, x + r, y - r * 0.6, x + r, y);
    ctx.arc(x, y, r, 0, Math.PI);
    ctx.bezierCurveTo(x - r, y - r * 0.6, x - r * 0.35, y - r * 1.1, x, y - r * 1.9);
    ctx.closePath();
  }

  // Nota musical con borde de tinta: corchea sola o dos corcheas unidas. (x, y) = centro de la cabeza.
  function notaMusical(ctx, x, y, r, color, doble) {
    const b = Math.max(0.8, r * 0.3), w = Math.max(1.2, r * 0.42), h = r * 2.8, sube = doble ? r * 0.45 : 0;
    const palos = doble ? [x - r * 1.05, x + r * 1.05] : [x];
    const camino = () => {
      ctx.beginPath();
      palos.forEach((px, i) => { ctx.moveTo(px + r * 0.82, y - r * 0.1); ctx.lineTo(px + r * 0.82, y - h - sube * i); });
      if (!doble) { ctx.moveTo(x + r * 0.82, y - h); ctx.quadraticCurveTo(x + r * 2.1, y - h + r * 0.7, x + r * 1.55, y - h + r * 1.75); }
    };
    const barra = () => { ctx.beginPath(); ctx.moveTo(palos[0] + r * 0.82, y - h); ctx.lineTo(palos[1] + r * 0.82, y - h - sube); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [c, extra] of [[INK, b * 2], [color, 0]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w + extra; camino(); ctx.stroke();
      if (doble) { ctx.lineWidth = w * 1.9 + extra; barra(); ctx.stroke(); }
    }
    ctx.fillStyle = color; ctx.strokeStyle = INK; ctx.lineWidth = b;
    for (const px of palos) { ctx.beginPath(); ctx.ellipse(px, y, r, r * 0.74, -0.38, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  }

  // Huellitas que caminan en ronda alrededor del cubo, por el piso. capa 0 = la mitad de atrás, 1 = la de adelante.
  function huellitas(ctx, s, t, capa) {
    const N = 14, paso = 260, vivas = 11, rx = s * 0.95, ry = s * 0.26, cy = -s * 0.04, n = Math.floor(t / paso);
    for (let edad = vivas - 1; edad >= 0; edad--) {
      const j = n - edad, a = -j * (Math.PI * 2 / N), atras = Math.sin(a) < 0;
      if (atras === !!capa) continue;
      const lado = j % 2 ? 1 : -1, tx = -Math.sin(a) * rx, ty = Math.cos(a) * ry, l = Math.hypot(tx, ty);
      // cada pie va un poquito a un costado del camino
      const x = Math.cos(a) * rx + (-ty / l) * lado * s * 0.07, y = cy + Math.sin(a) * ry + (tx / l) * lado * s * 0.035;
      const u = (t / paso - j) / vivas, pop = Math.min(1, (t / paso - j) * 2.5);
      ctx.globalAlpha = Math.max(0, 1 - u * u) * (atras ? 0.8 : 1);
      ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.72); ctx.rotate(Math.atan2(-ty, -tx) + Math.PI / 2);
      const k = s * 0.13 * (0.7 + 0.3 * pop);
      ctx.fillStyle = '#7a4a30';
      ctx.beginPath(); ctx.ellipse(0, k * 0.4, k * 0.6, k * 0.48, 0, 0, Math.PI * 2); ctx.fill();
      for (const [dx, dy] of [[-0.7, -0.32], [-0.26, -0.78], [0.26, -0.78], [0.7, -0.32]]) {
        ctx.beginPath(); ctx.ellipse(dx * k, dy * k, k * 0.2, k * 0.25, dx * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // Estela espacial: un planeta con anillo, uno azul y una estrella giran alrededor del cubo dejando una cola de chispitas.
  // capa 0 = la mitad de atrás de la órbita, 1 = la de adelante.
  function estelaEspacial(ctx, s, t, capa) {
    const cy = -s * 0.52, rx = s * 0.98, ry = s * 0.36, giro = -0.24, cg = Math.cos(giro), sg = Math.sin(giro);
    const punto = a => { const x = Math.cos(a) * rx, y = Math.sin(a) * ry; return [x * cg - y * sg, cy + x * sg + y * cg]; };
    const visible = a => (Math.sin(a) > 0) === !!capa;
    const colas = ['#ffcf4d', '#8fd8ff', '#fff3a8'];
    ctx.strokeStyle = INK;
    for (let k = 0; k < 3; k++) {
      const a = t / 1150 + k * Math.PI * 2 / 3;
      // cola: chispitas que quedan atrás en la órbita y se apagan
      for (let i = 12; i >= 1; i--) {
        const b = a - i * 0.075;
        if (!visible(b)) continue;
        const [x, y] = punto(b), v = 1 - i / 13, tw = 0.75 + 0.25 * Math.sin(t / 120 + i * 1.7 + k);
        ctx.globalAlpha = 0.9 * v; ctx.fillStyle = colas[k];
        if (i % 3 === 1) { estrella(ctx, x, y, s * 0.075 * v * tw + 0.8, 4); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(x, y, s * 0.035 * v + 0.6, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      if (!visible(a)) continue;
      const [x, y] = punto(a);
      ctx.lineWidth = Math.max(1, s * 0.03);
      if (k === 0) {
        // planeta con anillo
        const anillo = (desde, hasta) => {
          ctx.lineWidth = Math.max(2.5, s * 0.075); ctx.strokeStyle = INK;
          ctx.beginPath(); ctx.ellipse(x, y, s * 0.24, s * 0.07, -0.35, desde, hasta); ctx.stroke();
          ctx.lineWidth = Math.max(1.2, s * 0.035); ctx.strokeStyle = '#ffe9a0';
          ctx.beginPath(); ctx.ellipse(x, y, s * 0.24, s * 0.07, -0.35, desde, hasta); ctx.stroke();
        };
        anillo(Math.PI, Math.PI * 2);
        ctx.fillStyle = '#ff9a4d'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.beginPath(); ctx.arc(x, y, s * 0.13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.arc(x - s * 0.045, y - s * 0.045, s * 0.04, 0, Math.PI * 2); ctx.fill();
        anillo(0, Math.PI);
      } else if (k === 1) {
        // planetita azul con mares verdes
        ctx.fillStyle = '#4fa3ff'; ctx.beginPath(); ctx.arc(x, y, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.clip(); ctx.fillStyle = '#6be0b5';
        ctx.beginPath(); ctx.ellipse(x - s * 0.04, y + s * 0.03, s * 0.06, s * 0.035, 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + s * 0.06, y - s * 0.05, s * 0.04, s * 0.025, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.beginPath(); ctx.arc(x, y, s * 0.1, 0, Math.PI * 2); ctx.stroke();
      } else {
        // estrella que titila
        ctx.fillStyle = '#ffe14d'; estrella(ctx, x, y, s * (0.13 + 0.02 * Math.sin(t / 150))); ctx.fill(); ctx.stroke();
      }
    }
  }

  // Lenguas de energía que suben desde la base del cubo (aura de 'ki' y Llama dorada).
  // ancho y alto en lados de cubo; k0 desfasa el titileo entre capas. Deja el camino armado por si se quiere hacer stroke().
  function lenguasDeEnergia(ctx, s, t, ancho, alto, col, k0) {
    const n = 7, W = s * ancho, pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = (u * 2 - 1) * W, campana = 1 - Math.pow(u * 2 - 1, 2);
      const y = -s * (0.6 + alto * (0.3 + 0.7 * campana) * (0.85 + 0.15 * Math.sin(t / 85 + i * 2.3 + k0)));
      pts.push([x + Math.sin(t / 170 + i + k0) * s * 0.05 * campana, y]);
    }
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-W * 0.8, s * 0.02);
    ctx.quadraticCurveTo(-W * 1.05, -s * 0.3, pts[0][0], pts[0][1]);
    for (let i = 1; i <= n; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], vx = (x0 + x1) / 2, vy = Math.max(y0, y1) + s * alto * 0.28;
      ctx.quadraticCurveTo(x0 + (vx - x0) * 0.2, vy, vx, vy); ctx.quadraticCurveTo(x1 - (x1 - vx) * 0.2, vy, x1, y1);
    }
    ctx.quadraticCurveTo(W * 1.05, -s * 0.3, W * 0.8, s * 0.02); ctx.closePath(); ctx.fill();
  }

  // Guerrero: puntas de la vincha que flamean atrás (del lado contrario a donde mira).
  function guerreroColas(ctx, s, t, mirar, color) {
    const lado = mirar > 0 ? -1 : 1;
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045); ctx.lineJoin = 'round';
    for (const k of [1, 0]) {
      const x0 = lado * s * 0.46, y0 = -s * 0.83, L = s * (0.6 - k * 0.14), N = 9, arriba = [], abajo = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N, w = s * 0.055 * (1 - u * 0.35);
        const y = y0 + u * s * (0.06 + k * 0.16) + Math.sin(u * 5 - t / 85 + k * 1.9) * s * 0.06 * u;
        arriba.push([x0 + lado * u * L, y - w]); abajo.push([x0 + lado * u * L, y + w]);
      }
      ctx.fillStyle = color; ctx.beginPath();
      arriba.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (let i = N; i >= 0; i--) ctx.lineTo(abajo[i][0], abajo[i][1]);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  // Guerrero: vincha con nudo, cejas (ceno = cuánto se inclinan; null = sin cejas) y la curita en el cachete.
  function guerreroCara(ctx, s, look, mirar, color, ceno) {
    const lado = mirar > 0 ? -1 : 1;
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045);
    ctx.fillStyle = color; rr(ctx, -s * 0.53, -s * 0.9, s * 1.06, s * 0.13, s * 0.05); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(lado * s * 0.47, -s * 0.835, s * 0.075, s * 0.085, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (ceno != null) {
      ctx.lineWidth = Math.max(1.5, s * 0.055); ctx.lineCap = 'round';
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * s * 0.3 + look, -s * (0.71 + ceno)); ctx.lineTo(side * s * 0.1 + look, -s * 0.7); ctx.stroke(); }
    }
    ctx.save(); ctx.translate(-s * 0.31 + look, -s * 0.31); ctx.rotate(-0.45);
    ctx.fillStyle = '#ffdcb0'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.025);
    rr(ctx, -s * 0.11, -s * 0.04, s * 0.22, s * 0.08, s * 0.04); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f0b884'; ctx.fillRect(-s * 0.035, -s * 0.03, s * 0.07, s * 0.06);
    ctx.restore();
  }

  // ---------- pase 51-100: ayudas de dibujo ----------
  // Número pseudoazar estable entre 0 y 1 (mismo a y b → mismo resultado).
  const ruido = (a, b) => { const r = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return r - Math.floor(r); };
  // ¿Ese punto taparía la cara? (para mandar atrás las partículas que pasarían por adelante de la cara)
  const tapaCara = (x, y, s) => Math.abs(x) < s * 0.52 && y > -s * 1.02 && y < -s * 0.15;
  // Punto a una fracción u (0..1, da la vuelta) del contorno de un rectángulo redondeado, en sentido horario.
  function puntoRR(u, x, y, w, h, r) {
    const lw = w - 2 * r, lh = h - 2 * r, arco = Math.PI * r / 2;
    let d = (((u % 1) + 1) % 1) * (2 * lw + 2 * lh + 4 * arco);
    const tramos = [
      [lw, k => [x + r + k, y]],
      [arco, k => { const a = -Math.PI / 2 + k / r; return [x + w - r + Math.cos(a) * r, y + r + Math.sin(a) * r]; }],
      [lh, k => [x + w, y + r + k]],
      [arco, k => { const a = k / r; return [x + w - r + Math.cos(a) * r, y + h - r + Math.sin(a) * r]; }],
      [lw, k => [x + w - r - k, y + h]],
      [arco, k => { const a = Math.PI / 2 + k / r; return [x + r + Math.cos(a) * r, y + h - r + Math.sin(a) * r]; }],
      [lh, k => [x, y + h - r - k]],
      [arco, k => { const a = Math.PI + k / r; return [x + r + Math.cos(a) * r, y + r + Math.sin(a) * r]; }],
    ];
    for (const [L, f] of tramos) { if (d <= L) return f(d); d -= L; }
    return [x + r, y];
  }
  // Gradiente transparente con una franja de luz en p (0..1 a lo largo de x0,y0 → x1,y1). Fuera de 0..1 no se ve.
  function franjaDeLuz(ctx, x0, y0, x1, y1, p, ancho, rgb, alfa) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1), a = q => alfa * Math.max(0, 1 - Math.abs(q - p) / ancho);
    for (const q of [0, p - ancho, p, p + ancho, 1].filter(q => q >= 0 && q <= 1).sort((m, n) => m - n)) g.addColorStop(q, `rgba(${rgb},${a(q)})`);
    return g;
  }

  // Pulpo: tentáculo que se afina y se enrula, con ventosas del lado de adentro de la curva.
  // (x0, y0) = base, a0 = hacia dónde sale, curl = cuánto se enrula (el signo dice para qué lado), onda = meneo.
  function tentaculo(ctx, x0, y0, a0, largo, ancho, curl, onda, color) {
    const N = 16, ejes = [];
    let x = x0, y = y0;
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = a0 + curl * u * u + onda * Math.sin(u * Math.PI), w = ancho * (1 - u * 0.8) / 2;
      ejes.push([x, y, -Math.sin(a), Math.cos(a), w]);
      x += Math.cos(a) * largo / N; y += Math.sin(a) * largo / N;
    }
    ctx.fillStyle = color; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, ancho * 0.26);
    ctx.beginPath();
    ejes.forEach(([px, py, nx, ny, w], i) => (i ? ctx.lineTo(px - nx * w, py - ny * w) : ctx.moveTo(px - nx * w, py - ny * w)));
    for (let i = N; i >= 0; i--) { const [px, py, nx, ny, w] = ejes[i]; ctx.lineTo(px + nx * w, py + ny * w); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    const lado = Math.sign(curl) || 1;
    ctx.fillStyle = '#ffd9f2'; ctx.strokeStyle = 'rgba(29,35,64,.45)'; ctx.lineWidth = Math.max(0.6, ancho * 0.06);
    for (const i of [3, 6, 9, 12]) {
      const [px, py, nx, ny, w] = ejes[i];
      ctx.beginPath(); ctx.arc(px + nx * w * 0.42 * lado, py + ny * w * 0.42 * lado, w * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  // Cósmico: un lucero que da vueltas alrededor del cubo con su colita. capa 0 = mitad de atrás, 1 = la de adelante.
  function orbitaCosmica(ctx, s, t, capa) {
    const pos = a => [Math.cos(a) * s * 0.8, -s * 0.44 + Math.sin(a) * s * 0.28 - Math.cos(a) * s * 0.1];
    ctx.strokeStyle = 'rgba(190,160,255,.55)'; ctx.lineWidth = Math.max(1, s * 0.022); ctx.setLineDash([s * 0.05, s * 0.07]);
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) { const [x, y] = pos((capa ? 0 : Math.PI) + i / 24 * Math.PI); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
    const a = t / 1100;
    for (let k = 6; k >= 0; k--) {
      const b = a - k * 0.12;
      if ((Math.sin(b) > 0) !== (capa === 1)) continue;
      const [x, y] = pos(b);
      ctx.globalAlpha = k ? 0.6 * (1 - k / 7) : 1; ctx.fillStyle = k ? '#c9a8ff' : '#fff2a8';
      ctx.beginPath(); ctx.arc(x, y, s * (k ? 0.06 * (1 - k / 9) : 0.085), 0, Math.PI * 2);
      if (k) { ctx.fill(); continue; }
      ctx.save(); ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = s * 0.3; ctx.fill(); ctx.restore();
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.028); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Hojas al viento: cruzan de izquierda a derecha dando vueltas. capa 0 = detrás, 1 = adelante (solo por los costados).
  function hojasAlViento(ctx, s, t, capa) {
    if (capa === 0) {
      // rachitas de viento
      ctx.strokeStyle = 'rgba(90,150,120,.4)'; ctx.lineWidth = Math.max(1, s * 0.03); ctx.lineCap = 'round';
      for (let k = 0; k < 2; k++) {
        const f = fase(t, 1900, k * 0.5), x = (f * 3 - 1.5) * s, y = -s * (0.5 + k * 0.7);
        ctx.globalAlpha = Math.sin(f * Math.PI);
        ctx.beginPath(); ctx.moveTo(x - s * 0.55, y); ctx.bezierCurveTo(x - s * 0.25, y - s * 0.1, x - s * 0.05, y + s * 0.08, x + s * 0.2, y - s * 0.02);
        ctx.quadraticCurveTo(x + s * 0.34, y - s * 0.1, x + s * 0.26, y - s * 0.16); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const cols = ['#5cbf4a', '#ffb02e', '#ff7a3d', '#e0503a', '#9ccf3a', '#ffcf3a', '#ff8a3d', '#4fae5a'];
    for (let k = 0; k < 8; k++) {
      const f = fase(t, 2400 + (k * 373) % 900, k * 0.37);
      const x = (f * 2.9 - 1.45) * s, y = -s * (0.25 + ((k * 0.53) % 1) * 1.3) + Math.sin(f * 7 + k) * s * 0.14;
      if ((k % 2 === 1 && !tapaCara(x, y, s)) !== (capa === 1)) continue;
      ctx.globalAlpha = Math.min(1, f * 6, (1 - f) * 6);
      ctx.save(); ctx.translate(x, y); ctx.rotate(f * 9 + k); ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(t / 260 + k)));
      const r = s * 0.18;
      ctx.fillStyle = cols[k]; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.quadraticCurveTo(0, -r * 0.75, r, 0); ctx.quadraticCurveTo(0, r * 0.75, -r, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(29,35,64,.45)'; ctx.lineWidth = Math.max(0.7, s * 0.015);
      ctx.beginPath(); ctx.moveTo(-r * 1.25, 0); ctx.lineTo(r * 0.7, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // Burbujas de jabón tornasoladas que flotan por los costados y revientan arriba.
  function burbujasDeJabon(ctx, s, t, capa) {
    for (let k = 0; k < 6; k++) {
      const per = 3600 + (k * 410) % 900, f = fase(t, per, k / 6), side = k % 2 ? 1 : -1;
      const x = side * s * (0.62 + 0.28 * ((k * 0.37) % 1)) + Math.sin(t / 600 + k) * s * 0.08;
      const y = -s * (0.05 + f * 1.85), r = s * (0.13 + 0.07 * ((k * 0.61) % 1));
      if ((!tapaCara(x, y, s)) !== (capa === 1)) continue;
      if (f > 0.9) {
        // ¡plop! gotitas que salen
        const u = (f - 0.9) / 0.1;
        ctx.globalAlpha = 1 - u; ctx.strokeStyle = 'rgba(120,200,255,.9)'; ctx.lineWidth = Math.max(1, s * 0.025);
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3 + k;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * (0.6 + u), y + Math.sin(a) * r * (0.6 + u)); ctx.lineTo(x + Math.cos(a) * r * (0.9 + u * 1.2), y + Math.sin(a) * r * (0.9 + u * 1.2)); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        continue;
      }
      const wob = Math.sin(t / 180 + k * 2) * 0.05;
      ctx.save(); ctx.translate(x, y); ctx.scale(1 + wob, 1 - wob);
      ctx.globalAlpha = Math.min(1, f * 8);
      const g = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.8, 'rgba(210,235,255,.18)'); g.addColorStop(1, 'rgba(255,190,240,.35)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      // borde tornasolado que va cambiando de color
      const h = t / 9 + k * 60, a = t / 700 + k;
      const tor = ctx.createLinearGradient(Math.cos(a) * r, Math.sin(a) * r, -Math.cos(a) * r, -Math.sin(a) * r);
      tor.addColorStop(0, `hsl(${h % 360},95%,68%)`); tor.addColorStop(0.5, `hsl(${(h + 120) % 360},95%,68%)`); tor.addColorStop(1, `hsl(${(h + 240) % 360},95%,68%)`);
      ctx.strokeStyle = 'rgba(29,35,64,.35)'; ctx.lineWidth = Math.max(2.2, s * 0.055); ctx.stroke();
      ctx.strokeStyle = tor; ctx.lineWidth = Math.max(1.4, s * 0.035); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(1, s * 0.025);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.68, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.42, Math.max(0.8, r * 0.1), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // Electricidad: arquitos que chisporrotean pegados al contorno del cubo. capa 0 = resplandor detrás.
  function electricidad(ctx, s, t, capa) {
    if (capa === 0) {
      const p = 0.5 + 0.5 * Math.sin(t / 90) * Math.sin(t / 37);
      const g = ctx.createRadialGradient(0, -s * 0.5, s * 0.4, 0, -s * 0.5, s * 1.0);
      g.addColorStop(0, 'rgba(80,170,255,0)'); g.addColorStop(0.55, `rgba(80,170,255,${0.2 + 0.15 * p})`); g.addColorStop(1, 'rgba(80,170,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -s * 0.5, s, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const d = s * 0.07, X = -s / 2 - d, Y = -s - d, W = s + 2 * d, R = s * 0.2 + d, tick = Math.floor(t / 70);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let j = 0; j < 5; j++) {
      // cada arco vive unos cuadros y salta a otro lado del contorno (nunca al borde de abajo, que va contra el piso)
      const vida = Math.floor((tick + j * 3) / 5), largo = 0.05 + 0.05 * ruido(vida, j + 9);
      let u0 = ruido(vida, j);
      if (puntoRR(u0 + largo / 2, X, Y, W, W, R)[1] > -s * 0.2) u0 += 0.5;
      if (ruido(tick, j + 20) < 0.15) continue;
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const v = i / 6, [px, py] = puntoRR(u0 + largo * v, X, Y, W, W, R), dx = px, dy = py + s * 0.5, n = Math.hypot(dx, dy) || 1;
        const sal = (i === 0 || i === 6 ? 0 : (ruido(tick * 7 + i, j) - 0.3) * s * 0.16) + Math.sin(v * Math.PI) * s * 0.08;
        pts.push([px + dx / n * sal, py + dy / n * sal]);
      }
      for (const [col, ancho] of [['rgba(40,90,255,.5)', Math.max(3, s * 0.11)], ['#5fe0ff', Math.max(1.8, s * 0.055)], ['#ffffff', Math.max(1, s * 0.022)]]) {
        ctx.strokeStyle = col; ctx.lineWidth = ancho;
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      }
      // chispitas en las puntas
      ctx.fillStyle = '#fff8a0';
      for (const [px, py] of [pts[0], pts[6]]) {
        const a = ruido(tick, j * 3 + px) * Math.PI * 2, r = s * 0.08 * ruido(tick + 1, j);
        ctx.beginPath(); ctx.arc(px + Math.cos(a) * r, py + Math.sin(a) * r, Math.max(1, s * 0.028), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // Pétalos que bajan girando en remolino alrededor del cubo. capa 0 = detrás, 1 = adelante (sin tapar la cara).
  function petalosRemolino(ctx, s, t, capa) {
    const cols = ['#ffc1d9', '#ff9ec4', '#ffe0ec', '#ffb3d1'];
    for (let k = 0; k < 10; k++) {
      const f = fase(t, 3400, k / 10), a = t / 950 + k * 2.39, R = s * (0.66 + 0.16 * Math.sin(k * 1.7));
      const x = Math.cos(a) * R, y = -s * (1.8 - f * 1.75) + Math.sin(t / 400 + k) * s * 0.03;
      if ((Math.sin(a) > 0 && !tapaCara(x, y, s)) !== (capa === 1)) continue;
      ctx.globalAlpha = Math.min(1, f * 7, (1 - f) * 7) * (capa ? 1 : 0.85);
      ctx.save(); ctx.translate(x, y); ctx.rotate(f * 8 + k); ctx.scale(0.4 + 0.6 * Math.abs(Math.cos(t / 300 + k * 1.3)), 1);
      const r = s * 0.13;
      ctx.fillStyle = cols[k % 4]; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.9, s * 0.022);
      ctx.beginPath(); ctx.moveTo(0, r * 0.9); ctx.quadraticCurveTo(-r, 0, -r * 0.4, -r); ctx.lineTo(0, -r * 0.7); ctx.lineTo(r * 0.4, -r);
      ctx.quadraticCurveTo(r, 0, 0, r * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // Espiral galáctica: tres brazos de estrellitas que giran despacio detrás del cubo.
  function espiralGalactica(ctx, s, t) {
    const cy = -s * 0.5, giro = t / 2400;
    ctx.save(); ctx.translate(0, cy); ctx.scale(1, 0.8);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.3);
    g.addColorStop(0, 'rgba(255,240,200,.95)'); g.addColorStop(0.28, 'rgba(200,130,255,.5)'); g.addColorStop(0.65, 'rgba(90,70,210,.22)'); g.addColorStop(1, 'rgba(40,30,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s * 1.3, 0, Math.PI * 2); ctx.fill();
    const cols = ['#fff3c4', '#ffb3e6', '#c08bff', '#7fd6ff'];
    for (let k = 0; k < 3; k++) {
      // el brazo: trazo suave y encima las estrellitas
      ctx.strokeStyle = 'rgba(170,120,255,.35)'; ctx.lineWidth = Math.max(3, s * 0.16); ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 26; i++) { const u = i / 26, a = giro + k * 2.094 + u * 3.6, r = s * (0.18 + u * 1.08); i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.stroke();
      for (let i = 0; i <= 26; i++) {
        const u = i / 26, a = giro + k * 2.094 + u * 3.6 + Math.sin(i * 3.1 + k) * 0.08, r = s * (0.18 + u * 1.08);
        ctx.globalAlpha = 1 - u * 0.45; ctx.fillStyle = cols[Math.min(3, Math.floor(u * 4))];
        ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, Math.max(0.8, s * 0.07 * (1 - u * 0.6) * (i % 3 ? 0.7 : 1)), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // estrellas sueltas que titilan
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(29,35,64,.55)'; ctx.lineWidth = Math.max(0.6, s * 0.012);
    for (let k = 0; k < 6; k++) {
      const a = giro * 0.6 + k * 1.05, r = s * (0.9 + 0.3 * ((k * 0.7) % 1)), tw = 0.5 + 0.5 * Math.sin(t / 260 + k * 2);
      estrella(ctx, Math.cos(a) * r, Math.sin(a) * r, s * 0.06 * tw + 0.8, 4); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // Pixeles: cuadraditos de 8 bits que se juntan arriba del cubo formando un dibujo, se quedan y se desarman.
  const PIXELES = [
    { filas: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'], col: '#ff4f6d', luz: '#ffa3b4' },   // corazón
    { filas: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '..XXX..', '..XXX..'], col: '#35cf72', luz: '#a6f2c4' },   // flecha para arriba
    { filas: ['...X...', '..XXX..', 'XXXXXXX', '.XXXXX.', '.XX.XX.', 'X.....X'], col: '#ffcf2e', luz: '#fff2a6' },   // estrella
  ];
  function pixelesFx(ctx, s, t) {
    const per = 3400, f = fase(t, per), n = Math.floor(t / per), dib = PIXELES[((n % 3) + 3) % 3];
    const p = Math.max(2, s * 0.085), cy = -s * 1.5, borde = Math.max(0.7, p * 0.16), w = dib.filas[0].length, h = dib.filas.length;
    const lleno = (c, r) => r >= 0 && dib.filas[r][c] === 'X';
    const fuera = (x, y, cx, cy2) => (tapaCara(x, y, s) ? [x, cy2 - (y - cy2)] : [x, y]);
    const celdas = [];
    dib.filas.forEach((fila, r) => [...fila].forEach((ch, c) => { if (ch === 'X') celdas.push([c, r]); }));
    const pos = celdas.map(([c, r], i) => {
      const tx = (c - (w - 1) / 2) * p, ty = cy + (r - (h - 1) / 2) * p, sem = n * 31 + i;
      const a = ruido(sem, 1) * Math.PI * 2, R = s * (0.8 + 0.5 * ruido(sem, 2));
      const [sx, sy] = fuera(tx + Math.cos(a) * R, ty + Math.sin(a) * R * 0.75, 0, cy);
      const b = ruido(sem, 3) * Math.PI * 2, R2 = s * (0.9 + 0.6 * ruido(sem, 4));
      const [ex, ey] = fuera(tx + Math.cos(b) * R2, ty + Math.sin(b) * R2 * 0.75 - s * 0.2, 0, cy);
      const d = ruido(sem, 5) * 0.1;
      if (f < 0.32) {
        const u = Math.min(1, Math.max(0, (f - d) / 0.22)), e = 1 - Math.pow(1 - u, 3);
        return [sx + (tx - sx) * e, sy + (ty - sy) * e, Math.min(1, u * 3), c, r];
      }
      if (f < 0.7) return [tx, ty + Math.sin(t / 200) * s * 0.02, 1, c, r];
      const u = Math.min(1, Math.max(0, (f - 0.7 - d * 0.5) / 0.25)), e = u * u;
      return [tx + (ex - tx) * e, ty + (ey - ty) * e, 1 - u, c, r];
    });
    // primero el borde de tinta de todos (así el dibujo armado queda con un solo contorno), después los colores
    for (const [x, y, al] of pos) { ctx.globalAlpha = al; ctx.fillStyle = INK; ctx.fillRect(x - p / 2 - borde, y - p / 2 - borde, p + borde * 2, p + borde * 2); }
    for (const [x, y, al, c, r] of pos) {
      ctx.globalAlpha = al; ctx.fillStyle = lleno(c, r - 1) ? dib.col : dib.luz; ctx.fillRect(x - p / 2, y - p / 2, p, p);
    }
    // brillito que recorre el dibujo armado
    if (f > 0.34 && f < 0.68) {
      const i = Math.floor((f - 0.34) / 0.34 * pos.length) % pos.length, [x, y] = pos[i];
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffffff'; ctx.fillRect(x - p / 2, y - p / 2, p, p);
    }
    // pixeles sueltos que suben por los costados
    for (let k = 0; k < 6; k++) {
      const g = fase(t, 1800 + k * 170, k / 6), side = k % 2 ? 1 : -1, x = side * s * (0.64 + 0.16 * ruido(k, 7)), y = -s * (0.1 + g * 1.2), q = p * 0.8;
      ctx.globalAlpha = Math.min(1, g * 5, (1 - g) * 3);
      ctx.fillStyle = INK; ctx.fillRect(x - q / 2 - borde, y - q / 2 - borde, q + borde * 2, q + borde * 2);
      ctx.fillStyle = ARCO[k % ARCO.length]; ctx.fillRect(x - q / 2, y - q / 2, q, q);
    }
    ctx.globalAlpha = 1;
  }

  // Corona de luz: aro dorado que flota arriba con puntas de luz y cuentas que corren. capa 0 = mitad de atrás.
  function coronaDeLuz(ctx, s, t, capa) {
    const cy = -s * 1.36 + Math.sin(t / 700) * s * 0.03, rx = s * 0.5, ry = s * 0.13;
    const desde = capa ? 0 : Math.PI, hasta = desde + Math.PI;
    ctx.save();
    ctx.shadowColor = '#ffe680'; ctx.shadowBlur = s * 0.3;
    for (let k = 0; k < 9; k++) {
      const a = t / 2000 + k * Math.PI * 2 / 9;
      if ((Math.sin(a) > 0) !== !!capa) continue;
      const x = Math.cos(a) * rx, y = cy + Math.sin(a) * ry, alto = s * (0.26 + 0.08 * Math.sin(t / 260 + k * 1.3)), w = s * 0.07;
      const g = ctx.createLinearGradient(0, y, 0, y - alto); g.addColorStop(0, 'rgba(255,196,30,1)'); g.addColorStop(0.5, 'rgba(255,220,90,.85)'); g.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.globalAlpha = capa ? 1 : 0.75; ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w * 0.3, y - alto * 0.5, x, y - alto); ctx.quadraticCurveTo(x + w * 0.3, y - alto * 0.5, x + w, y); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const [col, ancho] of [['rgba(190,120,0,.85)', Math.max(3.5, s * 0.115)], ['#ffc928', Math.max(2.2, s * 0.075)], ['#fffbe0', Math.max(1, s * 0.028)]]) {
      ctx.strokeStyle = col; ctx.lineWidth = ancho; ctx.beginPath(); ctx.ellipse(0, cy, rx, ry, 0, desde, hasta); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 5; k++) {
      const a = t / 650 + k * Math.PI * 2 / 5;
      if ((Math.sin(a) > 0) !== !!capa) continue;
      ctx.beginPath(); ctx.arc(Math.cos(a) * rx, cy + Math.sin(a) * ry, Math.max(1.2, s * 0.04), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Supernova: se carga, explota con rayos y una onda expansiva por el piso, y vuelve a empezar.
  // capa 0 = núcleo, rayos y mitad de atrás de la onda; 1 = mitad de adelante y chispas que no tapan la cara.
  function supernova(ctx, s, t, capa) {
    const per = 2600, f = fase(t, per), n = Math.floor(t / per), cy = -s * 0.5;
    const carga = f < 0.3, u = carga ? 0 : (f - 0.3) / 0.7, e = 1 - Math.pow(1 - u, 3);
    if (capa === 0) {
      const rN = carga ? s * (0.55 + 0.4 * f / 0.3) : s * (0.95 - 0.4 * u);
      const g = ctx.createRadialGradient(0, cy, 0, 0, cy, rN * 1.3);
      g.addColorStop(0, 'rgba(255,255,240,.95)'); g.addColorStop(0.45, 'rgba(255,190,80,.6)'); g.addColorStop(1, 'rgba(255,80,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, cy, rN * 1.3, 0, Math.PI * 2); ctx.fill();
      if (!carga) {
        const cols = ['#ffffff', '#ffd23f', '#ff8a3d', '#ff5dc8'];
        ctx.globalAlpha = Math.pow(1 - u, 1.2);
        for (let k = 0; k < 16; k++) {
          const a = k * Math.PI / 8 + n * 0.7, L = s * (0.55 + (k % 2 ? 0.85 : 1.35) * e), w = k % 2 ? 0.07 : 0.1;
          ctx.fillStyle = cols[k % 4];
          ctx.beginPath(); ctx.moveTo(Math.cos(a - w) * s * 0.4, cy + Math.sin(a - w) * s * 0.4); ctx.lineTo(Math.cos(a) * L, cy + Math.sin(a) * L);
          ctx.lineTo(Math.cos(a + w) * s * 0.4, cy + Math.sin(a + w) * s * 0.4); ctx.closePath(); ctx.fill();
        }
        if (u < 0.15) { ctx.globalAlpha = 1 - u / 0.15; ctx.fillStyle = '#fffbe6'; ctx.beginPath(); ctx.arc(0, cy, s * 1.3, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
    }
    if (!carga) {
      const rx = s * (0.5 + 1.3 * e), ry = rx * 0.28, desde = capa ? 0 : Math.PI;
      ctx.globalAlpha = 1 - u;
      for (const [col, ancho] of [['#ff8a3d', Math.max(2, s * 0.12 * (1 - u * 0.6))], ['#fff3c4', Math.max(1, s * 0.045 * (1 - u * 0.6))]]) {
        ctx.strokeStyle = col; ctx.lineWidth = ancho; ctx.beginPath(); ctx.ellipse(0, -s * 0.06, rx, ry, 0, desde, desde + Math.PI); ctx.stroke();
      }
      for (let k = 0; k < 12; k++) {
        const a = k * Math.PI / 6 + n * 1.3 + ruido(n, k) * 0.4, r = s * (0.55 + 1.2 * e * (0.7 + 0.3 * ruido(k, n)));
        const x = Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.9;
        if ((!tapaCara(x, y, s)) !== (capa === 1)) continue;
        ctx.fillStyle = ['#fff3b0', '#ffb02e', '#ff5dc8'][k % 3]; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.8, s * 0.02);
        estrella(ctx, x, y, s * 0.07 * (1 - u * 0.5) + 0.8, 4); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (capa === 1) {
      // partículas que se juntan antes de explotar
      const v = f / 0.3;
      for (let k = 0; k < 10; k++) {
        const a = k * 0.628 + n, r = s * (1.4 - 0.8 * v), x = Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.9;
        if (tapaCara(x, y, s)) continue;
        ctx.globalAlpha = v; ctx.fillStyle = k % 2 ? '#ffd23f' : '#ffffff'; ctx.strokeStyle = 'rgba(29,35,64,.6)'; ctx.lineWidth = Math.max(0.7, s * 0.015);
        ctx.beginPath(); ctx.arc(x, y, Math.max(1, s * 0.04), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  // Brillos de nivel: un borde de color pegado por dentro al contorno del cubo, más un detalle según el rango.
  // Mismo origen que los efectos (base del cubo en 0,0; el cubo va de -s/2 a s/2 y de -s a 0).
  // Se llama después de pintar el cuerpo y su contorno, antes de la cara.
  function marcoNivel(ctx, id, s, t) {
    if (!id || id === 'ninguno') return;
    const lw = Math.max(2, s * 0.08), b = Math.max(2, s * 0.075), R = s * 0.2, iR = lw / 2 + b / 2;
    const borde = d => rr(ctx, -s / 2 + d, -s + d, s - 2 * d, s - 2 * d, Math.max(0.5, R - d));
    const pasada = (estilo, ancho, d = iR - 0.4) => { borde(d); ctx.strokeStyle = estilo; ctx.lineWidth = ancho; ctx.stroke(); };
    const diag = (...cs) => { const g = ctx.createLinearGradient(-s / 2, -s, s / 2, 0); cs.forEach((c, i) => g.addColorStop(i / (cs.length - 1), c)); return g; };
    const esquina = (sx, sy) => [sx * (s / 2 - R + (R - iR) * 0.7071), -s / 2 + sy * (s / 2 - R + (R - iR) * 0.7071)];
    const enBorde = (u, d = iR) => puntoRR(u, -s / 2 + d, -s + d, s - 2 * d, s - 2 * d, Math.max(0.5, R - d));
    const brillo = (x, y, r, color, tinta = INK) => {
      ctx.fillStyle = color; ctx.strokeStyle = tinta; ctx.lineWidth = Math.max(0.8, s * 0.018); estrella(ctx, x, y, r, 4); ctx.fill(); ctx.stroke();
    };
    // filete de tinta por dentro, para que se lea como marco (va antes de los brillos)
    const filete = () => pasada('rgba(29,35,64,.5)', Math.max(0.8, s * 0.02), lw / 2 + b);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (id === 'bronce') {
      // bronce cálido con dos destellos que se turnan
      pasada(diag('#f7c08c', '#c77d3e', '#8f5428', '#e6a46a'), b); filete();
      for (const [k, sx, sy] of [[0, -1, -1], [1, 1, 1]]) {
        const a = Math.max(0, Math.sin(t / 520 + k * Math.PI)), [x, y] = esquina(sx, sy);
        ctx.globalAlpha = 0.35 + 0.65 * a; brillo(x, y, s * (0.04 + 0.08 * a) + 1, '#fff1dc');
      }
    } else if (id === 'plata') {
      // plata con un brillo que barre en diagonal cada tanto
      pasada(diag('#f4f7fb', '#b4bfd0', '#8d99ad', '#e3e9f2'), b);
      pasada(franjaDeLuz(ctx, -s / 2, -s, s / 2, 0, fase(t, 2600) * 1.8 - 0.4, 0.14, '255,255,255', 1), b); filete();
    } else if (id === 'oro') {
      // oro con brillo lento y destellos en las cuatro esquinas, uno detrás del otro
      pasada(diag('#fff1a6', '#ffc928', '#d99400', '#ffe066'), b);
      pasada(franjaDeLuz(ctx, -s / 2, -s, s / 2, 0, fase(t, 3200) * 1.8 - 0.4, 0.12, '255,255,235', 0.95), b); filete();
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], k) => {
        const a = 0.5 + 0.5 * Math.sin(t / 300 - k * Math.PI / 2), [x, y] = esquina(sx, sy);
        brillo(x, y, s * (0.05 + 0.07 * a) + 1, '#fffbe0');
      });
    } else if (id === 'platino') {
      // platino con un reflejo celeste que gira y tres puntitos que dan la vuelta por afuera
      pasada(diag('#ffffff', '#cdd6e6', '#aab6cc', '#eef3fa'), b);
      const a = t / 1400, gx = Math.cos(a) * s * 0.7, gy = Math.sin(a) * s * 0.7;
      const g = ctx.createLinearGradient(-gx, -s / 2 - gy, gx, -s / 2 + gy);
      g.addColorStop(0, 'rgba(140,205,255,0)'); g.addColorStop(0.5, 'rgba(140,205,255,.95)'); g.addColorStop(1, 'rgba(140,205,255,0)');
      pasada(g, b); filete();
      const d = -(lw / 2 + s * 0.07);
      for (let k = 0; k < 3; k++) {
        for (let c = 3; c >= 0; c--) {
          const [x, y] = enBorde(t / 3200 + k / 3 - c * 0.014, d);
          ctx.globalAlpha = c ? 0.55 * (1 - c / 4) : 1; ctx.fillStyle = c ? '#a9dcff' : '#f2f9ff';
          ctx.beginPath(); ctx.arc(x, y, Math.max(c ? 0.8 : 1.4, s * (c ? 0.03 : 0.045)), 0, Math.PI * 2); ctx.fill();
          if (!c) { ctx.strokeStyle = 'rgba(29,35,64,.8)'; ctx.lineWidth = Math.max(0.7, s * 0.015); ctx.stroke(); }
        }
      }
      ctx.globalAlpha = 1;
    } else if (id === 'diamante') {
      // cian tallado en facetas, con halo por fuera y destellos de cristal que aparecen en el borde
      ctx.save(); ctx.shadowColor = '#7fe3ff'; ctx.shadowBlur = s * 0.25; pasada('rgba(127,227,255,.8)', Math.max(1, s * 0.03), -(lw / 2 + s * 0.02)); ctx.restore();
      pasada('#1fa9dc', b);
      ctx.lineCap = 'butt';
      ctx.setLineDash([s * 0.1, s * 0.08]); ctx.lineDashOffset = -t / 220; pasada('#aef0ff', b * 0.8);
      ctx.setLineDash([s * 0.03, s * 0.15]); ctx.lineDashOffset = -t / 220 - s * 0.035; pasada('#ffffff', b * 0.45);
      ctx.setLineDash([]); ctx.lineCap = 'round'; filete();
      for (let k = 0; k < 3; k++) {
        const fk = fase(t, 900, k / 3), nk = Math.floor(t / 900 + k / 3), [x, y] = enBorde(ruido(nk, k)), a = Math.sin(fk * Math.PI);
        brillo(x, y, s * 0.13 * a + 0.6, '#ffffff', '#1a6f9c');
      }
    } else if (id === 'cosmico') {
      // arcoíris que gira, halo que cambia de color y estrellitas que se van a la deriva
      const h = (t / 8) % 360;
      ctx.save(); ctx.shadowColor = `hsl(${h},100%,70%)`; ctx.shadowBlur = s * 0.3; pasada(`hsla(${h},100%,72%,.85)`, Math.max(1, s * 0.035), -(lw / 2 + s * 0.025)); ctx.restore();
      let g;
      if (ctx.createConicGradient) { g = ctx.createConicGradient(t / 700, 0, -s / 2); for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(i * 60) % 360},100%,64%)`); }
      else g = diag(...[0, 1, 2, 3, 4, 5].map(i => `hsl(${(i * 60 + t / 8) % 360},100%,64%)`));
      pasada(g, b);
      ctx.setLineDash([s * 0.02, s * 0.12]); ctx.lineDashOffset = t / 90; pasada('rgba(255,255,255,.9)', b * 0.4); ctx.setLineDash([]); filete();
      const d = -(lw / 2 + s * 0.04);
      for (let k = 0; k < 8; k++) {
        const f = fase(t, 2600 + k * 290, k * 0.37), [x0, y0] = enBorde(k / 8 + 0.03 * Math.sin(k), d);
        const dx = x0, dy = y0 + s / 2, n = Math.hypot(dx, dy) || 1, a = Math.sin(f * Math.PI);
        ctx.globalAlpha = a; brillo(x0 + dx / n * f * s * 0.3, y0 + dy / n * f * s * 0.3 - f * s * 0.15, s * 0.065 * a + 0.8, ARCO[k % ARCO.length]);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // Efectos que van detrás del cubo
  function efectoDetras(ctx, id, s, t) {
    if (id === 'arcoiris') {
      ctx.lineWidth = s * 0.09;
      ARCO.forEach((c, k) => {
        ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(0, -s * 0.3, s * (1.15 - k * 0.09), Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      });
    } else if (id === 'fuego' || id === 'infierno') {
      const cs = id === 'fuego' ? ['#ff5d2d', '#ffad4d', '#ffe14d'] : ['#7a0f2a', '#e0203a', '#ff7a3d'];
      for (let k = 0; k < 5; k++) {
        const x = (k - 2) * s * 0.3, h = s * (0.85 + 0.3 * Math.sin(t / 90 + k * 1.9)) * (k % 2 ? 0.8 : 1);
        cs.forEach((c, i) => {
          const w = s * (0.24 - i * 0.06), hh = h * (1 - i * 0.28);
          ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - w, 0); ctx.quadraticCurveTo(x - w, -hh * 0.5, x, -hh);
          ctx.quadraticCurveTo(x + w, -hh * 0.5, x + w, 0); ctx.closePath(); ctx.fill();
        });
      }
      if (id === 'infierno') {
        for (let k = 0; k < 6; k++) {
          const f = fase(t, 1100, k / 6), x = Math.sin(k * 2.3 + t / 500) * s * 0.7;
          ctx.globalAlpha = 1 - f; ctx.fillStyle = k % 2 ? '#ff7a3d' : '#ffe14d';
          ctx.fillRect(x, -s * (0.2 + f * 1.4), s * 0.06, s * 0.06);
        }
        ctx.globalAlpha = 1;
      }
    } else if (id === 'halo') {
      ctx.save(); ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = s * 0.4;
      ctx.strokeStyle = '#ffcc29'; ctx.lineWidth = Math.max(2.5, s * 0.08);
      ctx.beginPath(); ctx.ellipse(0, -s * (1.42 + 0.04 * Math.sin(t / 400)), s * 0.42, s * 0.12, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 0.18; ctx.fillStyle = '#ffe14d';
      ctx.beginPath(); ctx.arc(0, -s * 0.5, s * (0.95 + 0.06 * Math.sin(t / 300)), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    } else if (id === 'aura') {
      ctx.lineWidth = Math.max(2, s * 0.05);
      for (let k = 0; k < 2; k++) {
        ctx.strokeStyle = k ? '#5cb0ff' : '#ff5d7d';
        ctx.setLineDash([s * 0.18, s * 0.12]); ctx.lineDashOffset = (k ? -1 : 1) * t / 30;
        ctx.beginPath(); ctx.ellipse(0, -s * 0.5, s * (0.86 + k * 0.12), s * (0.3 + k * 0.08), k ? 0.35 : -0.35, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.setLineDash([]);
    } else if (id === 'aurora') {
      // cortinas de aurora hechas de rayitos verticales: borde de abajo brillante, se apagan hacia arriba y a los costados
      const cols = ['92,255,176', '192,123,255', '92,224,255'], N = 40, X = u => (u * 2.4 - 1.2) * s;
      ctx.lineCap = 'butt';
      for (let k = 0; k < 3; k++) {
        const base = -s * (0.45 + k * 0.26), alto = s * (0.6 + 0.1 * k), c = cols[k];
        const onda = u => base + Math.sin(u * 5 + t / 700 + k * 2) * s * 0.12 + Math.sin(u * 11 - t / 450 + k) * s * 0.035;
        const g = ctx.createLinearGradient(0, base - alto - s * 0.15, 0, base + s * 0.16);
        g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(0.75, `rgba(${c},.85)`); g.addColorStop(1, `rgba(${c},.5)`);
        ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, s * 0.045);
        for (let i = 0; i <= N; i++) {
          const u = i / N, y = onda(u);
          ctx.globalAlpha = Math.pow(Math.sin(u * Math.PI), 0.8) * (0.6 + 0.4 * Math.sin(u * 17 + t / 380 + k * 2));
          ctx.beginPath(); ctx.moveTo(X(u), y + s * 0.02); ctx.lineTo(X(u), y - alto * (0.6 + 0.4 * Math.sin(u * 7 + t / 900 + k))); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const borde = ctx.createLinearGradient(X(0), 0, X(1), 0);
        borde.addColorStop(0, `rgba(${c},0)`); borde.addColorStop(0.5, `rgba(${c},1)`); borde.addColorStop(1, `rgba(${c},0)`);
        ctx.strokeStyle = borde; ctx.lineWidth = Math.max(1.5, s * 0.045); ctx.lineCap = 'round'; ctx.beginPath();
        for (let i = 0; i <= N; i++) ctx.lineTo(X(i / N), onda(i / N));
        ctx.stroke(); ctx.lineCap = 'butt';
      }
    } else if (id === 'alas') {
      // alas de luz con plumas, aletean despacio
      const ale = Math.sin(t / 650) * 0.2;
      ctx.lineWidth = Math.max(1.2, s * 0.035); ctx.strokeStyle = INK;
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(side * s * 0.36, -s * 0.66); ctx.rotate(side * (ale - 0.38));
        for (let c = 0; c < 3; c++) {
          const L = s * (1.0 - c * 0.24), H = s * (0.6 - c * 0.1), n = 4 - c;
          ctx.beginPath(); ctx.moveTo(0, s * 0.1);
          ctx.quadraticCurveTo(side * L * 0.35, -H * 1.15, side * L, -H);
          for (let f = 1; f <= n; f++) {
            const u0 = (f - 1) / n, u1 = f / n;
            const x0 = side * L * (1 - u0 * 0.9), y0 = -H * (1 - u0) + s * 0.1 * u0;
            const x1 = side * L * (1 - u1 * 0.9), y1 = -H * (1 - u1) + s * 0.1 * u1;
            ctx.quadraticCurveTo((x0 + x1) / 2 + side * s * 0.05, (y0 + y1) / 2 + s * 0.16, x1, y1);
          }
          ctx.closePath();
          ctx.save(); ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = s * 0.35; ctx.fillStyle = ['#ffe9a0', '#fff6d6', '#ffffff'][c]; ctx.fill(); ctx.restore();
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if (id === 'agujero') {
      // agujero negro: remolino oscuro, brazos que giran, anillo violeta y partículas que caen en espiral
      const cy = -s * 0.35;
      const g = ctx.createRadialGradient(0, cy, s * 0.1, 0, cy, s * 1.1);
      g.addColorStop(0, 'rgba(8,4,22,1)'); g.addColorStop(0.45, 'rgba(36,14,74,.92)'); g.addColorStop(0.75, 'rgba(110,50,190,.35)'); g.addColorStop(1, 'rgba(110,50,190,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, cy, s * 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(1.5, s * 0.05);
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = k % 2 ? 'rgba(192,139,255,.6)' : 'rgba(255,93,214,.5)'; ctx.beginPath();
        for (let i = 0; i <= 20; i++) { const u = i / 20, a = t / 500 + k * 2.09 + u * 3.4, r = s * (1.0 - u * 0.8); ctx.lineTo(Math.cos(a) * r, cy + Math.sin(a) * r * 0.85); }
        ctx.stroke();
      }
      for (let k = 0; k < 9; k++) {
        const f = fase(t, 1700, k / 9), a = k * 2.4 + f * 5.5, r = s * (1.15 * (1 - f) + 0.1);
        ctx.globalAlpha = Math.min(1, f * 5) * (1 - f * 0.4); ctx.fillStyle = k % 3 ? '#e2d1ff' : '#ffd1f4';
        ctx.beginPath(); ctx.arc(Math.cos(a) * r, cy + Math.sin(a) * r * 0.85, s * 0.055 * (1 - f * 0.6), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // mitad de atrás del anillo (la de adelante va en efectoDelante)
      ctx.lineWidth = Math.max(3, s * 0.12); ctx.strokeStyle = '#8f4bff';
      ctx.beginPath(); ctx.ellipse(0, cy, s * 0.98, s * 0.18, -0.18, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = Math.max(1.5, s * 0.05); ctx.strokeStyle = '#f0c8ff';
      ctx.beginPath(); ctx.ellipse(0, cy, s * 0.98, s * 0.18, -0.18, Math.PI, Math.PI * 2); ctx.stroke();
    } else if (id === 'codigo') {
      // lluvia de código: columnas de 0 y 1 que caen
      const paso = s * 0.21;
      ctx.font = `800 ${Math.max(6, Math.round(s * 0.21))}px ui-monospace,Consolas,monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(1, s * 0.03); ctx.strokeStyle = INK;
      for (let c = 0; c < 9; c++) {
        // la cabeza baja de a un casillero, como en una terminal
        const x = (c - 4) * s * 0.25, fila0 = Math.floor((fase(t, 1500 + (c * 317) % 800, c * 0.37) * 2.2 - 1.8) * s / paso);
        for (let i = 0; i < 6; i++) {
          const fila = fila0 - i, y = fila * paso;
          if (y > -paso * 0.4 || y < -s * 1.75) continue;
          const r = Math.sin(c * 91.7 + fila * 37.3 + Math.floor(t / 400 + c * 0.3) * 13.1) * 43758.5;
          const bit = (r - Math.floor(r)) > 0.5 ? '1' : '0';
          ctx.globalAlpha = i ? 0.95 * (1 - i / 7) : 1;
          ctx.fillStyle = i ? (c % 2 ? '#25d073' : '#1cc0dc') : '#eafff8';
          if (!i) ctx.strokeText(bit, x, y);
          ctx.fillText(bit, x, y);
        }
      }
      ctx.globalAlpha = 1;
    } else if (id === 'nieve') {
      // copos que caen (la mitad va detrás del cubo, la otra mitad adelante)
      nieve(ctx, s, t, 0);
    } else if (id === 'huellitas') {
      // pasos que dan la vuelta por atrás del cubo (los de adelante van en efectoDelante)
      huellitas(ctx, s, t, 0);
    } else if (id === 'estela') {
      // mitad de atrás de la órbita
      estelaEspacial(ctx, s, t, 0);
    } else if (id === 'ki') {
      // aura de energía: lenguas en capas (borde azul, medio celeste, centro blanco) que laten despacio
      const p = 1 + 0.045 * Math.sin(t / 260);
      ctx.scale(p, p);
      ctx.save(); ctx.shadowColor = '#5fe0ff'; ctx.shadowBlur = s * 0.3;
      lenguasDeEnergia(ctx, s, t, 0.84, 0.95, 'rgba(40,95,225,.55)', 0); ctx.restore();
      ctx.strokeStyle = 'rgba(150,235,255,.95)'; ctx.lineWidth = Math.max(1.2, s * 0.035); ctx.stroke();
      lenguasDeEnergia(ctx, s, t, 0.7, 0.72, 'rgba(95,224,255,.7)', 1.7);
      lenguasDeEnergia(ctx, s, t, 0.58, 0.5, 'rgba(255,255,255,.88)', 3.1);
    } else if (id === 'hojas') {
      // hojas que cruza el viento (las de adelante van en efectoDelante, solo por los costados)
      hojasAlViento(ctx, s, t, 0);
    } else if (id === 'burbujasx') {
      burbujasDeJabon(ctx, s, t, 0);
    } else if (id === 'relampago') {
      // resplandor eléctrico que titila (los arcos van adelante)
      electricidad(ctx, s, t, 0);
    } else if (id === 'petalos') {
      petalosRemolino(ctx, s, t, 0);
    } else if (id === 'galaxiafx') {
      espiralGalactica(ctx, s, t);
    } else if (id === 'corona') {
      // mitad de atrás del aro de luz
      coronaDeLuz(ctx, s, t, 0);
    } else if (id === 'supernova') {
      // núcleo, rayos y mitad de atrás de la onda
      supernova(ctx, s, t, 0);
    }
  }
  // Efectos que van delante del cubo
  function efectoDelante(ctx, id, s, t) {
    if (id === 'chispas' || id === 'estrellas') {
      const n = id === 'chispas' ? 4 : 6, r = id === 'chispas' ? 0.82 : 0.5, cy = id === 'chispas' ? -0.5 : -1.22;
      for (let k = 0; k < n; k++) {
        const a = t / (id === 'chispas' ? 700 : 1300) + k * Math.PI * 2 / n;
        const x = Math.cos(a) * s * r, y = s * cy + Math.sin(a) * s * (id === 'chispas' ? 0.6 : 0.14);
        const tw = 0.6 + 0.4 * Math.sin(t / 160 + k * 2);
        ctx.fillStyle = id === 'chispas' ? '#fffaf0' : '#ffe14d'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.025);
        estrella(ctx, x, y, s * (id === 'chispas' ? 0.14 : 0.13) * tw, id === 'chispas' ? 4 : 5); ctx.fill(); ctx.stroke();
      }
    } else if (id === 'burbujas') {
      ctx.lineWidth = Math.max(1.5, s * 0.03);
      for (let k = 0; k < 5; k++) {
        const f = fase(t, 1700, k / 5), x = (k - 2) * s * 0.3 + Math.sin(t / 300 + k) * s * 0.08;
        ctx.globalAlpha = 1 - f; ctx.strokeStyle = '#5cb0ff'; ctx.fillStyle = 'rgba(200,235,255,.5)';
        ctx.beginPath(); ctx.arc(x, -s * (0.1 + f * 1.5), s * (0.09 + 0.05 * (k % 3)), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (id === 'corazones') {
      for (let k = 0; k < 3; k++) {
        const f = fase(t, 1900, k / 3), x = (k - 1) * s * 0.55 + Math.sin(t / 400 + k * 2) * s * 0.1;
        ctx.globalAlpha = Math.min(1, (1 - f) * 1.6); ctx.fillStyle = '#ff5d7d'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.025);
        corazon(ctx, x, -s * (0.9 + f * 0.8), s * 0.15); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (id === 'confeti') {
      for (let k = 0; k < 9; k++) {
        const f = fase(t, 1500, k / 9), x = Math.sin(k * 7.7) * s * 0.8 + Math.sin(t / 250 + k) * s * 0.06;
        ctx.save(); ctx.translate(x, -s * (1.7 - f * 1.5)); ctx.rotate(t / 150 + k);
        ctx.globalAlpha = f < 0.85 ? 1 : (1 - f) / 0.15; ctx.fillStyle = ARCO[k % ARCO.length];
        ctx.fillRect(-s * 0.075, -s * 0.035, s * 0.15, s * 0.07); ctx.restore();
      }
      ctx.globalAlpha = 1;
    } else if (id === 'cometa') {
      const a = t / 600;
      for (let k = 8; k >= 0; k--) {
        const b = a - k * 0.09, x = Math.cos(b) * s * 0.85, y = -s * 0.5 + Math.sin(b) * s * 0.35;
        ctx.globalAlpha = k ? 0.6 * (1 - k / 9) : 1;
        ctx.fillStyle = k ? '#ffad4d' : '#ffe14d';
        ctx.beginPath(); ctx.arc(x, y, s * (k ? 0.1 * (1 - k / 11) : 0.14), 0, Math.PI * 2); ctx.fill();
        if (!k) { ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.025); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
    } else if (id === 'rayos') {
      ctx.lineJoin = 'round';
      for (const side of [-1, 1]) {
        if (Math.sin(t / 70 + side * 1.3) < -0.2) continue;
        const x0 = side * s * 0.78; ctx.save(); ctx.translate(x0, -s * 0.65); ctx.scale(1.35, 1.35); ctx.translate(-x0, s * 0.65);
        ctx.beginPath(); ctx.moveTo(x0, -s * 1.15); ctx.lineTo(x0 - side * s * 0.12, -s * 0.7); ctx.lineTo(x0 + side * s * 0.06, -s * 0.66);
        ctx.lineTo(x0 - side * s * 0.08, -s * 0.15); ctx.lineTo(x0 + side * s * 0.16, -s * 0.78); ctx.lineTo(x0 - side * s * 0.02, -s * 0.8);
        ctx.lineTo(x0 + side * s * 0.12, -s * 1.15); ctx.closePath();
        ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.03); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    } else if (id === 'agujero') {
      // mitad de adelante del anillo del agujero negro
      const cy = -s * 0.35;
      ctx.lineWidth = Math.max(3, s * 0.12); ctx.strokeStyle = 'rgba(143,75,255,.92)';
      ctx.beginPath(); ctx.ellipse(0, cy, s * 0.98, s * 0.18, -0.18, 0, Math.PI); ctx.stroke();
      ctx.lineWidth = Math.max(1.5, s * 0.05); ctx.strokeStyle = '#f0c8ff';
      ctx.beginPath(); ctx.ellipse(0, cy, s * 0.98, s * 0.18, -0.18, 0, Math.PI); ctx.stroke();
    } else if (id === 'tormenta') {
      // nubecita con lluvia y un rayo cada tanto
      const cy = -s * 1.55 + Math.sin(t / 900) * s * 0.03, ciclo = fase(t, 2600), vuelta = Math.floor(t / 2600);
      const flash = ciclo > 0.84 && ciclo < 0.95 && !(ciclo > 0.875 && ciclo < 0.895);
      ctx.strokeStyle = 'rgba(70,150,255,.9)'; ctx.lineWidth = Math.max(1.5, s * 0.04);
      for (let k = 0; k < 7; k++) {
        const x = (k - 3) * s * 0.15 + Math.sin(k * 5.3) * s * 0.03, piso = Math.abs(x) < s * 0.5 ? -s : 0;
        const f = fase(t, 560 + (k * 97) % 160, k * 0.41), y0 = cy + s * 0.12, y = y0 + f * (piso - y0);
        ctx.globalAlpha = f > 0.85 ? (1 - f) / 0.15 : 1;
        ctx.beginPath(); ctx.moveTo(x, y - s * 0.13); ctx.lineTo(x - s * 0.02, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (flash) {
        const side = vuelta % 2 ? 1 : -1, x0 = side * s * 0.58, y0 = cy + s * 0.1;
        ctx.globalAlpha = 0.3; ctx.fillStyle = '#fff6b0'; ctx.beginPath(); ctx.arc(0, cy, s * 0.85, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.035); ctx.beginPath();
        for (const [px, py] of [[-0.07, 0], [0.1, 0], [0.03, 0.28], [0.16, 0.28], [-0.08, 0.74], [-0.01, 0.4], [-0.13, 0.4]]) {
          ctx.lineTo(x0 + side * (px + py * 0.3) * s, y0 + py * s);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.lineWidth = Math.max(2, s * 0.05);
      const bolas = [[-0.3, 0.02, 0.2], [-0.05, -0.1, 0.27], [0.24, -0.02, 0.22], [0.42, 0.06, 0.14]];
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(4, s * 0.1);
      for (const [x, y, r] of bolas) { ctx.beginPath(); ctx.arc(x * s, cy + y * s, r * s, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = flash ? '#a7acd0' : '#5a6088';
      for (const [x, y, r] of bolas) { ctx.beginPath(); ctx.arc(x * s, cy + y * s, r * s, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(-s * 0.1, cy - s * 0.18, s * 0.1, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'nieve') {
      nieve(ctx, s, t, 1);
    } else if (id === 'fuegos') {
      // fuegos artificiales: un cohetito sube y explota arriba del cubo
      const cols = ['#ff4f7b', '#ff8a2e', '#2fcf86', '#3f95ff', '#a466ff', '#ff4fc3'];
      for (let k = 0; k < 3; k++) {
        const per = 1900, f = fase(t, per, k / 3), n = Math.floor(t / per + k / 3);
        const bx = [-0.68, 0.05, 0.72][k] * s + Math.sin(n * 3.7 + k) * s * 0.1, by = -s * [1.4, 1.85, 1.5][k];
        const c1 = cols[((n * 2 + k * 3) % 6 + 6) % 6], c2 = cols[((n * 2 + k * 3 + 2) % 6 + 6) % 6];
        if (f < 0.25) {
          // sube el cohetito con su estela
          const u = f / 0.25, y0 = k === 1 ? -s * 1.05 : -s * 0.3, y = y0 + (by - y0) * (1 - (1 - u) * (1 - u));
          ctx.globalAlpha = 0.7; ctx.strokeStyle = c1; ctx.lineWidth = Math.max(1.5, s * 0.04);
          ctx.beginPath(); ctx.moveTo(bx, Math.min(y0, y + s * 0.3)); ctx.lineTo(bx, y); ctx.stroke(); ctx.globalAlpha = 1;
          ctx.fillStyle = '#fff6d6'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.025);
          ctx.beginPath(); ctx.arc(bx, y, Math.max(1.5, s * 0.05), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else {
          // explota: rayitos de dos colores que se abren y caen un poco
          const u = (f - 0.25) / 0.75, r = s * 0.44 * (1 - Math.pow(1 - u, 2.5)), caida = u * u * s * 0.16;
          ctx.globalAlpha = 1 - u * u;
          if (u < 0.2) { ctx.fillStyle = '#fff6d6'; ctx.beginPath(); ctx.arc(bx, by, s * 0.18 * (1 - u / 0.2), 0, Math.PI * 2); ctx.fill(); }
          for (let i = 0; i < 12; i++) {
            const a = i * Math.PI / 6 + n, ca = Math.cos(a), sa = Math.sin(a), c = i % 2 ? c1 : c2, rr2 = i % 2 ? r : r * 0.8;
            ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = Math.max(1.5, s * 0.055);
            ctx.beginPath(); ctx.moveTo(bx + ca * rr2 * 0.5, by + sa * rr2 * 0.5 + caida * 0.5); ctx.lineTo(bx + ca * rr2 * 0.85, by + sa * rr2 * 0.85 + caida * 0.85); ctx.stroke();
            ctx.beginPath(); ctx.arc(bx + ca * rr2, by + sa * rr2 + caida, Math.max(1.2, s * 0.04), 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
    } else if (id === 'notas') {
      // notas de colores que suben por los costados y se juntan arriba; laten y se hamacan al ritmo (un pulso cada 500 ms)
      const pulso = Math.max(0, 1 - fase(t, 500) * 3.5), hamaca = Math.sin(t / 500 * Math.PI) * 0.22;
      for (let k = 0; k < 6; k++) {
        const f = fase(t, 2700, k / 6), side = k % 2 ? 1 : -1;
        const x = side * s * (0.74 - 0.38 * f) + Math.sin(t / 420 + k * 2.1) * s * 0.05;
        const y = -s * (0.25 + f * 1.45) - pulso * s * 0.05;
        ctx.globalAlpha = f < 0.12 ? f / 0.12 : f > 0.78 ? (1 - f) / 0.22 : 1;
        ctx.save(); ctx.translate(x, y); ctx.rotate(hamaca * (k % 3 ? 1 : -1)); ctx.scale(1 + pulso * 0.2, 1 + pulso * 0.2);
        notaMusical(ctx, 0, 0, Math.max(2.2, s * 0.085), ARCO[(k * 2 + (k > 2 ? 1 : 0)) % ARCO.length], k % 3 === 1);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    } else if (id === 'huellitas') {
      huellitas(ctx, s, t, 1);
    } else if (id === 'estela') {
      estelaEspacial(ctx, s, t, 1);
    } else if (id === 'ki') {
      // chispas de energía y rayitas que suben por los costados (no tapan la cara)
      ctx.lineCap = 'round';
      for (let k = 0; k < 8; k++) {
        const f = fase(t, k % 2 ? 700 : 1000, k * 0.29), side = k % 2 ? 1 : -1, x = side * s * (0.56 + 0.22 * ((k * 0.43) % 1));
        const y = -s * (0.1 + f * 1.45);
        ctx.globalAlpha = f < 0.1 ? f / 0.1 : 1 - f;
        if (k < 4) {
          ctx.strokeStyle = k % 3 ? 'rgba(160,240,255,.95)' : '#ffffff'; ctx.lineWidth = Math.max(1.2, s * 0.03);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + s * 0.22); ctx.stroke();
        } else {
          ctx.fillStyle = k % 3 ? '#9ff0ff' : '#ffffff'; ctx.strokeStyle = 'rgba(40,95,225,.9)'; ctx.lineWidth = Math.max(0.8, s * 0.02);
          estrella(ctx, x, y, s * 0.065 + 0.8, 4); ctx.fill(); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    } else if (id === 'hojas') {
      hojasAlViento(ctx, s, t, 1);
    } else if (id === 'burbujasx') {
      burbujasDeJabon(ctx, s, t, 1);
    } else if (id === 'relampago') {
      // arquitos pegados al contorno del cubo
      electricidad(ctx, s, t, 1);
    } else if (id === 'petalos') {
      petalosRemolino(ctx, s, t, 1);
    } else if (id === 'pixeles') {
      pixelesFx(ctx, s, t);
    } else if (id === 'corona') {
      coronaDeLuz(ctx, s, t, 1);
    } else if (id === 'supernova') {
      supernova(ctx, s, t, 1);
    }
  }

  // Partes de cada personaje. detras: antes del cuerpo · piel: dentro del cuerpo · encima: después de la cara.
  const PARTES = {
    orejas: { detras(ctx, s, sk) {
      for (const side of [-1, 1]) {
        ctx.fillStyle = sk.cuerpo; ctx.strokeStyle = INK;
        ctx.beginPath(); ctx.moveTo(side * s * 0.46, -s * 0.9); ctx.lineTo(side * s * 0.36, -s * 1.3); ctx.lineTo(side * s * 0.08, -s * 0.96);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff9fb6';
        ctx.beginPath(); ctx.moveTo(side * s * 0.38, -s * 0.98); ctx.lineTo(side * s * 0.34, -s * 1.17); ctx.lineTo(side * s * 0.2, -s * 1.0); ctx.closePath(); ctx.fill();
      }
    } },
    panda: {
      detras(ctx, s) { ctx.fillStyle = INK; for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * s * 0.38, -s * 0.98, s * 0.17, 0, Math.PI * 2); ctx.fill(); } },
      piel(ctx, s, sk, t, look) {
        ctx.fillStyle = '#2b3048';
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * s * 0.2 + look, -s * 0.54, s * 0.13, s * 0.17, side * -0.5, 0, Math.PI * 2); ctx.fill(); }
      },
      ojo: CREMA,
    },
    rana: {
      detras(ctx, s, sk) {
        ctx.fillStyle = sk.cuerpo; ctx.strokeStyle = INK;
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * s * 0.24, -s * 0.96, s * 0.19, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      },
      encima(ctx, s, sk, t, look) {
        for (const side of [-1, 1]) {
          ctx.fillStyle = CREMA; ctx.beginPath(); ctx.arc(side * s * 0.24, -s * 0.98, s * 0.12, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(side * s * 0.24 + look, -s * 0.97, s * 0.06, 0, Math.PI * 2); ctx.fill();
        }
      },
    },
    abeja: {
      detras(ctx, s) {
        ctx.fillStyle = 'rgba(210,240,255,.85)'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.04);
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * s * 0.55, -s * 0.95, s * 0.22, s * 0.13, side * -0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      },
      piel(ctx, s) { ctx.fillStyle = INK; ctx.fillRect(-s / 2, -s * 0.2, s, s * 0.08); ctx.fillRect(-s / 2, -s * 0.07, s, s * 0.08); },
      encima(ctx, s) {
        ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045);
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(side * s * 0.12, -s); ctx.quadraticCurveTo(side * s * 0.16, -s * 1.22, side * s * 0.3, -s * 1.28); ctx.stroke();
          ctx.beginPath(); ctx.arc(side * s * 0.3, -s * 1.28, s * 0.06, 0, Math.PI * 2); ctx.fill();
        }
      },
    },
    pinguino: {
      piel(ctx, s) { ctx.fillStyle = CREMA; ctx.beginPath(); ctx.ellipse(0, -s * 0.36, s * 0.38, s * 0.46, 0, 0, Math.PI * 2); ctx.fill(); },
      encima(ctx, s) {
        ctx.fillStyle = '#ffad4d'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.04);
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * s * 0.2, -s * 0.02, s * 0.13, s * 0.06, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      },
    },
    ninja: {
      piel(ctx, s) { ctx.fillStyle = '#f2c9a0'; ctx.fillRect(-s / 2, -s * 0.7, s, s * 0.28); },
      encima(ctx, s, sk, t, look, mirar) {
        ctx.fillStyle = '#ff3b3b'; ctx.strokeStyle = INK;
        rr(ctx, -s / 2 - s * 0.02, -s * 0.88, s * 1.04, s * 0.13, s * 0.04); ctx.fill(); ctx.stroke();
        const lado = mirar > 0 ? -1 : 1, ondea = Math.sin(t / 140) * s * 0.06;
        for (const k of [0, 1]) {
          ctx.beginPath(); ctx.moveTo(lado * s * 0.5, -s * 0.82);
          ctx.quadraticCurveTo(lado * s * 0.75, -s * (0.8 - k * 0.12) + ondea, lado * s * (0.92 - k * 0.06), -s * (0.66 - k * 0.14) - ondea);
          ctx.lineTo(lado * s * (0.84 - k * 0.06), -s * (0.6 - k * 0.14) - ondea);
          ctx.quadraticCurveTo(lado * s * 0.68, -s * (0.72 - k * 0.12), lado * s * 0.5, -s * 0.76); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      },
    },
    sombrero: { encima(ctx, s) {
      ctx.fillStyle = '#9a5b2e'; ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.ellipse(0, -s * 0.98, s * 0.72, s * 0.12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.36, -s * 1.0); ctx.lineTo(-s * 0.3, -s * 1.36); ctx.quadraticCurveTo(0, -s * 1.26, s * 0.3, -s * 1.36);
      ctx.lineTo(s * 0.36, -s * 1.0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff5d7d'; ctx.fillRect(-s * 0.34, -s * 1.12, s * 0.68, s * 0.08);
    } },
    chef: { encima(ctx, s) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = INK;
      for (const [x, y, r] of [[-0.24, -1.26, 0.2], [0.24, -1.26, 0.2], [0, -1.36, 0.24]]) { ctx.beginPath(); ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      rr(ctx, -s * 0.38, -s * 1.2, s * 0.76, s * 0.26, s * 0.05); ctx.fill(); ctx.stroke();
    } },
    pirata: {
      piel(ctx, s) {
        ctx.fillStyle = '#e0203a'; ctx.fillRect(-s / 2, -s, s, s * 0.22);
        ctx.fillStyle = CREMA; for (const x of [-0.3, 0, 0.3]) { ctx.beginPath(); ctx.arc(x * s, -s * 0.89, s * 0.035, 0, Math.PI * 2); ctx.fill(); }
      },
      encima(ctx, s, sk, t, look) {
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.04);
        ctx.beginPath(); ctx.moveTo(-s / 2, -s * 0.74); ctx.lineTo(s / 2, -s * 0.48); ctx.stroke();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(-s * 0.2 + look, -s * 0.56, s * 0.12, s * 0.11, 0, 0, Math.PI * 2); ctx.fill();
      },
    },
    vikingo: { encima(ctx, s) {
      ctx.strokeStyle = INK;
      for (const side of [-1, 1]) {
        ctx.fillStyle = CREMA; ctx.beginPath(); ctx.moveTo(side * s * 0.36, -s * 1.02);
        ctx.quadraticCurveTo(side * s * 0.72, -s * 1.08, side * s * 0.7, -s * 1.42); ctx.quadraticCurveTo(side * s * 0.55, -s * 1.18, side * s * 0.3, -s * 1.18);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#b8c4d6'; ctx.beginPath(); ctx.ellipse(0, -s * 0.98, s * 0.42, s * 0.3, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9aa6bb'; ctx.fillRect(-s * 0.04, -s * 1.27, s * 0.08, s * 0.28);
    } },
    zombie: {
      piel(ctx, s) {
        ctx.fillStyle = 'rgba(70,110,60,.45)'; ctx.beginPath(); ctx.ellipse(s * 0.28, -s * 0.2, s * 0.16, s * 0.1, 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.03);
        ctx.beginPath(); ctx.moveTo(-s * 0.42, -s * 0.86); ctx.lineTo(-s * 0.1, -s * 0.76); ctx.stroke();
        for (let k = 0; k < 4; k++) { const x = -s * 0.38 + k * s * 0.09; ctx.beginPath(); ctx.moveTo(x, -s * 0.88 + k * s * 0.025); ctx.lineTo(x + s * 0.02, -s * 0.76 + k * s * 0.025); ctx.stroke(); }
        ctx.fillStyle = CREMA; ctx.fillRect(s * 0.12, -s * 0.94, s * 0.3, s * 0.1);
      },
    },
    mago: { encima(ctx, s) {
      ctx.fillStyle = '#3b3f9e'; ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.ellipse(0, -s * 0.98, s * 0.62, s * 0.11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.36, -s * 1.0); ctx.quadraticCurveTo(-s * 0.1, -s * 1.4, s * 0.18, -s * 1.7); ctx.lineTo(s * 0.36, -s * 1.0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe14d'; estrella(ctx, s * 0.02, -s * 1.22, s * 0.1); ctx.fill();
    } },
    lava: { piel(ctx, s, sk, t) {
      ctx.strokeStyle = `rgba(255,${140 + 60 * Math.sin(t / 300) | 0},40,.95)`; ctx.lineWidth = Math.max(1.5, s * 0.04);
      for (const pts of [[[-0.5, -0.3], [-0.3, -0.22], [-0.24, -0.06], [-0.1, 0]], [[0.5, -0.8], [0.32, -0.74], [0.3, -0.9]], [[0.5, -0.22], [0.36, -0.12], [0.2, -0.16]]]) {
        ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s))); ctx.stroke();
      }
    } },
    arcoiris: { piel(ctx, s) { ARCO.forEach((c, k) => { ctx.fillStyle = c; ctx.fillRect(-s / 2, -s + k * s / 6, s, s / 6 + 1); }); } },
    galaxia: { piel(ctx, s, sk, t) {
      ctx.fillStyle = 'rgba(255,93,170,.35)'; ctx.beginPath(); ctx.ellipse(-s * 0.2, -s * 0.3, s * 0.4, s * 0.18, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(92,176,255,.35)'; ctx.beginPath(); ctx.ellipse(s * 0.25, -s * 0.8, s * 0.36, s * 0.16, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = CREMA;
      for (const [x, y, k] of [[-0.36, -0.86, 0], [0.34, -0.28, 1], [-0.1, -0.14, 2], [0.12, -0.92, 3], [0.4, -0.6, 4]]) {
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t / 400 + k)); ctx.fillRect(x * s, y * s, s * 0.035, s * 0.035);
      }
      ctx.globalAlpha = 1;
    } },
    diablito: {
      detras(ctx, s, sk, t) {
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, s * 0.06);
        const w = Math.sin(t / 250) * s * 0.08;
        ctx.beginPath(); ctx.moveTo(s * 0.4, -s * 0.15); ctx.quadraticCurveTo(s * 0.8, -s * 0.1 + w, s * 0.72, -s * 0.55); ctx.stroke();
        ctx.fillStyle = '#ff3b3b'; ctx.lineWidth = Math.max(1.5, s * 0.035);
        ctx.beginPath(); ctx.moveTo(s * 0.72, -s * 0.72); ctx.lineTo(s * 0.62, -s * 0.5); ctx.lineTo(s * 0.84, -s * 0.52); ctx.closePath(); ctx.fill(); ctx.stroke();
      },
      encima(ctx, s) {
        ctx.fillStyle = '#7a0f2a'; ctx.strokeStyle = INK;
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(side * s * 0.38, -s * 0.98); ctx.quadraticCurveTo(side * s * 0.46, -s * 1.22, side * s * 0.3, -s * 1.36);
          ctx.quadraticCurveTo(side * s * 0.26, -s * 1.15, side * s * 0.14, -s * 0.98); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      },
    },
    diamante: {
      piel(ctx, s) {
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.beginPath(); ctx.moveTo(-s / 2, -s); ctx.lineTo(0, -s * 0.5); ctx.lineTo(-s / 2, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(40,120,200,.18)';
        ctx.beginPath(); ctx.moveTo(s / 2, -s); ctx.lineTo(0, -s * 0.5); ctx.lineTo(s / 2, 0); ctx.closePath(); ctx.fill();
      },
      encima(ctx, s, sk, t) {
        ctx.fillStyle = '#fff';
        for (const [x, y, k] of [[-0.56, -1.02, 0], [0.58, -0.82, 1], [0.36, -1.2, 2]]) {
          const a = 0.5 + 0.5 * Math.sin(t / 200 + k * 2.1); ctx.globalAlpha = a; estrella(ctx, x * s, y * s, s * (0.05 + 0.07 * a), 4); ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
    },
  };

  Object.assign(PARTES, {
    sabio: {
      encima(ctx, s) {
        // capucha y barba larga
        ctx.fillStyle = '#6a4bd6'; ctx.strokeStyle = INK;
        ctx.beginPath(); ctx.moveTo(-s * 0.58, -s * 0.42); ctx.lineTo(-s * 0.58, -s * 0.9); ctx.quadraticCurveTo(-s * 0.5, -s * 1.36, 0, -s * 1.38);
        ctx.quadraticCurveTo(s * 0.5, -s * 1.36, s * 0.58, -s * 0.9); ctx.lineTo(s * 0.58, -s * 0.42); ctx.lineTo(s * 0.44, -s * 0.42);
        ctx.lineTo(s * 0.44, -s * 0.84); ctx.quadraticCurveTo(0, -s * 1.0, -s * 0.44, -s * 0.84); ctx.lineTo(-s * 0.44, -s * 0.42); ctx.closePath(); ctx.fill(); ctx.stroke();
        // cejas blancas
        ctx.strokeStyle = CREMA; ctx.lineWidth = Math.max(2, s * 0.06);
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * s * 0.1, -s * 0.74); ctx.quadraticCurveTo(side * s * 0.2, -s * 0.8, side * s * 0.32, -s * 0.72); ctx.stroke(); }
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, s * 0.08);
        ctx.fillStyle = CREMA;
        ctx.beginPath(); ctx.moveTo(-s * 0.36, -s * 0.4); ctx.quadraticCurveTo(-s * 0.3, s * 0.02, 0, s * 0.14);
        ctx.quadraticCurveTo(s * 0.3, s * 0.02, s * 0.36, -s * 0.4); ctx.quadraticCurveTo(0, -s * 0.28, -s * 0.36, -s * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffcc29'; ctx.beginPath(); ctx.arc(0, -s * 1.42, s * 0.08, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      },
    },
    fantasma: {
      encima(ctx, s, sk, t) {
        // boquita de "uh" y ondas abajo
        ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, -s * 0.3, s * 0.06, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(191,224,255,.7)';
        for (let k = 0; k < 3; k++) {
          const f = fase(t, 1600, k / 3);
          ctx.globalAlpha = 1 - f; ctx.beginPath(); ctx.arc((k - 1) * s * 0.4, -s * (1.05 + f * 0.5), s * (0.05 + f * 0.05), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
    },
    fenix: {
      detras(ctx, s, sk, t) {
        const aleteo = Math.sin(t / 160) * 0.18;
        for (const side of [-1, 1]) {
          ctx.save(); ctx.translate(side * s * 0.45, -s * 0.6); ctx.rotate(side * (-0.35 + aleteo));
          ctx.fillStyle = '#ffad4d'; ctx.strokeStyle = INK;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(side * s * 0.5, -s * 0.45, side * s * 0.62, -s * 0.05);
          ctx.quadraticCurveTo(side * s * 0.45, -s * 0.02, side * s * 0.5, s * 0.14); ctx.quadraticCurveTo(side * s * 0.3, s * 0.08, 0, s * 0.18); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
      },
      piel(ctx, s) {
        const g = ctx.createLinearGradient(0, -s, 0, 0); g.addColorStop(0, '#ffcc29'); g.addColorStop(1, '#ff3b3b');
        ctx.fillStyle = g; ctx.globalAlpha = 0.7; ctx.fillRect(-s / 2, -s, s, s); ctx.globalAlpha = 1;
      },
      encima(ctx, s, sk, t) {
        ctx.strokeStyle = INK;
        for (const [x, h, c] of [[-0.18, 0.34, '#ff3b3b'], [0.18, 0.34, '#ff3b3b'], [0, 0.46, '#ffcc29']]) {
          const w = Math.sin(t / 120 + x * 9) * s * 0.03;
          ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x * s - s * 0.1, -s * 0.98);
          ctx.quadraticCurveTo(x * s - s * 0.08 + w, -s * (0.98 + h * 0.6), x * s + w, -s * (0.98 + h));
          ctx.quadraticCurveTo(x * s + s * 0.1 + w, -s * (0.98 + h * 0.5), x * s + s * 0.1, -s * 0.98); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        for (let k = 0; k < 4; k++) {
          const f = fase(t, 900, k / 4), x = Math.sin(k * 3.1 + t / 400) * s * 0.55;
          ctx.globalAlpha = 1 - f; ctx.fillStyle = k % 2 ? '#ffe14d' : '#ff7a3d'; ctx.fillRect(x, -s * (0.3 + f * 1.3), s * 0.05, s * 0.05);
        }
        ctx.globalAlpha = 1;
      },
    },
    glitch: {
      piel(ctx, s, sk, t) {
        const k = Math.floor(t / 90);
        for (let i = 0; i < 4; i++) {
          const r = Math.sin(k * 12.9898 + i * 78.233) * 43758.5453, f = r - Math.floor(r);
          ctx.fillStyle = i % 2 ? 'rgba(255,59,212,.55)' : 'rgba(95,245,255,.55)';
          ctx.fillRect(-s / 2 + (f - 0.5) * s * 0.2, -s + f * s * 0.9, s, s * 0.06 + f * s * 0.05);
        }
      },
      encima(ctx, s, sk, t) {
        const j = Math.floor(t / 120) % 5 === 0 ? s * 0.05 : s * 0.025;
        ctx.lineWidth = Math.max(1.5, s * 0.04);
        ctx.strokeStyle = 'rgba(255,59,212,.85)'; rr(ctx, -s / 2 - j, -s, s, s, s * 0.2); ctx.stroke();
        ctx.strokeStyle = 'rgba(95,245,255,.85)'; rr(ctx, -s / 2 + j, -s, s, s, s * 0.2); ctx.stroke();
      },
    },
    holograma: {
      piel(ctx, s, sk, t) {
        const g = ctx.createLinearGradient(-s / 2, -s, s / 2, 0);
        for (let k = 0; k <= 4; k++) g.addColorStop(k / 4, `hsl(${(t / 12 + k * 70) % 360},95%,72%)`);
        ctx.fillStyle = g; ctx.globalAlpha = 0.85; ctx.fillRect(-s / 2, -s, s, s);
        ctx.globalAlpha = 0.18; ctx.fillStyle = '#fff';
        const off = (t / 40) % (s * 0.16);
        for (let y = -s + off; y < 0; y += s * 0.16) ctx.fillRect(-s / 2, y, s, s * 0.05);
        ctx.globalAlpha = 1;
      },
    },
    sombra: {
      detras(ctx, s, sk, t) {
        for (let k = 0; k < 5; k++) {
          const f = fase(t, 1400, k / 5), x = (k - 2) * s * 0.26 + Math.sin(t / 300 + k) * s * 0.06;
          ctx.globalAlpha = 0.5 * (1 - f); ctx.fillStyle = '#3a2b6e';
          ctx.beginPath(); ctx.arc(x, -s * (0.2 + f * 1.1), s * (0.12 + f * 0.12), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
      encima(ctx, s, sk, t, look) {
        ctx.save(); ctx.shadowColor = '#c08bff'; ctx.shadowBlur = s * 0.3; ctx.fillStyle = '#e2d1ff';
        for (const side of [-1, 1]) { rr(ctx, side * s * 0.2 + look - s * 0.06, -s * 0.66, s * 0.12, s * 0.2, s * 0.06); ctx.fill(); }
        ctx.restore();
      },
    },
    dev: {
      piel(ctx, s, sk, t) {
        // líneas de código que suben
        ctx.fillStyle = 'rgba(95,245,255,.22)';
        const off = (t / 30) % (s * 0.14);
        for (let k = 0, y = -s + off; y < 0; y += s * 0.14, k++) {
          const w = s * (0.25 + 0.45 * Math.abs(Math.sin(k * 1.7)));
          ctx.fillRect(-s * 0.38 + (k % 3) * s * 0.06, y, w, s * 0.04);
        }
      },
      encima(ctx, s, sk, t, look) {
        // ojos que brillan, sonrisa de cursor y "</>" flotando
        ctx.save(); ctx.shadowColor = '#5ff5ff'; ctx.shadowBlur = s * 0.35; ctx.fillStyle = '#5ff5ff';
        for (const side of [-1, 1]) { rr(ctx, side * s * 0.2 + look - s * 0.06, -s * 0.66, s * 0.12, s * 0.2, s * 0.06); ctx.fill(); }
        if (Math.floor(t / 450) % 2) ctx.fillRect(look - s * 0.1, -s * 0.3, s * 0.2, s * 0.06);
        const y = -s * 1.28 + Math.sin(t / 400) * s * 0.05;
        ctx.font = `800 ${Math.round(s * 0.36)}px "Rubik",ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff3bd4'; ctx.shadowColor = '#ff3bd4'; ctx.fillText('</>', 0, y);
        ctx.restore();
      },
    },
    // ---- Premios grandes del camino de nivel ----
    cristal: {
      detras(ctx, s) {
        // cristalitos de hielo que asoman arriba
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045);
        for (const [x, h, a] of [[-0.24, 0.3, -0.35], [0.04, 0.42, 0.06], [0.28, 0.26, 0.4]]) {
          const w = s * 0.085, hh = h * s;
          ctx.save(); ctx.translate(x * s, -s * 0.9); ctx.rotate(a);
          ctx.fillStyle = '#9fdcff';
          ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(-w, -hh * 0.72); ctx.lineTo(0, -hh); ctx.lineTo(w, -hh * 0.72); ctx.lineTo(w, 0); ctx.closePath();
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.85)';
          ctx.beginPath(); ctx.moveTo(-w * 0.7, -s * 0.02); ctx.lineTo(-w * 0.7, -hh * 0.72); ctx.lineTo(0, -hh * 0.94); ctx.lineTo(0, -s * 0.02); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      },
      piel(ctx, s, sk, t) {
        // hielo: claro arriba a la izquierda, más hondo abajo, con caras talladas
        const g = ctx.createLinearGradient(-s / 2, -s, s / 2, 0);
        g.addColorStop(0, '#f2fbff'); g.addColorStop(0.5, '#b5e8ff'); g.addColorStop(1, '#6fc3f0');
        ctx.fillStyle = g; ctx.fillRect(-s / 2, -s, s, s);
        ctx.fillStyle = 'rgba(255,255,255,.6)';
        ctx.beginPath(); ctx.moveTo(-s / 2, -s); ctx.lineTo(-s * 0.02, -s); ctx.lineTo(-s / 2, -s * 0.42); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(30,110,190,.2)';
        ctx.beginPath(); ctx.moveTo(s / 2, -s * 0.66); ctx.lineTo(s / 2, 0); ctx.lineTo(-s * 0.16, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1, s * 0.025);
        ctx.beginPath(); ctx.moveTo(-s * 0.02, -s); ctx.lineTo(s / 2, -s * 0.66); ctx.moveTo(-s / 2, -s * 0.42); ctx.lineTo(-s * 0.16, 0); ctx.stroke();
        // reflejo que cruza el hielo cada tanto
        const f = fase(t, 3200);
        if (f < 0.4) {
          const x = -s * 0.9 + (f / 0.4) * s * 2;
          ctx.fillStyle = 'rgba(255,255,255,.55)';
          ctx.beginPath(); ctx.moveTo(x, -s); ctx.lineTo(x + s * 0.16, -s); ctx.lineTo(x - s * 0.24, 0); ctx.lineTo(x - s * 0.4, 0); ctx.closePath(); ctx.fill();
        }
      },
      encima(ctx, s, sk, t) {
        // destello que titila en la esquina
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.025); ctx.fillStyle = '#fff';
        for (const [x, y, k, r] of [[0.48, -0.98, 0, 0.13], [-0.6, -0.52, 1, 0.08]]) {
          const a = 0.55 + 0.45 * Math.sin(t / 260 + k * 2.4);
          estrella(ctx, x * s, y * s, s * r * a, 4); ctx.fill(); ctx.stroke();
        }
      },
    },
    tigre: {
      detras(ctx, s, sk) {
        for (const side of [-1, 1]) {
          ctx.fillStyle = sk.cuerpo; ctx.strokeStyle = INK;
          ctx.beginPath(); ctx.arc(side * s * 0.33, -s * 0.96, s * 0.17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = CREMA; ctx.beginPath(); ctx.arc(side * s * 0.33, -s * 0.99, s * 0.08, 0, Math.PI * 2); ctx.fill();
        }
      },
      piel(ctx, s, sk, t, look) {
        // rayas en cuña (desde el borde hacia adentro) y hocico blanco
        ctx.fillStyle = INK;
        const raya = (x0, y0, x1, y1, w) => {
          const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = -dy / l * w, ny = dx / l * w, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
          ctx.beginPath(); ctx.moveTo(x0 + nx, y0 + ny); ctx.quadraticCurveTo(mx + nx * 0.7, my + ny * 0.7, x1, y1);
          ctx.quadraticCurveTo(mx - nx * 0.7, my - ny * 0.7, x0 - nx, y0 - ny); ctx.closePath(); ctx.fill();
        };
        for (const side of [-1, 1]) {
          raya(side * s * 0.54, -s * 0.84, side * s * 0.3, -s * 0.76, s * 0.06);
          raya(side * s * 0.54, -s * 0.56, side * s * 0.36, -s * 0.5, s * 0.05);
          raya(side * s * 0.54, -s * 0.22, side * s * 0.3, -s * 0.12, s * 0.06);
        }
        raya(0, -s * 1.02, 0, -s * 0.78, s * 0.06);
        raya(-s * 0.15, -s * 1.02, -s * 0.12, -s * 0.85, s * 0.045);
        raya(s * 0.15, -s * 1.02, s * 0.12, -s * 0.85, s * 0.045);
        ctx.fillStyle = CREMA; ctx.beginPath(); ctx.ellipse(look, -s * 0.27, s * 0.25, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      },
      encima(ctx, s, sk, t, look) {
        ctx.fillStyle = '#e0506e'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.beginPath(); ctx.moveTo(look - s * 0.07, -s * 0.43); ctx.lineTo(look + s * 0.07, -s * 0.43); ctx.lineTo(look, -s * 0.36); ctx.closePath(); ctx.fill(); ctx.stroke();
      },
    },
    caballero: {
      encima(ctx, s, sk, t, look) {
        // penacho rojo que se mueve (va detrás del casco)
        const ond = Math.sin(t / 320) * s * 0.04;
        ctx.fillStyle = '#e0203a'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.05);
        ctx.beginPath(); ctx.moveTo(-s * 0.08, -s * 1.08);
        ctx.quadraticCurveTo(-s * 0.12, -s * 1.52, s * 0.2 + ond, -s * 1.54);
        ctx.quadraticCurveTo(s * 0.56 + ond, -s * 1.52, s * 0.66 + ond * 1.6, -s * 1.12);
        ctx.quadraticCurveTo(s * 0.42 + ond, -s * 1.32, s * 0.12, -s * 1.06); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#ff7a8a'; ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.beginPath(); ctx.moveTo(s * 0.02, -s * 1.38); ctx.quadraticCurveTo(s * 0.34 + ond, -s * 1.44, s * 0.5 + ond * 1.4, -s * 1.22); ctx.stroke();
        // casco de acero
        const g = ctx.createLinearGradient(0, -s * 1.18, 0, -s * 0.38);
        g.addColorStop(0, '#f1f4fa'); g.addColorStop(1, '#94a3bd');
        ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, s * 0.07);
        ctx.beginPath(); ctx.moveTo(-s * 0.55, -s * 0.38); ctx.lineTo(-s * 0.55, -s * 0.8);
        ctx.quadraticCurveTo(-s * 0.55, -s * 1.18, 0, -s * 1.2); ctx.quadraticCurveTo(s * 0.55, -s * 1.18, s * 0.55, -s * 0.8);
        ctx.lineTo(s * 0.55, -s * 0.38); ctx.closePath(); ctx.fill(); ctx.stroke();
        // cresta y reflejo
        ctx.fillStyle = 'rgba(255,255,255,.75)'; rr(ctx, -s * 0.38, -s * 1.06, s * 0.16, s * 0.3, s * 0.08); ctx.fill();
        ctx.strokeStyle = 'rgba(29,35,64,.35)'; ctx.lineWidth = Math.max(1, s * 0.035);
        ctx.beginPath(); ctx.moveTo(0, -s * 1.16); ctx.lineTo(0, -s * 0.74); ctx.stroke();
        // visera: ranura oscura y los ojos que se ven adentro
        ctx.fillStyle = INK; rr(ctx, -s * 0.43, -s * 0.7, s * 0.86, s * 0.24, s * 0.08); ctx.fill();
        ctx.fillStyle = CREMA;
        for (const side of [-1, 1]) { rr(ctx, side * s * 0.2 + look - s * 0.055, -s * 0.665, s * 0.11, s * 0.17, s * 0.05); ctx.fill(); }
        // remaches
        ctx.fillStyle = '#6f7d96';
        for (const side of [-1, 1]) for (const y of [-0.9, -0.42]) { ctx.beginPath(); ctx.arc(side * s * 0.45, y * s, s * 0.035, 0, Math.PI * 2); ctx.fill(); }
      },
    },
    dragon: {
      detras(ctx, s, sk, t) {
        // alitas de murciélago que aletean
        const ale = Math.sin(t / 220) * 0.16;
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045);
        for (const side of [-1, 1]) {
          ctx.save(); ctx.translate(side * s * 0.4, -s * 0.66); ctx.rotate(side * (-0.1 + ale));
          ctx.fillStyle = '#2f9e57';
          ctx.beginPath(); ctx.moveTo(0, -s * 0.06); ctx.lineTo(side * s * 0.54, -s * 0.36);
          ctx.quadraticCurveTo(side * s * 0.44, -s * 0.12, side * s * 0.54, s * 0.06);
          ctx.quadraticCurveTo(side * s * 0.38, -s * 0.02, side * s * 0.3, s * 0.12);
          ctx.quadraticCurveTo(side * s * 0.16, s * 0.02, 0, s * 0.16); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.lineWidth = Math.max(1, s * 0.025);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(side * s * 0.5, -s * 0.3); ctx.moveTo(0, 0); ctx.lineTo(side * s * 0.52, s * 0.04);
          ctx.moveTo(0, 0); ctx.lineTo(side * s * 0.3, s * 0.1); ctx.stroke();
          ctx.restore();
        }
      },
      piel(ctx, s) {
        // escamitas en el lomo y panza clara con escamas
        ctx.fillStyle = 'rgba(30,120,60,.35)';
        for (const [x, y] of [[-0.32, -0.84], [-0.18, -0.92], [0.3, -0.86], [0.4, -0.72], [-0.4, -0.38], [0.38, -0.36]]) {
          ctx.beginPath(); ctx.arc(x * s, y * s, s * 0.05, 0, Math.PI); ctx.fill();
        }
        ctx.fillStyle = '#e6f59a'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.beginPath(); ctx.ellipse(0, s * 0.05, s * 0.32, s * 0.22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(120,150,40,.85)'; ctx.lineWidth = Math.max(1, s * 0.025);
        for (const [y, n] of [[-0.09, 3], [-0.01, 4]]) {
          for (let k = 0; k < n; k++) {
            const x = (k - (n - 1) / 2) * s * 0.13;
            ctx.beginPath(); ctx.arc(x, y * s - s * 0.02, s * 0.065, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
          }
        }
      },
      encima(ctx, s, sk, t, look) {
        // cuernitos y fosas de la nariz
        ctx.fillStyle = '#fff1c9'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045);
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(side * s * 0.1, -s * 0.97); ctx.quadraticCurveTo(side * s * 0.12, -s * 1.22, side * s * 0.3, -s * 1.32);
          ctx.quadraticCurveTo(side * s * 0.24, -s * 1.12, side * s * 0.32, -s * 0.97); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(29,35,64,.6)';
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(look + side * s * 0.05, -s * 0.42, s * 0.022, s * 0.016, 0, 0, Math.PI * 2); ctx.fill(); }
      },
    },
    campeon: {
      detras(ctx, s, sk, t) {
        // capa roja que flamea
        const w1 = Math.sin(t / 260) * s * 0.05, w2 = Math.sin(t / 260 + 1.6) * s * 0.05;
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.05);
        ctx.fillStyle = '#d7263d';
        ctx.beginPath(); ctx.moveTo(-s * 0.42, -s * 0.9);
        ctx.quadraticCurveTo(-s * 0.62, -s * 0.5, -s * 0.76 + w1, -s * 0.02);
        ctx.quadraticCurveTo(-s * 0.62, -s * 0.1 + w2, -s * 0.5, -s * 0.02);
        ctx.lineTo(s * 0.5, -s * 0.02);
        ctx.quadraticCurveTo(s * 0.62, -s * 0.1 + w1, s * 0.76 + w2, -s * 0.02);
        ctx.quadraticCurveTo(s * 0.62, -s * 0.5, s * 0.42, -s * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(122,15,42,.6)'; ctx.lineWidth = Math.max(1, s * 0.03);
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * s * 0.5, -s * 0.7); ctx.quadraticCurveTo(side * s * 0.6, -s * 0.4, side * (s * 0.64 + (side < 0 ? -w1 : w2) * 0.5), -s * 0.08); ctx.stroke(); }
      },
      piel(ctx, s) {
        // oro con un reflejo en diagonal
        const g = ctx.createLinearGradient(0, -s, 0, 0); g.addColorStop(0, '#ffe066'); g.addColorStop(1, '#f5a300');
        ctx.fillStyle = g; ctx.fillRect(-s / 2, -s, s, s);
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.beginPath(); ctx.moveTo(s * 0.12, -s); ctx.lineTo(s * 0.3, -s); ctx.lineTo(-s * 0.2, 0); ctx.lineTo(-s * 0.38, 0); ctx.closePath(); ctx.fill();
      },
      encima(ctx, s, sk, t) {
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.04);
        // broches de la capa
        ctx.fillStyle = '#ffe066';
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * s * 0.44, -s * 0.84, s * 0.07, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        // corona de laureles
        ctx.lineWidth = Math.max(1.2, s * 0.035);
        for (const side of [-1, 1]) {
          // 3 hojas por lado sobre el borde de arriba, apuntando hacia el centro
          for (const [u, a] of [[0.92, 0.2], [0.6, 0.55], [0.28, 0.95]]) {
            ctx.save(); ctx.translate(side * s * (0.06 + u * 0.4), -s * (0.98 + 0.04 * Math.sin(u * Math.PI)));
            ctx.rotate(-side * a);
            ctx.fillStyle = '#4cbf5e';
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(side * s * 0.09, -s * 0.08, 0, -s * 0.2);
            ctx.quadraticCurveTo(-side * s * 0.09, -s * 0.08, 0, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.restore();
          }
        }
        // estrellita de campeón arriba
        const a = 0.85 + 0.15 * Math.sin(t / 300);
        ctx.fillStyle = '#fff6c2'; ctx.lineWidth = Math.max(1, s * 0.03);
        estrella(ctx, 0, -s * 1.1, s * 0.11 * a); ctx.fill(); ctx.stroke();
      },
    },
    // ---- Premios de juegos ----
    turbo: {
      detras(ctx, s, sk, t, look, mirar) {
        const lado = mirar < 0 ? 1 : -1;
        // líneas de velocidad del lado de atrás
        ctx.lineCap = 'round'; ctx.strokeStyle = '#6fbcff'; ctx.lineWidth = Math.max(1.5, s * 0.055);
        for (let k = 0; k < 3; k++) {
          const f = fase(t, 560, k * 0.37), y = -s * (0.9 - k * 0.27), x0 = lado * s * (0.62 + f * 0.3), l = s * (0.46 - k * 0.08) * (1 - f * 0.5);
          ctx.globalAlpha = 1 - f * f;
          ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + lado * l, y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // las dos puntas de la bufanda, flameando
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045); ctx.lineJoin = 'round';
        for (const k of [1, 0]) {
          const x0 = lado * s * 0.4, y0 = -s * 0.15, L = s * (0.66 - k * 0.16), N = 10, arriba = [], abajo = [];
          for (let i = 0; i <= N; i++) {
            const u = i / N, w = s * 0.07 * (1 - u * 0.3);
            const y = y0 + u * s * (0.02 + k * 0.12) + Math.sin(u * 5 - t / 70 + k * 1.7) * s * 0.07 * u;
            arriba.push([x0 + lado * u * L, y - w]); abajo.push([x0 + lado * u * L, y + w]);
          }
          ctx.fillStyle = k ? '#c41f2e' : '#e8323c'; ctx.beginPath();
          arriba.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          const [xa, ya] = arriba[N], [xb, yb] = abajo[N];
          ctx.lineTo((xa + xb) / 2 - lado * s * 0.06, (ya + yb) / 2);
          for (let i = N; i >= 0; i--) ctx.lineTo(abajo[i][0], abajo[i][1]);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      },
      piel(ctx, s) {
        // azul eléctrico, más claro arriba
        const g = ctx.createLinearGradient(0, -s, 0, 0); g.addColorStop(0, '#4fa8ff'); g.addColorStop(1, '#1f6fe6');
        ctx.fillStyle = g; ctx.fillRect(-s / 2, -s, s, s);
      },
      encima(ctx, s, sk, t, look, mirar) {
        const lado = mirar < 0 ? 1 : -1;
        // bufanda roja con el nudo del lado de atrás
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.05);
        ctx.fillStyle = '#e8323c'; rr(ctx, -s * 0.54, -s * 0.23, s * 1.08, s * 0.16, s * 0.07); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(122,15,42,.55)'; ctx.lineWidth = Math.max(1, s * 0.025);
        ctx.beginPath(); ctx.moveTo(-s * 0.44, -s * 0.15); ctx.lineTo(s * 0.44, -s * 0.15); ctx.stroke();
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045); ctx.fillStyle = '#ff4f5a';
        ctx.beginPath(); ctx.ellipse(lado * s * 0.42, -s * 0.15, s * 0.09, s * 0.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // cejas decididas
        ctx.lineWidth = Math.max(1.5, s * 0.055); ctx.lineCap = 'round';
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * s * 0.29 + look, -s * 0.78); ctx.lineTo(side * s * 0.11 + look, -s * 0.715); ctx.stroke(); }
        // antiparras de aviador subidas en la frente
        ctx.lineWidth = Math.max(1, s * 0.03); ctx.fillStyle = '#6b4a35';
        rr(ctx, -s * 0.53, -s * 1.0, s * 1.06, s * 0.08, s * 0.03); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d6dde9'; rr(ctx, -s * 0.06, -s * 1.0, s * 0.12, s * 0.06, s * 0.02); ctx.fill(); ctx.stroke();
        for (const side of [-1, 1]) {
          const cx = side * s * 0.17, cy = -s * 0.98;
          ctx.lineWidth = Math.max(1.5, s * 0.045); ctx.fillStyle = '#d6dde9';
          ctx.beginPath(); ctx.arc(cx, cy, s * 0.14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          const g = ctx.createLinearGradient(cx, cy - s * 0.1, cx, cy + s * 0.1); g.addColorStop(0, '#ffe27a'); g.addColorStop(1, '#ff8a2e');
          ctx.fillStyle = g; ctx.lineWidth = Math.max(1, s * 0.025);
          ctx.beginPath(); ctx.arc(cx, cy, s * 0.09, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(cx - s * 0.035, cy - s * 0.035, s * 0.03, 0, Math.PI * 2); ctx.fill();
        }
      },
    },
    paraguas: {
      encima(ctx, s, sk, t) {
        // paragüitas de sombrero que se hamaca; las gotas caen, resbalan por la tela y se caen por el borde
        const R = s * 0.66, H = s * 0.44, y0 = -s * 0.12, n = 4;
        ctx.save(); ctx.translate(0, -s * 0.98); ctx.rotate(Math.sin(t / 700) * 0.06);
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, s * 0.06);
        ctx.beginPath(); ctx.moveTo(0, s * 0.02); ctx.lineTo(0, y0); ctx.stroke();
        const borde = i => -R + i * (2 * R / n);
        const tela = () => {
          ctx.beginPath(); ctx.moveTo(-R, y0); ctx.ellipse(0, y0, R, H, 0, Math.PI, Math.PI * 2);
          for (let i = n - 1; i >= 0; i--) ctx.quadraticCurveTo((borde(i) + borde(i + 1)) / 2, y0 - H * 0.24, borde(i), y0);
          ctx.closePath();
        };
        tela(); ctx.fillStyle = '#ff4f6d'; ctx.fill();
        ctx.save(); tela(); ctx.clip(); ctx.fillStyle = '#ffe14d';
        for (let i = 1; i < n; i += 2) { ctx.beginPath(); ctx.moveTo(0, y0 - H); ctx.lineTo(borde(i), y0 + 1); ctx.lineTo(borde(i + 1), y0 + 1); ctx.closePath(); ctx.fill(); }
        ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.ellipse(-R * 0.45, y0 - H * 0.6, R * 0.2, H * 0.14, -0.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.lineWidth = Math.max(1, s * 0.025);
        ctx.beginPath(); for (let i = 1; i < n; i++) { ctx.moveTo(0, y0 - H); ctx.lineTo(borde(i), y0); } ctx.stroke();
        ctx.lineWidth = Math.max(1.5, s * 0.05); tela(); ctx.stroke();
        ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.arc(0, y0 - H - s * 0.04, s * 0.05, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // gotas
        const r = Math.max(1.4, s * 0.05);
        for (let k = 0; k < 3; k++) {
          const f = fase(t, 1900, k / 3 + 0.05), side = k === 1 ? 1 : -1, th0 = 0.35 + k * 0.12, th1 = 1.38;
          ctx.fillStyle = '#7cc8ff'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.8, s * 0.02);
          if (f < 0.18) {
            // cae del cielo hasta la tela
            const u = f / 0.18, x = side * R * Math.sin(th0), yT = y0 - H * Math.cos(th0) - r;
            ctx.globalAlpha = Math.min(1, u * 3);
            gota(ctx, x, yT - (1 - u) * s * 0.7, r); ctx.fill(); ctx.stroke();
          } else if (f < 0.6) {
            // resbala por la tela hasta el borde
            const u = (f - 0.18) / 0.42, th = th0 + (th1 - th0) * u * u;
            gota(ctx, side * (R + r * 0.6) * Math.sin(th), y0 - (H + r * 0.6) * Math.cos(th) - r * 0.2, r); ctx.fill(); ctx.stroke();
          } else {
            // se cae por el borde hasta el piso
            const u = (f - 0.6) / 0.4;
            ctx.globalAlpha = u > 0.8 ? (1 - u) / 0.2 : 1;
            gota(ctx, side * (R + r * 0.3), y0 + r + u * u * s * 0.95, r); ctx.fill(); ctx.stroke();
          }
          ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(255,255,255,.8)';
        }
        ctx.restore();
      },
    },
    caja: {
      piel(ctx, s) {
        // cartón: un poco más oscuro abajo, con la canaleta del corrugado y pelusitas
        const g = ctx.createLinearGradient(0, -s, 0, 0); g.addColorStop(0, '#e3ad72'); g.addColorStop(1, '#c98c50');
        ctx.fillStyle = g; ctx.fillRect(-s / 2, -s, s, s);
        ctx.strokeStyle = 'rgba(120,70,30,.12)'; ctx.lineWidth = Math.max(1, s * 0.02);
        ctx.beginPath(); for (let x = -0.44; x < 0.5; x += 0.08) { ctx.moveTo(x * s, -s); ctx.lineTo(x * s, 0); } ctx.stroke();
        ctx.fillStyle = 'rgba(110,60,25,.28)';
        for (const [x, y] of [[-0.36, -0.42], [0.38, -0.5], [-0.14, -0.12], [0.1, -0.06], [-0.4, -0.66]]) { ctx.fillRect(x * s, y * s, s * 0.03, s * 0.012); }
        // pliegue de la tapa
        ctx.strokeStyle = 'rgba(110,60,25,.5)'; ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.beginPath(); ctx.moveTo(-s / 2, -s * 0.8); ctx.lineTo(s / 2, -s * 0.8); ctx.stroke();
        // cinta de embalar, cortada en zigzag
        ctx.fillStyle = 'rgba(250,232,190,.95)'; ctx.strokeStyle = 'rgba(150,100,40,.55)'; ctx.lineWidth = Math.max(1, s * 0.018);
        const w = s * 0.11, fin = -s * 0.7;
        ctx.beginPath(); ctx.moveTo(-w, -s); ctx.lineTo(-w, fin);
        for (let i = 1; i <= 4; i++) ctx.lineTo(-w + i * (w / 2), fin + (i % 2 ? s * 0.035 : 0));
        ctx.lineTo(w, -s); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(-w * 0.55, -s, w * 0.3, s * 0.27);
      },
      encima(ctx, s, sk, t, look) {
        // flechitas de "este lado arriba" y sello rojo con la copa de "frágil"
        ctx.strokeStyle = 'rgba(70,40,20,.75)'; ctx.lineWidth = Math.max(1.2, s * 0.03); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const dx of [-0.36, -0.22]) {
          ctx.beginPath(); ctx.moveTo(dx * s, -s * 0.06); ctx.lineTo(dx * s, -s * 0.2);
          ctx.moveTo(dx * s - s * 0.045, -s * 0.15); ctx.lineTo(dx * s, -s * 0.2); ctx.lineTo(dx * s + s * 0.045, -s * 0.15); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(-s * 0.41, -s * 0.04); ctx.lineTo(-s * 0.17, -s * 0.04); ctx.stroke();
        ctx.save(); ctx.translate(s * 0.28, -s * 0.13); ctx.rotate(-0.16);
        ctx.strokeStyle = '#d7263d'; ctx.fillStyle = 'rgba(215,38,61,.12)'; ctx.lineWidth = Math.max(1.2, s * 0.03);
        rr(ctx, -s * 0.12, -s * 0.11, s * 0.24, s * 0.22, s * 0.04); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d7263d';
        ctx.beginPath(); ctx.moveTo(-s * 0.06, -s * 0.075); ctx.lineTo(s * 0.06, -s * 0.075);
        ctx.quadraticCurveTo(s * 0.06, s * 0.01, 0, s * 0.015); ctx.quadraticCurveTo(-s * 0.06, s * 0.01, -s * 0.06, -s * 0.075); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, s * 0.06); ctx.moveTo(-s * 0.04, s * 0.065); ctx.lineTo(s * 0.04, s * 0.065); ctx.stroke();
        // rajadura de la copa
        ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(0.8, s * 0.015);
        ctx.beginPath(); ctx.moveTo(-s * 0.01, -s * 0.075); ctx.lineTo(s * 0.015, -s * 0.045); ctx.lineTo(-s * 0.01, -s * 0.025); ctx.lineTo(s * 0.01, -s * 0.0); ctx.stroke();
        ctx.restore();
      },
    },
    equilibrista: {
      encima(ctx, s, sk, t, look) {
        // galera a rayas y la vara: se hamacan para lados opuestos, como haciendo equilibrio
        const vaiven = Math.sin(t / 700);
        ctx.save(); ctx.translate(0, -s * 0.97); ctx.rotate(vaiven * 0.09);
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.05);
        const copa = () => { ctx.beginPath(); ctx.moveTo(-s * 0.24, -s * 0.02); ctx.lineTo(-s * 0.28, -s * 0.5); ctx.lineTo(s * 0.28, -s * 0.5); ctx.lineTo(s * 0.24, -s * 0.02); ctx.closePath(); };
        ctx.fillStyle = '#e8323c'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.42, s * 0.085, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        copa(); ctx.fillStyle = '#fff6ea'; ctx.fill();
        ctx.save(); copa(); ctx.clip(); ctx.fillStyle = '#e8323c';
        for (let i = 0; i < 3; i++) ctx.fillRect(-s * 0.2 + i * s * 0.16, -s * 0.52, s * 0.08, s * 0.52);
        ctx.fillStyle = '#ffcc29'; ctx.fillRect(-s * 0.3, -s * 0.15, s * 0.6, s * 0.09);
        ctx.restore();
        copa(); ctx.stroke();
        ctx.lineWidth = Math.max(1, s * 0.025); ctx.beginPath(); ctx.moveTo(-s * 0.29, -s * 0.15); ctx.lineTo(s * 0.29, -s * 0.15); ctx.moveTo(-s * 0.29, -s * 0.06); ctx.lineTo(s * 0.29, -s * 0.06); ctx.stroke();
        ctx.fillStyle = '#c08bff'; ctx.lineWidth = Math.max(1, s * 0.025); ctx.beginPath(); ctx.ellipse(s * 0.2, -s * 0.2, s * 0.05, s * 0.13, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
        // vara de equilibrio con pesitas y las manitos que la agarran
        ctx.save(); ctx.translate(0, -s * 0.15); ctx.rotate(-vaiven * 0.11);
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045);
        ctx.fillStyle = '#ffcc29'; rr(ctx, -s * 1.02, -s * 0.035, s * 2.04, s * 0.07, s * 0.035); ctx.fill(); ctx.stroke();
        for (const side of [-1, 1]) {
          ctx.fillStyle = '#e8323c'; ctx.beginPath(); ctx.arc(side * s * 1.04, 0, s * 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(side * s * 1.04 - s * 0.03, -s * 0.03, s * 0.03, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = sk.cuerpo; ctx.beginPath(); ctx.arc(side * s * 0.3, 0, s * 0.085, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      },
    },
    playero: {
      encima(ctx, s, sk, t, look) {
        // visera (deja la cabeza al aire) y anteojos de sol con un reflejo que pasa cada tanto
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.05);
        ctx.fillStyle = '#16b8b8'; rr(ctx, -s * 0.53, -s * 1.0, s * 1.06, s * 0.11, s * 0.04); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(47,214,208,.6)'; ctx.beginPath(); ctx.ellipse(look * 0.5, -s * 0.9, s * 0.62, s * 0.16, 0, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = Math.max(1, s * 0.025); ctx.beginPath(); ctx.ellipse(look * 0.5, -s * 0.9, s * 0.5, s * 0.1, 0, 0.15 * Math.PI, 0.5 * Math.PI); ctx.stroke(); ctx.strokeStyle = INK;
        ctx.fillStyle = '#ffe14d'; ctx.lineWidth = Math.max(1, s * 0.025);
        ctx.beginPath(); ctx.arc(look * 0.5, -s * 0.945, s * 0.035, 0, Math.PI * 2); ctx.fill();
        // anteojos
        ctx.lineWidth = Math.max(1.5, s * 0.045);
        ctx.beginPath(); ctx.moveTo(-s * 0.52, -s * 0.66); ctx.lineTo(s * 0.52, -s * 0.66); ctx.stroke();
        const f = fase(t, 2800);
        for (const side of [-1, 1]) {
          const x = side * s * 0.21 + look;
          const g = ctx.createLinearGradient(0, -s * 0.72, 0, -s * 0.46); g.addColorStop(0, '#2b3470'); g.addColorStop(1, '#3f8fc9');
          ctx.fillStyle = g; rr(ctx, x - s * 0.17, -s * 0.73, s * 0.34, s * 0.25, s * 0.1); ctx.fill(); ctx.stroke();
          ctx.save(); rr(ctx, x - s * 0.17, -s * 0.73, s * 0.34, s * 0.25, s * 0.1); ctx.clip();
          ctx.fillStyle = 'rgba(255,255,255,.55)';
          const rx = x - s * 0.3 + (f < 0.35 ? f / 0.35 : 0) * s * 0.6;
          ctx.beginPath(); ctx.moveTo(rx, -s * 0.48); ctx.lineTo(rx + s * 0.08, -s * 0.73); ctx.lineTo(rx + s * 0.15, -s * 0.73); ctx.lineTo(rx + s * 0.07, -s * 0.48); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(x - s * 0.08, -s * 0.66, s * 0.03, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      },
    },
    esquiador: {
      encima(ctx, s, sk, t, look) {
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.05);
        // cachetes bien colorados por el frío
        ctx.fillStyle = 'rgba(255,70,105,.5)';
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * s * 0.31 + look, -s * 0.29, s * 0.1, s * 0.065, 0, 0, Math.PI * 2); ctx.fill(); }
        // antiparras de esquí: elástico, marco y vidrio espejado que deja ver los ojos
        ctx.fillStyle = '#2b3470'; ctx.fillRect(-s * 0.54, -s * 0.62, s * 1.08, s * 0.1);
        rr(ctx, -s * 0.42 + look, -s * 0.75, s * 0.84, s * 0.36, s * 0.15);
        ctx.fillStyle = '#ffffff'; ctx.fill();
        const g = ctx.createLinearGradient(0, -s * 0.72, 0, -s * 0.42);
        g.addColorStop(0, 'rgba(255,122,61,.6)'); g.addColorStop(0.5, 'rgba(255,79,163,.45)'); g.addColorStop(1, 'rgba(143,107,255,.6)');
        ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = Math.max(2, s * 0.065); ctx.stroke();
        ctx.save(); rr(ctx, -s * 0.42 + look, -s * 0.75, s * 0.84, s * 0.36, s * 0.15); ctx.clip();
        ctx.fillStyle = INK;
        for (const side of [-1, 1]) { rr(ctx, side * s * 0.2 + look - s * 0.06, -s * 0.66, s * 0.12, s * 0.2, s * 0.06); ctx.fill(); }
        ctx.fillStyle = 'rgba(255,255,255,.6)';
        ctx.beginPath(); ctx.moveTo(-s * 0.3 + look, -s * 0.42); ctx.lineTo(-s * 0.14 + look, -s * 0.75); ctx.lineTo(-s * 0.04 + look, -s * 0.75); ctx.lineTo(-s * 0.2 + look, -s * 0.42); ctx.closePath(); ctx.fill();
        ctx.restore();
        // gorro de lana con franja y pompón que rebota
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.05);
        const gorro = () => { ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.9); ctx.bezierCurveTo(-s * 0.5, -s * 1.42, s * 0.5, -s * 1.42, s * 0.5, -s * 0.9); ctx.closePath(); };
        gorro(); ctx.fillStyle = '#e8323c'; ctx.fill();
        ctx.save(); gorro(); ctx.clip(); ctx.fillStyle = '#fff6ea'; ctx.fillRect(-s * 0.6, -s * 1.13, s * 1.2, s * 0.09); ctx.restore();
        gorro(); ctx.stroke();
        ctx.fillStyle = '#c41f2e'; rr(ctx, -s * 0.56, -s * 0.97, s * 1.12, s * 0.17, s * 0.07); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, s * 0.025);
        ctx.beginPath(); for (let x = -0.44; x <= 0.45; x += 0.11) { ctx.moveTo(x * s, -s * 0.93); ctx.lineTo(x * s, -s * 0.84); } ctx.stroke();
        const py = -s * 1.32 - Math.abs(Math.sin(t / 260)) * s * 0.05, pr = s * 0.13;
        ctx.fillStyle = '#fff6ea'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045);
        ctx.beginPath();
        for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI * 2, rr2 = pr * (i % 2 ? 0.86 : 1); ctx.lineTo(Math.cos(a) * rr2, py + Math.sin(a) * rr2); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      },
    },
    luchador: {
      piel(ctx, s, sk, t, look) {
        // máscara de lucha: magenta con ribetes dorados y celestes, huecos para los ojos y la boca
        ctx.fillStyle = '#e8336b';
        ctx.beginPath(); ctx.moveTo(-s / 2, -s); ctx.lineTo(s / 2, -s); ctx.lineTo(s / 2, -s * 0.2);
        ctx.quadraticCurveTo(0, -s * 0.08, -s / 2, -s * 0.2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = Math.max(1.5, s * 0.045);
        ctx.beginPath(); ctx.moveTo(s / 2, -s * 0.2); ctx.quadraticCurveTo(0, -s * 0.08, -s / 2, -s * 0.2); ctx.stroke();
        // rayo celeste en el medio de la frente
        ctx.fillStyle = '#3fb8ff';
        ctx.beginPath(); ctx.moveTo(look, -s * 0.84); ctx.lineTo(look + s * 0.07, -s * 0.66); ctx.lineTo(look, -s * 0.5); ctx.lineTo(look - s * 0.07, -s * 0.66); ctx.closePath(); ctx.fill();
        const hueco = side => {
          const x = side * s * 0.2 + look;
          ctx.beginPath(); ctx.moveTo(x - side * s * 0.1, -s * 0.44);
          ctx.quadraticCurveTo(x - side * s * 0.15, -s * 0.66, x - side * s * 0.02, -s * 0.73);
          ctx.quadraticCurveTo(x + side * s * 0.16, -s * 0.82, x + side * s * 0.32, -s * 0.84);
          ctx.quadraticCurveTo(x + side * s * 0.2, -s * 0.66, x + side * s * 0.12, -s * 0.44);
          ctx.quadraticCurveTo(x, -s * 0.38, x - side * s * 0.1, -s * 0.44); ctx.closePath();
        };
        for (const side of [-1, 1]) {
          hueco(side); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = Math.max(2, s * 0.08); ctx.stroke();
          ctx.fillStyle = CREMA; ctx.fill();
          ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.025); ctx.stroke();
        }
        ctx.beginPath(); ctx.ellipse(look, -s * 0.3, s * 0.17, s * 0.1, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = Math.max(2, s * 0.07); ctx.stroke();
        ctx.fillStyle = sk.cuerpo; ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.025); ctx.stroke();
      },
      encima(ctx, s, sk, t, look) {
        // vincha dorada con estrella
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045);
        ctx.fillStyle = '#ffcc29'; rr(ctx, -s * 0.53, -s * 0.98, s * 1.06, s * 0.11, s * 0.04); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff6c2'; ctx.lineWidth = Math.max(1, s * 0.03);
        estrella(ctx, 0, -s * 0.925, s * 0.11); ctx.fill(); ctx.stroke();
      },
    },
    // ---- Legendaria exclusiva ----
    sonrisa: {
      colas(ctx, s, t, mirar) {
        // puntas del pañuelo atado atrás, del lado contrario a donde mira
        const lado = mirar > 0 ? -1 : 1, w = Math.sin(t / 260) * s * 0.04;
        ctx.fillStyle = '#25305a'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045);
        for (const k of [0, 1]) {
          ctx.beginPath(); ctx.moveTo(lado * s * 0.44, -s * (0.92 - k * 0.06));
          ctx.quadraticCurveTo(lado * s * 0.68, -s * (0.9 - k * 0.12) + w, lado * s * (0.8 - k * 0.06), -s * (0.7 - k * 0.12) - w);
          ctx.lineTo(lado * s * (0.68 - k * 0.06), -s * (0.66 - k * 0.12) - w);
          ctx.quadraticCurveTo(lado * s * 0.58, -s * (0.78 - k * 0.1), lado * s * 0.44, -s * (0.8 - k * 0.06)); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      },
      piel(ctx, s, sk, t, look) {
        // placa de chapa gastada que tapa la cara
        const g = ctx.createLinearGradient(0, -s, 0, 0); g.addColorStop(0, '#5a6070'); g.addColorStop(1, '#353946');
        ctx.fillStyle = g; rr(ctx, -s * 0.47, -s * 0.9, s * 0.94, s * 0.84, s * 0.14); ctx.fill();
        ctx.fillStyle = 'rgba(15,15,25,.3)';
        for (const [x, y, rx, ry, a] of [[-0.28, -0.7, 0.14, 0.07, 0.4], [0.3, -0.18, 0.12, 0.06, -0.3], [0.32, -0.62, 0.08, 0.05, 0.8]]) {
          ctx.beginPath(); ctx.ellipse(x * s, y * s, rx * s, ry * s, a, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, s * 0.018);
        ctx.beginPath(); ctx.moveTo(-s * 0.38, -s * 0.5); ctx.lineTo(-s * 0.26, -s * 0.44);
        ctx.moveTo(s * 0.18, -s * 0.8); ctx.lineTo(s * 0.34, -s * 0.74); ctx.moveTo(s * 0.36, -s * 0.5); ctx.lineTo(s * 0.4, -s * 0.38); ctx.stroke();
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045); rr(ctx, -s * 0.47, -s * 0.9, s * 0.94, s * 0.84, s * 0.14); ctx.stroke();
        // remaches en las esquinas de arriba
        ctx.lineWidth = Math.max(1, s * 0.025);
        for (const side of [-1, 1]) {
          ctx.fillStyle = '#a7b0c2'; ctx.beginPath(); ctx.arc(side * s * 0.36, -s * 0.7, s * 0.045, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        // agujeros de los ojos
        for (const side of [-1, 1]) {
          ctx.fillStyle = '#12131f'; ctx.strokeStyle = '#8a92a6'; ctx.lineWidth = Math.max(1, s * 0.03);
          ctx.beginPath(); ctx.ellipse(side * s * 0.2 + look, -s * 0.56, s * 0.12, s * 0.14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        // sonrisa pintada enorme: dos filas de dientes y la raya del medio que sube en las puntas
        const L = s * 0.42, u = x => (x / L) * (x / L);
        const arriba = x => -s * 0.4 - s * 0.06 * u(x), medio = x => -s * 0.25 - s * 0.1 * u(x), abajo = x => -s * 0.085 - s * 0.16 * u(x);
        ctx.beginPath(); ctx.moveTo(-L, arriba(-L));
        for (let i = 1; i <= 16; i++) { const x = -L + i * (2 * L / 16); ctx.lineTo(x + look * 0.5, arriba(x)); }
        for (let i = 16; i >= 0; i--) { const x = -L + i * (2 * L / 16); ctx.lineTo(x + look * 0.5, abajo(x)); }
        ctx.closePath(); ctx.fillStyle = '#12131f'; ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.025); ctx.fillStyle = '#f4efe2';
        const fila = (n, desde, hasta, desfase) => {
          const ancho = 2 * L / n;
          for (let i = 0; i < n; i++) {
            const x0 = -L + i * ancho + desfase, xc = x0 + ancho / 2, j = Math.sin(i * 7.3 + desfase * 40) * s * 0.012;
            const y0 = desde(xc) + s * 0.006 + Math.abs(j), y1 = hasta(xc) - s * 0.008;
            if (y1 - y0 < s * 0.03) continue;
            rr(ctx, x0 + s * 0.005 + look * 0.5, y0, ancho - s * 0.01, y1 - y0, Math.min(s * 0.035, (y1 - y0) / 2)); ctx.fill(); ctx.stroke();
          }
        };
        fila(6, arriba, medio, 0);
        fila(5, medio, abajo, 0);
        ctx.lineWidth = Math.max(1.2, s * 0.035); ctx.beginPath(); ctx.moveTo(-L + look * 0.5, arriba(-L));
        for (let i = 1; i <= 16; i++) { const x = -L + i * (2 * L / 16); ctx.lineTo(x + look * 0.5, arriba(x)); }
        for (let i = 16; i >= 0; i--) { const x = -L + i * (2 * L / 16); ctx.lineTo(x + look * 0.5, abajo(x)); }
        ctx.closePath(); ctx.stroke();
      },
      ojo: '#ffd27a',
      encima(ctx, s, sk, t, look, mirar) {
        // pañuelo azul oscuro que cubre la cabeza, con el nudo atrás (las puntas van por afuera del brillo)
        PARTES.sonrisa.colas(ctx, s, t, mirar);
        const lado = mirar > 0 ? -1 : 1;
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.05); ctx.fillStyle = '#25305a';
        ctx.beginPath(); ctx.moveTo(-s * 0.55, -s * 0.76); ctx.lineTo(-s * 0.55, -s * 0.94);
        ctx.quadraticCurveTo(-s * 0.5, -s * 1.12, 0, -s * 1.13); ctx.quadraticCurveTo(s * 0.5, -s * 1.12, s * 0.55, -s * 0.94);
        ctx.lineTo(s * 0.55, -s * 0.76); ctx.quadraticCurveTo(0, -s * 0.86, -s * 0.55, -s * 0.76); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.3)';
        for (const [x, y] of [[-0.3, -0.98], [0.02, -1.03], [0.3, -0.96], [-0.12, -0.9], [0.16, -0.89]]) { ctx.beginPath(); ctx.arc(x * s, y * s, s * 0.022, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#25305a'; ctx.lineWidth = Math.max(1.5, s * 0.04);
        ctx.beginPath(); ctx.ellipse(lado * s * 0.52, -s * 0.86, s * 0.07, s * 0.08, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      },
    },
    // ---- Geo: cubo naranja de esquinas rectas, borde celeste y cara de cuadrados ----
    geo: {
      detras(ctx, s) {
        // filo celeste por afuera del borde negro
        const e = Math.max(2, s * 0.08) / 2 + s * 0.04;
        ctx.fillStyle = '#5ff5ff'; rr(ctx, -s / 2 - e, -s - e, s + 2 * e, s + 2 * e, s * 0.1); ctx.fill();
      },
      piel(ctx, s) {
        const g = ctx.createLinearGradient(0, -s, 0, 0);
        g.addColorStop(0, '#ffe23d'); g.addColorStop(0.55, '#ffb52e'); g.addColorStop(1, '#ff8418');
        ctx.fillStyle = g; ctx.fillRect(-s / 2, -s, s, s);
        const luz = ctx.createRadialGradient(0, -s * 0.62, 0, 0, -s * 0.62, s * 0.5);
        luz.addColorStop(0, 'rgba(255,250,170,.55)'); luz.addColorStop(1, 'rgba(255,250,170,0)');
        ctx.fillStyle = luz; ctx.fillRect(-s / 2, -s, s, s);
      },
      encima(ctx, s, sk, t, look) {
        // ojos cuadrados y boca ancha, celestes con borde negro
        ctx.fillStyle = '#6ff3ff'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.05); ctx.lineJoin = 'miter';
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.rect(side * s * 0.19 + look - s * 0.09, -s * 0.7, s * 0.18, s * 0.18); ctx.fill(); ctx.stroke(); }
        ctx.beginPath(); ctx.rect(look - s * 0.29, -s * 0.38, s * 0.58, s * 0.15); ctx.fill(); ctx.stroke();
      },
    },
    // ---- Guerrero y sus formas ----
    guerrero: {
      detras(ctx, s, sk, t, look, mirar) { guerreroColas(ctx, s, t, mirar, '#e0263a'); },
      encima(ctx, s, sk, t, look, mirar) { guerreroCara(ctx, s, look, mirar, '#e0263a', 0.06); },
    },
    guerreroDorado: {
      detras(ctx, s, sk, t, look, mirar) {
        // llama dorada alta: tres capas de lenguas que suben y titilan, con chispas que vuelan
        ctx.save(); ctx.shadowColor = '#ffcf3a'; ctx.shadowBlur = s * 0.35;
        lenguasDeEnergia(ctx, s, t, 0.88, 1.1, 'rgba(255,165,25,.85)', 0); ctx.restore();
        lenguasDeEnergia(ctx, s, t, 0.7, 0.85, 'rgba(255,224,100,.95)', 1.3);
        lenguasDeEnergia(ctx, s, t, 0.5, 0.6, 'rgba(255,250,215,.95)', 2.6);
        for (let k = 0; k < 6; k++) {
          const f = fase(t, 900, k / 6), x = Math.sin(k * 4.1) * s * 0.75 + Math.sin(t / 200 + k) * s * 0.05;
          ctx.globalAlpha = 1 - f; ctx.fillStyle = k % 2 ? '#fff6c2' : '#ff9a1a';
          estrella(ctx, x, -s * (0.3 + f * 1.6), s * 0.07 * (1 - f * 0.5) + 0.8, 4); ctx.fill();
        }
        ctx.globalAlpha = 1;
        guerreroColas(ctx, s, t, mirar, '#ffffff');
      },
      encima(ctx, s, sk, t, look, mirar) { guerreroCara(ctx, s, look, mirar, '#ffffff', 0.09); },
    },
    guerreroCarmesi: {
      detras(ctx, s, sk, t, look, mirar) {
        // aura carmesí dentada que late
        const late = 1 + 0.07 * Math.max(0, Math.sin(t / 140)), salto = Math.floor(t / 110), cy = -s * 0.5;
        const pinchos = (r0, col) => {
          ctx.fillStyle = col; ctx.beginPath();
          for (let i = 0; i < 22; i++) {
            const a = i / 22 * Math.PI * 2, j = Math.sin(i * 12.9 + salto * 3.7), r = s * r0 * late * (i % 2 ? 0.72 : 1 + 0.12 * j);
            ctx.lineTo(Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 1.08 - (Math.sin(a) < 0 ? s * 0.12 : 0));
          }
          ctx.closePath(); ctx.fill();
        };
        ctx.save(); ctx.shadowColor = '#ff2a3d'; ctx.shadowBlur = s * 0.3;
        pinchos(1.0, 'rgba(140,10,35,.8)'); ctx.restore();
        pinchos(0.84, 'rgba(255,60,70,.85)');
        guerreroColas(ctx, s, t, mirar, '#2b1020');
      },
      piel(ctx, s) {
        // mechones de pelaje más oscuros en los costados
        ctx.fillStyle = 'rgba(90,0,20,.55)';
        for (const side of [-1, 1]) {
          for (const y of [0.62, 0.38, 0.14]) {
            ctx.beginPath(); ctx.moveTo(side * s * 0.5, -s * (y + 0.1)); ctx.lineTo(side * s * 0.34, -s * (y + 0.03));
            ctx.lineTo(side * s * 0.43, -s * (y + 0.01)); ctx.lineTo(side * s * 0.31, -s * (y - 0.06)); ctx.lineTo(side * s * 0.5, -s * (y - 0.06)); ctx.closePath(); ctx.fill();
          }
        }
      },
      ojo: '#ffb02e',
      encima(ctx, s, sk, t, look, mirar) {
        // ojos ámbar que brillan
        ctx.save(); ctx.shadowColor = '#ffb02e'; ctx.shadowBlur = s * (0.25 + 0.1 * Math.sin(t / 140)); ctx.fillStyle = '#ffd36a';
        for (const side of [-1, 1]) { rr(ctx, side * s * 0.2 + look - s * 0.06, -s * 0.66, s * 0.12, s * 0.2, s * 0.06); ctx.fill(); }
        ctx.restore();
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.03);
        for (const side of [-1, 1]) { rr(ctx, side * s * 0.2 + look - s * 0.06, -s * 0.66, s * 0.12, s * 0.2, s * 0.06); ctx.stroke(); }
        guerreroCara(ctx, s, look, mirar, '#2b1020', 0.14);
      },
    },
    guerreroCeleste: {
      detras(ctx, s, sk, t, look, mirar) {
        // aura calma y lisa, con puntitos de estrellas que giran despacio
        const cy = -s * 0.52, r = 1 + 0.03 * Math.sin(t / 900);
        const g = ctx.createRadialGradient(0, cy, s * 0.3, 0, cy, s * 1.05 * r);
        g.addColorStop(0, 'rgba(120,230,255,.75)'); g.addColorStop(0.7, 'rgba(70,150,255,.45)'); g.addColorStop(1, 'rgba(70,150,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, cy, s * 0.95 * r, s * 1.08 * r, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(160,240,255,.9)'; ctx.lineWidth = Math.max(1.5, s * 0.04);
        ctx.beginPath(); ctx.ellipse(0, cy, s * 0.8 * r, s * 0.92 * r, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (let k = 0; k < 5; k++) {
          const a = t / 2400 + k * Math.PI * 2 / 5, tw = 0.6 + 0.4 * Math.sin(t / 300 + k * 2);
          estrella(ctx, Math.cos(a) * s * 0.88, cy + Math.sin(a) * s * 0.98, s * 0.06 * tw + 0.8, 4); ctx.fill();
        }
        guerreroColas(ctx, s, t, mirar, '#2f5fd0');
      },
      ojo: 'rgba(0,0,0,0)',
      encima(ctx, s, sk, t, look, mirar) {
        // ojos cerrados, tranquilos
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, s * 0.06); ctx.lineCap = 'round';
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * s * 0.2 + look, -s * 0.6, s * 0.08, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
        guerreroCara(ctx, s, look, mirar, '#2f5fd0', null);
      },
    },
    guerreroPlateado: {
      detras(ctx, s, sk, t, look, mirar) {
        // imagen fantasma corrida que titila a los costados
        const dx = Math.sin(t / 70) * s * 0.08, a = 0.4 + 0.2 * Math.sin(t / 50);
        ctx.globalAlpha = a; ctx.fillStyle = '#a996ff';
        rr(ctx, -s / 2 + dx - s * 0.04, -s - s * 0.02, s, s, s * 0.2); ctx.fill();
        ctx.globalAlpha = a * 0.8; ctx.fillStyle = '#b8c6e6';
        rr(ctx, -s / 2 - dx + s * 0.04, -s + s * 0.01, s, s, s * 0.2); ctx.fill();
        ctx.globalAlpha = 1;
        // volutas plateadas y lila que suben y parpadean
        ctx.lineCap = 'round';
        for (let k = 0; k < 7; k++) {
          const f = fase(t, 1300, k / 7), side = k % 2 ? 1 : -1, x0 = side * s * (0.56 + 0.18 * ((k * 0.37) % 1));
          const parpadeo = Math.sin(t / 45 + k * 3) > -0.6 ? 1 : 0.3;
          ctx.globalAlpha = (1 - f) * 0.9 * parpadeo; ctx.strokeStyle = k % 3 ? '#9fb0d8' : '#8f74ff'; ctx.lineWidth = Math.max(1.5, s * 0.065 * (1 - f * 0.5));
          const y0 = -s * (0.1 + f * 1.0), h = s * 0.4;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 + side * s * 0.12, y0 - h * 0.35, x0 - side * s * 0.1, y0 - h * 0.7, x0 + side * s * 0.04, y0 - h); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        guerreroColas(ctx, s, t, mirar, '#b49cff');
      },
      piel(ctx, s, sk, t) {
        // plata: brillo en diagonal que cruza cada tanto
        const g = ctx.createLinearGradient(-s / 2, -s, s / 2, 0); g.addColorStop(0, '#fbfcff'); g.addColorStop(1, '#bcc7dd');
        ctx.fillStyle = g; ctx.fillRect(-s / 2, -s, s, s);
        const f = fase(t, 1800), x = -s + f * s * 2.4;
        ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(x, -s); ctx.lineTo(x + s * 0.14, -s); ctx.lineTo(x - s * 0.26, 0); ctx.lineTo(x - s * 0.4, 0); ctx.closePath(); ctx.fill();
      },
      ojo: '#7d8bb0',
      encima(ctx, s, sk, t, look, mirar) {
        // ojos plateados con borde y brillito
        for (const side of [-1, 1]) {
          const x = side * s * 0.2 + look;
          ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.03);
          rr(ctx, x - s * 0.06, -s * 0.66, s * 0.12, s * 0.2, s * 0.06); ctx.stroke();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x - s * 0.015, -s * 0.6, s * 0.03, 0, Math.PI * 2); ctx.fill();
        }
        guerreroCara(ctx, s, look, mirar, '#b49cff', 0.03);
      },
    },
    // ---- pase 51-100 ----
    astronomo: {
      detras(ctx, s, sk, t) {
        // telescopio de bronce en su trípode, al costado: se inclina despacio y la lente brilla cada tanto
        const mx = s * 0.68, my = -s * 0.44, a = -0.72 + 0.08 * Math.sin(t / 1400);
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045);
        ctx.beginPath(); for (const dx of [-0.16, 0.02, 0.18]) { ctx.moveTo(mx, my); ctx.lineTo(mx + dx * s, 0); } ctx.stroke();
        ctx.save(); ctx.translate(mx, my); ctx.rotate(a);
        ctx.lineWidth = Math.max(1.2, s * 0.035);
        const g = ctx.createLinearGradient(0, -s * 0.1, 0, s * 0.1); g.addColorStop(0, '#ffe08a'); g.addColorStop(0.5, '#e0a53a'); g.addColorStop(1, '#a8701e');
        ctx.fillStyle = g;
        rr(ctx, -s * 0.34, -s * 0.045, s * 0.14, s * 0.09, s * 0.03); ctx.fill(); ctx.stroke();   // ocular
        rr(ctx, -s * 0.22, -s * 0.08, s * 0.46, s * 0.16, s * 0.05); ctx.fill(); ctx.stroke();    // tubo
        rr(ctx, s * 0.22, -s * 0.11, s * 0.16, s * 0.22, s * 0.05); ctx.fill(); ctx.stroke();     // boca
        ctx.strokeStyle = 'rgba(122,74,20,.8)'; ctx.lineWidth = Math.max(1, s * 0.025);
        ctx.beginPath(); ctx.moveTo(s * 0.02, -s * 0.08); ctx.lineTo(s * 0.02, s * 0.08); ctx.stroke();
        ctx.fillStyle = '#9fe8ff'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.025);
        ctx.beginPath(); ctx.ellipse(s * 0.38, 0, s * 0.03, s * 0.09, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const brillo = Math.max(0, Math.sin(t / 700)) ** 6;
        if (brillo > 0.05) { ctx.globalAlpha = brillo; ctx.fillStyle = '#fff'; estrella(ctx, s * 0.43, -s * 0.05, s * (0.05 + 0.08 * brillo), 4); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.restore();
        ctx.fillStyle = '#a8701e'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.beginPath(); ctx.arc(mx, my, s * 0.05, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      },
      piel(ctx, s, sk, t) {
        // constelación abajo a la izquierda y estrellitas que titilan
        const pts = [[-0.4, -0.12], [-0.27, -0.2], [-0.14, -0.1], [-0.04, -0.17]];
        ctx.strokeStyle = 'rgba(255,250,240,.4)'; ctx.lineWidth = Math.max(0.8, s * 0.018);
        ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s))); ctx.stroke();
        ctx.fillStyle = '#ffe9a0';
        pts.forEach(([x, y], k) => { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t / 350 + k * 1.9); ctx.beginPath(); ctx.arc(x * s, y * s, s * 0.028 + 0.4, 0, Math.PI * 2); ctx.fill(); });
        for (const [x, y, k] of [[0.36, -0.16, 0], [0.42, -0.74, 1], [-0.42, -0.72, 2], [0.18, -0.1, 3]]) {
          ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t / 420 + k * 1.3)); estrella(ctx, x * s, y * s, s * 0.04, 4); ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
      encima(ctx, s, sk, t) {
        // gorro con estrellas, banda de bronce y una estrella de pompón que se hamaca
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.05);
        ctx.fillStyle = '#4659d6';
        ctx.beginPath(); ctx.moveTo(-s * 0.46, -s * 0.96); ctx.bezierCurveTo(-s * 0.46, -s * 1.42, s * 0.46, -s * 1.42, s * 0.46, -s * 0.96); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffe14d';
        for (const [x, y, r, k] of [[-0.22, -1.13, 0.065, 0], [0.13, -1.2, 0.055, 1], [0.29, -1.05, 0.045, 2]]) {
          estrella(ctx, x * s, y * s, s * r * (0.75 + 0.25 * Math.sin(t / 300 + k * 2)) + 0.6, 5); ctx.fill();
        }
        ctx.fillStyle = '#e8b04a'; rr(ctx, -s * 0.52, -s * 1.04, s * 1.04, s * 0.14, s * 0.06); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.translate(0, -s * 1.36); ctx.rotate(Math.sin(t / 500) * 0.15);
        ctx.fillStyle = '#ffe14d'; ctx.lineWidth = Math.max(1.2, s * 0.035); estrella(ctx, 0, 0, s * 0.13, 5); ctx.fill(); ctx.stroke();
        ctx.restore();
      },
    },
    pulpo: {
      detras(ctx, s, sk, t) {
        // dos tentáculos de atrás que saludan a los costados
        for (const side of [-1, 1]) {
          tentaculo(ctx, side * s * 0.4, -s * 0.5, side > 0 ? -0.35 : Math.PI + 0.35, s * 0.5, s * 0.16, -side * 2.4, side * Math.sin(t / 420 + side) * 0.45, sk.cuerpo);
        }
      },
      piel(ctx, s) {
        // manchitas en la cabeza y panza más clara
        ctx.fillStyle = 'rgba(150,50,160,.35)';
        for (const [x, y, r] of [[-0.3, -0.86, 0.07], [0.06, -0.92, 0.05], [0.33, -0.8, 0.065], [-0.42, -0.6, 0.04], [0.43, -0.5, 0.035]]) {
          ctx.beginPath(); ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,214,240,.45)'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.42, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      },
      encima(ctx, s, sk, t) {
        // cuatro tentáculos de adelante: salen de abajo, van por el piso hacia afuera y se enrulan para arriba
        for (const side of [-1, 1]) {
          for (const [x0, a0, largo, curl, k] of [[0.34, 0.12, 0.56, 3.6, 0], [0.1, 0.5, 0.36, 3.4, 1]]) {
            const onda = Math.sin(t / 380 + side * 2 + k * 1.7) * 0.25;
            tentaculo(ctx, side * s * x0, -s * 0.14, side > 0 ? a0 : Math.PI - a0, s * largo, s * 0.15, -side * curl, side * onda, sk.cuerpo);
          }
        }
      },
    },
    samurai: {
      piel(ctx, s) {
        // peto laqueado con cordones dorados
        ctx.fillStyle = '#b5162f'; ctx.fillRect(-s / 2, -s * 0.2, s, s * 0.2);
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, s * 0.035);
        ctx.beginPath(); ctx.moveTo(-s / 2, -s * 0.2); ctx.lineTo(s / 2, -s * 0.2); ctx.stroke();
        ctx.strokeStyle = 'rgba(70,0,15,.6)'; ctx.lineWidth = Math.max(1, s * 0.02);
        ctx.beginPath(); ctx.moveTo(-s / 2, -s * 0.1); ctx.lineTo(s / 2, -s * 0.1); ctx.stroke();
        ctx.fillStyle = '#f2c14e';
        for (let k = -3; k <= 3; k++) for (const y of [-0.17, -0.07]) ctx.fillRect(k * s * 0.13 - s * 0.012, y * s, s * 0.024, s * 0.05);
      },
      encima(ctx, s, sk, t, look) {
        // mirada tranquila: párpados a media asta que parpadean despacio
        const cierre = fase(t, 4600) > 0.965 ? 1 : 0.5;
        for (const side of [-1, 1]) {
          const x = side * s * 0.2 + look, y0 = -s * 0.67, y1 = y0 + s * 0.21 * cierre;
          ctx.fillStyle = sk.cuerpo; ctx.fillRect(x - s * 0.075, y0, s * 0.15, y1 - y0);
          ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, s * 0.035);
          ctx.beginPath(); ctx.moveTo(x - s * 0.075, y1); ctx.quadraticCurveTo(x, y1 + s * 0.02, x + s * 0.075, y1); ctx.stroke();
        }
        // hombreras de placas
        for (const side of [-1, 1]) {
          ctx.save(); ctx.translate(side * s * 0.56, -s * 0.42); ctx.rotate(side * 0.12);
          for (let k = 0; k < 3; k++) {
            ctx.fillStyle = k % 2 ? '#a50f28' : '#d2203c'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, s * 0.04);
            rr(ctx, -s * 0.13, -s * 0.18 + k * s * 0.12, s * 0.26, s * 0.13, s * 0.03); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#f2c14e';
            for (const dx of [-0.06, 0.06]) { ctx.beginPath(); ctx.arc(dx * s, -s * 0.115 + k * s * 0.12, s * 0.018 + 0.3, 0, Math.PI * 2); ctx.fill(); }
          }
          ctx.restore();
        }
        // casco: bóveda roja laqueada con placas
        const rojo = ctx.createLinearGradient(0, -s * 1.3, 0, -s * 0.84); rojo.addColorStop(0, '#ef3b55'); rojo.addColorStop(1, '#a50f28');
        ctx.fillStyle = rojo; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.05);
        ctx.beginPath(); ctx.moveTo(-s * 0.54, -s * 0.86); ctx.bezierCurveTo(-s * 0.54, -s * 1.38, s * 0.54, -s * 1.38, s * 0.54, -s * 0.86); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(90,0,20,.55)'; ctx.lineWidth = Math.max(1, s * 0.025);
        for (const x of [-0.3, 0.3]) { ctx.beginPath(); ctx.moveTo(x * s, -s * 0.88); ctx.quadraticCurveTo(x * s * 0.8, -s * 1.12, x * s * 0.3, -s * 1.22); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = Math.max(1, s * 0.035);
        ctx.beginPath(); ctx.arc(-s * 0.02, -s * 0.88, s * 0.36, Math.PI * 1.17, Math.PI * 1.38); ctx.stroke();
        // alas del casco dobladas hacia atrás
        for (const side of [-1, 1]) {
          ctx.fillStyle = '#d2203c'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, s * 0.04);
          ctx.beginPath(); ctx.moveTo(side * s * 0.54, -s * 0.94); ctx.lineTo(side * s * 0.76, -s * 1.04); ctx.lineTo(side * s * 0.72, -s * 0.76); ctx.lineTo(side * s * 0.54, -s * 0.78); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(side * s * 0.65, -s * 0.87, s * 0.025 + 0.3, 0, Math.PI * 2); ctx.fill();
        }
        // visera negra con filete dorado
        ctx.fillStyle = '#2a1f2e'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045);
        rr(ctx, -s * 0.6, -s * 0.92, s * 1.2, s * 0.13, s * 0.05); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = Math.max(1, s * 0.022);
        ctx.beginPath(); ctx.moveTo(-s * 0.52, -s * 0.83); ctx.lineTo(s * 0.52, -s * 0.83); ctx.stroke();
        // emblema: dos hojas doradas cortas y un disco con brillo
        const cy = -s * 0.98;
        ctx.fillStyle = '#f2c14e'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, s * 0.035);
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(side * s * 0.04, cy + s * 0.02); ctx.quadraticCurveTo(side * s * 0.2, cy - s * 0.08, side * s * 0.3, cy - s * 0.34);
          ctx.quadraticCurveTo(side * s * 0.12, cy - s * 0.18, 0, cy - s * 0.06); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, cy, s * 0.075, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d2203c'; ctx.beginPath(); ctx.arc(0, cy, s * 0.032, 0, Math.PI * 2); ctx.fill();
        const a = Math.max(0, Math.sin(t / 650)) ** 4;
        if (a > 0.05) { ctx.globalAlpha = a; ctx.fillStyle = '#fff'; estrella(ctx, s * 0.24, cy - s * 0.28, s * (0.04 + 0.07 * a), 4); ctx.fill(); ctx.globalAlpha = 1; }
      },
    },
    mecha: {
      piel(ctx, s) {
        // placas naranjas arriba y en el mentón, costuras y remaches
        ctx.fillStyle = '#ff8a1f'; ctx.fillRect(-s / 2, -s, s, s * 0.2); ctx.fillRect(-s / 2, -s * 0.18, s, s * 0.18);
        ctx.fillStyle = '#ffb05c'; ctx.fillRect(-s / 2, -s * 0.18, s, s * 0.04);
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, s * 0.035);
        ctx.beginPath(); ctx.moveTo(-s / 2, -s * 0.8); ctx.lineTo(s / 2, -s * 0.8); ctx.moveTo(-s / 2, -s * 0.18); ctx.lineTo(s / 2, -s * 0.18); ctx.stroke();
        ctx.strokeStyle = 'rgba(29,35,64,.28)'; ctx.lineWidth = Math.max(1, s * 0.02);
        ctx.beginPath(); for (const side of [-1, 1]) { ctx.moveTo(side * s * 0.43, -s * 0.8); ctx.lineTo(side * s * 0.43, -s * 0.18); } ctx.stroke();
        ctx.fillStyle = 'rgba(29,35,64,.45)';
        for (const [x, y] of [[-0.36, -0.09], [0.36, -0.09], [-0.2, -0.09], [0.2, -0.09]]) { ctx.beginPath(); ctx.arc(x * s, y * s, s * 0.022 + 0.3, 0, Math.PI * 2); ctx.fill(); }
      },
      encima(ctx, s, sk, t, look) {
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045);
        // orejeras
        for (const side of [-1, 1]) {
          ctx.fillStyle = '#ff8a1f'; rr(ctx, side * s * 0.53 - s * 0.075, -s * 0.72, s * 0.15, s * 0.32, s * 0.05); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#c7cedb'; ctx.lineWidth = Math.max(1, s * 0.025);
          ctx.beginPath(); ctx.arc(side * s * 0.53, -s * 0.56, s * 0.04, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.lineWidth = Math.max(1.5, s * 0.045);
        }
        // antena con luz que late
        ctx.beginPath(); ctx.moveTo(s * 0.24, -s * 1.02); ctx.lineTo(s * 0.3, -s * 1.3); ctx.stroke();
        ctx.fillStyle = '#c7cedb'; rr(ctx, s * 0.14, -s * 1.08, s * 0.2, s * 0.09, s * 0.03); ctx.fill(); ctx.stroke();
        const p = 0.5 + 0.5 * Math.sin(t / 300);
        ctx.beginPath(); ctx.arc(s * 0.3, -s * 1.35, s * 0.075, 0, Math.PI * 2);
        ctx.save(); ctx.shadowColor = '#ffb24d'; ctx.shadowBlur = s * 0.3 * p; ctx.fillStyle = p > 0.5 ? '#ffd27a' : '#ff8a1f'; ctx.fill(); ctx.restore(); ctx.stroke();
        // visor
        ctx.fillStyle = '#1d2340'; rr(ctx, -s * 0.4, -s * 0.73, s * 0.8, s * 0.31, s * 0.1); ctx.fill(); ctx.stroke();
        // ojos que brillan (parpadean cada tanto) y barrido del escáner
        const parp = fase(t, 3400) > 0.96 ? 0.25 : 1, ey = -s * 0.575;
        ctx.save(); ctx.shadowColor = '#ffb24d'; ctx.shadowBlur = s * 0.22; ctx.fillStyle = '#ffd98a';
        for (const side of [-1, 1]) { const h = s * 0.12 * parp; rr(ctx, side * s * 0.18 + look * 1.3 - s * 0.09, ey - h / 2, s * 0.18, h, Math.min(h / 2, s * 0.05)); ctx.fill(); }
        ctx.restore();
        const f = fase(t, 2200);
        if (f < 0.5) { ctx.fillStyle = 'rgba(255,210,140,.3)'; ctx.fillRect(-s * 0.36 + f * 2 * s * 0.68, -s * 0.71, s * 0.04, s * 0.27); }
        // rejilla de la boca
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, s * 0.032);
        ctx.beginPath(); for (const x of [-0.1, 0, 0.1]) { ctx.moveTo(x * s + look, -s * 0.34); ctx.lineTo(x * s + look, -s * 0.25); } ctx.stroke();
      },
    },
    cosmico: {
      detras(ctx, s, sk, t) { orbitaCosmica(ctx, s, t, 0); },
      piel(ctx, s, sk, t) {
        // nubes de nebulosa que se mueven adentro y estrellas que pasan despacio
        ctx.globalCompositeOperation = 'lighter';
        for (const [c, k] of [['255,70,190', 0], ['70,190,255', 1], ['150,90,255', 2], ['255,150,80', 3]]) {
          const x = Math.sin(t / 1900 + k * 1.7) * s * 0.3, y = -s * 0.5 + Math.cos(t / 2300 + k * 2.3) * s * 0.3, r = s * (0.38 + 0.08 * Math.sin(t / 900 + k));
          const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${c},.6)`); g.addColorStop(1, `rgba(${c},0)`);
          ctx.fillStyle = g; ctx.fillRect(-s / 2, -s, s, s);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = CREMA;
        for (let k = 0; k < 9; k++) {
          const x = (fase(t, 9000 + k * 700, k * 0.37) - 0.5) * s * 1.1, y = -s * (0.08 + ((k * 0.61) % 1) * 0.86);
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t / 300 + k * 2); ctx.beginPath(); ctx.arc(x, y, s * (k % 3 ? 0.018 : 0.03) + 0.3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
      encima(ctx, s, sk, t) { orbitaCosmica(ctx, s, t, 1); },
    },
    dragonRey: {
      detras(ctx, s, sk, t) {
        // colita con punta de flecha
        const w = Math.sin(t / 380) * s * 0.06, ex = s * 0.8 + w, ey = -s * 0.5;
        ctx.lineCap = 'round';
        for (const [c, a] of [[INK, 0.14], ['#e9a417', 0.08]]) {
          ctx.strokeStyle = c; ctx.lineWidth = Math.max(c === INK ? 4 : 2, s * a);
          ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.1); ctx.quadraticCurveTo(s * 0.88, -s * 0.06, ex, ey); ctx.stroke();
        }
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(Math.atan2(ey + s * 0.06, ex - s * 0.88) + Math.PI / 2);
        ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, s * 0.035);
        ctx.beginPath(); ctx.moveTo(0, -s * 0.17); ctx.lineTo(s * 0.1, s * 0.02); ctx.lineTo(0, -s * 0.02); ctx.lineTo(-s * 0.1, s * 0.02); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
        // alitas doradas que aletean
        const ale = Math.sin(t / 240) * 0.18;
        for (const side of [-1, 1]) {
          ctx.save(); ctx.translate(side * s * 0.42, -s * 0.7); ctx.rotate(side * (-0.25 + ale)); ctx.scale(side, 1);
          ctx.fillStyle = '#f0b42a'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045);
          ctx.beginPath(); ctx.moveTo(0, s * 0.12); ctx.quadraticCurveTo(s * 0.2, -s * 0.3, s * 0.56, -s * 0.38);
          ctx.quadraticCurveTo(s * 0.48, -s * 0.2, s * 0.58, -s * 0.06); ctx.quadraticCurveTo(s * 0.44, -s * 0.06, s * 0.42, s * 0.06);
          ctx.quadraticCurveTo(s * 0.28, 0, s * 0.22, s * 0.14); ctx.quadraticCurveTo(s * 0.12, s * 0.08, 0, s * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = 'rgba(150,90,10,.85)'; ctx.lineWidth = Math.max(1, s * 0.028);
          ctx.beginPath(); for (const [x, y] of [[0.54, -0.36], [0.56, -0.07], [0.4, 0.05]]) { ctx.moveTo(s * 0.04, s * 0.06); ctx.lineTo(x * s, y * s); } ctx.stroke();
          ctx.restore();
        }
      },
      piel(ctx, s, sk, t) {
        // oro con escamas (dejan la cara limpia) y un reflejo que cruza
        const g = ctx.createLinearGradient(0, -s, 0, 0); g.addColorStop(0, '#ffe680'); g.addColorStop(1, '#eba416');
        ctx.fillStyle = g; ctx.fillRect(-s / 2, -s, s, s);
        ctx.strokeStyle = 'rgba(170,100,10,.5)'; ctx.lineWidth = Math.max(1, s * 0.022);
        for (let f = 0; f < 8; f++) {
          const y = -s * (0.95 - f * 0.125);
          for (let c = -4; c <= 4; c++) {
            const x = (c + (f % 2) * 0.5) * s * 0.15;
            if (Math.abs(x) < s * 0.4 && y > -s * 0.8 && y < -s * 0.16) continue;
            ctx.beginPath(); ctx.arc(x, y, s * 0.075, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
          }
        }
        const x = -s + fase(t, 3000) * s * 2.6;
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(x, -s); ctx.lineTo(x + s * 0.12, -s); ctx.lineTo(x - s * 0.22, 0); ctx.lineTo(x - s * 0.34, 0); ctx.closePath(); ctx.fill();
      },
      encima(ctx, s, sk, t, look) {
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045);
        // cuernos que se curvan hacia afuera
        ctx.fillStyle = '#fff4d6';
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(side * s * 0.24, -s * 0.97);
          ctx.quadraticCurveTo(side * s * 0.34, -s * 1.28, side * s * 0.62, -s * 1.36);
          ctx.quadraticCurveTo(side * s * 0.46, -s * 1.18, side * s * 0.46, -s * 0.97); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        // coronita con gemas y un destello
        const cy = -s * 0.98;
        ctx.fillStyle = '#ffd23a';
        ctx.beginPath(); ctx.moveTo(-s * 0.2, cy); ctx.lineTo(-s * 0.22, cy - s * 0.24); ctx.lineTo(-s * 0.1, cy - s * 0.13); ctx.lineTo(0, cy - s * 0.3);
        ctx.lineTo(s * 0.1, cy - s * 0.13); ctx.lineTo(s * 0.22, cy - s * 0.24); ctx.lineTo(s * 0.2, cy); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff3b5c'; ctx.beginPath(); ctx.arc(0, cy - s * 0.08, s * 0.045, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5cb0ff'; for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * s * 0.13, cy - s * 0.06, s * 0.028, 0, Math.PI * 2); ctx.fill(); }
        const a = Math.max(0, Math.sin(t / 450));
        if (a > 0.1) { ctx.globalAlpha = a; ctx.fillStyle = '#fff'; estrella(ctx, 0, cy - s * 0.33, s * (0.05 + 0.06 * a), 4); ctx.fill(); ctx.globalAlpha = 1; }
        // fosas de la nariz
        ctx.fillStyle = 'rgba(120,70,0,.6)';
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(look + side * s * 0.05, -s * 0.43, s * 0.022, s * 0.016, 0, 0, Math.PI * 2); ctx.fill(); }
      },
    },
    fenixAzul: {
      detras(ctx, s, sk, t) {
        // llamas frías detrás
        const cs = ['rgba(60,130,255,.85)', 'rgba(127,227,255,.9)', 'rgba(235,252,255,.95)'];
        for (let k = 0; k < 4; k++) {
          const x = (k - 1.5) * s * 0.3, h = s * (1.25 + 0.18 * Math.sin(t / 110 + k * 2.1)) * (k % 3 ? 1 : 0.85), lean = Math.sin(t / 200 + k) * s * 0.04;
          cs.forEach((c, i) => {
            const w = s * (0.2 - i * 0.05), hh = h * (1 - i * 0.22);
            ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - w, -s * 0.3); ctx.quadraticCurveTo(x - w, -hh * 0.75, x + lean, -hh);
            ctx.quadraticCurveTo(x + w, -hh * 0.75, x + w, -s * 0.3); ctx.closePath(); ctx.fill();
          });
        }
        // alas de plumas de cristal
        const ale = Math.sin(t / 200) * 0.2;
        for (const side of [-1, 1]) {
          ctx.save(); ctx.translate(side * s * 0.42, -s * 0.62); ctx.scale(side, 1); ctx.rotate(ale);
          for (const [ang, L, W] of [[0.35, 0.46, 0.1], [-0.08, 0.62, 0.11], [-0.5, 0.72, 0.12], [-0.95, 0.62, 0.11]]) {
            ctx.save(); ctx.rotate(ang);
            ctx.fillStyle = '#d4f6ff'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * s * 0.35, -W * s); ctx.lineTo(L * s, 0); ctx.lineTo(L * s * 0.35, W * s); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#7fc8f0'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * s, 0); ctx.lineTo(L * s * 0.35, W * s); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, s * 0.035);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * s * 0.35, -W * s); ctx.lineTo(L * s, 0); ctx.lineTo(L * s * 0.35, W * s); ctx.closePath(); ctx.stroke();
            ctx.restore();
          }
          ctx.restore();
        }
      },
      piel(ctx, s) {
        // hielo: de blanco a azul, facetas y plumitas en V en el pecho
        const g = ctx.createLinearGradient(0, -s, 0, 0); g.addColorStop(0, '#eafcff'); g.addColorStop(0.55, '#8fd8ff'); g.addColorStop(1, '#3f8fe6');
        ctx.fillStyle = g; ctx.fillRect(-s / 2, -s, s, s);
        ctx.fillStyle = 'rgba(255,255,255,.45)';
        ctx.beginPath(); ctx.moveTo(-s / 2, -s * 0.7); ctx.lineTo(-s * 0.2, -s); ctx.lineTo(-s / 2, -s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(30,90,180,.25)';
        ctx.beginPath(); ctx.moveTo(s / 2, -s * 0.35); ctx.lineTo(s * 0.15, 0); ctx.lineTo(s / 2, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(1, s * 0.025);
        for (const [x, y] of [[-0.2, -0.13], [0, -0.09], [0.2, -0.13]]) { ctx.beginPath(); ctx.moveTo(x * s - s * 0.06, y * s - s * 0.04); ctx.lineTo(x * s, y * s); ctx.lineTo(x * s + s * 0.06, y * s - s * 0.04); ctx.stroke(); }
      },
      encima(ctx, s, sk, t, look) {
        // cresta de cristales que titilan como llamas
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, s * 0.035);
        for (const [x, h, w, k] of [[-0.27, 0.3, 0.09, 0], [0.27, 0.3, 0.09, 1], [-0.13, 0.42, 0.1, 2], [0.13, 0.42, 0.1, 3], [0, 0.56, 0.11, 4]]) {
          const hh = s * h * (1 + 0.1 * Math.sin(t / 130 + k * 1.7)), bx = x * s, by = -s * 0.97, lean = x * s * 0.35, ww = w * s;
          ctx.fillStyle = '#e4faff'; ctx.beginPath(); ctx.moveTo(bx - ww, by); ctx.lineTo(bx - ww * 0.8, by - hh * 0.55); ctx.lineTo(bx + lean, by - hh); ctx.lineTo(bx + ww * 0.8, by - hh * 0.55); ctx.lineTo(bx + ww, by); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#8fd0f5'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + lean, by - hh); ctx.lineTo(bx + ww * 0.8, by - hh * 0.55); ctx.lineTo(bx + ww, by); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(bx - ww, by); ctx.lineTo(bx - ww * 0.8, by - hh * 0.55); ctx.lineTo(bx + lean, by - hh); ctx.lineTo(bx + ww * 0.8, by - hh * 0.55); ctx.lineTo(bx + ww, by); ctx.stroke();
        }
        // piquito
        ctx.fillStyle = '#ffcf5a'; ctx.lineWidth = Math.max(1.2, s * 0.035);
        ctx.beginPath(); ctx.moveTo(look - s * 0.075, -s * 0.44); ctx.lineTo(look + s * 0.075, -s * 0.44); ctx.lineTo(look, -s * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
        // escarcha que sube por los costados
        for (let k = 0; k < 4; k++) {
          const f = fase(t, 1300, k / 4), x = (k % 2 ? 1 : -1) * s * (0.55 + 0.12 * Math.sin(k * 2.7 + t / 500)), y = -s * (0.25 + f * 1.1);
          ctx.globalAlpha = Math.min(1, f * 5) * (1 - f); ctx.fillStyle = '#f2fdff'; ctx.strokeStyle = '#3f8fe6'; ctx.lineWidth = Math.max(0.8, s * 0.018);
          estrella(ctx, x, y, s * 0.06 + 0.8, 4); ctx.fill(); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
    },
    leyenda: {
      detras(ctx, s, sk, t) {
        // rayos de luz de colores que giran detrás
        const cy = -s * 0.55, giro = t / 4000;
        const halo = ctx.createRadialGradient(0, cy, s * 0.2, 0, cy, s * 1.25);
        halo.addColorStop(0, 'rgba(255,250,220,.9)'); halo.addColorStop(0.5, 'rgba(255,225,150,.35)'); halo.addColorStop(1, 'rgba(255,225,150,0)');
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, cy, s * 1.25, 0, Math.PI * 2); ctx.fill();
        for (let k = 0; k < 16; k++) {
          const a = giro + k * Math.PI / 8, L = s * (k % 2 ? 0.95 : 1.3) * (1 + 0.06 * Math.sin(t / 300 + k)), w = k % 2 ? 0.1 : 0.14, hue = (k * 45 + t / 15) % 360;
          const g = ctx.createLinearGradient(0, cy, Math.cos(a) * L, cy + Math.sin(a) * L);
          g.addColorStop(0, `hsla(${hue},100%,66%,1)`); g.addColorStop(0.65, `hsla(${hue},100%,66%,.75)`); g.addColorStop(1, `hsla(${hue},100%,70%,0)`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(Math.cos(a - w) * s * 0.35, cy + Math.sin(a - w) * s * 0.35); ctx.lineTo(Math.cos(a) * L, cy + Math.sin(a) * L);
          ctx.lineTo(Math.cos(a + w) * s * 0.35, cy + Math.sin(a + w) * s * 0.35); ctx.closePath(); ctx.fill();
        }
        // capita violeta con borde dorado y puntas de golondrina
        const w1 = Math.sin(t / 300) * s * 0.04, w2 = Math.sin(t / 300 + 1.4) * s * 0.04;
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045); ctx.fillStyle = '#6a2fd0';
        ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.8);
        ctx.quadraticCurveTo(-s * 0.66, -s * 0.42, -s * 0.84 + w1, -s * 0.02); ctx.lineTo(-s * 0.68, -s * 0.14 + w2 * 0.5); ctx.lineTo(-s * 0.56, 0);
        ctx.lineTo(s * 0.56, 0); ctx.lineTo(s * 0.68, -s * 0.14 + w1 * 0.5); ctx.lineTo(s * 0.84 + w2, -s * 0.02);
        ctx.quadraticCurveTo(s * 0.66, -s * 0.42, s * 0.4, -s * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = Math.max(1, s * 0.028);
        for (const [side, w] of [[-1, w1], [1, w2]]) {
          ctx.beginPath(); ctx.moveTo(side * s * 0.43, -s * 0.74); ctx.quadraticCurveTo(side * s * 0.62, -s * 0.42, side * s * 0.78 + w, -s * 0.07); ctx.stroke();
        }
      },
      piel(ctx, s, sk, t) {
        // prisma: colores que corren en diagonal y un brillo que cruza
        const g = ctx.createLinearGradient(-s / 2, -s, s / 2, 0);
        for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(t / 12 + i * 55) % 360},90%,80%)`);
        ctx.fillStyle = g; ctx.fillRect(-s / 2, -s, s, s);
        const x = -s + fase(t, 2200) * s * 2.6;
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.moveTo(x, -s); ctx.lineTo(x + s * 0.16, -s); ctx.lineTo(x - s * 0.2, 0); ctx.lineTo(x - s * 0.36, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        for (const [px, py, k] of [[-0.34, -0.2, 0], [0.36, -0.78, 1], [0.32, -0.14, 2]]) {
          const a = 0.5 + 0.5 * Math.sin(t / 240 + k * 2.1); ctx.globalAlpha = a; estrella(ctx, px * s, py * s, s * (0.03 + 0.04 * a), 4); ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
      encima(ctx, s, sk, t) {
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, s * 0.035);
        // broches de la capa
        ctx.fillStyle = '#ffd23a';
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * s * 0.43, -s * 0.76, s * 0.06, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        // corona radiante que flota apenas
        const cy = -s * 0.97 + Math.sin(t / 600) * s * 0.02;
        ctx.lineCap = 'round';
        for (let k = 0; k < 7; k++) {
          const a = -Math.PI / 2 + (k - 3) * 0.33, p = 0.5 + 0.5 * Math.sin(t / 250 + k), r0 = s * 0.44, r1 = s * (0.54 + 0.09 * p), oy = cy - s * 0.1;
          ctx.globalAlpha = 0.45 + 0.55 * p; ctx.strokeStyle = '#ffb800'; ctx.lineWidth = Math.max(1.2, s * 0.035);
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, oy + Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, oy + Math.sin(a) * r1); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const g = ctx.createLinearGradient(0, cy - s * 0.4, 0, cy); g.addColorStop(0, '#fff3a0'); g.addColorStop(1, '#f5a300');
        ctx.beginPath(); ctx.moveTo(-s * 0.34, cy + s * 0.02);
        for (const [x, y] of [[-0.4, -0.3], [-0.2, -0.13], [0, -0.4], [0.2, -0.13], [0.4, -0.3], [0.34, 0.02]]) ctx.lineTo(x * s, cy + y * s);
        ctx.closePath();
        ctx.save(); ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = s * 0.35; ctx.fillStyle = g; ctx.fill(); ctx.restore();
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.045); ctx.stroke();
        ctx.fillStyle = '#fffbe6'; ctx.lineWidth = Math.max(1, s * 0.025);
        for (const [x, y] of [[-0.4, -0.3], [0, -0.4], [0.4, -0.3]]) { ctx.beginPath(); ctx.arc(x * s, cy + y * s, s * 0.05, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        [-0.2, 0, 0.2].forEach((x, k) => {
          ctx.fillStyle = `hsl(${(t / 6 + k * 120) % 360},95%,60%)`; ctx.beginPath(); ctx.arc(x * s, cy - s * 0.06, s * 0.04, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        });
        // destellos alrededor
        for (const [px, py, k] of [[-0.72, -1.12, 0], [0.74, -0.92, 1], [-0.7, -0.34, 2], [0.72, -0.24, 3]]) {
          const a = 0.5 + 0.5 * Math.sin(t / 280 + k * 1.7);
          ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.8, s * 0.02);
          estrella(ctx, px * s, py * s, s * (0.04 + 0.07 * a) + 0.8, 4); ctx.fill(); ctx.stroke();
        }
      },
    },
  });

  // ---------- muertes propias de un personaje (por ahora, Geo: se parte en pedazos) ----------
  // dibujarCubo anota dónde quedó el cubo en cada canvas. Los juegos llaman a morir() cuando perdés:
  // si tu personaje tiene muerte propia, se rompe ahí mismo en una capa encima de la página
  // y no se vuelve a dibujar hasta que tocás algo (o sea, hasta que seguís jugando).
  const vistos = new Map();   // canvas → { propio, otro }: el último cubo tuyo y el último de otro personaje ({ m, x, pie, s, t })
  let muerto = null;          // { canvas, sk, t0, hasta, toco }
  function anotar(ctx, x, pie, s, propio) {
    const cv = ctx.canvas;
    if (!cv || !cv.isConnected || !ctx.getTransform) return;
    const r = vistos.get(cv) || { propio: null, otro: null };
    r[propio ? 'propio' : 'otro'] = { m: ctx.getTransform(), x, pie, s, t: performance.now() };
    vistos.set(cv, r);
  }
  function alTocar() { if (muerto && performance.now() - muerto.t0 > 150) muerto.toco = true; }
  addEventListener('keydown', alTocar, true);
  addEventListener('pointerdown', alTocar, true);

  // canvas: el del juego (si falta, el último donde se dibujó tu cubo). o.volver: reaparece solo al terminar.
  function morir(canvas, o = {}) {
    const sk = skin();
    if (!sk.muerte) return false;
    const ahora = performance.now();
    for (const cv of vistos.keys()) if (!cv.isConnected) vistos.delete(cv);
    let cv = canvas, v = null, mejor = 0;
    if (canvas) { const r = vistos.get(canvas); v = r && (r.propio || r.otro); }
    else {
      for (const [c, { propio: w }] of vistos) {
        const tam = w ? w.s * Math.hypot(w.m.a, w.m.b) : 0;
        if (w && ahora - w.t < 400 && tam > mejor) { mejor = tam; cv = c; v = w; }
      }
    }
    if (!v) return false;
    const b = cv.getBoundingClientRect();
    if (!b.width || !cv.width) return false;
    const kx = b.width / cv.width, ky = b.height / cv.height, m = v.m, X = v.x, Y = v.pie - v.s / 2;
    const cx = b.left + (m.a * X + m.c * Y + m.e) * kx, cy = b.top + (m.b * X + m.d * Y + m.f) * ky;
    const tam = v.s * Math.hypot(m.a, m.b) * kx;
    if (!(tam > 2)) return false;
    estallar(cx, cy, tam, sk);
    muerto = { canvas: cv, sk, t0: ahora, hasta: ahora + 1000, toco: !!o.volver };
    vibrar(45);
    return true;
  }

  // Pedazos: una foto del cubo cortada en triángulos que salen volando, una onda expansiva chica,
  // un flash y cuadraditos sueltos. Se dibuja en un canvas fijo encima de todo que se borra solo.
  function estallar(cx, cy, S, sk) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const F = S * 1.3, P = Math.ceil(F * dpr), foto = document.createElement('canvas');
    foto.width = foto.height = P;
    const fc = foto.getContext('2d');
    fc.scale(P / F, P / F);
    dibujarCubo(fc, F / 2, F / 2 + S / 2, S, { skin: sk, efecto: false, brillo: false, t: performance.now(), _foto: true });

    const capa = document.createElement('canvas');
    capa.setAttribute('aria-hidden', 'true');
    capa.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483600';
    const W = innerWidth, H = innerHeight;
    capa.width = Math.ceil(W * dpr); capa.height = Math.ceil(H * dpr);
    document.body.appendChild(capa);
    const c = capa.getContext('2d');

    const rnd = (a, b) => a + Math.random() * (b - a), vel = quieto ? 0.35 : 1;
    // 4×4 celdas, cada una partida en dos triángulos por una diagonal al azar
    const N = 4, L = F / N, pedazos = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x0 = i * L, y0 = j * L, x1 = x0 + L, y1 = y0 + L;
      const tris = Math.random() < 0.5
        ? [[[x0, y0], [x1, y0], [x1, y1]], [[x0, y0], [x1, y1], [x0, y1]]]
        : [[[x0, y0], [x1, y0], [x0, y1]], [[x1, y0], [x1, y1], [x0, y1]]];
      for (const tri of tris) {
        const gx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, gy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        const dx = gx - F / 2, dy = gy - F / 2, d = Math.hypot(dx, dy) || 1, a = Math.atan2(dy, dx) + rnd(-0.35, 0.35);
        const v0 = S * rnd(2.6, 6.2) * (0.6 + d / F) * vel;
        pedazos.push({ tri, gx, gy, x: gx, y: gy, vx: Math.cos(a) * v0, vy: Math.sin(a) * v0 - S * rnd(1.5, 3.5) * vel,
          r: 0, vr: rnd(-11, 11) * vel, vida: rnd(0.75, 1.05) });
      }
    }
    const colores = ['#5ff5ff', '#ffe23d', '#ff9a1f', '#ffffff'], chispas = [];
    for (let k = 0; k < 18; k++) {
      const a = rnd(0, Math.PI * 2), v0 = S * rnd(3.5, 8.5) * vel;
      chispas.push({ x: F / 2, y: F / 2, vx: Math.cos(a) * v0, vy: Math.sin(a) * v0 - S * 2 * vel, r: rnd(0, 3), vr: rnd(-12, 12),
        l: S * rnd(0.06, 0.12), col: colores[k % colores.length], vida: rnd(0.45, 0.75) });
    }
    const G = S * 11 * vel, ox = cx - F / 2, oy = cy - F / 2, t0 = performance.now();
    let antes = t0;
    function paso(now) {
      const dt = Math.min(0.05, (now - antes) / 1000), e = (now - t0) / 1000; antes = now;
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
      // onda expansiva: dos anillos que se abren y se apagan
      for (const [demora, col, mul] of [[0, '#5ff5ff', 1], [0.07, '#ffd23a', 0.78]]) {
        const p = (e - demora) / 0.6;
        if (p <= 0 || p >= 1) continue;
        const q = 1 - (1 - p) ** 3;
        c.save(); c.globalAlpha = (1 - p) * 0.95; c.strokeStyle = col; c.shadowColor = col; c.shadowBlur = S * 0.35;
        c.lineWidth = Math.max(1.5, S * 0.17 * (1 - p) * mul);
        c.beginPath(); c.arc(cx, cy, S * (0.5 + 1.9 * q * mul), 0, Math.PI * 2); c.stroke(); c.restore();
      }
      // flash del primer instante
      if (e < 0.16) {
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, S * 1.1);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - e / 0.16)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.beginPath(); c.arc(cx, cy, S * 1.1, 0, Math.PI * 2); c.fill();
      }
      let vivos = 0;
      for (const p of pedazos) {
        p.vy += G * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        const f = e / p.vida;
        if (f >= 1) continue;
        vivos++;
        const k = 1 - 0.35 * f;
        c.save(); c.globalAlpha = f < 0.6 ? 1 : 1 - (f - 0.6) / 0.4;
        c.translate(ox + p.x, oy + p.y); c.rotate(p.r); c.scale(k, k);
        c.beginPath(); for (const [px, py] of p.tri) c.lineTo(px - p.gx, py - p.gy); c.closePath();
        c.clip(); c.drawImage(foto, -p.gx, -p.gy, F, F);
        c.restore();
      }
      for (const p of chispas) {
        p.vy += G * 0.7 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        const f = e / p.vida;
        if (f >= 1) continue;
        vivos++;
        c.save(); c.globalAlpha = 1 - f; c.translate(ox + p.x, oy + p.y); c.rotate(p.r);
        c.fillStyle = p.col; c.shadowColor = p.col; c.shadowBlur = S * 0.15; c.fillRect(-p.l / 2, -p.l / 2, p.l, p.l); c.restore();
      }
      if (vivos || e < 0.6) requestAnimationFrame(paso); else capa.remove();
    }
    requestAnimationFrame(paso);
  }

  // Dibuja el cubo con la base apoyada en (x, pie). `lado` es el tamaño del cubo en px.
  // Opciones: mirar (-1, 0, 1), mareado, t, skin (objeto de SKINS), efecto (id, o false para no dibujarlo).
  function dibujarCubo(ctx, x, pie, s, o = {}) {
    const sk = o.skin || skin();
    const fx = o.efecto === false ? null : o.efecto || efecto().id;
    // brillo de nivel: las vistas previas (efecto: false) no lo llevan; marco: id muestra uno en particular
    const mc = o.marco === false || o.efecto === false ? null : (o.marco || (marco() || {}).id);
    const t = o.t ?? performance.now();
    const mareado = !!o.mareado, mirar = Math.max(-1, Math.min(1, o.mirar || 0));
    const lw = Math.max(2, s * 0.08);
    const parte = PARTES[sk.extra] || {}, rad = s * (sk.radio ?? 0.2);
    if (!o._foto) {
      // el cubo que acaba de partirse en pedazos no se dibuja hasta que se vuelve a jugar
      if (muerto && ctx.canvas === muerto.canvas && sk.id === muerto.sk.id) {
        if (performance.now() < muerto.hasta || !muerto.toco) return;
        muerto = null;
      }
      anotar(ctx, x, pie, s, !o.skin);
    }
    ctx.save();
    ctx.translate(x, pie);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (sk.extra === 'fantasma' && !mareado) {
      // flota: sombrita en el piso y el cubo un poco arriba
      ctx.fillStyle = 'rgba(29,35,64,.16)'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.42, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(0, -s * (0.12 + 0.06 * Math.sin(t / 380)));
    }
    if (fx && fx !== 'ninguno') { ctx.save(); efectoDetras(ctx, fx, s, t); ctx.restore(); }

    ctx.fillStyle = 'rgba(29,35,64,.2)'; rr(ctx, -s / 2 + 3, -s + 4, s, s, rad); ctx.fill();
    const look = mirar * s * 0.06;
    ctx.lineWidth = lw; ctx.strokeStyle = INK;
    if (parte.detras && !mareado) { ctx.save(); parte.detras(ctx, s, sk, t, look, mirar); ctx.restore(); }

    // cuerpo (las legendarias brillan)
    if (sk.glow && !mareado && o.brillo !== false) {
      ctx.save();
      ctx.shadowColor = sk.extra === 'holograma' ? `hsl(${(t / 12) % 360},100%,70%)` : sk.glow;
      ctx.shadowBlur = s * (0.45 + 0.25 * Math.sin(t / 260)) * (sk.exclusiva ? 1.5 : 1);
      ctx.fillStyle = sk.glow;
      for (let k = sk.exclusiva ? 2 : 1; k > 0; k--) { rr(ctx, -s / 2, -s, s, s, rad); ctx.fill(); }
      ctx.restore();
    }
    ctx.fillStyle = mareado ? '#c9d3e3' : sk.cuerpo;
    if (sk.extra === 'fantasma' && !mareado) ctx.globalAlpha = 0.82 + 0.1 * Math.sin(t / 300);
    rr(ctx, -s / 2, -s, s, s, rad); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.save(); ctx.clip();
    if (sk.extra === 'semillas' && !mareado) {
      ctx.fillStyle = '#2fb36b'; ctx.fillRect(-s / 2, -s * 0.17, s, s * 0.17);
      ctx.fillStyle = '#9fe8b9'; ctx.fillRect(-s / 2, -s * 0.2, s, s * 0.04);
      ctx.fillStyle = INK;
      for (const [px, py, a] of [[-0.3, -0.3, 0.4], [0.3, -0.32, -0.4], [0, -0.26, 0], [-0.36, -0.75, 0.2], [0.38, -0.78, -0.2]]) {
        ctx.beginPath(); ctx.ellipse(px * s, py * s, s * 0.025, s * 0.045, a, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (sk.extra === 'estrellitas' && !mareado) {
      ctx.fillStyle = '#ffe14d';
      for (const [px, py, k] of [[-0.32, -0.25, 0], [0.3, -0.82, 1], [0.34, -0.22, 2], [-0.36, -0.82, 3]]) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t / 300 + k * 1.7);
        estrella(ctx, px * s, py * s, s * 0.06); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (parte.piel && !mareado) parte.piel(ctx, s, sk, t, look, mirar);
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = lw;
    rr(ctx, -s / 2, -s, s, s, rad); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.45)'; rr(ctx, -s * 0.36, -s * 0.9, s * 0.72, s * 0.12, s * 0.06); ctx.fill();
    if (mc && mc !== 'ninguno') { ctx.save(); marcoNivel(ctx, mc, s, t); ctx.restore(); }

    // cara
    const ex = s * 0.2, ey = -s * 0.56, ojo = mareado ? INK : parte.ojo || sk.ojo || INK;
    ctx.fillStyle = ojo; ctx.strokeStyle = ojo;
    if (mareado) {
      ctx.lineWidth = Math.max(2, s * 0.065);
      for (const side of [-1, 1]) {
        const x0 = side * ex, d = s * 0.08;
        ctx.beginPath(); ctx.moveTo(x0 - d, ey - d); ctx.lineTo(x0 + d, ey + d);
        ctx.moveTo(x0 + d, ey - d); ctx.lineTo(x0 - d, ey + d); ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(0, -s * 0.26, s * 0.08, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      if (!sk.sinOjos) {
        for (const side of [-1, 1]) {
          if (sk.ojos === 'cuadrados') { rr(ctx, side * ex + look - s * 0.07, ey - s * 0.08, s * 0.14, s * 0.14, s * 0.02); ctx.fill(); }
          else { rr(ctx, side * ex + look - s * 0.06, ey - s * 0.1, s * 0.12, s * 0.2, s * 0.06); ctx.fill(); }
        }
      }
      if (!sk.sinCachetes) {
        ctx.fillStyle = 'rgba(255,93,125,.55)';
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * s * 0.3 + look, -s * 0.3, s * 0.08, s * 0.05, 0, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.strokeStyle = sk.ojo || INK; ctx.lineWidth = Math.max(2, s * 0.056);
      if (sk.sinBoca) {
        // nada: la boca la tapa el personaje
      } else if (sk.ojos === 'cuadrados') {
        ctx.beginPath(); ctx.moveTo(look - s * 0.12, -s * 0.28); ctx.lineTo(look + s * 0.12, -s * 0.28); ctx.stroke();
      } else if (sk.sinOjos) {
        ctx.beginPath(); ctx.arc(look, -s * 0.5, s * 0.22, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(look, -s * 0.34, s * 0.1, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      }
    }

    // accesorios
    ctx.strokeStyle = INK; ctx.lineWidth = lw;
    if (parte.encima && !mareado) { ctx.save(); parte.encima(ctx, s, sk, t, look, mirar); ctx.restore(); }
    if (sk.extra === 'gorra') {
      const lado = mirar < 0 ? -1 : 1;
      ctx.fillStyle = sk.color2;
      rr(ctx, lado > 0 ? s * 0.02 : -s * 0.6, -s * 1.04, s * 0.58, s * 0.12, s * 0.06); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -s * 0.98, s * 0.4, s * 0.26, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = CREMA; ctx.beginPath(); ctx.arc(0, -s * 1.22, s * 0.05, 0, Math.PI * 2); ctx.fill();
    } else if (sk.extra === 'antena') {
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, -s * 1.32); ctx.stroke();
      ctx.fillStyle = Math.sin(t / 250) > 0 ? '#ff5d7d' : '#ffb3c2';
      ctx.beginPath(); ctx.arc(0, -s * 1.36, s * 0.09, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (sk.extra === 'auriculares') {
      ctx.lineWidth = Math.max(3, s * 0.1); ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.arc(0, -s * 0.55, s * 0.6, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      ctx.lineWidth = lw; ctx.fillStyle = sk.color2;
      for (const side of [-1, 1]) { rr(ctx, side * s * 0.6 - s * 0.11, -s * 0.74, s * 0.22, s * 0.36, s * 0.08); ctx.fill(); ctx.stroke(); }
    } else if (sk.extra === 'casco') {
      ctx.fillStyle = 'rgba(170,215,255,.22)'; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(2, s * 0.05);
      ctx.beginPath(); ctx.arc(0, -s * 0.52, s * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = Math.max(2, s * 0.06);
      ctx.beginPath(); ctx.arc(0, -s * 0.52, s * 0.62, Math.PI * 1.15, Math.PI * 1.4); ctx.stroke();
    } else if (sk.extra === 'corona') {
      ctx.fillStyle = sk.color2;
      ctx.beginPath(); ctx.moveTo(-s * 0.32, -s * 0.97); ctx.lineTo(-s * 0.36, -s * 1.32); ctx.lineTo(-s * 0.16, -s * 1.14);
      ctx.lineTo(0, -s * 1.4); ctx.lineTo(s * 0.16, -s * 1.14); ctx.lineTo(s * 0.36, -s * 1.32); ctx.lineTo(s * 0.32, -s * 0.97);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff5d7d'; ctx.beginPath(); ctx.arc(0, -s * 1.1, s * 0.05, 0, Math.PI * 2); ctx.fill();
    } else if (sk.extra === 'brillos') {
      ctx.fillStyle = CREMA;
      for (const [px, py, k] of [[-0.62, -1.0, 0], [0.6, -0.7, 1], [0.5, -1.18, 2]]) {
        const a = 0.5 + 0.5 * Math.sin(t / 220 + k * 2.1);
        ctx.globalAlpha = a; estrella(ctx, px * s, py * s, s * (0.06 + 0.06 * a), 4); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (fx && fx !== 'ninguno') { ctx.save(); efectoDelante(ctx, fx, s, t); ctx.restore(); }
    ctx.restore();

    if (mareado) {
      for (let k = 0; k < 3; k++) {
        const a = t / 110 + k * (Math.PI * 2 / 3);
        const sx = x + Math.cos(a) * s * 0.55, sy = pie - s * 1.18 + Math.sin(a) * s * 0.16;
        ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
        estrella(ctx, sx, sy, s * 0.14); ctx.fill(); ctx.stroke();
      }
    }
  }

  // Chrome bloquea (y avisa en consola) la vibración antes del primer toque del usuario.
  function vibrar(ms = 12) {
    try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) {}
  }
  function volver() { location.href = 'index.html'; }

  window.CuboComun = {
    SKINS, EFECTOS, TITULOS, PASE_MAX, DIFS, DURAS, JUEGOS, LOGROS, MEDALLAS, UMBRALES, canjear, marcar, leyendaTeclas, escalaUI,
    titulo, elegirTitulo, pase, MARCOS, marco, elegirMarco, agregarAmigo, quitarAmigo, refrescarAmigos, versus,
    xpPara, nivelDe, perfil, skin, efecto, elegirSkin, elegirEfecto, libre, nuevos, marcarVistos,
    sumarXP, xpEscala, partida, importarRecord, anotarRecord, revisarLogros, tieneLogro,
    claseNombre, estilos, juego, tablaDe, formato, iconoDif, selectorDif, verRanking, top, ponerApodo, vincular, limpiarApodo, rankingActivo, subirPendientes,
    avisar, vibrar, volver, dibujarCubo, morir,
  };
  // Duelos 1v1 (cubo-duelo.js): usa la misma conexión a Supabase y escucha las invitaciones en todas las páginas.
  window.CuboComun.RANKING = RANKING;
  const cargarDuelo = () => {
    if (!rankingActivo() || window.CuboDuelo || document.querySelector('script[src$="cubo-duelo.js"]')) return;
    const s = document.createElement('script'); s.src = 'cubo-duelo.js'; s.async = true; document.head.appendChild(s);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cargarDuelo); else cargarDuelo();
})();
