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
  ];
  // Códigos (se guarda solo el hash: sha256('cubo:' + CÓDIGO en mayúsculas, sin espacios ni guiones)).
  const CODIGOS = {
    '21ac801523d41ca2afdae55295d358cec55e7b078b52c4cb30635342c2e5469c': 'dev',
    '84c0cefa4e4958365252de6bce1d43f433b042cc385b04b95f8a25017d803b2f': 'holograma',
    'f84cf38b4df650d7c292d2a23967e20fe305e40099116526a7e6dd642ba675ff': 'sombra',
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
    { id: 'serpiente', nombre: 'Serpiente', archivo: 'serpiente.html', color: '#a3e048', nuevo: true, tablas: tablasDif('mayor', 'num', 'frutas') },
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
    serpiente: [8, 20, 40, 70],
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
      prueba: p => mejorTabla(p, 'escalador', 'sprint') < 20000 },
    { id: 'escalador-14', juego: 'escalador', nombre: 'Dedos rápidos', desc: 'Sprint 100 en menos de 14 s.', medalla: 'plata',
      prueba: p => mejorTabla(p, 'escalador', 'sprint') < 14000 },
    { id: 'escalador-12', juego: 'escalador', nombre: 'Velocista', desc: 'Sprint 100 en menos de 12 s.', medalla: 'oro',
      prueba: p => mejorTabla(p, 'escalador', 'sprint') < 12000 },
    { id: 'escalador-11', juego: 'escalador', nombre: 'Dedos de rayo', desc: 'Sprint 100 en menos de 11 s. Muy pocos llegan.', medalla: 'diamante',
      prueba: p => mejorTabla(p, 'escalador', 'sprint') < 11000 },
    { id: 'escalador-10', juego: 'escalador', nombre: 'Inhumano', desc: 'Sprint 100 en menos de 10.5 s.', medalla: 'diamante',
      prueba: p => mejorTabla(p, 'escalador', 'sprint') < 10500 },
    { id: 'escalador-limpio', juego: 'escalador', nombre: 'Sin un error', desc: 'Sprint 100 sin equivocarte ni una vez.', medalla: 'plata',
      prueba: p => !!p.marcas['escalador-limpio'] },
    { id: 'escalador-30', juego: 'escalador', nombre: 'Medio minuto', desc: 'Más de 200 escalones en 30 segundos.', medalla: 'oro',
      prueba: p => mejorTabla(p, 'escalador', 'time') > 200 },
    { id: 'escalador-espacio', juego: 'escalador', nombre: 'Houston', desc: 'Llegá al espacio en Libre (escalón 330).', medalla: 'plata',
      prueba: p => Math.max(mejorTabla(p, 'escalador', 'free') || 0, mejorTabla(p, 'escalador', 'free-x') || 0) >= 330 },
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
  const libre = (item, p = datos) => (item.codigo ? p.codigos.includes(item.id)
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
  function perfil() {
    datos = leer(); // otro juego pudo haberlo cambiado
    return {
      xp: datos.xp, ...nivelDe(datos.xp), skin: skin(), efecto: efecto(), records: { ...datos.records },
      mejores: { ...datos.mejores }, partidas: { ...datos.partidas }, total: datos.total,
      logros: { ...datos.logros }, extremo: { ...datos.extremo }, maestro: { ...datos.maestro }, marcas: { ...datos.marcas },
      codigos: [...datos.codigos], apodo: datos.apodo, id: datos.id,
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
    const id = CODIGOS[hash], sk = SKINS.find(k => k.id === id);
    if (!sk) return { ok: false, msg: 'Ese código no existe.' };
    datos = leer();
    if (datos.codigos.includes(id)) return { ok: true, skin: sk, ya: true };
    datos.codigos.push(id); datos.skin = id; guardar();
    subirPendientes();
    avisar(`<canvas width="96" height="104" style="width:48px;height:52px;flex:none"></canvas><div><b>¡${sk.nombre}!</b><span>Personaje legendario desbloqueado</span></div>`, 4200);
    const cv = document.querySelector('#cc-avisos .cc-aviso:last-child canvas');
    if (cv) { const c = cv.getContext('2d'); c.scale(2, 2); dibujarCubo(c, 24, 46, 28, { skin: sk, t: 0, efecto: false }); }
    return { ok: true, skin: sk };
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
  // Lo que desbloquea pasar del nivel a al b
  const porNivel = (a, b) => [...SKINS, ...EFECTOS].filter(i => i.nivel > a && i.nivel <= b && !i.logro);

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
  const registrar = apodo => api('rpc/registrar_jugador', { method: 'POST', body: JSON.stringify({ p_jugador: datos.id, p_apodo: apodo, p_skin: skin().id }) });
  async function asegurarJugador() {
    datos = leer();
    const sk = skin().id;
    if (datos.clave && datos.skinSubida === sk) return;
    const r = await registrar(datos.apodo);
    datos = leer();
    if (r && r.estado === 'ok') { datos.clave = r.clave; datos.skinSubida = sk; }
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
  async function top(jid, tid, n = 50) {
    const tb = tablaDe(jid, tid);
    const orden = tb && tb.orden === 'menor' ? 'asc' : 'desc';
    const t = encodeURIComponent(jid + ':' + tid);
    const filas = await api(`ranking?tabla=eq.${t}&select=apodo,valor,skin,huella&order=valor.${orden},creado.asc&limit=${n}`);
    const mia = await huella();
    const lista = filas.map((f, k) => ({ puesto: k + 1, apodo: f.apodo, valor: +f.valor, skin: f.skin, yo: !!mia && f.huella === mia }));
    let yo = lista.find(f => f.yo) || null;
    const mio = leer().mejores[jid + ':' + tid];
    if (!yo && mio != null && leer().apodo) {
      try {
        const op = orden === 'asc' ? 'lt' : 'gt';
        const r = await fetch(RANKING.url.replace(/\/$/, '') + `/rest/v1/ranking?tabla=eq.${t}&valor=${op}.${mio}&select=huella`, {
          method: 'HEAD', headers: { apikey: RANKING.clave, Prefer: 'count=exact' },
        });
        const total = +(r.headers.get('content-range') || '').split('/')[1];
        if (isFinite(total)) yo = { puesto: total + 1, apodo: leer().apodo, valor: mio, skin: skin().id, yo: true, afuera: true };
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
      datos.apodo = a; datos.clave = r.clave; datos.skinSubida = skin().id; datos.apodoPerdido = '';
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
    datos.id = r.id; datos.apodo = r.apodo; datos.clave = r.clave; datos.skinSubida = ''; datos.apodoPerdido = '';
    subirTodo();
    guardar();
    await subirPendientes();
    return { ok: true, apodo: r.apodo };
  }
  const claveLinda = c => (c && c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c);

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
.card button.cc-casa:focus-visible{outline:3px solid #62c6ff;outline-offset:2px}
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
.cc-dif:focus-visible{outline:3px solid #5cb0ff;outline-offset:2px}
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
#cc-rank .x{appearance:none;flex:none;width:42px;height:42px;border-radius:50%;border:0;background:transparent;font:700 20px/1 system-ui;color:${INK};cursor:pointer}
#cc-rank .x:hover{background:rgba(29,35,64,.08)}
#cc-rank .seg{display:grid;grid-template-columns:repeat(var(--n,4),minmax(0,1fr));gap:3px;margin:0 14px 8px;padding:3px;background:#ece8dc;border:2.5px solid ${INK};border-radius:14px}
#cc-rank .seg button{appearance:none;display:flex;align-items:center;justify-content:center;gap:4px;min-width:0;min-height:38px;padding:4px 2px;border:0;border-radius:10px;
  background:transparent;color:${INK};font:800 12.5px "Rubik",system-ui,sans-serif;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
#cc-rank li .v{font-variant-numeric:tabular-nums;font-weight:800}
#cc-rank li canvas{width:26px;height:30px;flex:none}
#cc-rank li.msg{display:block;padding:26px 18px;text-align:center;font-weight:600;line-height:1.45}
#cc-rank li.sep{display:block;padding:0;text-align:center;font-weight:800;opacity:.4;letter-spacing:.2em}
#cc-rank .pie{padding:10px 14px 14px;border-top:2px dashed rgba(29,35,64,.22)}
#cc-rank .yo-txt{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;min-height:32px}
#cc-rank .yo-txt b{font-weight:800;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
#cc-rank .link{appearance:none;flex:none;margin-left:auto;border:0;background:none;padding:6px 8px;border-radius:8px;font:800 13px "Rubik",system-ui,sans-serif;
  color:${INK};text-decoration:underline;text-underline-offset:3px;cursor:pointer}
#cc-rank .link:hover{background:rgba(29,35,64,.08)}
#cc-rank form{display:flex;gap:8px}
#cc-rank input{flex:1;min-width:0;height:44px;border-radius:12px;border:2.5px solid ${INK};padding:0 12px;font:600 16px "Rubik",system-ui,sans-serif;color:${INK};background:#fff}
#cc-rank form button{appearance:none;height:44px;padding:0 16px;border-radius:12px;border:2.5px solid ${INK};background:#ffcc29;color:${INK};
  font:400 18px "Lilita One","Trebuchet MS",sans-serif;box-shadow:0 3px 0 ${INK};cursor:pointer}
#cc-rank form button:active{transform:translateY(2px);box-shadow:0 1px 0 ${INK}}
#cc-rank .ayuda{margin:8px 2px 0;font-size:12px;font-weight:600;opacity:.75;line-height:1.35}
#cc-rank .ayuda .clave{font:800 15px ui-monospace,Consolas,monospace;letter-spacing:.08em;user-select:all;white-space:nowrap}
#cc-rank .f-clave input[name="c"]{flex:0 0 8.6em;text-transform:uppercase;letter-spacing:.06em}
#cc-rank form button:disabled,#cc-rank input:disabled{opacity:.6}
#cc-rank .pie .otro{display:block;margin:4px 0 0 -6px;font-size:12px}
/* nombres de quien usa una legendaria: con el color de su personaje */
.cc-leg{font-weight:800}
.cc-leg-fantasma{color:#3f6fd1;text-shadow:0 0 8px rgba(120,170,255,.75)}
.cc-leg-fenix{background:linear-gradient(90deg,#e0203a,#ff7a3d,#f5a000);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 4px rgba(255,122,61,.6))}
.cc-leg-glitch{color:#2b3470;text-shadow:-1.5px 0 #ff3bd4,1.5px 0 #00c8e0;animation:cc-glitch 1.6s steps(1) infinite}
@keyframes cc-glitch{0%,86%,100%{text-shadow:-1.5px 0 #ff3bd4,1.5px 0 #00c8e0}90%{text-shadow:2.5px 0 #ff3bd4,-2.5px 0 #00c8e0}}
.cc-leg-holograma{background:linear-gradient(90deg,#ff5d7d,#ffad4d,#3fcf8e,#3fa6ff,#a06bff,#ff5d7d);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:cc-holo 3s linear infinite}
@keyframes cc-holo{to{background-position:200% 0}}
.cc-leg-sombra{color:#5a2fc8;text-shadow:0 0 8px rgba(143,107,255,.85)}
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
    let editando = false, conClave = false, verClave = false;
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
      const tb = tablaDe(j.id, tid), mio = leer().mejores[j.id + ':' + tid];
      const tuyo = `Tu mejor marca: <strong>${formato(mio, tb)}</strong>`;
      if (!rankingActivo()) { msg(`El ranking online se está preparando.<br>${tuyo}`); return; }
      if (navigator.onLine === false) { msg(`Sin conexión. Tus récords se suben cuando vuelvas a tener internet.<br>${tuyo}`); return; }
      msg('Cargando…');
      const n = ++pedido;
      try {
        await esperarSubida();
        if (n !== pedido) return;
        const { lista, yo } = await top(j.id, tid);
        if (n !== pedido) return;
        if (!lista.length) { msg(`Todavía nadie jugó este modo. ¡Sé el primero!<br>${tuyo}`); return; }
        ol.innerHTML = '';
        const fila = f => {
          const li = document.createElement('li'); if (f.yo) li.className = 'yo';
          li.innerHTML = `<span class="p${f.puesto <= 3 ? ' m' + f.puesto : ''}">${f.puesto}</span><canvas width="52" height="60"></canvas><span class="n"></span><span class="v">${formato(f.valor, tb)}</span>`;
          const nm = li.querySelector('.n'), sk = SKINS.find(s => s.id === f.skin);
          if (sk && sk.legendaria) { const t = document.createElement('span'); t.className = claseNombre(sk); t.textContent = f.apodo; nm.appendChild(t); }
          else nm.textContent = f.apodo;
          if (f.yo) nm.append(' (vos)');
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
  });

  // Dibuja el cubo con la base apoyada en (x, pie). `lado` es el tamaño del cubo en px.
  // Opciones: mirar (-1, 0, 1), mareado, t, skin (objeto de SKINS), efecto (id, o false para no dibujarlo).
  function dibujarCubo(ctx, x, pie, s, o = {}) {
    const sk = o.skin || skin();
    const fx = o.efecto === false ? null : o.efecto || efecto().id;
    const t = o.t ?? performance.now();
    const mareado = !!o.mareado, mirar = Math.max(-1, Math.min(1, o.mirar || 0));
    const lw = Math.max(2, s * 0.08);
    const parte = PARTES[sk.extra] || {};
    ctx.save();
    ctx.translate(x, pie);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (sk.extra === 'fantasma' && !mareado) {
      // flota: sombrita en el piso y el cubo un poco arriba
      ctx.fillStyle = 'rgba(29,35,64,.16)'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.42, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(0, -s * (0.12 + 0.06 * Math.sin(t / 380)));
    }
    if (fx && fx !== 'ninguno') { ctx.save(); efectoDetras(ctx, fx, s, t); ctx.restore(); }

    ctx.fillStyle = 'rgba(29,35,64,.2)'; rr(ctx, -s / 2 + 3, -s + 4, s, s, s * 0.2); ctx.fill();
    const look = mirar * s * 0.06;
    ctx.lineWidth = lw; ctx.strokeStyle = INK;
    if (parte.detras && !mareado) { ctx.save(); parte.detras(ctx, s, sk, t, look, mirar); ctx.restore(); }

    // cuerpo (las legendarias brillan)
    if (sk.glow && !mareado && o.brillo !== false) {
      ctx.save();
      ctx.shadowColor = sk.extra === 'holograma' ? `hsl(${(t / 12) % 360},100%,70%)` : sk.glow;
      ctx.shadowBlur = s * (0.45 + 0.25 * Math.sin(t / 260)) * (sk.exclusiva ? 1.5 : 1);
      ctx.fillStyle = sk.glow;
      for (let k = sk.exclusiva ? 2 : 1; k > 0; k--) { rr(ctx, -s / 2, -s, s, s, s * 0.2); ctx.fill(); }
      ctx.restore();
    }
    ctx.fillStyle = mareado ? '#c9d3e3' : sk.cuerpo;
    if (sk.extra === 'fantasma' && !mareado) ctx.globalAlpha = 0.82 + 0.1 * Math.sin(t / 300);
    rr(ctx, -s / 2, -s, s, s, s * 0.2); ctx.fill();
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
    rr(ctx, -s / 2, -s, s, s, s * 0.2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.45)'; rr(ctx, -s * 0.36, -s * 0.9, s * 0.72, s * 0.12, s * 0.06); ctx.fill();

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
    SKINS, EFECTOS, DIFS, DURAS, JUEGOS, LOGROS, MEDALLAS, UMBRALES, canjear, marcar, leyendaTeclas, escalaUI,
    xpPara, nivelDe, perfil, skin, efecto, elegirSkin, elegirEfecto, libre, nuevos, marcarVistos,
    sumarXP, xpEscala, partida, importarRecord, anotarRecord, revisarLogros, tieneLogro,
    claseNombre, estilos, juego, tablaDe, formato, iconoDif, selectorDif, verRanking, top, ponerApodo, vincular, limpiarApodo, rankingActivo, subirPendientes,
    avisar, vibrar, volver, dibujarCubo,
  };
})();
