// Cubo Escalador: lo que comparten todos los juegos.
// Perfil (nivel, XP, personaje, efecto, logros, récords), ranking online, dificultades y el dibujo del cubo.
//
// Uso desde un juego (cargá este archivo antes del script del juego):
//   const CC = window.CuboComun;                       // puede no existir: el juego tiene que andar igual
//   CC.dibujarCubo(ctx, x, pie, lado, { mirar: -1|0|1, mareado: bool, t: performance.now() });
//
//   // Menú: selector de dificultad común (Fácil, Normal, Difícil, Extremo). Recuerda la última elegida.
//   const sel = CC.selectorDif(elemento, { juego: 'lluvia', alCambiar: id => ... });   sel.valor() → 'normal'
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
  ];
  function iconoDif(id, tam = 22) {
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
  ];

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
    lluvia: [100, 400, 1000, 2000],
    clasificador: [15, 40, 80, 140],
    equilibrio: [100, 400, 1000, 2000],
    ritmo: [5000, 20000, 60000, 120000],
    voley: [5, 15, 35, 70],
    paseo: [100, 400, 1000, 2000],
    serpiente: [8, 20, 40, 70],
    cohete: [200, 800, 2000, 4500],
    esqui: [300, 1000, 2500, 5000],
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
      vistos: Array.isArray(p.vistos) ? p.vistos : null,
      apodo: typeof p.apodo === 'string' ? p.apodo : '',
      id: typeof p.id === 'string' ? p.id : '',
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
  const libre = (item, p = datos) => (item.logro ? !!p.logros[item.logro] : nivelDe(p.xp).nivel >= (item.nivel || 1));
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
      logros: { ...datos.logros }, extremo: { ...datos.extremo }, marcas: { ...datos.marcas }, apodo: datos.apodo, id: datos.id,
    };
  }
  function elegirSkin(id) {
    datos = leer();
    const s = SKINS.find(k => k.id === id);
    if (!s || !libre(s)) return false;
    datos.skin = id; guardar();
    return true;
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
    if (dif && dif.id === 'extremo') datos.extremo[o.juego] = 1;
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
  let subiendo = false;
  async function subirPendientes() {
    datos = leer();
    if (!rankingActivo() || subiendo || !datos.apodo || !datos.pendientes.length || navigator.onLine === false) return;
    subiendo = true;
    try {
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
    subiendo = false;
  }
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
  function ponerApodo(s) {
    const a = limpiarApodo(s);
    if (a.length < 3) return false;
    datos = leer();
    const cambio = a !== datos.apodo;
    datos.apodo = a;
    // Al estrenar o cambiar el apodo se suben todos tus récords.
    if (cambio) for (const [k, v] of Object.entries(datos.mejores)) { const [j, t] = k.split(':'); if (tablaDe(j, t)) encolar(j, t, v); }
    guardar(); subirPendientes();
    return true;
  }

  // ---------- estilos de lo que dibuja esta librería en la página ----------
  function estilos() {
    if (document.getElementById('cc-estilos')) return;
    const st = document.createElement('style');
    st.id = 'cc-estilos';
    st.textContent = `
.cc-difs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;width:100%}
.cc-dif{appearance:none;font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;min-height:68px;
  padding:8px 4px 7px;border:3px solid ${INK};border-radius:14px;background:${CREMA};color:${INK};box-shadow:0 4px 0 ${INK};
  font-family:"Lilita One","Trebuchet MS",sans-serif;font-size:15px;line-height:1;transition:transform .08s,box-shadow .08s,background .15s}
.cc-dif small{font-family:"Rubik",system-ui,sans-serif;font-weight:700;font-size:11px;opacity:.75}
.cc-dif:active{transform:translateY(3px);box-shadow:0 1px 0 ${INK}}
.cc-dif[aria-checked="true"]{background:#ffcc29}
.cc-dif[data-d="extremo"]{color:#b3122a}
.cc-dif[data-d="extremo"][aria-checked="true"]{background:#ff3b3b;color:${INK}}
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
#cc-rank{position:fixed;inset:0;z-index:9998;display:flex;align-items:flex-end;justify-content:center;background:rgba(29,35,64,.55);
  padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));font-family:"Rubik",system-ui,sans-serif;color:${INK}}
#cc-rank .card{width:100%;max-width:440px;max-height:min(640px,calc(100dvh - 32px));display:flex;flex-direction:column;background:${CREMA};
  border:3px solid ${INK};border-radius:22px;box-shadow:0 6px 0 ${INK};overflow:hidden}
#cc-rank header{display:flex;align-items:center;gap:10px;padding:14px 14px 8px 18px}
#cc-rank h2{margin:0;flex:1;font:400 26px/1 "Lilita One","Trebuchet MS",sans-serif}
#cc-rank .x{appearance:none;width:44px;height:44px;border-radius:12px;border:3px solid ${INK};background:#fff;font:700 20px/1 system-ui;color:${INK};cursor:pointer}
#cc-rank .chips{display:flex;gap:6px;overflow-x:auto;padding:4px 18px 10px;scrollbar-width:none}
#cc-rank .chip{appearance:none;flex:none;display:flex;align-items:center;gap:5px;min-height:36px;padding:4px 12px;border-radius:999px;border:2.5px solid ${INK};
  background:#fff;color:${INK};font:700 13px "Rubik",system-ui,sans-serif;cursor:pointer}
#cc-rank .chip[aria-pressed="true"]{background:#ffcc29}
#cc-rank ol{list-style:none;margin:0;padding:0 10px;overflow-y:auto;flex:1;min-height:120px}
#cc-rank li{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:12px;font-weight:600}
#cc-rank li.yo{background:#ffcc29;outline:2.5px solid ${INK}}
#cc-rank li .p{width:30px;text-align:right;font:400 18px "Lilita One","Trebuchet MS",sans-serif}
#cc-rank li .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cc-rank li .v{font-variant-numeric:tabular-nums;font-weight:800}
#cc-rank li canvas{width:26px;height:30px;flex:none}
#cc-rank li.msg{display:block;padding:22px 18px;text-align:center;font-weight:600;line-height:1.4}
#cc-rank form{display:flex;gap:8px;padding:12px 14px 14px;border-top:2.5px dashed rgba(29,35,64,.3)}
#cc-rank input{flex:1;min-width:0;height:46px;border-radius:12px;border:3px solid ${INK};padding:0 12px;font:600 16px "Rubik",system-ui,sans-serif;color:${INK};background:#fff}
#cc-rank form button{appearance:none;height:46px;padding:0 16px;border-radius:12px;border:3px solid ${INK};background:#62c6ff;color:${INK};
  font:400 18px "Lilita One","Trebuchet MS",sans-serif;box-shadow:0 3px 0 ${INK};cursor:pointer}
#cc-rank .ayuda{margin:0;padding:0 18px 12px;font-size:12px;font-weight:600;opacity:.8}
`;
    document.head.appendChild(st);
  }

  // ---------- selector de dificultad ----------
  const NOTAS_DIF = {
    facil: 'Más lento y con más margen. Ideal para aprender.',
    normal: 'La experiencia de siempre.',
    dificil: 'Arranca rápido desde el primer segundo.',
    extremo: 'Para dedos de acero: todo al máximo y sin perdón. XP ×3.',
  };
  function selectorDif(el, o = {}) {
    estilos();
    const key = 'cubo-dif-' + (o.juego || 'x');
    let v = o.valor;
    if (!v) { try { v = localStorage.getItem(key); } catch (e) {} }
    if (!DIFS.some(d => d.id === v)) v = 'normal';
    el.classList.add('cc-difs');
    el.setAttribute('role', 'radiogroup');
    el.setAttribute('aria-label', 'Dificultad');
    el.innerHTML = DIFS.map(d => `<button type="button" class="cc-dif" role="radio" data-d="${d.id}" aria-checked="${d.id === v}">` +
      `${iconoDif(d.id, 24)}${d.nombre}<small>XP ×${String(d.xp).replace('.', ',')}</small></button>`).join('') +
      (o.sinNota ? '' : '<p class="cc-difs-nota" aria-live="polite"></p>');
    const nota = el.querySelector('.cc-difs-nota');
    function poner(id, avisar) {
      if (!DIFS.some(d => d.id === id)) return;
      v = id;
      try { localStorage.setItem(key, id); } catch (e) {}
      for (const b of el.querySelectorAll('.cc-dif')) b.setAttribute('aria-checked', String(b.dataset.d === id));
      if (nota) nota.textContent = (o.notas && o.notas[id]) || NOTAS_DIF[id];
      if (avisar && o.alCambiar) o.alCambiar(id);
    }
    el.addEventListener('click', e => { const b = e.target.closest('.cc-dif'); if (b) { poner(b.dataset.d, true); vibrar(8); } });
    poner(v, false);
    return { valor: () => v, poner: id => poner(id, true), siguiente(paso = 1) {
      const k = DIFS.findIndex(d => d.id === v); poner(DIFS[(k + paso + DIFS.length) % DIFS.length].id, true);
    } };
  }

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

  // ---------- ventana de ranking ----------
  function verRanking(o = {}) {
    estilos();
    const j = juego(o.juego) || JUEGOS[0];
    let tid = o.tabla && tablaDe(j.id, o.tabla) ? o.tabla : j.tablas[j.tablas.length > 4 ? 0 : 1].id;
    const previo = document.activeElement;
    const box = document.createElement('div');
    box.id = 'cc-rank';
    box.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="cc-rank-t">
      <header><h2 id="cc-rank-t">Ranking · ${j.nombre}</h2><button class="x" type="button" aria-label="Cerrar">✕</button></header>
      <div class="chips" role="group" aria-label="Modo"></div><ol aria-live="polite"></ol>
      <form><input name="a" maxlength="14" autocomplete="nickname" placeholder="Tu apodo (3 a 14 letras)" aria-label="Tu apodo"><button type="submit">Guardar</button></form>
      <p class="ayuda"></p></div>`;
    document.body.appendChild(box);
    const $ = s => box.querySelector(s);
    const chips = $('.chips'), ol = $('ol'), input = $('input'), ayuda = $('.ayuda');
    input.value = leer().apodo;
    const pintarAyuda = () => {
      ayuda.textContent = leer().apodo ? 'Tu mejor marca de cada modo se sube sola al terminar la partida.'
        : 'Poné un apodo para aparecer en el ranking. Tus récords se suben solos.';
    };
    pintarAyuda();
    for (const tb of j.tablas) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.dataset.t = tb.id;
      b.innerHTML = (tb.dif && j.tablas.length === 4 ? iconoDif(tb.dif, 16) : tb.dif === 'extremo' ? iconoDif('extremo', 16) : '') + tb.nombre.replace(' Extremo', '');
      b.addEventListener('click', () => { tid = tb.id; cargar(); });
      chips.appendChild(b);
    }
    const msg = t => { ol.innerHTML = `<li class="msg">${t}</li>`; };
    let pedido = 0;
    async function cargar() {
      for (const b of chips.children) b.setAttribute('aria-pressed', String(b.dataset.t === tid));
      const tb = tablaDe(j.id, tid), mio = leer().mejores[j.id + ':' + tid];
      const tuyo = `Tu mejor marca: <strong>${formato(mio, tb)}</strong>`;
      if (!rankingActivo()) { msg(`El ranking online se está preparando.<br>${tuyo}`); return; }
      if (navigator.onLine === false) { msg(`Sin conexión. Tus récords se suben cuando vuelvas a tener internet.<br>${tuyo}`); return; }
      msg('Cargando…');
      const n = ++pedido;
      try {
        const { lista, yo } = await top(j.id, tid);
        if (n !== pedido) return;
        if (!lista.length) { msg(`Todavía nadie jugó este modo. ¡Sé el primero!<br>${tuyo}`); return; }
        ol.innerHTML = '';
        const fila = f => {
          const li = document.createElement('li'); if (f.yo) li.className = 'yo';
          li.innerHTML = `<span class="p">${f.puesto}</span><canvas width="52" height="60"></canvas><span class="n"></span><span class="v">${formato(f.valor, tb)}</span>`;
          li.querySelector('.n').textContent = f.apodo + (f.yo ? ' (vos)' : '');
          const c = li.querySelector('canvas').getContext('2d'); c.scale(2, 2);
          dibujarCubo(c, 13, 28, 18, { skin: SKINS.find(s => s.id === f.skin) || SKINS[0], t: 0, efecto: false });
          ol.appendChild(li);
          return li;
        };
        lista.forEach(fila);
        if (yo && yo.afuera) fila(yo);
        const mia = ol.querySelector('.yo'); if (mia) mia.scrollIntoView({ block: 'nearest' });
      } catch (e) { if (n === pedido) msg(`No se pudo cargar el ranking. Probá de nuevo en un rato.<br>${tuyo}`); }
    }
    function cerrar() { box.remove(); removeEventListener('keydown', tecla, true); if (previo && previo.focus) previo.focus(); if (o.alCerrar) o.alCerrar(); }
    function tecla(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); } else if (e.target !== input) e.stopPropagation(); }
    addEventListener('keydown', tecla, true);
    $('.x').addEventListener('click', cerrar);
    box.addEventListener('click', e => { if (e.target === box) cerrar(); });
    $('form').addEventListener('submit', e => {
      e.preventDefault();
      if (!ponerApodo(input.value)) { ayuda.textContent = 'El apodo tiene que tener entre 3 y 14 letras o números.'; input.focus(); return; }
      input.value = leer().apodo; pintarAyuda(); input.blur(); setTimeout(cargar, 900);
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
    if (fx && fx !== 'ninguno') { ctx.save(); efectoDetras(ctx, fx, s, t); ctx.restore(); }

    ctx.fillStyle = 'rgba(29,35,64,.2)'; rr(ctx, -s / 2 + 3, -s + 4, s, s, s * 0.2); ctx.fill();
    const look = mirar * s * 0.06;
    ctx.lineWidth = lw; ctx.strokeStyle = INK;
    if (parte.detras && !mareado) { ctx.save(); parte.detras(ctx, s, sk, t, look, mirar); ctx.restore(); }

    // cuerpo
    ctx.fillStyle = mareado ? '#c9d3e3' : sk.cuerpo;
    rr(ctx, -s / 2, -s, s, s, s * 0.2); ctx.fill();
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
    SKINS, EFECTOS, DIFS, JUEGOS, LOGROS, MEDALLAS, UMBRALES,
    xpPara, nivelDe, perfil, skin, efecto, elegirSkin, elegirEfecto, libre, nuevos, marcarVistos,
    sumarXP, xpEscala, partida, importarRecord, anotarRecord, revisarLogros, tieneLogro,
    juego, tablaDe, formato, iconoDif, selectorDif, verRanking, top, ponerApodo, limpiarApodo, rankingActivo, subirPendientes,
    avisar, vibrar, volver, dibujarCubo,
  };
})();
