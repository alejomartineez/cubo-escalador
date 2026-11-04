// TwoFingers: lo que comparten todos los juegos.
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
//   CC.verPerfil({ huella, apodo, skin });               // tarjeta con el perfil de alguien (sin nada: el tuyo)
//   // El tiempo jugado se mide solo; si el juego sabe cuánto duró la partida, CC.partida({ ..., ms }).
//   CC.volver();                                          // vuelve a la pantalla de juegos
//   CC.vibrar(15);                                        // vibración corta en el celu, si se puede
(() => {
  'use strict';
  const KEY = 'cubo-perfil';
  const INK = '#1d2340', CREMA = '#fffaf0';

  // Ranking online (Supabase). La clave es la pública (publishable): solo deja leer el ranking y usar enviar_puntaje (ver supabase.sql).
  const RANKING = { url: 'https://gxdzuucgnozostryprkj.supabase.co', clave: 'sb_publishable_jxyT2zN6QwYD_zomchXL_A_pL3ibaY6' };

  // ---------- idioma ----------
  // Español (rioplatense, el original) o inglés. Se elige según el idioma del dispositivo y se cambia en Opciones de la
  // portada (`cubo-idioma`; al cambiarlo se recarga la página). La clave de cada texto es el texto en español, tal cual:
  //   T('Jugar') → 'Play' en inglés, 'Jugar' en español (si no está en el diccionario, queda en español).
  //   T('Nivel {n}', { n: 5 }) → 'Level 5'. Los valores que son texto también se traducen si están en el diccionario.
  // Cada archivo suma sus textos con textos({ 'en español': 'in English', ... }) (los juegos: CC.textos, al principio).
  // En inglés, además, el HTML que ya está en la página y el que se agrega después se traduce solo (ver traducirNodo):
  // los textos que coinciden enteros con una clave, sin contar emojis ni flechas de los costados (y los atributos
  // aria-label, title, placeholder y alt). Si un texto tiene etiquetas adentro («Hacé <b>10</b>»), el elemento lleva
  // data-t y la clave es su innerHTML. Lo que se dibuja en un canvas va siempre con T().
  const IDIOMAS = [{ id: 'es', nombre: 'Español' }, { id: 'en', nombre: 'English' }];
  const IDIOMA_KEY = 'cubo-idioma';
  const idioma = (() => {
    try { const g = localStorage.getItem(IDIOMA_KEY); if (IDIOMAS.some(i => i.id === g)) return g; } catch (e) {}
    const n = (navigator.languages && navigator.languages[0]) || navigator.language || 'es';
    return /^es\b/i.test(n) ? 'es' : 'en';
  })();
  const EN = new Map(), PATRONES = [];
  const enIngles = idioma === 'en';
  const conVars = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? (typeof vars[k] === 'string' ? T(vars[k]) : vars[k]) : m)) : s);
  function T(es, vars) {
    es = String(es);
    return conVars(enIngles ? (EN.get(es) ?? es) : es, vars);
  }
  function textos(dic) {
    for (const [es, en] of Object.entries(dic || {})) {
      if (EN.has(es)) continue;
      EN.set(es, en);
      // con {variables}: también sirve para traducir el HTML que ya viene armado («Nivel 5» → «Level 5»)
      if (/\{\w+\}/.test(es)) {
        const nombres = [];
        const re = es.split(/(\{\w+\})/).map(p => {
          const m = /^\{(\w+)\}$/.exec(p);
          if (m) { nombres.push(m[1]); return '(.+?)'; }
          return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('');
        PATRONES.push({ re: new RegExp('^' + re + '$', 's'), nombres, en });
      }
    }
    cacheT.clear();
    if (enIngles && document.body) traducirNodo(document.body);
  }
  // Traduce un texto ya armado: exacto, o sin los emojis/flechas de los costados, o por un patrón con {variables}.
  // null si no hay traducción.
  const cacheT = new Map();
  const NUCLEO = /^([^\p{L}\p{N}¿¡«"(]*)([\s\S]*?)([^\p{L}\p{N}?!.»")%]*)$/u;
  function traducirTexto(t) {
    if (!t || !/\p{L}/u.test(t)) return null;
    if (cacheT.has(t)) return cacheT.get(t);
    let r = null;
    const m = NUCLEO.exec(t), [, ini, nucleo, fin] = m || ['', '', t, ''];
    const buscar = s => {
      if (EN.has(s)) return EN.get(s);
      for (const p of PATRONES) {
        const x = p.re.exec(s);
        if (x) { const vars = {}; p.nombres.forEach((n, k) => { vars[n] = EN.get(x[k + 1]) ?? x[k + 1]; }); return conVars(p.en, vars); }
      }
      return null;
    };
    const trim = t.trim();
    let x = buscar(trim);
    if (x != null) r = t.replace(trim, () => x);
    else if (nucleo && nucleo !== trim && (x = buscar(nucleo)) != null) r = ini + x + fin;
    if (cacheT.size > 2000) cacheT.clear();
    cacheT.set(t, r);
    return r;
  }
  const ATRIBUTOS_T = ['aria-label', 'title', 'placeholder', 'alt'];
  const SIN_TRADUCIR = 'script,style,textarea,[translate="no"],[contenteditable="true"]';
  function traducirNodo(n) {
    if (!enIngles || !n) return;
    if (n.nodeType === 3) {
      const p = n.parentElement;
      if (!p || p.closest(SIN_TRADUCIR) || p.closest('[data-t]')) return;
      const x = traducirTexto(n.nodeValue);
      if (x != null && x !== n.nodeValue) n.nodeValue = x;
      return;
    }
    if (n.nodeType !== 1 || n.closest(SIN_TRADUCIR)) return;
    const els = [n, ...n.querySelectorAll('*')];
    for (const el of els) {
      if (el.matches(SIN_TRADUCIR)) continue;
      for (const a of ATRIBUTOS_T) {
        const v = el.getAttribute(a);
        if (v) { const x = traducirTexto(v); if (x != null && x !== v) el.setAttribute(a, x); }
      }
      if (el.hasAttribute('data-t')) {
        const k = el.innerHTML.trim().replace(/\s+/g, ' ');
        if (EN.has(k)) el.innerHTML = EN.get(k);
      }
    }
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
    const nodos = [];
    while (w.nextNode()) nodos.push(w.currentNode);
    for (const t of nodos) traducirNodo(t);
  }
  if (enIngles) {
    document.documentElement.lang = 'en';
    const tituloOriginal = document.title;
    const ponerTitulo = () => { const x = traducirTexto(document.title); if (x != null && x !== document.title) document.title = x; };
    new MutationObserver(lista => {
      for (const r of lista) {
        if (r.type === 'childList') r.addedNodes.forEach(traducirNodo);
        else if (r.type === 'characterData') traducirNodo(r.target);
        else if (r.type === 'attributes') {
          const v = r.target.getAttribute(r.attributeName), x = v && traducirTexto(v);
          if (x != null && x !== v) r.target.setAttribute(r.attributeName, x);
        }
      }
      if (document.title === tituloOriginal) ponerTitulo();
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS_T });
    const alCargar = () => { if (document.body) traducirNodo(document.body); ponerTitulo(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alCargar); else alCargar();
  }
  function ponerIdioma(id) {
    if (!IDIOMAS.some(i => i.id === id)) return;
    try { localStorage.setItem(IDIOMA_KEY, id); } catch (e) {}
    location.reload();
  }
  // Para formatear números y fechas en el idioma elegido.
  const LOCALE = enIngles ? 'en-US' : 'es-AR';
  const tr = T;   // para las funciones donde `T` es otra cosa (la temporada)
  // Decimales: «1,5» en español, «1.5» en inglés.
  const coma = s => (enIngles ? String(s) : String(s).replace('.', ','));
  // «¡Nivel 5!» / «Level 5!»
  const exclamar = s => (enIngles ? '' : '¡') + s + '!';
  // Como T(), pero sin traducir las variables: para lo que escribe un jugador (un apodo «Gato» no es «Cat»).
  const Tlit = (es, vars) => T(es).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  // El diccionario de este archivo (al final de la sección, antes de los datos que lo usan).
  textos({
    // desafío del día en cada juego
    ' · jugaste {n} de {m} desafíos de hoy: los otros te esperan en el inicio': ' · you played {n} of {m} daily challenges: the rest are waiting on the home screen',
    ' · ¡jugaste los {m} desafíos de hoy! Mañana hay otros (en {t})': ' · you played all {m} daily challenges! New ones tomorrow (in {t})',
    'Ya usaste los {n} intentos de hoy en {j}': 'You used all {n} of today\'s tries in {j}',
    ' (tu mejor: <strong>{v}</strong>)': ' (your best: <strong>{v}</strong>)',
    '. Mañana hay otro (en {t}).': '. A new one tomorrow (in {t}).',
    // pantalla de carga (la arma build.mjs) y el botón de volver que se vuelve casita
    'Cargando…': 'Loading…', 'Juegos': 'Games', 'Volver a los juegos': 'Back to games',
    // dificultades
    'Fácil': 'Easy', 'Difícil': 'Hard', 'Extremo': 'Extreme', 'Maestro': 'Master', 'Dificultad': 'Difficulty',
    'Más lento y con más margen. Ideal para aprender.': 'Slower and more forgiving. Great for learning.',
    'La experiencia de siempre.': 'The classic experience.',
    'Arranca rápido desde el primer segundo.': 'Fast from the very first second.',
    'Para dedos de acero: todo al máximo y sin perdón. XP ×2.': 'For fingers of steel: everything maxed out, no mercy. XP ×2.',
    'Más allá de Extremo. Casi nadie lo termina. XP ×2,5.': 'Beyond Extreme. Almost nobody beats it. XP ×2.5.',
    // leyenda de teclas
    'En el juego': 'In game', 'En el menú': 'In menu', 'moverte': 'move', 'reiniciar': 'restart', 'dificultad': 'difficulty',
    'jugar': 'play', 'salir': 'exit',
    // personajes
    'Clásico': 'Classic', 'Sandía': 'Watermelon', 'Menta': 'Mint', 'Gorra': 'Cap', 'Gato': 'Cat', 'Rana': 'Frog', 'Abeja': 'Bee',
    'Pingüino': 'Penguin', 'Astronauta': 'Astronaut', 'Vaquero': 'Cowboy', 'Rey': 'King', 'Pirata': 'Pirate', 'Noche': 'Night',
    'Vikingo': 'Viking', 'Zombi': 'Zombie', 'Oro': 'Gold', 'Mago': 'Wizard', 'Arcoíris': 'Rainbow', 'Galaxia': 'Galaxy',
    'Diablito': 'Little Devil', 'Diamante': 'Diamond', 'Sabio': 'Sage', 'Cristal': 'Crystal', 'Tigre': 'Tiger', 'Caballero': 'Knight',
    'Dragón': 'Dragon', 'Campeón': 'Champion', 'Guerrero': 'Warrior', 'Llama dorada': 'Golden Flame', 'Bestia carmesí': 'Crimson Beast',
    'Celeste divino': 'Divine Sky', 'Instinto plateado': 'Silver Instinct', 'Astrónomo': 'Astronomer', 'Pulpo': 'Octopus',
    'Samurái': 'Samurai', 'Cósmico': 'Cosmic', 'Dragón real': 'Royal Dragon', 'Fénix de hielo': 'Ice Phoenix', 'Leyenda': 'Legend',
    'Paraguas': 'Umbrella', 'Cajita': 'Little Box', 'Equilibrista': 'Tightrope Walker', 'Playero': 'Beachgoer', 'Esquiador': 'Skier',
    'Luchador': 'Wrestler', 'Fantasma': 'Phantom', 'Fénix': 'Phoenix', 'Holograma': 'Hologram', 'Sonrisa de metal': 'Metal Smile',
    'Piloto': 'Racer', 'Neón rosa': 'Pink Neon', 'Visor cian': 'Cyan Visor', 'Neón lima': 'Lime Neon', 'Rey Neón': 'Neon King',
    'Gorrito': 'Beanie', 'Visor polar': 'Polar Visor', 'Glaciar': 'Glacier', 'Rey del Hielo': 'Ice King', 'Aventurero': 'Adventurer',
    'Héroe de la selva': 'Jungle Hero', 'Rey de la Selva': 'Jungle King', 'Llama eterna': 'Eternal Flame',
    // pistas de las legendarias
    'Los botones de la pantalla principal esconden una combinación.': 'The buttons on the main screen hide a combination.',
    'Escapá muy, muy lejos de la lava.': 'Escape very, very far from the lava.',
    'Hay minutos que se leen igual al derecho y al revés. Terminá una partida en uno.': 'Some times read the same forwards and backwards. Finish a game at one of them.',
    'Se consigue con un código.': 'Unlocked with a code.',
    'Solo la tiene quien hizo el juego.': "Only the game's creator has this one.",
    'Hecha a pedido para un solo jugador.': 'Custom-made for a single player.',
    'Nivel 30 de la temporada Neón.': 'Level 30 of the Neon season.',
    'Nivel 30 de la temporada Hielo.': 'Level 30 of the Ice season.',
    'Nivel 30 de la temporada Selva.': 'Level 30 of the Jungle season.',
    'Jugá el desafío del día 30 días seguidos.': 'Play the daily challenge 30 days in a row.',
    'Un verdadero maestro no deja ningún juego sin probar en su dificultad más alta.': 'A true master tries every game on its highest difficulty.',
    'Al cubo le dan cosquillas. Hacele muchas seguidas y vas a ver cómo se pone.': 'The cube is ticklish. Tickle it a lot in a row and see what happens.',
    // efectos
    'Sin efecto': 'No effect', 'Chispas': 'Sparks', 'Burbujas': 'Bubbles', 'Corazones': 'Hearts', 'Confeti': 'Confetti', 'Fuego': 'Fire',
    'Órbita': 'Orbit', 'Estrellas': 'Stars', 'Cometa': 'Comet', 'Rayos': 'Thunderbolts', 'Infierno': 'Inferno',
    'Notas musicales': 'Music Notes', 'Huellitas': 'Paw Prints', 'Estela espacial': 'Space Trail', 'Nieve': 'Snow', 'Aura de ki': 'Ki Aura',
    'Fuegos artificiales': 'Fireworks', 'Hojas al viento': 'Leaves in the Wind', 'Burbujas de jabón': 'Soap Bubbles',
    'Electricidad': 'Electricity', 'Pétalos': 'Petals', 'Espiral galáctica': 'Galactic Spiral', 'Pixeles': 'Pixels',
    'Corona de luz': 'Crown of Light', 'Alas de luz': 'Wings of Light', 'Agujero negro': 'Black Hole', 'Tormenta': 'Storm',
    'Lluvia de código': 'Code Rain', 'Orbes de neón': 'Neon Orbs', 'Pulso de neón': 'Neon Pulse', 'Lluvia de neón': 'Neon Rain',
    'Copos': 'Snowflakes', 'Escarcha': 'Frost', 'Cristales': 'Crystals', 'Hojitas': 'Little Leaves', 'Luciérnagas': 'Fireflies',
    'Flores': 'Flowers', 'Llama de la racha': 'Streak Flame',
    // títulos (en los datos quedan en español porque se suben así al ranking: se traducen al mostrarlos)
    'Novato': 'Rookie', 'Saltarín': 'Hopper', 'Constante': 'Consistent', 'Veterano': 'Veteran', 'Experto': 'Expert',
    'As de las flechas': 'Arrow Ace', 'Imparable': 'Unstoppable', 'Reflejos de gato': 'Cat Reflexes', 'Sin frenos': 'No Brakes',
    'Inalcanzable': 'Untouchable', 'Cabeza fría': 'Cool Head', 'Dedos de oro': 'Golden Fingers', 'Mito': 'Myth', 'Titán': 'Titan',
    'Rayo': 'Lightning', 'Fenómeno': 'Phenom', 'Imbatible': 'Unbeatable', 'Gran maestro': 'Grandmaster', 'Inmortal': 'Immortal',
    'Supremo': 'Supreme', 'Leyenda viviente': 'Living Legend', 'Gran campeón': 'Grand Champion', 'Incansable': 'Tireless',
    'Maratonista': 'Marathoner', 'Ojo de halcón': 'Hawk Eye', 'Pulso de acero': 'Steady Hand', 'Sin pestañear': 'Unblinking',
    'Sesenta y contando': 'Sixty and Counting', 'Indomable': 'Indomitable', 'Sabio de las flechas': 'Arrow Sage',
    'Implacable': 'Relentless', 'Hechicero': 'Sorcerer', 'Coloso': 'Colossus', 'Fuera de serie': 'One of a Kind',
    'Estratega': 'Strategist', 'Prodigio': 'Prodigy', 'Invencible': 'Invincible', 'Astro': 'Star', 'Héroe': 'Hero',
    'Titánico': 'Titanic', 'Elegido': 'Chosen One', 'Majestad': 'Majesty', 'Ocho infinito': 'Infinite Eight',
    'Noventa y pico': 'Ninety-Something', 'Semidiós': 'Demigod', 'Deidad': 'Deity', 'Eterno': 'Eternal', 'Casi leyenda': 'Almost a Legend',
    'Al borde': 'On the Edge', 'Uno más': 'One More', 'Centenario': 'Centurion', 'Luz de neón': 'Neon Light',
    'Rey de la noche': 'King of the Night', 'Ciudad de luces': 'City of Lights', 'Leyenda de Neón': 'Neon Legend',
    'Primera nevada': 'First Snow', 'Corazón de hielo': 'Heart of Ice', 'Sin frío': 'Coldproof', 'Leyenda del Hielo': 'Ice Legend',
    'Explorador': 'Explorer', 'Instinto salvaje': 'Wild Instinct', 'Pura liana': 'Vine Swinger', 'Leyenda de la Selva': 'Jungle Legend',
    // brillos y medallas
    'Sin brillo': 'No glow', 'Bronce': 'Bronze', 'Plata': 'Silver', 'Platino': 'Platinum',
    // juegos, modos y unidades
    'Escalador': 'Climber', 'Lluvia': 'Rain', 'Ritmo': 'Rhythm', 'Vóley': 'Volley', 'Paleta': 'Paddle', 'Esquí': 'Ski',
    'Pulseada': 'Arm Wrestling', '30 segundos': '30 seconds', 'Libre': 'Endless', 'Sprint 100 Extremo': 'Sprint 100 Extreme',
    '30 segundos Extremo': '30 seconds Extreme', 'Libre Extremo': 'Endless Extreme', 'Lava Extremo': 'Lava Extreme',
    'Sprint 100 Maestro': 'Sprint 100 Master', '30 segundos Maestro': '30 seconds Master', 'Libre Maestro': 'Endless Master',
    'Lava Maestro': 'Lava Master', 'esc.': 'steps', 'rivales': 'rivals',
    // logros
    'Primeros pasos': 'First Steps', 'Le agarraste la mano': 'Getting the Hang of It', 'Crack': 'Pro',
    'Hacé {v} o más en Normal o más difícil.': 'Score {v} or more on Normal or harder.',
    'Arrancamos': 'Here We Go', 'Jugá tu primera partida.': 'Play your first game.',
    'Jugá a todos los juegos al menos una vez.': 'Play every game at least once.',
    'Jugá 50 partidas.': 'Play 50 games.', 'No paro más': "Can't Stop", 'Jugá 300 partidas.': 'Play 300 games.',
    'Nivel 10': 'Level 10', 'Llegá al nivel 10.': 'Reach level 10.', 'Nivel 25': 'Level 25', 'Llegá al nivel 25.': 'Reach level 25.',
    'Pacto con el diablo': 'Deal with the Devil', 'Terminá una partida en Extremo.': 'Finish a game on Extreme.',
    'Sin miedo': 'Fearless', 'Jugá en Extremo en 5 juegos distintos.': 'Play Extreme in 5 different games.',
    'Iluminado': 'Enlightened', 'Terminá una partida en Maestro.': 'Finish a game on Master.',
    'Jugá en Maestro en 3 juegos distintos.': 'Play Master in 3 different games.',
    'Coleccionista': 'Collector', 'Conseguí 10 logros.': 'Earn 10 achievements.',
    'Leyenda viva': 'True Legend', 'Conseguí una medalla de diamante en cualquier juego.': 'Earn a diamond medal in any game.',
    'Primer sprint': 'First Sprint', 'Sprint 100 en menos de 20 s.': 'Sprint 100 in under 20 s.',
    'Dedos rápidos': 'Quick Fingers', 'Sprint 100 en menos de 14 s.': 'Sprint 100 in under 14 s.',
    'Velocista': 'Sprinter', 'Sprint 100 en menos de 12 s.': 'Sprint 100 in under 12 s.',
    'Dedos de rayo': 'Lightning Fingers', 'Sprint 100 en menos de 11 s. Muy pocos llegan.': 'Sprint 100 in under 11 s. Very few make it.',
    'Inhumano': 'Inhuman', 'Sprint 100 en menos de 10.5 s.': 'Sprint 100 in under 10.5 s.',
    'Sin un error': 'Flawless', 'Sprint 100 sin equivocarte ni una vez.': 'Sprint 100 without a single mistake.',
    'Medio minuto': 'Half a Minute', 'Más de 200 escalones en 30 segundos.': 'Over 200 steps in 30 seconds.',
    'Llegá al espacio en Libre (escalón 330).': 'Reach space in Endless (step 330).',
    'Peloteo eterno': 'Endless Rally', 'Hacé un rally de 30 golpes en la Paleta.': 'Hit a 30-shot rally in Paddle.',
    'Diez por segundo': 'Ten per Second', 'Sostené 10 toques por segundo en la Pulseada.': 'Keep up 10 taps per second in Arm Wrestling.',
    'Escalera del infierno': 'Stairway to Hell', 'Sprint 100 en Extremo en menos de 15 s.': 'Sprint 100 on Extreme in under 15 s.',
    'Pies calientes': 'Hot Feet', 'Escapá de la lava por 150 escalones.': 'Escape the lava for 150 steps.',
    'Volcanólogo': 'Volcanologist', 'Escapá de la lava por 300 escalones.': 'Escape the lava for 300 steps.',
    'Tres al hilo': 'Three in a Row', 'Jugá el desafío del día 3 días seguidos.': 'Play the daily challenge 3 days in a row.',
    'Siete de siete': 'Seven for Seven', 'Jugá el desafío del día 7 días seguidos.': 'Play the daily challenge 7 days in a row.',
    'Combinación secreta': 'Secret Combo', 'Encontraste la combinación de los botones.': 'You found the button combination.',
    'Renacer': 'Reborn', 'Escapaste de la lava por 450 escalones.': 'You escaped the lava for 450 steps.',
    'Hora espejo': 'Mirror Time', 'Terminaste una partida a una hora capicúa, como las 12:21.': 'You finished a game at a palindrome time, like 12:21.',
    'Cosquillas': 'Tickles', 'Le hiciste cosquillas a tu personaje.': 'You tickled your character.',
    'Maestro de todo': 'Master of All', 'Jugaste todos los juegos en Maestro.': 'You played every game on Master.',
    // avisos de nivel, logros y códigos
    'Nivel {n}': 'Level {n}', 'Desbloqueaste: {x}': 'Unlocked: {x}', 'Desbloqueaste {x}': 'Unlocked {x}', ' y ': ' and ',
    // rarezas de los títulos, rangos de los logros, maestría y vitrina
    'Común': 'Common', 'Raro': 'Rare', 'Épico': 'Epic', 'Legendario': 'Legendary', 'Mítico': 'Mythic',
    'Título común': 'Common title', 'Título raro': 'Rare title', 'Título épico': 'Epic title', 'Título legendario': 'Legendary title',
    'Título mítico': 'Mythic title', 'Secreto': 'Secret', 'Legendaria': 'Legendary',
    'Maestría': 'Mastery', 'Maestría {n} en {j} · {r}': 'Mastery {n} in {j} · {r}', 'Aprendiz': 'Apprentice', 'Hábil': 'Skilled',
    'Más jugados': 'Most played', 'maestría · partidas · tiempo': 'mastery · games · time',
    'Vitrina': 'Showcase', 'Elegir': 'Choose', 'tus más difíciles · elegí cuáles mostrar': 'your hardest · choose which to show',
    'sus más difíciles': 'their hardest', 'Cuando consigas logros, elegí hasta 3 para mostrar acá.': 'Once you earn achievements, pick up to 3 to show here.',
    'Elegir logros para la vitrina': 'Choose achievements for the showcase', 'Elegí uno': 'Pick one',
    'Marcá hasta {n} · {k} de {n}': 'Pick up to {n} · {k} of {n}', 'Logros para la vitrina': 'Achievements for the showcase',
    'Ya elegiste {n}: sacá uno para poner otro.': "You've picked {n}: remove one to add another.",
    'Logro bronce': 'Bronze achievement', 'Logro plata': 'Silver achievement', 'Logro oro': 'Gold achievement',
    'Logro diamante': 'Diamond achievement',
    'Personaje legendario desbloqueado': 'Legendary character unlocked', 'Efecto legendario desbloqueado': 'Legendary effect unlocked',
    'Escribí un código.': 'Enter a code.', 'No se pudo revisar el código en este navegador.': "Couldn't check the code in this browser.",
    'Ese código no existe.': "That code doesn't exist.",
    // desafío del día
    'Desafío del día': 'Daily challenge', 'Ranking del día': 'Daily leaderboard', 'Jugar el desafío': 'Play the challenge',
    'El desafío de hoy es en <b>{j}</b>. Esta partida es normal.': "Today's challenge is in <b>{j}</b>. This is a regular game.",
    'Intento {n} de {m} · tu mejor de hoy: <strong>{v}</strong>': 'Attempt {n} of {m} · your best today: <strong>{v}</strong>',
    ' (¡mejoraste!)': ' (improved!)', ' · <strong>+{n} XP</strong> por jugarlo': ' · <strong>+{n} XP</strong> for playing',
    ' · mañana hay otro (en {t})': ' · new one tomorrow (in {t})',
    '{f} · Normal · el mismo nivel para todos · {n} intentos': '{f} · Normal · same level for everyone · {n} attempts',
    '{f} · Normal · el mismo nivel para todos · te queda 1 intento': '{f} · Normal · same level for everyone · 1 attempt left',
    '{f} · Normal · el mismo nivel para todos · te quedan {n} intentos': '{f} · Normal · same level for everyone · {n} attempts left',
    'Ya usaste los {n} intentos de hoy. Mañana hay otro (en {t}).': "You've used all {n} attempts for today. New one tomorrow (in {t}).",
    ' · tu mejor: <strong>{v}</strong>': ' · your best: <strong>{v}</strong>',
    '🔥 {n} día': '🔥 {n} day', '🔥 {n} días seguidos': '🔥 {n} days in a row',
    'Intento {n} de {m}': 'Attempt {n} of {m}', 'Seguir en modo normal': 'Keep playing normal mode',
    // temporadas, eventos de XP y misiones
    // (los patrones se prueban en orden: el más específico va primero)
    'Neón': 'Neon', 'Hielo': 'Ice', 'Selva': 'Jungle', 'Temporada {t}: nivel {n}': 'Season {t}: level {n}', 'Temporada {n}': 'Season {n}',
    'Luces, visores y brillo de ciudad de noche.': 'Lights, visors and the glow of the city at night.',
    'Copos, gorritos y un frío que quema.': 'Snowflakes, beanies and a biting cold.',
    'Hojas, capas de aventurero y un rey de la selva.': 'Leaves, adventurer capes and a king of the jungle.',
    'Doble XP en tus próximas {n} partidas': 'Double XP for your next {n} games',
    'Arranque de temporada': 'Season kickoff', 'Hora feliz': 'Happy hour', 'Finde de XP': 'XP weekend',
    'Doble XP (te quedan {n})': 'Double XP ({n} left)', 'Misión cumplida': 'Mission complete',
    'Jugá 5 partidas': 'Play 5 games', 'Jugá 3 partidas de {j}': 'Play 3 games of {j}', 'Ganá 300 XP': 'Earn 300 XP',
    'Jugá el desafío del día': 'Play the daily challenge', 'Jugá 2 partidas en Difícil o más': 'Play 2 games on Hard or above',
    'Jugá 3 juegos distintos': 'Play 3 different games', 'Superá un récord tuyo': 'Beat one of your records',
    'Hacé {v} en {j} (Normal o más)': 'Score {v} in {j} (Normal or above)',
    'Jugá 30 partidas': 'Play 30 games', 'Ganá 2.500 XP': 'Earn 2,500 XP', 'Jugá el desafío 5 días': 'Play the challenge on 5 days',
    'Jugá a todos los juegos': 'Play every game', 'Superá 3 récords tuyos': 'Beat 3 of your records',
    'Jugá 10 partidas en Difícil o más': 'Play 10 games on Hard or above',
    'Trajimos tu progreso': 'Your progress is back',
    // apodo, clave y amigos (mensajes de error)
    'Necesitás internet para esto.': 'You need internet for this.',
    'No se pudo guardar el apodo. Probá de nuevo en un rato.': "Couldn't save your nickname. Try again in a bit.",
    '«{a}» ya es de otra persona. Elegí otro, o si es tuyo, entrá con tu clave.': '"{a}" is already taken. Pick another one, or if it\'s yours, sign in with your key.',
    'El apodo tiene que tener entre 3 y 14 letras o números.': 'Your nickname must be 3 to 14 letters or numbers.',
    'Escribí tu apodo y tu clave.': 'Enter your nickname and your key.',
    'No se pudo conectar. Probá de nuevo en un rato.': "Couldn't connect. Try again in a bit.",
    'El apodo y la clave no coinciden.': "The nickname and key don't match.",
    'El código de amigo tiene 6 letras y números.': 'Friend codes have 6 letters and numbers.',
    'Para agregar amigos primero elegí un apodo en cualquier ranking.': 'To add friends, first pick a nickname in any leaderboard.',
    'Ese es tu propio código. Pasáselo a tus amigos.': "That's your own code. Share it with your friends.",
    'Ya es tu amigo.': "You're already friends.",
    'Ya le mandaste una solicitud. Falta que la acepte.': 'You already sent a request. Waiting for them to accept.',
    'Los amigos se están actualizando. Probá de nuevo en un rato.': 'Friends are being updated. Try again in a bit.',
    'No hay nadie con ese código.': 'No one has that code.',
    'Mandaste muchas solicitudes seguidas. Esperá un rato.': 'You sent too many requests in a row. Wait a bit.',
    'Tu apodo todavía no se subió. Probá de nuevo en unos segundos.': "Your nickname hasn't been uploaded yet. Try again in a few seconds.",
    'No se pudo mandar la solicitud.': "Couldn't send the request.",
    // ventana de ranking
    'Ranking': 'Leaderboard', 'Cerrar': 'Close', 'Quiénes': 'Who', 'Todos': 'Everyone', 'Amigos': 'Friends', 'Modo': 'Mode',
    'Tu apodo (3 a 14 letras)': 'Your nickname (3–14 letters)', 'Tu apodo': 'Your nickname', 'Guardar': 'Save', 'Clave': 'Key',
    'Tu clave': 'Your key', 'Entrar': 'Sign in', 'Jugás como': 'Playing as', 'Cambiar apodo': 'Change nickname',
    'Ocultar clave': 'Hide key', 'Jugar en otro dispositivo': 'Play on another device',
    'Tu clave es <b class="clave" translate="no"></b>. En el otro celu o compu abrí un ranking, tocá «Ya tengo apodo» y poné tu apodo y esta clave. No se la pases a nadie.':
      'Your key is <b class="clave" translate="no"></b>. On your other phone or computer, open a leaderboard, tap "I have a nickname" and enter your nickname and this key. Don\'t share it with anyone.',
    'Conectate a internet para ver tu clave.': 'Connect to the internet to see your key.',
    'Tu mejor marca de cada modo se sube sola al terminar la partida.': 'Your best score in each mode uploads automatically when the game ends.',
    'Elegir un apodo nuevo': 'Pick a new nickname', 'Ya tengo apodo en otro dispositivo': 'I have a nickname on another device',
    'La clave está en el ranking del dispositivo donde ya tenés tu apodo.': 'Your key is in the leaderboard on the device where you already have your nickname.',
    '«{a}» ya es de otra persona. Si es tuyo, entrá con tu clave; si no, elegí otro.': '"{a}" is already taken. If it\'s yours, sign in with your key; if not, pick another one.',
    'Poné un apodo para aparecer en el ranking. Es solo tuyo y tus récords se suben solos.': 'Pick a nickname to show up on the leaderboard. It\'s yours only and your records upload automatically.',
    'Tu mejor de hoy: <strong>{v}</strong>': 'Your best today: <strong>{v}</strong>', 'Todavía no lo jugaste hoy.': "You haven't played it today.",
    'Tu mejor marca: <strong>{v}</strong>': 'Your best score: <strong>{v}</strong>',
    'El ranking online se está preparando.': 'The online leaderboard is getting ready.',
    'Sin conexión. Tus récords se suben cuando vuelvas a tener internet.': "Offline. Your records will upload when you're back online.",
    'el desafío de hoy': "today's challenge", 'este modo': 'this mode',
    'Ni vos ni tus amigos jugaron {c} todavía.': "Neither you nor your friends have played {c} yet.",
    'Todavía nadie jugó {c}. ¡Sé el primero!': 'Nobody has played {c} yet. Be the first!',
    ' (vos)': ' (you)',
    'No se pudo cargar el ranking. Probá de nuevo en un rato.': "Couldn't load the leaderboard. Try again in a bit.",
    'Guardando…': 'Saving…', 'Revisando…': 'Checking…',
    '¡Listo! Ahora jugás como {a} también en este dispositivo.': "Done! You're now playing as {a} on this device too.",
    // apodo la primera vez
    '¿Cómo te llamás?': "What's your name?", 'Tu nombre en el ranking': 'Your name on the leaderboard',
    'Elegí un apodo y tus récords se suben solos al ranking de cada juego. Es solo tuyo: nadie más lo puede usar.':
      "Pick a nickname and your records will upload to each game's leaderboard automatically. It's yours only: no one else can use it.",
    'Listo': 'Done', 'Ahora no': 'Not now', 'Después lo podés cambiar desde cualquier ranking.': 'You can change it later from any leaderboard.',
    'La clave está en el ranking del dispositivo donde ya tenés tu apodo («Jugar en otro dispositivo»).':
      'Your key is in the leaderboard on the device where you already have your nickname ("Play on another device").',
    '¡Hola, <span translate="no"></span>!': 'Hi, <span translate="no"></span>!', 'Ya estás en el ranking': "You're on the leaderboard",
    // sombras
    'Sombra': 'Ghost', 'Sombra de un amigo': "A friend's ghost",
    'Bajás su mejor partida y corrés contra ella. Solo se ven las de amigos aceptados.': 'Download their best run and race against it. Only accepted friends show up.',
    'Poné un apodo en el Ranking y sumá amigos para correr contra sus sombras.': 'Pick a nickname in the Leaderboard and add friends to race their ghosts.',
    'Todavía no tenés amigos aceptados. Sumalos desde la portada, en Amigos.': "You don't have any accepted friends yet. Add them from the home screen, in Friends.",
    'Bajando la sombra de {a}…': "Downloading {a}'s ghost…", '{a} todavía no tiene sombra en {m}.': "{a} doesn't have a ghost in {m} yet.",
    'No se pudo bajar la sombra. Probá de nuevo.': "Couldn't download the ghost. Try again.",
    'Hasta acá llegaste la otra vez: {v}': 'You got this far last time: {v}',
    '¡Pasaste tu marca!': 'You beat your best!', 'La otra vez llegaste a {v}': 'Last time you reached {v}',
  });

  // ---------- dificultades ----------
  const DIFS = [
    { id: 'facil', nombre: 'Fácil', xp: 1 },
    { id: 'normal', nombre: 'Normal', xp: 1.25 },
    { id: 'dificil', nombre: 'Difícil', xp: 1.5 },
    { id: 'extremo', nombre: 'Extremo', xp: 2 },
    { id: 'maestro', nombre: 'Maestro', xp: 2.5 },
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
    // `antes`: el logro que lo daba antes, de un juego que ya no está (quien lo ganó así lo sigue teniendo).
    { id: 'caja', nombre: 'Cajita', logro: 'ritmo-4', antes: 'clasificador-4', cuerpo: '#dba268', extra: 'caja' },
    { id: 'equilibrista', nombre: 'Equilibrista', logro: 'paleta-4', antes: ['equilibrio-4', 'zigzag-4'], cuerpo: '#c7a6ff', extra: 'equilibrista' },
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
    // nombreEn: en inglés no sale del diccionario porque «Sombra» ahí es la sombra de tu mejor partida (Ghost)
    { id: 'sombra', nombre: 'Sombra', nombreEn: 'Shadow', legendaria: true, codigo: true, cuerpo: '#14152a', ojo: '#c08bff', extra: 'sombra', glow: '#8f6bff', sinCachetes: true,
      pista: 'Se consigue con un código.' },
    { id: 'dev', nombre: 'Dev', legendaria: true, exclusiva: true, codigo: true, cuerpo: '#12142a', ojo: '#5ff5ff', extra: 'dev', glow: '#5ff5ff', sinCachetes: true, sinBoca: true,
      pista: 'Solo la tiene quien hizo el juego.' },
    { id: 'sonrisa', nombre: 'Sonrisa de metal', legendaria: true, exclusiva: true, codigo: true, cuerpo: '#3a3550', extra: 'sonrisa', glow: '#ffb070', sinBoca: true, sinCachetes: true,
      pista: 'Hecha a pedido para un solo jugador.' },
    { id: 'benja', nombre: 'McLovin', legendaria: true, exclusiva: true, codigo: true, cuerpo: '#f4c9a1', extra: 'benja', glow: '#6f8fe8', sinBoca: true,
      pista: 'Hecha a pedido para un solo jugador.' },
    { id: 'fabri', nombre: 'Piloto', legendaria: true, exclusiva: true, codigo: true, cuerpo: '#e8202a', ojo: '#ffffff', extra: 'piloto', glow: '#ff3b3b',
      sinBoca: true, sinCachetes: true, pista: 'Hecha a pedido para un solo jugador.' },
    // Temporadas (ver temporada()): se ganan llegando al nivel `tier` de esa temporada mientras está en curso.
    { id: 'neonrosa', nombre: 'Neón rosa', temporada: 1, tier: 5, cuerpo: '#2a1f4a', ojo: '#ff7ce0', extra: 'neon', color2: '#ff3bd4', sinCachetes: true },
    { id: 'visorcian', nombre: 'Visor cian', temporada: 1, tier: 12, cuerpo: '#3b3f63', extra: 'visor', color2: '#5ff5ff', sinCachetes: true },
    { id: 'neonlima', nombre: 'Neón lima', temporada: 1, tier: 20, cuerpo: '#1b2a1f', ojo: '#c6ff3b', extra: 'neon', color2: '#c6ff3b', sinCachetes: true },
    { id: 'neonrey', nombre: 'Rey Neón', legendaria: true, temporada: 1, tier: 30, cuerpo: '#1a1033', ojo: '#5ff5ff', extra: 'leyendaT',
      color2: '#ff3bd4', color3: '#5ff5ff', glow: '#ff3bd4', sinCachetes: true, pista: 'Nivel 30 de la temporada Neón.' },
    { id: 'gorritoazul', nombre: 'Gorrito', temporada: 2, tier: 5, cuerpo: '#ffd9b3', extra: 'gorrito', color2: '#3f8cff', color3: CREMA },
    { id: 'visorhielo', nombre: 'Visor polar', temporada: 2, tier: 12, cuerpo: '#e8f7ff', extra: 'visor', color2: '#5cb8ff' },
    { id: 'glaciar', nombre: 'Glaciar', temporada: 2, tier: 20, cuerpo: '#bfe6ff', ojo: '#123a66', extra: 'neon', color2: '#ffffff' },
    { id: 'reyhielo', nombre: 'Rey del Hielo', legendaria: true, temporada: 2, tier: 30, cuerpo: '#dff4ff', ojo: '#1d4f7a', extra: 'leyendaT',
      color2: '#7fd8ff', color3: '#ffffff', glow: '#9fe8ff', pista: 'Nivel 30 de la temporada Hielo.' },
    { id: 'aventurero', nombre: 'Aventurero', temporada: 3, tier: 5, cuerpo: '#f6cfa4', extra: 'capa', color2: '#2f9e57' },
    { id: 'safari', nombre: 'Safari', temporada: 3, tier: 12, cuerpo: '#ffad4d', extra: 'gorrito', color2: '#c9a46a', color3: '#7a5a2e' },
    { id: 'heroeselva', nombre: 'Héroe de la selva', temporada: 3, tier: 20, cuerpo: '#7bd36a', extra: 'capa', color2: '#e0203a' },
    { id: 'reyselva', nombre: 'Rey de la Selva', legendaria: true, temporada: 3, tier: 30, cuerpo: '#ffb52e', extra: 'leyendaT',
      color2: '#1fbf6a', color3: '#ffe14d', glow: '#ffcc29', pista: 'Nivel 30 de la temporada Selva.' },
    // la racha del desafío del día
    { id: 'eterno', nombre: 'Llama eterna', legendaria: true, logro: 'racha30', cuerpo: '#ff5d2d', ojo: '#fff3c4', extra: 'leyendaT',
      color2: '#ffad4d', color3: '#ffe14d', glow: '#ff7a3d', pista: 'Jugá el desafío del día 30 días seguidos.' },
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
    '7f0da2349fd57b88ad0f54b7fc15ea2d9b11aa216e5e5d0fb23bd47bc7963cbb': ['benja'],     // exclusiva de benja
    'c7172f65f15346f70813f760fa9e60ed081e629e30727a8dc10cbe1c8108c5ce': ['fabri'],     // exclusiva de fabri
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
    { id: 'huellitas', nombre: 'Huellitas', logro: 'voley-4', antes: 'paseo-4' },
    { id: 'estela', nombre: 'Estela espacial', logro: 'paleta-4', antes: ['cohete-4', 'zigzag-4'] },
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
    // Temporadas y racha: se dibujan con fxTemp a partir de `fx`
    { id: 'neonorbes', nombre: 'Orbes de neón', temporada: 1, tier: 3, fx: { tipo: 'orbes', colores: ['#ff3bd4', '#5ff5ff', '#c6ff3b'] } },
    { id: 'neonpulso', nombre: 'Pulso de neón', temporada: 1, tier: 15, fx: { tipo: 'anillos', colores: ['#5ff5ff', '#ff3bd4'] } },
    { id: 'neonlluvia', nombre: 'Lluvia de neón', temporada: 1, tier: 25, fx: { tipo: 'copos', colores: ['#ff3bd4', '#5ff5ff', '#c6ff3b', '#ffcc29'] } },
    { id: 'copos', nombre: 'Copos', temporada: 2, tier: 3, fx: { tipo: 'copos', colores: ['#ffffff', '#bfe6ff', '#8fd0ff'] } },
    { id: 'escarcha', nombre: 'Escarcha', temporada: 2, tier: 15, fx: { tipo: 'anillos', colores: ['#bfe6ff', '#ffffff'] } },
    { id: 'cristales', nombre: 'Cristales', temporada: 2, tier: 25, fx: { tipo: 'orbes', colores: ['#bfe6ff', '#ffffff', '#7fd8ff'] } },
    { id: 'hojitas', nombre: 'Hojitas', temporada: 3, tier: 3, fx: { tipo: 'copos', colores: ['#2fbf5a', '#7bd36a', '#ffcc29'] } },
    { id: 'luciernagas', nombre: 'Luciérnagas', temporada: 3, tier: 15, fx: { tipo: 'orbes', colores: ['#ffe14d', '#c6ff3b'] } },
    { id: 'flores', nombre: 'Flores', temporada: 3, tier: 25, fx: { tipo: 'anillos', colores: ['#ff6fae', '#ffcc29'] } },
    { id: 'llamitas', nombre: 'Llama de la racha', logro: 'racha7', fx: { tipo: 'llamitas', colores: ['#ff5d2d', '#ffad4d', '#ffe14d'] } },
  ];
  const FX_TEMP = Object.fromEntries(EFECTOS.filter(e => e.fx).map(e => [e.id, e.fx]));

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
    // títulos de temporada
    ...[[1, 1, 'Luz de neón'], [1, 8, 'Rey de la noche'], [1, 18, 'Ciudad de luces'], [1, 30, 'Leyenda de Neón'],
      [2, 1, 'Primera nevada'], [2, 8, 'Corazón de hielo'], [2, 18, 'Sin frío'], [2, 30, 'Leyenda del Hielo'],
      [3, 1, 'Explorador'], [3, 8, 'Instinto salvaje'], [3, 18, 'Pura liana'], [3, 30, 'Leyenda de la Selva']]
      .map(([temporada, tier, nombre]) => ({ id: `s${temporada}-${tier}`, nombre, temporada, tier })),
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
    { id: 'ritmo', nombre: 'Ritmo', archivo: 'ritmo.html', color: '#8f6bff', tablas: tablasDif('mayor', 'num', 'pts') },
    { id: 'voley', nombre: 'Vóley', archivo: 'voley.html', color: '#ff7a59', nuevo: true, tablas: tablasDif('mayor', 'num', 'pts') },
    { id: 'paleta', nombre: 'Paleta', archivo: 'paleta.html', color: '#2ec27e', nuevo: true, tablas: tablasDif('mayor', 'num', 'pts') },
    { id: 'esqui', nombre: 'Esquí', archivo: 'esqui.html', color: '#5b8cff', nuevo: true, tablas: tablasDif('mayor', 'num', 'm') },
    { id: 'pulseada', nombre: 'Pulseada', archivo: 'pulseada.html', color: '#f5b84a', nuevo: true, tablas: tablasDif('mayor', 'num', 'rivales') },
    { id: 'guardia', nombre: 'Guardia', archivo: 'guardia.html', color: '#e2525f', nuevo: true, tablas: tablasDif('mayor', 'num', 'pts') },
    { id: 'esgrima', nombre: 'Esgrima', archivo: 'esgrima.html', color: '#e0566e', nuevo: true, tablas: tablasDif('mayor', 'num', 'rivales') },
    { id: 'pasadizo', nombre: 'Pasadizo', archivo: 'pasadizo.html', color: '#d0609c', nuevo: true, tablas: tablasDif('mayor', 'num', 'm') },
  ];
  const juego = id => JUEGOS.find(j => j.id === id);
  const tablaDe = (j, t) => (juego(j) || { tablas: [] }).tablas.find(x => x.id === t);
  function formato(valor, tb) {
    if (valor == null || !isFinite(valor)) return '—';
    if (tb && tb.formato === 'ms') return (valor / 1000).toFixed(2) + ' s';
    return Math.round(valor).toLocaleString(LOCALE) + (tb && tb.unidad ? ' ' + T(tb.unidad) : '');
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
    ritmo: [5000, 25000, 70000, 160000],
    voley: [5, 12, 20, 32],
    paleta: [4, 10, 18, 30],
    esqui: [250, 1000, 2500, 5000],
    pulseada: [2, 5, 9, 14],
    guardia: [500, 2000, 5000, 10000],
    esgrima: [1, 3, 6, 10],
    pasadizo: [25, 80, 200, 400],
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
    { id: 'paleta-rally', juego: 'paleta', nombre: 'Peloteo eterno', desc: 'Hacé un rally de 30 golpes en la Paleta.', medalla: 'plata',
      prueba: p => !!p.marcas['paleta-rally'] },
    { id: 'guardia-combo', juego: 'guardia', nombre: 'Muralla', desc: 'Hacé un combo de 50 golpes sin errar en Guardia.', medalla: 'plata',
      prueba: p => !!p.marcas['guardia-combo'] },
    { id: 'pulseada-tps10', juego: 'pulseada', nombre: 'Diez por segundo', desc: 'Sostené 10 toques por segundo en la Pulseada.', medalla: 'oro',
      prueba: p => !!p.marcas['tps10'] },
    { id: 'esgrima-racha', juego: 'esgrima', nombre: 'Muñeca de acero', desc: 'Hacé 10 paradas perfectas seguidas en Esgrima.', medalla: 'oro',
      prueba: p => !!p.marcas['esgrima-racha'] },
    { id: 'pasadizo-ciego', juego: 'pasadizo', nombre: 'A ojo', desc: 'Llegá a 100 m en Maestro, sin arco guía, en el Pasadizo.', medalla: 'oro',
      prueba: p => !!p.marcas['pasadizo-ciego'] },
    { id: 'escalador-x', juego: 'escalador', nombre: 'Escalera del infierno', desc: 'Sprint 100 en Extremo en menos de 15 s.', medalla: 'oro',
      prueba: p => mejorTabla(p, 'escalador', 'sprint-x') < 15000 },
    { id: 'escalador-lava', juego: 'escalador', nombre: 'Pies calientes', desc: 'Escapá de la lava por 150 escalones.', medalla: 'bronce',
      prueba: p => lavaMax(p) >= 150 },
    { id: 'escalador-lava2', juego: 'escalador', nombre: 'Volcanólogo', desc: 'Escapá de la lava por 300 escalones.', medalla: 'oro',
      prueba: p => lavaMax(p) >= 300 },
    // Desafío del día: días seguidos jugándolo
    { id: 'racha3', nombre: 'Tres al hilo', desc: 'Jugá el desafío del día 3 días seguidos.', medalla: 'bronce',
      progreso: p => [Math.min(3, +p.diario.mejorRacha || 0), 3] },
    { id: 'racha7', nombre: 'Siete de siete', desc: 'Jugá el desafío del día 7 días seguidos.', medalla: 'oro',
      progreso: p => [Math.min(7, +p.diario.mejorRacha || 0), 7] },
    { id: 'racha30', nombre: 'Llama eterna', desc: 'Jugá el desafío del día 30 días seguidos.', medalla: 'diamante',
      progreso: p => [Math.min(30, +p.diario.mejorRacha || 0), 30] },
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
      id: `${jid}-${k + 1}`, juego: jid, nombre: `${T(j.nombre)}: ${T(NOMBRES_TIER[k])}`, medalla: TIERS[k],
      desc: T('Hacé {v} o más en Normal o más difícil.', { v: formato(v, tb) }),
      prueba: p => (mejorEnJuego(p, jid, true) || 0) >= v,
    }));
  }
  // En inglés, los nombres, descripciones y pistas de personajes, efectos, brillos, medallas y logros quedan traducidos
  // en los datos (así salen bien aunque se concatenen o se dibujen). Los TITULOS, DIFS y JUEGOS no: los títulos se
  // suben al ranking en español y los otros se comparan; esos se traducen al mostrarlos (T() o el observer).
  if (enIngles) {
    for (const x of [...SKINS, ...EFECTOS, ...MARCOS, ...Object.values(MEDALLAS), ...LOGROS]) {
      for (const k of ['nombre', 'desc', 'pista']) if (typeof x[k] === 'string') x[k] = T(x[k]);
      if (x.nombreEn) x.nombre = x.nombreEn;
    }
  }
  const tieneLogro = (p, l) => (l.prueba ? l.prueba(p) : (() => { const [a, b] = l.progreso(p); return a >= b; })());

  // ---------- rarezas, maestrías y vitrina ----------
  // Rareza de cada título según lo difícil que es conseguirlo: los de nivel por el nivel que piden y los de temporada por
  // el escalón del camino. Se ve con color y los más difíciles brillan (legendario) o cambian de color (mítico): en la
  // tarjeta de perfil, en el ranking y en la hoja de Personaje del hub (clases .cc-r y .cc-r-<rareza>, en estilos()).
  const RAREZAS = {
    comun: { nombre: 'Común', color: '#9aa0b5' },
    raro: { nombre: 'Raro', color: '#3f95ff' },
    epico: { nombre: 'Épico', color: '#a066ff' },
    legendario: { nombre: 'Legendario', color: '#ffbf1f' },
    mitico: { nombre: 'Mítico', color: '#ff4f9a' },
  };
  function rarezaTitulo(t) {
    if (!t) return 'comun';
    if (t.temporada) return t.tier >= 30 ? 'legendario' : t.tier >= 18 ? 'epico' : t.tier >= 8 ? 'raro' : 'comun';
    const n = t.nivel || 1;
    return n >= 95 ? 'mitico' : n >= 75 ? 'legendario' : n >= 45 ? 'epico' : n >= 20 ? 'raro' : 'comun';
  }
  // El ranking y el servidor guardan el título como texto, en español: se busca el de ese nombre.
  const tituloPorNombre = nombre => TITULOS.find(t => t.nombre === nombre) || null;
  // Pone un título en un elemento, con el color de su rareza (t = el título, o su nombre en español).
  function pintarTitulo(el, t) {
    const it = typeof t === 'string' ? tituloPorNombre(t) : t, nombre = typeof t === 'string' ? t : t && t.nombre;
    const r = rarezaTitulo(it);
    el.textContent = nombre ? T(nombre) : '';
    el.classList.remove(...Object.keys(RAREZAS).map(k => 'cc-r-' + k));
    if (!nombre) return el;
    el.classList.add('cc-r', 'cc-r-' + r);
    el.title = T('Título ' + RAREZAS[r].nombre.toLowerCase());
    return el;
  }

  // Rango de un logro, para que los difíciles se vean más: el de su medalla, salvo los secretos y los que dan una legendaria.
  const RANGOS_LOGRO = ['bronce', 'plata', 'oro', 'diamante', 'secreto', 'legendaria'];
  function rangoLogro(l) {
    if (!l) return 'bronce';
    if ([...SKINS, ...EFECTOS].some(i => i.legendaria && i.logro === l.id)) return 'legendaria';
    return l.oculto ? 'secreto' : l.medalla;
  }
  const NOMBRE_RANGO = { bronce: 'Bronce', plata: 'Plata', oro: 'Oro', diamante: 'Diamante', secreto: 'Secreto', legendaria: 'Legendaria' };
  const ICONO_RANGO = { bronce: '★', plata: '★', oro: '★', diamante: '◆', secreto: '✦', legendaria: '♛' };
  // La medalla de un logro (HTML), con el color y el brillo de su rango. `clase`: la del lugar donde va (tamaño).
  const medallaLogro = (l, clase = '') => {
    const r = rangoLogro(l);
    return `<span class="cc-med cc-med-${r}${clase ? ' ' + clase : ''}" style="background:${(MEDALLAS[l.medalla] || MEDALLAS.bronce).color}" aria-hidden="true">${ICONO_RANGO[r]}</span>`;
  };
  // Los logros que alguien muestra en su tarjeta de perfil (los que eligió, o si no eligió, sus 3 más difíciles).
  const VITRINA_MAX = 3;
  function vitrinaDe(p) {
    const logros = p && p.logros && typeof p.logros === 'object' ? p.logros : {};
    const tiene = l => !!logros[l.id];
    const elegidos = (Array.isArray(p && p.vitrina) ? p.vitrina : []).map(id => LOGROS.find(l => l.id === id)).filter(l => l && tiene(l));
    if (elegidos.length) return { logros: [...new Set(elegidos)].slice(0, VITRINA_MAX), elegida: true };
    const hechos = LOGROS.filter(tiene).sort((a, b) => RANGOS_LOGRO.indexOf(rangoLogro(b)) - RANGOS_LOGRO.indexOf(rangoLogro(a)) || (+logros[a.id] || 0) - (+logros[b.id] || 0));
    return { logros: hechos.slice(0, VITRINA_MAX), elegida: false };
  }

  // Maestría de cada juego: sube con lo que jugaste a ese juego (10 puntos por partida y 6 por minuto jugado) y un poco
  // con sus logros (20, 40, 80 o 150 según la medalla). Del 1 al 50; para llegar al nivel n hacen falta 40·(n−1)^1,5
  // puntos (el 10 unos 1.080, el 25 unos 4.700, el 50 unos 13.700). 0 si nunca lo jugaste.
  // Se ve en el ranking de cada juego (al lado del apodo) y en la tarjeta de perfil. Para el ranking, la de cada juego se
  // sube con el perfil a la nube (`maestria` en progreso()) y la vista `ranking` la lee de ahí (supabase.sql).
  const MAESTRIA_MAX = 50;
  const puntosMaestria = n => Math.round(40 * Math.pow(Math.max(0, n - 1), 1.5));
  const PUNTOS_MEDALLA = { bronce: 20, plata: 40, oro: 80, diamante: 150 };
  const RANGOS_MAESTRIA = [
    { desde: 1, nombre: 'Aprendiz' }, { desde: 5, nombre: 'Hábil' }, { desde: 15, nombre: 'Experto' },
    { desde: 30, nombre: 'Maestro' }, { desde: 45, nombre: 'Leyenda' },
  ];
  const rangoMaestria = n => Math.max(0, RANGOS_MAESTRIA.filter(r => n >= r.desde).length - 1);
  function maestria(p, jid) {
    const o = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    p = o(p);
    const partidas = Math.max(0, Math.floor(+o(p.partidas)[jid] || 0)), seg = Math.max(0, +o(p.tiempo)[jid] || 0), logros = o(p.logros);
    const extra = LOGROS.reduce((a, l) => a + (l.juego === jid && logros[l.id] ? PUNTOS_MEDALLA[l.medalla] || 0 : 0), 0);
    const puntos = partidas * 10 + Math.floor(seg / 60) * 6 + extra;
    if (!partidas && !seg) return { nivel: 0, puntos: 0, desde: 0, hasta: puntosMaestria(2), rango: 0, max: false };
    let n = 1;
    while (n < MAESTRIA_MAX && puntos >= puntosMaestria(n + 1)) n++;
    return { nivel: n, puntos, desde: puntosMaestria(n), hasta: puntosMaestria(Math.min(MAESTRIA_MAX, n + 1)), rango: rangoMaestria(n), max: n >= MAESTRIA_MAX };
  }
  const maestrias = p => Object.fromEntries(JUEGOS.map(j => [j.id, maestria(p, j.id).nivel]).filter(([, n]) => n > 0));
  // La insignia de maestría (un <span>), para poner al lado de un apodo o de un juego.
  function insigniaMaestria(n, jid) {
    const el = document.createElement('span');
    if (!(n > 0)) { el.hidden = true; return el; }
    n = Math.min(MAESTRIA_MAX, Math.floor(n));
    const r = rangoMaestria(n), j = juego(jid);
    el.className = 'cc-ms cc-ms-' + r;
    el.textContent = n;
    el.title = T('Maestría {n} en {j} · {r}', { n, j: j ? j.nombre : '', r: RANGOS_MAESTRIA[r].nombre });
    el.setAttribute('aria-label', el.title);
    return el;
  }

  // XP para pasar del nivel n al n+1. La curva 2 (noviembre de 2026) es más dura que la primera (80 + 40·(n−1)): el nivel 2
  // pide 100, el 10 unos 690, el 50 unos 4.500 y el 100 unos 11.900 (antes 440, 2.040 y 4.000).
  const xpPara = n => 100 + 60 * (n - 1) + Math.round(0.6 * (n - 1) * (n - 1));
  const xpParaViejo = n => 80 + 40 * (n - 1);
  // Nadie baja de nivel con la curva nueva: la XP guardada con la curva vieja se pasa a la nueva conservando el nivel y lo
  // que tenías hecho del siguiente (en proporción). La marca 'curva2' en `marcas` dice que ya está pasada; va en marcas
  // porque las versiones viejas del juego la conservan y la nube la junta por unión (un campo nuevo lo perderían y la XP
  // se volvería a pasar dos veces).
  function xpCurvaNueva(xp) {
    let n = 1, resto = Math.max(0, +xp || 0), total = 0;
    while (resto >= xpParaViejo(n)) { resto -= xpParaViejo(n); total += xpPara(n); n++; }
    return Math.round(total + resto / xpParaViejo(n) * xpPara(n));
  }
  const conCurva = p => (p && p.marcas && p.marcas.curva2 ? Math.max(0, +p.xp || 0) : xpCurvaNueva(p && p.xp));

  // ---------- perfil guardado ----------
  function leer() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!p || typeof p !== 'object') p = {};
    const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    const gente = v => (Array.isArray(v) ? v.filter(a => a && typeof a.codigo === 'string' && typeof a.huella === 'string').slice(0, 100) : []);
    return {
      xp: conCurva(p),
      skin: typeof p.skin === 'string' ? p.skin : 'clasico',
      efecto: typeof p.efecto === 'string' ? p.efecto : 'ninguno',
      records: obj(p.records),
      mejores: obj(p.mejores),
      partidas: obj(p.partidas),
      tiempo: obj(p.tiempo),   // segundos jugados en cada juego (ver «tiempo jugado»)
      total: +p.total || 0,
      logros: obj(p.logros),
      marcas: { ...obj(p.marcas), curva2: 1 },
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
      // amigos aceptados y solicitudes: copia de lo que tiene el servidor. Sin amigosServidor, `amigos` es la lista vieja
      // de este dispositivo (de cuando agregar era directo) y se sube una vez con migrar_amigos.
      amigos: gente(p.amigos),
      recibidas: gente(p.recibidas),
      enviadas: gente(p.enviadas),
      recibidasVistas: Array.isArray(p.recibidasVistas) ? p.recibidasVistas.filter(c => typeof c === 'string').slice(-100) : [],
      amigosServidor: p.amigosServidor === true,
      pendientes: Array.isArray(p.pendientes) ? p.pendientes.slice(-40) : [],
      // desafío del día: { fecha, juegos: { [juego]: { intentos, mejor, premio } }, racha, ultimo (último día jugado), mejorRacha }
      diario: obj(p.diario),
      // temporadas: { [n]: { xp, cobrado } } · boost: partidas que quedan con doble XP · misiones: progreso del día y la semana
      temporadas: obj(p.temporadas),
      // boost = partidas de doble XP ganadas (boostG) menos las usadas (boostU): dos contadores que solo suben, así al
      // juntar el perfil de dos dispositivos no se regeneran las que ya usaste
      ...(() => {
        const g = Math.max(0, Math.floor(p.boostG != null ? +p.boostG || 0 : +p.boost || 0)), u = Math.max(0, Math.floor(+p.boostU || 0));
        return { boostG: g, boostU: u, boost: Math.max(0, g - u) };
      })(),
      misiones: obj(p.misiones),
      eleccion: +p.eleccion || 0,   // cuándo elegiste personaje, efecto, título o brillo (gana el más nuevo al juntar perfiles)
      // los logros que elegiste mostrar en tu tarjeta de perfil (ids, hasta VITRINA_MAX)
      vitrina: Array.isArray(p.vitrina) ? [...new Set(p.vitrina.filter(s => typeof s === 'string'))].slice(0, VITRINA_MAX) : [],
    };
  }
  let datos = leer();
  // Cada vez que se guarda, el progreso se sube solo a la nube un rato después (ver «progreso en la nube» más abajo).
  const nube = { timer: 0, sincronizando: false, ya: false };
  const guardar = () => { try { localStorage.setItem(KEY, JSON.stringify(datos)); } catch (e) {} programarNube(); };
  // si recién se pasó a la curva nueva, que quede guardado (y se suba) ya
  try { const crudo = JSON.parse(localStorage.getItem(KEY)); if (crudo && !(crudo.marcas && crudo.marcas.curva2)) guardar(); } catch (e) {}
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
  const libre = (item, p = datos) => (item.temporada ? ((p.temporadas[item.temporada] || {}).xp || 0) >= item.tier * TEMP_XP
    : item.codigo ? p.codigos.includes(claveCodigo(item))
    : item.logro ? !!(p.logros[item.logro] || [].concat(item.antes || []).some(a => p.logros[a])) : nivelDe(p.xp).nivel >= (item.nivel || 1));
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
    datos.marco = id; datos.eleccion = Date.now(); guardar();
    return true;
  }
  // Los logros para mostrar en tu tarjeta de perfil (solo los que tenés, hasta VITRINA_MAX; [] = los más difíciles solos).
  function elegirVitrina(ids) {
    datos = leer();
    const ok = [...new Set((Array.isArray(ids) ? ids : []).filter(id => datos.logros[id] && LOGROS.some(l => l.id === id)))].slice(0, VITRINA_MAX);
    datos.vitrina = ok; datos.eleccion = Date.now(); guardar();
    return ok;
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
      mejores: { ...datos.mejores }, partidas: { ...datos.partidas }, tiempo: { ...datos.tiempo }, total: datos.total,
      logros: { ...datos.logros }, extremo: { ...datos.extremo }, maestro: { ...datos.maestro }, marcas: { ...datos.marcas },
      codigos: [...datos.codigos], apodo: datos.apodo, id: datos.id, titulo: titulo(), marco: marco(),
      codigoAmigo: datos.codigoAmigo, amigos: datos.amigos.map(a => ({ ...a })),
      recibidas: datos.recibidas.map(a => ({ ...a })), enviadas: datos.enviadas.map(a => ({ ...a })),
    };
  }
  function elegirSkin(id) {
    datos = leer();
    const s = SKINS.find(k => k.id === id);
    if (!s || !libre(s)) return false;
    datos.skin = id; datos.eleccion = Date.now(); guardar();
    subirPendientes();   // el ranking muestra tu skin actual
    return true;
  }
  // Canjea un código. Devuelve { ok, skin } o { ok: false, msg }.
  async function canjear(texto) {
    const limpio = String(texto || '').toUpperCase().replace(/[\s-]/g, '');
    if (!limpio) return { ok: false, msg: T('Escribí un código.') };
    let hash = '';
    try {
      const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('cubo:' + limpio));
      hash = [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { return { ok: false, msg: T('No se pudo revisar el código en este navegador.') }; }
    const ids = CODIGOS[hash] || [];
    const deCodigo = k => (k.startsWith('fx:') ? EFECTOS.find(e => e.codigo === k) : SKINS.find(x => x.id === k));
    const items = ids.map(deCodigo).filter(Boolean);
    if (!items.length) return { ok: false, msg: T('Ese código no existe.') };
    const sk = items.find(i => SKINS.includes(i)), fx = items.find(i => EFECTOS.includes(i));
    datos = leer();
    const faltan = ids.filter(k => !datos.codigos.includes(k));
    if (!faltan.length) return { ok: true, items, skin: sk, efecto: fx, ya: true };
    datos.codigos.push(...faltan);
    if (sk) datos.skin = sk.id;
    if (fx) datos.efecto = fx.id;
    if (sk || fx) datos.eleccion = Date.now();
    guardar();
    subirPendientes();
    avisar(`<canvas width="96" height="104" style="width:48px;height:52px;flex:none"></canvas><div><b>${exclamar(items.map(i => i.nombre).join(T(' y ')))}</b><span>${T(sk ? 'Personaje legendario desbloqueado' : 'Efecto legendario desbloqueado')}</span></div>`, 4200);
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
    datos.efecto = id; datos.eleccion = Date.now(); guardar();
    return true;
  }
  function elegirTitulo(id) {
    datos = leer();
    const x = TITULOS.find(k => k.id === id);
    if (!x || !libre(x)) return false;
    datos.titulo = id; datos.eleccion = Date.now(); guardar();
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
  // sinMisiones: la XP que dan las misiones no cuenta para la misión de "Ganá X XP"
  function sumarSolo(n, silencioso, sinMisiones) {
    datos = leer();
    n = Math.max(0, Math.round(+n || 0));
    const antes = nivelDe(datos.xp).nivel;
    datos.xp += n;
    const nivT = sumarTemporada(n), cumplidas = sinMisiones || !n ? [] : avanzarMisiones({ xp: n });
    guardar();
    const ahora = nivelDe(datos.xp).nivel;
    const nuevas = porNivel(antes, ahora);
    if (ahora > antes && !silencioso) avisoNivel(ahora, nuevas);
    if (!silencioso) avisoTemporada(nivT);
    premiarMisiones(cumplidas);
    return { ganada: n, nivel: ahora, subio: ahora > antes, desbloqueadas: nuevas.map(s => T(s.nombre)) };
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
    const antes = nivelDe(datos.xp).nivel, xpLogros = ganados.reduce((a, l) => a + MEDALLAS[l.medalla].xp, 0);
    datos.xp += xpLogros;
    const nivT = sumarTemporada(xpLogros);
    guardar();
    for (const l of ganados) avisoLogro(l);
    avisoTemporada(nivT);
    const ahora = nivelDe(datos.xp).nivel;
    if (ahora > antes) avisoNivel(ahora, porNivel(antes, ahora));
    return ganados;
  }

  // XP según qué tan bien jugaste: `malo` da `min`, `experto` da `max` y por encima sigue subiendo un poco.
  // Sirve igual si gana el número más chico (por ejemplo un tiempo): pasá malo > experto.
  // Por debajo de «malo» ya no da el mínimo fijo: baja en proporción hasta 0, así una partida sin puntos no da XP
  // (antes daba 6 y, con Maestro, un evento y doble XP, hasta 96: más que el nivel 2 entero).
  function xpEscala(valor, malo, experto, min = 6, max = 60) {
    valor = +valor;
    if (!(valor > 0)) return 0;
    const f = (valor - malo) / (experto - malo || 1);
    if (f < 0) {
      // más alto es mejor (puntos): en proporción a lo que hiciste; más bajo es mejor (tiempos): cuanto más lento, menos
      const k = experto > malo ? (malo > 0 ? valor / malo : 0) : malo / valor;
      return Math.round(min * Math.max(0, Math.min(1, k)) ** 2);
    }
    return Math.round(min + (max - min) * Math.pow(Math.min(1.35, f), 1.3));
  }

  // ---------- tiempo jugado ----------
  // Sin tocar los juegos: un reloj suma un segundo por cada segundo con la pestaña a la vista en que estás jugando (tocaste
  // una tecla o la pantalla hace menos de 5 s, o tenés una apretada). Así no cuentan los menús quietos, las pausas ni la
  // pestaña oculta. partida() se lleva lo acumulado desde la partida anterior. Si un juego sabe cuánto duró la partida,
  // puede pasar `ms` a CC.partida (gana sobre el reloj), y CC.empezar() pone el reloj en cero al arrancar una.
  const reloj = { s: 0, toque: -1e9, apretados: new Set() };
  {
    const toque = () => { reloj.toque = performance.now(); };
    addEventListener('keydown', e => { toque(); reloj.apretados.add('k' + e.code); }, true);
    addEventListener('keyup', e => reloj.apretados.delete('k' + e.code), true);
    addEventListener('pointerdown', e => { toque(); reloj.apretados.add('p' + e.pointerId); }, true);
    addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') toque(); }, { capture: true, passive: true });
    for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, e => reloj.apretados.delete('p' + e.pointerId), true);
    addEventListener('blur', () => reloj.apretados.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) { reloj.apretados.clear(); reloj.toque = -1e9; } });
    setInterval(() => {
      if (document.hidden) return;
      if (reloj.apretados.size || performance.now() - reloj.toque < 5000) reloj.s = Math.min(reloj.s + 1, 7200);
    }, 1000);
  }
  const empezar = () => { reloj.s = 0; };
  // Segundos de esta partida (como mucho una hora, por si algo raro quedó contando).
  function tiempoDePartida(o) {
    const s = +o.ms > 0 ? +o.ms / 1000 : reloj.s;
    reloj.s = 0;
    return Math.max(0, Math.min(3600, Math.round(s)));
  }
  // "3 h 20 min" / "45 min" / "menos de 1 min"
  function horasTexto(seg) {
    const min = Math.floor((+seg || 0) / 60);
    if (min < 1) return seg > 0 ? 'menos de 1 min' : '0 min';
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60), m = min % 60;
    return h + ' h' + (m && h < 10 ? ' ' + m + ' min' : '');
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
    datos.tiempo[o.juego] = (+datos.tiempo[o.juego] || 0) + tiempoDePartida(o);
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
    const dia = o.diario ? anotarDiario(o, valor) : null;
    if (dia) xp += dia.premio;
    // eventos de XP (hora feliz, finde, arranque de temporada) y las partidas con doble XP que da la temporada
    // No se multiplican entre sí: cuenta el más alto. La partida de doble XP solo se gasta si gana a la del evento.
    let ev = eventoXP();
    const boost = datos.boost > 0 && xp > 0 && (!ev || ev.mult < 2);
    if (boost) { xp *= 2; datos.boostU++; datos.boost--; ev = null; }
    else if (ev && xp > 0) xp = Math.round(xp * ev.mult);
    if (ev || boost) avisar(`<b>⚡ ${[ev && `${ev.nombre}: ${ev.texto}`, boost && T('Doble XP (te quedan {n})', { n: datos.boost })].filter(Boolean).join(' · ')}</b>`, 2600);
    const cumplidas = avanzarMisiones({ partida: { juego: o.juego, dif: dif ? dif.id : null, record, valor, diario: !!dia } });
    guardar();
    const r = sumarSolo(xp);
    const logros = revisarLogros();
    premiarMisiones(cumplidas);
    if (record || (dia && dia.nueva)) subirPendientes();
    return {
      xp: r.ganada + logros.reduce((a, l) => a + MEDALLAS[l.medalla].xp, 0), base, nivel: perfil().nivel, subio: perfil().nivel > nivelAntes,
      record, primera: record && anterior == null, anterior: anterior ?? null,
      logros: logros.map(l => l.nombre), dif: dif ? dif.id : null,
      texto: formato(valor, tb), textoAnterior: anterior != null ? formato(anterior, tb) : null, diario: dia,
      evento: ev ? ev.nombre : null, boost,
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

  // ---------- desafío del día ----------
  // Cada juego tiene su desafío, todos los días: se juega en Normal y con la semilla de la fecha y el juego, así los
  // niveles salen idénticos para todo el mundo. 3 intentos por juego, cuenta el mejor, y cada uno tiene su ranking del
  // día (tabla `d20261104` de ese juego). Jugar al menos un desafío por día arma la racha 🔥. El día cambia a las 00:00
  // UTC: es el mismo en todos lados. Los juegos lo abren con ?diario=1: `diarioDe(juego)` da la semilla, cuenta el
  // intento y dibuja el cartel. Todos los juegos de JUEGOS tienen que llamar a diarioDe (el inicio les pone el botón).
  const DIARIO_INTENTOS = 3;
  const DIARIO_VIEJO = ['escalador', 'lluvia', 'paleta', 'esqui', 'voley', 'ritmo', 'pulseada'];   // la rotación de antes (un juego por día)
  const DIARIO_TABLA = { escalador: 'time' };   // la tabla normal que se juega en el desafío (si no está acá, 'normal')
  const DIA_MS = 864e5;
  const fechaDia = n => new Date(n * DIA_MS).toISOString().slice(0, 10);
  const fechaLinda = f => new Date(f + 'T12:00:00Z').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', timeZone: 'UTC' });
  // Generador con semilla (mulberry32, el mismo de los duelos) y la semilla de cada desafío sacada de la fecha y el juego (FNV-1a).
  function azar(semilla) {
    let a = semilla >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function semillaDe(texto) {
    let h = 0x811c9dc5;
    for (const c of texto) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  // Para probar otro día: ?dia=2026-11-05 en la URL hace de cuenta que hoy es esa fecha (también para la racha).
  function ahoraDiario() {
    try { const f = new URLSearchParams(location.search).get('dia'); if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) return Date.parse(f + 'T12:00:00Z'); } catch (e) {}
    return Date.now();
  }
  // Lo jugado en la fecha f, por juego: { [juego]: { intentos, mejor, premio } }. datos.diario es
  // { fecha, juegos, racha, ultimo (último día jugado), mejorRacha }; el formato de antes (un solo juego por día, con
  // juego/intentos/mejor/premio sueltos) se lee igual. Con crear, d queda en el formato nuevo y en la fecha f.
  function diaDe(d, f, crear) {
    let js = d.fecha === f && d.juegos && typeof d.juegos === 'object' && !Array.isArray(d.juegos) ? d.juegos : null;
    if (!js) {
      js = {};
      if (d.fecha === f && (+d.intentos || d.mejor != null)) {
        const jid = d.juego || DIARIO_VIEJO[Math.floor(Date.parse(f + 'T12:00:00Z') / DIA_MS) % DIARIO_VIEJO.length];
        js[jid] = { intentos: Math.max(0, +d.intentos || 0), mejor: d.mejor != null ? +d.mejor : null, premio: d.premio === f };
      }
    }
    if (crear) {
      for (const k of ['juego', 'intentos', 'mejor', 'premio']) delete d[k];
      d.fecha = f; d.juegos = js;
    }
    return js;
  }
  function infoDiario(jid, n, d) {
    const j = juego(jid);
    if (!j) return null;
    const fecha = fechaDia(n), g = diaDe(d, fecha)[jid] || {}, intentos = Math.min(DIARIO_INTENTOS, Math.max(0, +g.intentos || 0));
    const tabla = DIARIO_TABLA[jid] || 'normal', mejor = g.mejor != null ? +g.mejor : null, quedan = DIARIO_INTENTOS - intentos;
    return {
      fecha, fechaLinda: fechaLinda(fecha), juego: jid, nombre: j.nombre, color: j.color, archivo: j.archivo + '?diario=1',
      tabla, tablaRanking: 'd' + fecha.replace(/-/g, ''), semilla: semillaDe('twofingers:' + fecha + ':' + jid),
      intentos, quedan, maxIntentos: DIARIO_INTENTOS, jugado: intentos > 0, hecho: !quedan,
      mejor, texto: mejor != null ? formato(mejor, tablaDe(jid, tabla)) : null,
      racha: d.ultimo === fecha || d.ultimo === fechaDia(n - 1) ? +d.racha || 0 : 0, jugadoHoy: d.ultimo === fecha,
      mejorRacha: +d.mejorRacha || 0, quedanMs: (n + 1) * DIA_MS - Date.now(),
    };
  }
  // diario(juego): el desafío de hoy de ese juego. diario(): el de todos los juegos juntos (para el inicio), con
  // `juegos` (la lista), `jugados` (con al menos un intento), `hechos` (sin intentos), la racha y cuánto falta.
  function diario(jid, ahora = ahoraDiario()) {
    const n = Math.floor(ahora / DIA_MS), d = leer().diario;
    if (jid) return infoDiario(jid, n, d);
    const juegos = JUEGOS.map(j => infoDiario(j.id, n, d)), r = juegos[0], fecha = fechaDia(n);
    return {
      fecha, fechaLinda: fechaLinda(fecha), juegos, total: juegos.length, maxIntentos: DIARIO_INTENTOS,
      jugados: juegos.filter(x => x.jugado).length, hechos: juegos.filter(x => x.hecho).length,
      racha: r.racha, jugadoHoy: r.jugadoHoy, mejorRacha: r.mejorRacha, quedanMs: r.quedanMs,
    };
  }
  // "5 h" / "40 min": cuánto falta para los próximos desafíos
  function faltaTexto(ms) {
    const min = Math.max(1, Math.ceil(ms / 60000));
    return min >= 60 ? Math.floor(min / 60) + ' h' : min + ' min';
  }
  // Fin de una partida del desafío (lo llama partida): guarda la mejor de hoy de ese juego, la manda a su ranking del
  // día y da el premio de XP la primera vez de cada juego cada día (un poco más con la racha).
  function anotarDiario(o, valor) {
    const f = o.diario.fecha, d = datos.diario;
    if (!f || d.fecha !== f) return null;   // el intento era de otro día
    const g = diaDe(d, f, true)[o.juego];
    if (!g || !g.intentos) return null;
    const nueva = isFinite(valor) && valor > 0 && (g.mejor == null || valor > g.mejor);
    if (nueva) { g.mejor = valor; if (datos.apodo) encolar(o.juego, o.diario.tablaRanking, valor); }
    let premio = 0;
    if (!g.premio) { g.premio = true; premio = 15 + 2 * Math.min(5, Math.max(0, (+d.racha || 1) - 1)); }
    const jugados = Object.values(d.juegos).filter(x => x && +x.intentos > 0).length;
    return { nueva, mejor: g.mejor ?? null, texto: g.mejor != null ? formato(g.mejor, tablaDe(o.juego, o.diario.tabla)) : '—',
      intentos: +g.intentos || 0, quedan: Math.max(0, DIARIO_INTENTOS - (+g.intentos || 0)), racha: +d.racha || 1, premio,
      jugados, total: JUEGOS.length };
  }
  function diarioDe(jid) {
    let pide = false;
    try { pide = new URLSearchParams(location.search).has('diario'); } catch (e) {}
    if (!pide || !juego(jid)) return null;
    const info = diario(jid);
    estilos();
    const carteles = [];
    function cartel(fin) {
      const el = document.createElement('div');
      el.className = 'cc-dia' + (fin ? ' fin' : '');
      el.innerHTML = `<b>📅 ${T('Desafío del día')}</b><span class="txt"></span><span class="racha"></span>` +
        `<button class="cc-dia-rk" type="button">🏆 ${T('Ranking del día')}</button>`;
      el.querySelector('button').addEventListener('click', () => verRanking({ juego: jid, diario: true }));
      carteles.push(el);
      return el;
    }
    function pintar(r) {
      const i = diario(jid);
      for (const el of carteles) {
        const fin = el.classList.contains('fin');
        let t;
        if (fin && r) {
          t = T('Intento {n} de {m} · tu mejor de hoy: <strong>{v}</strong>', { n: r.intentos, m: DIARIO_INTENTOS, v: r.texto }) +
            (r.nueva && r.intentos > 1 ? T(' (¡mejoraste!)') : '');
          if (r.premio) t += T(' · <strong>+{n} XP</strong> por jugarlo', { n: r.premio });
          if (!r.quedan) t += r.jugados < r.total ? T(' · jugaste {n} de {m} desafíos de hoy: los otros te esperan en el inicio', { n: r.jugados, m: r.total })
            : T(' · ¡jugaste los {m} desafíos de hoy! Mañana hay otros (en {t})', { m: r.total, t: faltaTexto(i.quedanMs) });
        } else {
          const base = '{f} · Normal · el mismo nivel para todos · ';
          t = i.quedan ? T(base + (i.quedan === DIARIO_INTENTOS ? '{n} intentos' : i.quedan === 1 ? 'te queda 1 intento' : 'te quedan {n} intentos'),
              { f: i.fechaLinda, n: i.quedan }) + (i.texto ? T(' · tu mejor: <strong>{v}</strong>', { v: i.texto }) : '')
            : T('Ya usaste los {n} intentos de hoy en {j}', { n: DIARIO_INTENTOS, j: i.nombre }) + (i.texto ? T(' (tu mejor: <strong>{v}</strong>)', { v: i.texto }) : '')
              + T('. Mañana hay otro (en {t}).', { t: faltaTexto(i.quedanMs) });
        }
        el.querySelector('.txt').innerHTML = t;
        const racha = fin && r ? r.racha : i.racha;
        el.querySelector('.racha').textContent = racha > 0 ? T(racha === 1 ? '🔥 {n} día' : '🔥 {n} días seguidos', { n: racha }) : '';
      }
    }
    // el texto del botón "Otra vez" (cada juego lo arma distinto)
    function textoBoton(btn, t) {
      const n = btn && (btn.querySelector('#againT') || [...btn.childNodes].find(x => x.nodeType === 3 && x.textContent.trim()));
      if (n) n.textContent = t;
    }
    return {
      ...info,
      azar: () => azar(info.semilla),
      // Al empezar cada partida: cuenta el intento (y la racha). false = no quedan intentos o ya cambió el día.
      empezar() {
        datos = leer();
        const n = Math.floor(ahoraDiario() / DIA_MS);
        if (fechaDia(n) !== info.fecha) return false;
        const d = datos.diario, js = diaDe(d, info.fecha, true), g = js[jid] = js[jid] || { intentos: 0, mejor: null };
        if ((+g.intentos || 0) >= DIARIO_INTENTOS) return false;
        if (d.ultimo !== info.fecha) {
          d.racha = d.ultimo === fechaDia(n - 1) ? (+d.racha || 0) + 1 : 1;
          d.ultimo = info.fecha; d.mejorRacha = Math.max(+d.mejorRacha || 0, d.racha);
        }
        g.intentos = (+g.intentos || 0) + 1;
        guardar();
        pintar();
        return true;
      },
      // Sin intentos: se sigue jugando el mismo juego, pero normal.
      normal() { location.replace(location.pathname); },
      quedan: () => diario(jid).quedan,
      // En el menú: el cartel en lugar del selector de dificultad (y de los modos, si hay). Con alJugar, el cartel trae
      // su propio botón Jugar (para menús donde se juega tocando un modo).
      menu(el, ocultar = [], alJugar) {
        if (!el) return;
        const c = cartel(false);
        if (alJugar) {
          const j = document.createElement('button');
          j.type = 'button'; j.className = 'cc-dia-jugar'; j.textContent = '▶ ' + T('Jugar el desafío');
          j.addEventListener('click', alJugar);
          c.appendChild(j);
        }
        el.parentNode.insertBefore(c, el);
        for (const x of [el, ...ocultar]) if (x) x.hidden = true;
        pintar();
      },
      // En la pantalla de fin: el cartel arriba del botón "Otra vez", con el resultado de partida() (r.diario).
      fin(r, btn, ocultar = []) {
        if (btn && !(btn.previousElementSibling && btn.previousElementSibling.classList.contains('cc-dia'))) btn.parentNode.insertBefore(cartel(true), btn);
        for (const x of ocultar) if (x) x.hidden = true;
        pintar(r && r.diario);
        const q = diario(jid).quedan;
        textoBoton(btn, q ? `↻ ${T('Intento {n} de {m}', { n: DIARIO_INTENTOS - q + 1, m: DIARIO_INTENTOS })} ` : `▸ ${T('Seguir en modo normal')} `);
      },
    };
  }

  // ---------- temporadas, misiones y eventos de XP ----------
  // Una temporada dura 6 semanas y tiene su propio camino de 30 niveles (TEMP_XP de XP cada uno). Toda la XP que ganás
  // mientras dura cuenta para la temporada. Sus premios (los items con `temporada` y `tier` en SKINS, EFECTOS y TITULOS)
  // se ganan solo mientras está en curso: después quedan para quien los tiene. El nivel 30 es una legendaria exclusiva.
  // Los niveles sin item dan doble XP en las próximas partidas. Para sumar una temporada: agregala a TEMPORADAS y poné
  // sus premios con `temporada: n` (si no hay, la temporada igual corre, con doble XP en cada nivel).
  const TEMP_INICIO = Date.UTC(2026, 10, 2);   // lunes 2 de noviembre de 2026, 00:00 UTC: arranca la temporada 1
  const TEMP_DIAS = 42, TEMP_NIVELES = 30, TEMP_XP = 250, BOOST_PARTIDAS = 3;
  const TEMPORADAS = [
    { n: 1, nombre: T('Neón'), color: '#ff3bd4', color2: '#5ff5ff', desc: T('Luces, visores y brillo de ciudad de noche.') },
    { n: 2, nombre: T('Hielo'), color: '#5cb8ff', color2: '#e8f7ff', desc: T('Copos, gorritos y un frío que quema.') },
    { n: 3, nombre: T('Selva'), color: '#1fbf6a', color2: '#ffcc29', desc: T('Hojas, capas de aventurero y un rey de la selva.') },
  ];
  function temporadaDe(ahora = Date.now()) {
    const n = Math.max(1, Math.floor((ahora - TEMP_INICIO) / (TEMP_DIAS * DIA_MS)) + 1);
    const def = TEMPORADAS.find(x => x.n === n) || { n, nombre: T('Temporada {n}', { n }), color: '#ffcc29', color2: '#fffaf0', desc: '' };
    const inicio = TEMP_INICIO + (n - 1) * TEMP_DIAS * DIA_MS;
    return { ...def, inicio, fin: inicio + TEMP_DIAS * DIA_MS };
  }
  // Los premios de una temporada, nivel por nivel: items de las listas o, si no hay, doble XP.
  function premiosTemporada(n) {
    const de = (lista, tipo) => lista.filter(i => i.temporada === n).map(it => ({ tipo, it }));
    const todos = [...de(SKINS, 'skin'), ...de(EFECTOS, 'efecto'), ...de(TITULOS, 'titulo')];
    return Array.from({ length: TEMP_NIVELES }, (_, k) => {
      const items = todos.filter(x => x.it.tier === k + 1);
      return { nivel: k + 1, items, boost: !items.length };
    });
  }
  function temporada() {
    const T = temporadaDe(), st = leer().temporadas[T.n] || {};
    const xp = Math.max(0, +st.xp || 0), nivel = Math.min(TEMP_NIVELES, Math.floor(xp / TEMP_XP));
    return { ...T, xp, nivel, max: TEMP_NIVELES, enNivel: nivel >= TEMP_NIVELES ? TEMP_XP : xp - nivel * TEMP_XP, porNivel: TEMP_XP,
      quedanMs: T.fin - Date.now(), premios: premiosTemporada(T.n).map(p => ({ ...p, listo: nivel >= p.nivel })), boost: leer().boost };
  }
  // XP que entra a la temporada (va adentro de sumarSolo y revisarLogros, con `datos` ya cargado). Devuelve los niveles nuevos.
  function sumarTemporada(n) {
    if (!(n > 0)) return [];
    const T = temporadaDe();
    const st = datos.temporadas[T.n] = { xp: 0, cobrado: 0, ...datos.temporadas[T.n] };
    st.xp = (+st.xp || 0) + n;
    const nivel = Math.min(TEMP_NIVELES, Math.floor(st.xp / TEMP_XP)), nuevos = [];
    const premios = premiosTemporada(T.n);
    for (let k = (+st.cobrado || 0) + 1; k <= nivel; k++) {
      const p = premios[k - 1];
      if (p.boost) { datos.boostG += BOOST_PARTIDAS; datos.boost += BOOST_PARTIDAS; }
      nuevos.push(p);
    }
    st.cobrado = Math.max(+st.cobrado || 0, nivel);
    return nuevos;
  }
  function avisoTemporada(niveles) {
    if (!niveles.length) return;
    const p = niveles[niveles.length - 1], T = temporadaDe();
    // (acá `T` es la temporada: la función de traducir es `tr`)
    const premio = p.items.length ? p.items.map(x => tr(x.it.nombre)).join(' + ') : '⚡ ' + tr('Doble XP en tus próximas {n} partidas', { n: BOOST_PARTIDAS });
    avisar(`<b>🏆 ${tr('Temporada {t}: nivel {n}', { t: T.nombre, n: p.nivel })}</b><br>${premio}`, 3600);
  }

  // Eventos de XP: el arranque de cada temporada (3 días), la hora feliz (de 20 a 21, hora tuya) y los fines de semana.
  function eventoXP(ahora = Date.now()) {
    const T = temporadaDe(ahora), d = new Date(ahora), evs = [];
    if (ahora - T.inicio < 3 * DIA_MS) evs.push({ mult: 2, nombre: tr('Arranque de temporada'), hasta: T.inicio + 3 * DIA_MS });
    if (d.getHours() === 20) { const h = new Date(d); h.setHours(21, 0, 0, 0); evs.push({ mult: 2, nombre: tr('Hora feliz'), hasta: +h }); }
    if (d.getDay() === 0 || d.getDay() === 6) {
      const h = new Date(d); h.setHours(24, 0, 0, 0); if (d.getDay() === 6) h.setDate(h.getDate() + 1);
      evs.push({ mult: 1.5, nombre: tr('Finde de XP'), hasta: +h });
    }
    if (!evs.length) return null;
    const e = evs.sort((a, b) => b.mult - a.mult)[0];
    return { ...e, quedanMs: e.hasta - ahora, texto: `×${coma(e.mult)} XP` };
  }

  // Misiones: 3 del día y 3 de la semana, iguales para todos (salen de la fecha). Se cumplen solas jugando y dan XP.
  const MIS_DIA = [
    { id: 'partidas', txt: 'Jugá 5 partidas', meta: 5, xp: 100 },
    { id: 'juego', txt: 'Jugá 3 partidas de {j}', meta: 3, xp: 100 },
    { id: 'xp', txt: 'Ganá 300 XP', meta: 300, xp: 120 },
    { id: 'diario', txt: 'Jugá el desafío del día', meta: 1, xp: 120 },
    { id: 'dificil', txt: 'Jugá 2 partidas en Difícil o más', meta: 2, xp: 150 },
    { id: 'distintos', txt: 'Jugá 3 juegos distintos', meta: 3, xp: 120 },
    { id: 'record', txt: 'Superá un récord tuyo', meta: 1, xp: 150 },
    { id: 'marca', txt: 'Hacé {v} en {j} (Normal o más)', meta: 1, xp: 150 },
  ];
  const MIS_SEMANA = [
    { id: 'partidas', txt: 'Jugá 30 partidas', meta: 30, xp: 400 },
    { id: 'xp', txt: 'Ganá 2.500 XP', meta: 2500, xp: 500 },
    { id: 'diario', txt: 'Jugá el desafío 5 días', meta: 5, xp: 600 },
    { id: 'distintos', txt: 'Jugá a todos los juegos', meta: 0, xp: 500 },
    { id: 'record', txt: 'Superá 3 récords tuyos', meta: 3, xp: 500 },
    { id: 'dificil', txt: 'Jugá 10 partidas en Difícil o más', meta: 10, xp: 500 },
  ];
  const DIFICILES = ['dificil', 'extremo', 'maestro'];
  function armarMisiones(pool, clave, cuantas) {
    const r = azar(semillaDe('misiones:' + clave)), lista = pool.slice(), out = [];
    while (out.length < cuantas && lista.length) out.push(lista.splice(Math.floor(r() * lista.length), 1)[0]);
    return out.map((m, k) => {
      const x = { ...m, clave: clave + ':' + k + ':' + m.id, txt: T(m.txt) };
      if (m.id === 'juego' || m.id === 'marca') {
        const opciones = m.id === 'marca' ? JUEGOS.filter(j => UMBRALES[j.id]) : JUEGOS;
        const j = opciones[Math.floor(r() * opciones.length)];
        x.juego = j.id;
        if (m.id === 'marca') x.valor = UMBRALES[j.id][0];
        x.txt = T(m.txt, { j: j.nombre, v: m.id === 'marca' ? formato(x.valor, j.tablas[1]) : '' });
      }
      if (m.id === 'distintos' && !m.meta) x.meta = JUEGOS.length;
      return x;
    });
  }
  function claves(ahora = Date.now()) {
    const n = Math.floor(ahora / DIA_MS), semana = Math.floor((n + 3) / 7);   // las semanas empiezan el lunes
    return { dia: fechaDia(n), semana: 's' + semana, finDia: (n + 1) * DIA_MS, finSemana: ((semana + 1) * 7 - 3) * DIA_MS };
  }
  function misiones() {
    const c = claves(), m = leer().misiones;
    const prog = (x, guardado) => { const v = guardado && guardado[x.clave]; return Array.isArray(v) ? v.length : +v || 0; };
    const ver = (lista, g) => lista.map(x => ({ ...x, prog: Math.min(x.meta, prog(x, g)), hecha: !!(g && g['ok:' + x.clave]) }));
    return {
      diarias: ver(armarMisiones(MIS_DIA, c.dia, 3), m.dia === c.dia ? m.d : null),
      semanales: ver(armarMisiones(MIS_SEMANA, c.semana, 3), m.semana === c.semana ? m.s : null),
      quedanDia: c.finDia - Date.now(), quedanSemana: c.finSemana - Date.now(),
    };
  }
  // Suma a las misiones lo que pasó (con `datos` ya cargado). ev: { partida: {juego, dif, record, valor, diario} } o { xp }.
  // Devuelve las que se cumplieron recién (la XP la da quien llama, después de guardar).
  function avanzarMisiones(ev) {
    const c = claves(), m = datos.misiones = { ...datos.misiones };
    if (m.dia !== c.dia) { m.dia = c.dia; m.d = {}; }
    if (m.semana !== c.semana) { m.semana = c.semana; m.s = {}; }
    const cumplidas = [];
    const mover = (lista, g) => {
      for (const x of lista) {
        if (g['ok:' + x.clave]) continue;
        const p = ev.partida;
        let suma = 0;
        if (ev.xp) { if (x.id === 'xp') suma = ev.xp; }
        else if (p) {
          if (x.id === 'partidas') suma = 1;
          else if (x.id === 'juego' && p.juego === x.juego) suma = 1;
          else if (x.id === 'dificil' && DIFICILES.includes(p.dif)) suma = 1;
          else if (x.id === 'record' && p.record) suma = 1;
          else if (x.id === 'marca' && p.juego === x.juego && p.dif && p.dif !== 'facil' && p.valor >= x.valor) suma = 1;
          else if (x.id === 'diario' && p.diario) {
            // la del día: con una partida alcanza; la de la semana cuenta días distintos
            if (x.meta === 1) suma = 1;
            else { const dias = Array.isArray(g[x.clave]) ? g[x.clave] : []; if (!dias.includes(c.dia)) g[x.clave] = [...dias, c.dia]; }
          } else if (x.id === 'distintos') {
            const js = Array.isArray(g[x.clave]) ? g[x.clave] : [];
            if (!js.includes(p.juego)) g[x.clave] = [...js, p.juego];
          }
        }
        if (suma) g[x.clave] = (+g[x.clave] || 0) + suma;
        const v = g[x.clave], hecho = Array.isArray(v) ? v.length : +v || 0;
        if (hecho >= x.meta) { g['ok:' + x.clave] = 1; cumplidas.push(x); }
      }
    };
    mover(armarMisiones(MIS_DIA, c.dia, 3), m.d = { ...m.d });
    mover(armarMisiones(MIS_SEMANA, c.semana, 3), m.s = { ...m.s });
    return cumplidas;
  }
  function premiarMisiones(cumplidas) {
    if (!cumplidas.length) return 0;
    const xp = cumplidas.reduce((a, x) => a + x.xp, 0);
    for (const x of cumplidas) avisar(`<b>🎯 ${T('Misión cumplida')}</b><br>${x.txt} · +${x.xp} XP`, 3200);
    sumarSolo(xp, false, true);
    return xp;
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
  // Top de una tabla: [{ apodo, valor, skin, titulo, maestria, yo }] más tu puesto si no estás en la lista.
  let rankingSinMaestria = false;
  async function top(jid, tid, n = 50, o = {}) {
    const tb = tablaDe(jid, tid);
    const orden = tb && tb.orden === 'menor' ? 'asc' : 'desc';
    const t = encodeURIComponent(jid + ':' + tid);
    const mia = await huella();
    // solo amigos: vos y los que agregaste
    const filtro = o.amigos ? `&huella=in.(${[mia, ...leer().amigos.map(a => a.huella)].filter(Boolean).join(',')})` : '';
    // la maestría de cada uno viene en la vista desde «Parte: maestrías y vitrina» de supabase.sql; sin esa parte, la
    // columna no existe (error 400) y se pide sin ella: solo se ve la tuya
    const pedir = conM => api(`ranking?tabla=eq.${t}${filtro}&select=apodo,valor,skin,huella,titulo${conM ? ',maestria' : ''}&order=valor.${orden},creado.asc&limit=${n}`);
    let filas;
    if (rankingSinMaestria) filas = await pedir(false);
    else try { filas = await pedir(true); } catch (e) { if (!/ 400$/.test(e.message)) throw e; rankingSinMaestria = true; filas = await pedir(false); }
    const miMaestria = maestria(leer(), jid).nivel;
    const lista = filas.map((f, k) => {
      const yo = !!mia && f.huella === mia;
      return { puesto: k + 1, apodo: f.apodo, valor: +f.valor, skin: f.skin, titulo: f.titulo || '', huella: f.huella, yo, maestria: yo ? miMaestria : Math.max(0, +f.maestria || 0) };
    });
    let yo = lista.find(f => f.yo) || null;
    const mio = o.mio !== undefined ? o.mio : leer().mejores[jid + ':' + tid];
    if (!yo && !o.amigos && mio != null && leer().apodo) {
      try {
        const op = orden === 'asc' ? 'lt' : 'gt';
        const r = await fetch(RANKING.url.replace(/\/$/, '') + `/rest/v1/ranking?tabla=eq.${t}&valor=${op}.${mio}&select=huella`, {
          method: 'HEAD', headers: { apikey: RANKING.clave, Prefer: 'count=exact' },
        });
        const total = +(r.headers.get('content-range') || '').split('/')[1];
        if (isFinite(total)) yo = { puesto: total + 1, apodo: leer().apodo, valor: mio, skin: skin().id, titulo: titulo().nombre, huella: mia, yo: true, afuera: true, maestria: miMaestria };
      } catch (e) {}
    }
    return { lista, yo };
  }
  function limpiarApodo(s) {
    return String(s || '').normalize('NFC').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  }
  const sinRed = () => (!rankingActivo() || navigator.onLine === false ? { ok: false, msg: T('Necesitás internet para esto.') } : null);
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
      catch (e) { return { ok: false, msg: T('No se pudo guardar el apodo. Probá de nuevo en un rato.') }; }
      if (r && r.estado === 'ocupado') return { ok: false, msg: Tlit('«{a}» ya es de otra persona. Elegí otro, o si es tuyo, entrá con tu clave.', { a }) };
      if (!r || r.estado !== 'ok') return { ok: false, msg: T('El apodo tiene que tener entre 3 y 14 letras o números.') };
      datos = leer();
      datos.apodo = a; datos.clave = r.clave; datos.codigoAmigo = r.codigo || ''; datos.skinSubida = firma(); datos.apodoPerdido = '';
      subirTodo();   // al estrenar el apodo se suben todos tus récords
      guardar();
      await subirPendientes();
      sincronizarNube(true);
      refrescarAmigos(true);   // si tenías amigos guardados de antes, ahora se pueden subir
      return { ok: true };
    })();
  }
  // Usar en este dispositivo el apodo que ya tenés en otro, con su clave. Lo de acá se suma a lo tuyo.
  async function vincular(apodo, clave) {
    const a = limpiarApodo(apodo);
    if (a.length < 3 || !String(clave || '').trim()) return { ok: false, msg: T('Escribí tu apodo y tu clave.') };
    const err = sinRed();
    if (err) return err;
    let r;
    try {
      await subiendo; datos = leer();
      r = await api('rpc/vincular_jugador', { method: 'POST', body: JSON.stringify({ p_apodo: a, p_clave: clave, p_viejo: datos.id }) });
    } catch (e) { return { ok: false, msg: T('No se pudo conectar. Probá de nuevo en un rato.') }; }
    if (!r || !r.id) return { ok: false, msg: T('El apodo y la clave no coinciden.') };
    datos = leer();
    datos.id = r.id; datos.apodo = r.apodo; datos.clave = r.clave; datos.skinSubida = ''; datos.codigoAmigo = ''; datos.apodoPerdido = '';
    subirTodo();
    guardar();
    await subirPendientes();
    await sincronizarNube(true);   // trae tu progreso del otro dispositivo y lo junta con el de acá
    refrescarAmigos(true);   // los amigos de tu apodo (el servidor ya juntó los de este dispositivo)
    return { ok: true, apodo: r.apodo };
  }
  const claveLinda = c => (c && c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c);

  // ---------- progreso en la nube ----------
  // El perfil (XP, personajes, logros, récords, temporada, misiones, racha) se guarda también en Supabase, atado a tu id de
  // jugador (tabla `perfiles` de supabase.sql). Solo con apodo. Se sube solo unos segundos después de cada cambio y al
  // abrir el juego; si no hay internet, queda para cuando vuelva. Antes de subir se baja lo que hay en la nube y se junta
  // con lo de acá quedándose con lo mejor de cada lado, así jugar en dos dispositivos (o entrar con tu clave en otro) no
  // pisa nada. Lo que es de cada dispositivo (id, clave, amigos, cola del ranking, lo ya visto) no se sube.
  const NUBE_KEY = 'cubo-nube';   // lo último que se subió, para no subir dos veces lo mismo
  const DE_LA_NUBE = ['xp', 'skin', 'efecto', 'titulo', 'marco', 'eleccion', 'records', 'mejores', 'partidas', 'total', 'logros',
    'marcas', 'extremo', 'maestro', 'codigos', 'diario', 'temporadas', 'boostG', 'boostU', 'misiones', 'tiempo', 'vitrina'];
  // `maestria` (el nivel de maestría de cada juego) no se guarda: sale de lo jugado y viaja para que el ranking la muestre
  const progreso = p => { const o = {}; for (const k of DE_LA_NUBE) o[k] = p[k]; o.maestria = maestrias(p); return o; };
  const objDe = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const maxObj = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(objDe(b))) o[k] = Math.max(+o[k] || 0, +v || 0); return o; };
  // Junta dos perfiles (a = este dispositivo, ya pasado por leer(); b = la nube) quedándose con lo mejor de cada lado.
  function mezclar(a, b) {
    const o = { ...a };
    o.xp = Math.max(a.xp, conCurva(b));   // b puede venir de una versión con la curva vieja
    o.total = Math.max(a.total, +b.total || 0);
    o.partidas = maxObj(a.partidas, b.partidas);
    o.tiempo = maxObj(a.tiempo, b.tiempo);
    o.boostG = Math.max(a.boostG, Math.floor(+b.boostG || 0)); o.boostU = Math.max(a.boostU, Math.floor(+b.boostU || 0));
    o.boost = Math.max(0, o.boostG - o.boostU);
    // logros: la fecha más vieja de cada uno; marcas y "jugado en Extremo/Maestro": la unión
    const lb = objDe(b.logros);
    o.logros = { ...lb, ...a.logros };
    for (const [k, v] of Object.entries(lb)) if (+v && +v < +o.logros[k]) o.logros[k] = v;
    o.marcas = { ...objDe(b.marcas), ...a.marcas }; o.extremo = { ...objDe(b.extremo), ...a.extremo }; o.maestro = { ...objDe(b.maestro), ...a.maestro };
    o.codigos = [...new Set([...a.codigos, ...(Array.isArray(b.codigos) ? b.codigos.filter(c => typeof c === 'string') : [])])];
    // récords: la mejor marca de cada tabla; el texto del récord de cada juego, del lado que tenía la mejor marca
    const rb = objDe(b.records);
    o.mejores = { ...a.mejores }; o.records = { ...rb, ...a.records };
    for (const [k, v] of Object.entries(objDe(b.mejores))) {
      const [jid, tid] = k.split(':'), tb = tablaDe(jid, tid);
      if (isFinite(+v) && +v > 0 && (o.mejores[k] == null || (tb && mejor(tb, +v, o.mejores[k])))) {
        o.mejores[k] = +v;
        if (rb[jid]) o.records[jid] = String(rb[jid]);
      }
    }
    // temporadas: el máximo de XP y de niveles cobrados de cada una
    o.temporadas = { ...a.temporadas };
    for (const [n, t] of Object.entries(objDe(b.temporadas))) {
      const x = o.temporadas[n] || {}, y = objDe(t);
      o.temporadas[n] = { ...x, xp: Math.max(+x.xp || 0, +y.xp || 0), cobrado: Math.max(+x.cobrado || 0, +y.cobrado || 0) };
    }
    // desafío del día: la mejor racha, la racha del último día jugado y, si es el mismo día, lo mejor de los dos en
    // cada juego (los dos lados pasan antes al formato por juego, por si alguno es de antes)
    const da = { ...a.diario }, db = { ...objDe(b.diario) }, d = { ...da };
    d.mejorRacha = Math.max(+da.mejorRacha || 0, +db.mejorRacha || 0);
    if (String(db.ultimo || '') > String(da.ultimo || '')) { d.ultimo = db.ultimo; d.racha = +db.racha || 0; }
    else if (db.ultimo && db.ultimo === da.ultimo) d.racha = Math.max(+da.racha || 0, +db.racha || 0);
    const ja = da.fecha ? diaDe(da, da.fecha) : {}, jb = db.fecha ? diaDe(db, db.fecha) : {};
    for (const k of ['juego', 'intentos', 'mejor', 'premio']) delete d[k];
    if (String(db.fecha || '') > String(da.fecha || '')) { d.fecha = db.fecha; d.juegos = { ...jb }; }
    else {
      d.juegos = { ...ja };
      if (db.fecha && db.fecha === da.fecha) for (const [jid, y] of Object.entries(jb)) {
        const x = d.juegos[jid] || {};
        d.juegos[jid] = {
          intentos: Math.max(+x.intentos || 0, +y.intentos || 0),
          mejor: x.mejor == null ? (y.mejor ?? null) : y.mejor == null ? x.mejor : Math.max(+x.mejor, +y.mejor),
          premio: !!(x.premio || y.premio),
        };
      }
    }
    o.diario = d;
    // misiones: si son del mismo día (o semana), el progreso más alto de cada una y las cumplidas de los dos lados
    const ma = a.misiones, mb = objDe(b.misiones), m = { ...ma };
    const juntarProg = (x, y) => {
      const r = { ...objDe(x) };
      for (const [k, v] of Object.entries(objDe(y))) {
        r[k] = Array.isArray(v) || Array.isArray(r[k]) ? [...new Set([...(Array.isArray(r[k]) ? r[k] : []), ...(Array.isArray(v) ? v : [])])]
          : Math.max(+r[k] || 0, +v || 0);
      }
      return r;
    };
    for (const [clave, prog] of [['dia', 'd'], ['semana', 's']]) {
      if (String(mb[clave] || '') > String(ma[clave] || '')) { m[clave] = mb[clave]; m[prog] = objDe(mb[prog]); }
      else if (mb[clave] && mb[clave] === ma[clave]) m[prog] = juntarProg(ma[prog], mb[prog]);
    }
    o.misiones = m;
    // personaje, efecto, título, brillo y vitrina: los que elegiste más recientemente
    if ((+b.eleccion || 0) > a.eleccion) for (const k of ['skin', 'efecto', 'titulo', 'marco', 'eleccion']) if (typeof b[k] === typeof a[k]) o[k] = b[k];
    if ((+b.eleccion || 0) > a.eleccion && Array.isArray(b.vitrina)) o.vitrina = b.vitrina.filter(s => typeof s === 'string').slice(0, VITRINA_MAX);
    return o;
  }
  function programarNube() {
    if (nube.sincronizando || !datos.apodo) return;
    clearTimeout(nube.timer);
    nube.timer = setTimeout(() => sincronizarNube(), 6000);
  }
  // Baja tu progreso de la nube (la primera vez que se abre la página, o con forzar), lo junta con el de acá y sube el
  // resultado si cambió. Devuelve true si trajo algo nuevo.
  async function sincronizarNube(forzar) {
    clearTimeout(nube.timer);
    datos = leer();
    if (!datos.apodo || !rankingActivo() || navigator.onLine === false) return false;
    if (nube.sincronizando) { nube.timer = setTimeout(() => sincronizarNube(forzar), 3000); return false; }
    nube.sincronizando = true;
    let cambio = false;
    try {
      if (!datos.clave) await subirPendientes();   // el jugador tiene que estar registrado
      datos = leer();
      if (!datos.apodo) return false;
      let subido = null;
      try { subido = localStorage.getItem(NUBE_KEY + ':' + datos.id); } catch (e) {}
      if (forzar || !nube.ya || subido == null) {
        const r = await api('rpc/bajar_perfil', { method: 'POST', body: JSON.stringify({ p_jugador: datos.id }) });
        nube.ya = true;
        datos = leer();
        if (r && typeof r === 'object' && !Array.isArray(r)) {
          const antes = JSON.stringify(progreso(datos)), nivelAntes = nivelDe(datos.xp).nivel;
          const junto = mezclar(datos, r);
          if (JSON.stringify(progreso(junto)) !== antes) {
            datos = junto;
            try { localStorage.setItem(KEY, JSON.stringify(datos)); } catch (e) {}
            cambio = true;
            const n = nivelDe(datos.xp).nivel;
            if (n > nivelAntes) avisar(`<b>☁️ ${T('Trajimos tu progreso')}</b><br>${T('Nivel {n}', { n })}`, 3200);
          }
        }
      }
      const json = JSON.stringify(progreso(datos));
      if (json !== subido) {
        const ok = await api('rpc/subir_perfil', { method: 'POST', body: JSON.stringify({ p_jugador: datos.id, p_datos: progreso(datos) }) });
        if (ok === true) { try { localStorage.setItem(NUBE_KEY + ':' + datos.id, json); } catch (e) {} }
        else nube.timer = setTimeout(() => sincronizarNube(), 8000);   // muy seguido: de nuevo en un rato
      }
    } catch (e) { /* sin conexión o falta el SQL nuevo: queda para la próxima */ }
    finally { nube.sincronizando = false; }
    if (cambio) {
      revisarLogros();   // lo que se juntó puede destrabar algún logro (por ejemplo, Coleccionista)
      if (firma() !== leer().skinSubida) subirPendientes();   // el ranking muestra el personaje que elegiste en el otro
      dispatchEvent(new CustomEvent('cubo-perfil'));
    }
    return cambio;
  }
  addEventListener('online', () => sincronizarNube());
  setTimeout(() => sincronizarNube(), 2000);

  // ---------- amigos ----------
  // Cada jugador con apodo tiene un código de amigo (6 letras). Poner el código de alguien le manda una solicitud:
  // son amigos cuando la acepta (o si los dos se agregaron). Quién es amigo de quién lo guarda el servidor (supabase.sql)
  // y acá queda una copia. Solo los amigos aceptados se retan, tienen versus y salen en el ranking de amigos.
  const limpiarCodigo = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const persona = a => ({ codigo: a.codigo, apodo: a.apodo, huella: a.huella, skin: a.skin, titulo: a.titulo || '' });
  const rpcAmigos = (nombre, cuerpo) => api('rpc/' + nombre, { method: 'POST', body: JSON.stringify({ p_jugador: leer().id, ...cuerpo }) });
  // Le avisa al otro al instante (si tiene el juego abierto) que hay novedades; cubo-duelo.js lo escucha.
  function avisarAmistad(h) {
    if (!h || !rankingActivo()) return;
    fetch(RANKING.url.replace(/\/$/, '') + '/realtime/v1/api/broadcast', {
      method: 'POST', headers: { apikey: RANKING.clave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: 'cubo-j-' + h, event: 'amistad', payload: {} }] }),
    }).catch(() => {});
  }
  function guardarAmistades(r) {
    datos = leer();
    datos.amigos = r.amigos.map(persona); datos.recibidas = (r.recibidas || []).map(persona); datos.enviadas = (r.enviadas || []).map(persona);
    datos.amigosServidor = true;
    guardar();
    dispatchEvent(new CustomEvent('cubo-amigos'));
  }
  // Trae del servidor tus amigos y solicitudes. La primera vez sube los amigos viejos de este dispositivo.
  let refrescando = null, ultimoRefresco = 0;
  function refrescarAmigos(forzar) {
    if (refrescando) return forzar ? refrescando.then(() => refrescarAmigos(true)) : refrescando;
    if (!forzar && Date.now() - ultimoRefresco < 20000) return Promise.resolve(leer().amigos);
    refrescando = (async () => {
      datos = leer();
      if (sinRed() || !datos.apodo) return datos.amigos;
      ultimoRefresco = Date.now();
      try {
        if (!datos.codigoAmigo) await subirPendientes();   // el jugador tiene que estar registrado
        datos = leer();
        const r = datos.amigosServidor ? await rpcAmigos('mis_amigos', {})
          : await rpcAmigos('migrar_amigos', { p_codigos: datos.amigos.map(a => a.codigo) });
        if (r && Array.isArray(r.amigos)) guardarAmistades(r);
      } catch (e) { /* sin conexión o falta el SQL nuevo: queda la copia de este dispositivo */ }
      return leer().amigos;
    })().finally(() => { refrescando = null; });
    return refrescando;
  }
  // Manda una solicitud. Devuelve { ok, estado: 'pendiente' | 'amigos', amigo } o { ok: false, msg }.
  async function agregarAmigo(codigo) {
    const c = limpiarCodigo(codigo);
    if (c.length !== 6) return { ok: false, msg: T('El código de amigo tiene 6 letras y números.') };
    const err = sinRed();
    if (err) return err;
    datos = leer();
    if (!datos.apodo) return { ok: false, msg: T('Para agregar amigos primero elegí un apodo en cualquier ranking.') };
    if (c === datos.codigoAmigo) return { ok: false, msg: T('Ese es tu propio código. Pasáselo a tus amigos.') };
    if (datos.amigosServidor && datos.amigos.some(a => a.codigo === c)) return { ok: false, msg: T('Ya es tu amigo.') };
    if (datos.enviadas.some(a => a.codigo === c)) return { ok: false, msg: T('Ya le mandaste una solicitud. Falta que la acepte.') };
    let r;
    try {
      if (!datos.codigoAmigo) await subirPendientes();
      r = await rpcAmigos('pedir_amistad', { p_codigo: c });
    } catch (e) {
      return { ok: false, msg: T(e.message === 'ranking 404' ? 'Los amigos se están actualizando. Probá de nuevo en un rato.' : 'No se pudo conectar. Probá de nuevo en un rato.') };
    }
    if (!r || r.error || !r.amigo) {
      const msg = { 'no-existe': 'No hay nadie con ese código.', propio: 'Ese es tu propio código. Pasáselo a tus amigos.',
        muchos: 'Mandaste muchas solicitudes seguidas. Esperá un rato.', 'sin-apodo': 'Tu apodo todavía no se subió. Probá de nuevo en unos segundos.' }[r && r.error];
      return { ok: false, msg: msg ? T(msg) : T('No se pudo mandar la solicitud.') };
    }
    avisarAmistad(r.amigo.huella);
    await refrescarAmigos(true);
    return { ok: true, estado: r.estado, amigo: persona(r.amigo) };
  }
  // Aceptar o rechazar una solicitud que te llegó. Devuelve { ok, estado: 'amigos' | 'rechazada' | null } o { ok: false, msg }.
  async function responderSolicitud(codigo, acepto) {
    const err = sinRed();
    if (err) return err;
    const a = leer().recibidas.find(x => x.codigo === codigo);
    let r;
    try { r = await rpcAmigos('responder_amistad', { p_codigo: codigo, p_acepto: !!acepto }); }
    catch (e) { return { ok: false, msg: T('No se pudo conectar. Probá de nuevo en un rato.') }; }
    if (r === 'amigos' && a) avisarAmistad(a.huella);
    await refrescarAmigos(true);
    return { ok: true, estado: r };
  }
  // Dejar de ser amigos, o cancelar una solicitud que mandaste.
  async function quitarAmigo(codigo) {
    datos = leer();
    if (datos.amigosServidor) { const err = sinRed(); if (err) return err; }
    const a = [...datos.amigos, ...datos.enviadas].find(x => x.codigo === codigo);
    datos.amigos = datos.amigos.filter(x => x.codigo !== codigo); datos.enviadas = datos.enviadas.filter(x => x.codigo !== codigo);
    guardar();
    if (!datos.amigosServidor) return { ok: true };   // todavía no se subió: alcanza con sacarlo de acá
    try { await rpcAmigos('quitar_amistad', { p_codigo: codigo }); }
    catch (e) { await refrescarAmigos(true); return { ok: false, msg: T('No se pudo conectar. Probá de nuevo en un rato.') }; }
    if (a) avisarAmistad(a.huella);
    return { ok: true };
  }
  // Solicitudes que te llegaron y todavía no viste (el aviso del botón de Amigos).
  const solicitudesNuevas = () => { const d = leer(); return d.recibidas.filter(a => !d.recibidasVistas.includes(a.codigo)).length; };
  function marcarSolicitudesVistas() { datos = leer(); datos.recibidasVistas = datos.recibidas.map(a => a.codigo); guardar(); }
  // Versus: tu mejor marca contra la de un amigo en cada modo que jugaron los dos.
  async function versus(amigo) {
    if (!leer().amigos.some(a => a.huella === amigo.huella)) throw new Error('no es tu amigo');
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
.cc-marca{position:fixed;left:0;right:0;top:0;height:9px;background:rgba(29,35,64,.4);border-bottom:2.5px solid ${INK};z-index:50;pointer-events:none}
.cc-marca i{position:absolute;left:0;top:0;bottom:0;width:0;background:#fffaf0;border-right:2.5px solid ${INK}}
.cc-marca span{position:absolute;right:2px;top:6px;font-size:19px;line-height:1}
.cc-marca.paso{background:#ffcc29}.cc-marca.paso i{background:#ffcc29}
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
#cc-rank li .n .tt{display:block;padding:2px 0 3px;font-size:10.5px;font-weight:700;line-height:1.1;overflow:hidden;text-overflow:ellipsis}
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
#cc-rank .cc-ap .pie{border-top:0;padding-top:2px}
#cc-rank .cc-ap canvas{display:block;width:66px;height:60px;margin:0 auto 4px}
#cc-rank .cc-ap .intro{margin:0 2px 12px;font-size:14px;font-weight:600;line-height:1.4;text-align:center}
#cc-rank .cc-ap .botones{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
#cc-rank .cc-ap .botones .link{margin:0;font-size:12px}
#cc-rank .cc-ap .botones .no{margin-left:auto}
#cc-rank button:focus-visible{outline:3px solid #ff5d7d;outline-offset:2px}
/* desafío del día: el cartel del menú y de la pantalla de fin */
.cc-dia{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin:0 0 12px;padding:10px 12px;text-align:left;
  background:#fff3c4;color:${INK};border:2.5px solid ${INK};border-radius:16px;box-shadow:0 3px 0 ${INK};font:600 13px/1.35 "Rubik",system-ui,sans-serif}
.cc-dia b{flex:1 1 100%;font:400 19px/1.1 "Lilita One","Trebuchet MS",sans-serif}
.cc-dia .txt{flex:1 1 100%}
.cc-dia .racha{font-weight:800}
.cc-dia .racha:empty{display:none}
.cc-dia button{margin-left:auto;padding:6px 10px;border:2px solid ${INK};border-radius:11px;background:#fff;color:${INK};
  font:800 12.5px "Rubik",system-ui,sans-serif;box-shadow:0 2px 0 ${INK};cursor:pointer}
.cc-dia button:active{transform:translateY(2px);box-shadow:none}
.cc-dia .cc-dia-jugar{flex:1 1 100%;margin:6px 0 0;padding:10px;background:#ffcc29;font:400 20px "Lilita One","Trebuchet MS",sans-serif;box-shadow:0 3px 0 ${INK}}
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
/* rareza de los títulos (pintarTitulo): común gris, raro azul, épico violeta, legendario dorado con brillo, mítico arcoíris.
   Con «Reducir movimiento» (clase cc-quieto) las animaciones se apagan solas y queda el color. */
.cc-r{white-space:nowrap;opacity:1}
.cc-r::before{content:"";display:inline-block;width:.58em;height:.58em;margin:0 .38em 0 .08em;vertical-align:.05em;transform:rotate(45deg);border:1.5px solid ${INK};border-radius:2px;background:var(--rz)}
.cc-r-comun{--rz:#dfe1e9;color:#5f6580}
.cc-r-raro{--rz:#3f95ff;color:#1b63c9}
.cc-r-epico{--rz:#a066ff;color:#6c2bd3}
.cc-r-legendario,.cc-r-mitico{display:inline-block;padding:.14em .62em .16em .5em;border:2px solid ${INK};border-radius:99px;color:${INK};line-height:1.1}
.cc-r-legendario{--rz:#fff;background:linear-gradient(105deg,#ffbf1f 0 36%,#fff8d6 47%,#ffbf1f 58% 100%);background-size:300% 100%;
  animation:cc-brillo 3s ease-in-out infinite;box-shadow:0 0 9px rgba(255,170,0,.6)}
.cc-r-mitico{--rz:#fff;background:linear-gradient(90deg,#ff7ab5,#ffad5c,#ffe066,#6ee0a6,#6cbcff,#b993ff,#ff7ab5);background-size:300% 100%;
  animation:cc-arco 5s linear infinite;box-shadow:0 0 11px rgba(255,79,154,.6)}
.cc-r-mitico::after{content:"✦";margin-left:.32em;font-size:.9em}
.cc-rz{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
.cc-rz-comun{color:#6b7189}.cc-rz-raro{color:#1b63c9}.cc-rz-epico{color:#6c2bd3}.cc-rz-legendario{color:#a86f00}.cc-rz-mitico{color:#d1306f}
.item.titulo .cc-r{white-space:normal}
.item.titulo .cc-r-legendario,.item.titulo .cc-r-mitico{padding-inline:.6em}
.item.titulo .cc-r-legendario::before,.item.titulo .cc-r-mitico::before{display:none}
.item.titulo.lock .cc-r{opacity:.55;animation:none;box-shadow:none}
@keyframes cc-brillo{0%{background-position:100% 0}55%,100%{background-position:0 0}}
@keyframes cc-arco{to{background-position:150% 0}}
/* maestría de un juego (insigniaMaestria): aprendiz, hábil, experto, maestro y leyenda */
.cc-ms{display:inline-flex;align-items:center;justify-content:center;min-width:2.1em;height:1.5em;margin:0 0 0 .4em;padding:0 .4em 0 .3em;vertical-align:.1em;
  border:2px solid ${INK};border-radius:.5em;background:var(--ms);color:${INK};font:400 11px/1 "Lilita One","Trebuchet MS",sans-serif;letter-spacing:.02em;white-space:nowrap}
.cc-ms::before{content:"✦";font-size:.85em;margin-right:.18em;opacity:.7}
.cc-ms-0{--ms:#f3d3b6}
.cc-ms-1{--ms:#e1e8f3}
.cc-ms-2{--ms:#ffcc29;box-shadow:0 0 6px rgba(255,190,30,.55)}
.cc-ms-3{--ms:#8ff0ff;box-shadow:0 0 8px rgba(70,215,255,.75)}
.cc-ms-4{background:linear-gradient(90deg,#ff7ab5,#ffad5c,#ffe066,#6ee0a6,#6cbcff,#b993ff,#ff7ab5);background-size:300% 100%;animation:cc-arco 5s linear infinite;box-shadow:0 0 9px rgba(255,79,154,.6)}
/* logros según su rango (rangoLogro): la medalla (.cc-med) y la fila o tarjeta (.cc-lgr). Oro y diamante con un destello
   que pasa, los secretos violeta y los que dan una legendaria con los colores corriendo. */
.cc-med{position:relative;overflow:hidden}
.cc-med-oro{box-shadow:0 0 0 3px rgba(255,204,41,.45),0 0 12px rgba(255,180,20,.7)}
.cc-med-diamante{box-shadow:0 0 0 3px rgba(127,227,255,.5),0 0 14px rgba(60,210,255,.85)}
.cc-med-oro::after,.cc-med-diamante::after,.cc-med-legendaria::after{content:"";position:absolute;inset:-30%;
  background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.9) 50%,transparent 60%);transform:translateX(-130%);animation:cc-destello 3.4s ease-in-out infinite}
.cc-med-diamante::after{animation-delay:.6s}
.cc-med-secreto{background:#8f6bff!important;color:#fff!important;box-shadow:0 0 0 3px rgba(143,107,255,.4),0 0 14px rgba(143,107,255,.85)}
.cc-med-legendaria{background:conic-gradient(#ff7ab5,#ffe066,#6ee0a6,#6cbcff,#b993ff,#ff7ab5)!important;color:${INK}!important;
  box-shadow:0 0 0 3px rgba(255,122,181,.4),0 0 16px rgba(255,79,154,.75);animation:cc-tono 4s linear infinite}
@keyframes cc-destello{0%,50%{transform:translateX(-130%)}100%{transform:translateX(130%)}}
@keyframes cc-tono{to{filter:hue-rotate(360deg)}}
.cc-lgr-oro{background:linear-gradient(100deg,#fff1bd,#fff 65%)!important}
.cc-lgr-diamante{background:linear-gradient(100deg,#d6f8ff,#fff 65%)!important;box-shadow:0 0 0 2px rgba(127,227,255,.6)}
.cc-lgr-secreto{background:linear-gradient(100deg,#e9ddff,#fff 65%)!important;box-shadow:0 0 0 2px rgba(143,107,255,.45)}
.cc-lgr-legendaria{background:linear-gradient(100deg,#ffd9ec,#fff3c4 40%,#fff 75%)!important;box-shadow:0 0 0 2px rgba(255,122,181,.5),0 0 12px rgba(255,191,31,.45)}
.cc-rango{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
.cc-rango-bronce{color:#a8643a}.cc-rango-plata{color:#6c7891}.cc-rango-oro{color:#b07a00}.cc-rango-diamante{color:#0f8fb3}
.cc-rango-secreto{color:#6c43e0}.cc-rango-legendaria{color:#d1306f}
`;
    document.head.appendChild(st);
  }

  // ---------- selector de dificultad ----------
  const NOTAS_DIF = {
    facil: 'Más lento y con más margen. Ideal para aprender.',
    normal: 'La experiencia de siempre.',
    dificil: 'Arranca rápido desde el primer segundo.',
    extremo: 'Para dedos de acero: todo al máximo y sin perdón. XP ×2.',
    maestro: 'Más allá de Extremo. Casi nadie lo termina. XP ×2,5.',
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
    el.setAttribute('aria-label', T('Dificultad'));
    el.innerHTML = lista.map(d => `<button type="button" class="cc-dif" role="radio" data-d="${d.id}" aria-checked="${d.id === v}">` +
      `${iconoDif(d.id, o.compacto ? 20 : 24)}${T(d.nombre)}<small>XP ×${coma(d.xp)}</small></button>`).join('') +
      (o.sinNota || o.compacto ? '' : '<p class="cc-difs-nota" aria-live="polite"></p>');
    const nota = el.querySelector('.cc-difs-nota');
    function pintar(id) {
      v = id;
      for (const b of el.querySelectorAll('.cc-dif')) b.setAttribute('aria-checked', String(b.dataset.d === id));
      if (nota) nota.textContent = T((o.notas && o.notas[id]) || NOTAS_DIF[id]);
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
    const extra = (o.extra || [['R', 'reiniciar']]).map(([k, t]) => `<kbd>${k}</kbd>${T(t)}`).join(' ');
    el.innerHTML = `<span class="g juego"><span class="t">${T('En el juego')}</span><kbd class="f">←</kbd><kbd class="f">→</kbd>${T(o.jugar || 'moverte')} ${extra}</span>` +
      (o.menu === false ? '' : `<span class="g menu"><span class="t">${T('En el menú')}</span><kbd>↑</kbd><kbd>↓</kbd>${T(o.elegir || 'dificultad')} <kbd>Enter</kbd>${T('jugar')} <kbd>Esc</kbd>${T('salir')}</span>`);
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
      // en inglés el observer ya puede haber cambiado «Juegos» por «Games»
      if (!/(Juegos|Games)\s*$/.test(b.textContent)) continue;
      estilos();
      const card = b.closest('.card'), fila = b.parentElement, brand = card.querySelector(':scope > .brand');
      b.className = 'cc-casa';
      b.innerHTML = CASA;
      b.setAttribute('aria-label', T('Volver a los juegos'));
      b.title = T('Volver a los juegos');
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
      `<div><b>${exclamar(T('Nivel {n}', { n: nivel }))}</b>` +
      (nuevas.length ? `<span>${T('Desbloqueaste: {x}', { x: nuevas.map(s => T(s.nombre)).join(', ') })}</span>` : '') + '</div>', 3600);
    const cv = el && el.querySelector('canvas');
    if (cv) { const c = cv.getContext('2d'); c.scale(2, 2); dibujarCubo(c, 24, 46, 28, { skin: nueva, t: 0, efecto: false }); }
  }
  function avisoLogro(l) {
    const m = MEDALLAS[l.medalla];
    const premio = [...SKINS, ...EFECTOS].filter(i => i.logro === l.id).map(i => i.nombre);
    avisar(`<div class="cc-medalla" style="background:${m.color}">★</div><div><b>${l.nombre}</b>` +
      `<span>${T('Logro ' + l.medalla)} · +${m.xp} XP${premio.length ? ' · ' + T('Desbloqueaste {x}', { x: premio.join(', ') }) : ''}</span></div>`, 3800);
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
    // o.diario: el ranking del desafío de hoy (una sola tabla, sin modos ni dificultades)
    const dia = o.diario ? diario(j.id) : null;
    if (dia) tid = dia.tabla;
    const previo = document.activeElement;
    const box = document.createElement('div');
    box.id = 'cc-rank';
    box.innerHTML = `<div class="cc-rk" role="dialog" aria-modal="true" aria-labelledby="cc-rank-t">
      <header><div><h2 id="cc-rank-t">${T(dia ? 'Desafío del día' : 'Ranking')}</h2><small>${dia ? T(j.nombre) + ' · ' + dia.fechaLinda : T(j.nombre)}</small></div><button class="x" type="button" aria-label="${T('Cerrar')}">✕</button></header>
      <div class="seg quien" role="group" aria-label="${T('Quiénes')}" hidden><button type="button" data-q="todos" aria-pressed="true">🌎 ${T('Todos')}</button><button type="button" data-q="amigos" aria-pressed="false">👥 ${T('Amigos')}</button></div>
      ${conModos ? `<div class="seg modos" role="group" aria-label="${T('Modo')}"></div>` : ''}<div class="seg difs" role="group" aria-label="${T('Dificultad')}"${dia ? ' hidden' : ''}></div>
      <ol aria-live="polite"></ol>
      <div class="pie"><div class="yo-txt"></div>
        <form class="f-apodo"><input name="a" maxlength="14" autocomplete="nickname" placeholder="${T('Tu apodo (3 a 14 letras)')}" aria-label="${T('Tu apodo')}"><button type="submit">${T('Guardar')}</button></form>
        <form class="f-clave" hidden><input name="a" maxlength="14" autocomplete="nickname" placeholder="${T('Tu apodo')}" aria-label="${T('Tu apodo')}">
          <input name="c" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${T('Clave')}" aria-label="${T('Tu clave')}"><button type="submit">${T('Entrar')}</button></form>
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
        // el apodo va con translate="no": el observer no tiene que traducir un apodo «Gato»
        yoTxt.innerHTML = `${T('Jugás como')} <b translate="no"></b><button class="link" type="button">${T('Cambiar apodo')}</button>`;
        const b = yoTxt.querySelector('b'); b.textContent = p.apodo; b.className = claseNombre(skin());
        yoTxt.querySelector('.link').addEventListener('click', () => { editando = true; verClave = false; pintarPie(); input.focus(); });
        otro.textContent = T(verClave ? 'Ocultar clave' : 'Jugar en otro dispositivo');
        if (verClave) {
          ayuda.innerHTML = T(p.clave
            ? 'Tu clave es <b class="clave" translate="no"></b>. En el otro celu o compu abrí un ranking, tocá «Ya tengo apodo» y poné tu apodo y esta clave. No se la pases a nadie.'
            : 'Conectate a internet para ver tu clave.');
          const c = ayuda.querySelector('.clave'); if (c) c.textContent = claveLinda(p.clave);
        } else ayuda.textContent = aviso || T('Tu mejor marca de cada modo se sube sola al terminar la partida.');
      } else {
        if (!input.value) input.value = p.apodo || p.apodoPerdido;
        otro.textContent = T(conClave ? 'Elegir un apodo nuevo' : 'Ya tengo apodo en otro dispositivo');
        ayuda.textContent = aviso || (conClave ? T('La clave está en el ranking del dispositivo donde ya tenés tu apodo.')
          : p.apodoPerdido ? Tlit('«{a}» ya es de otra persona. Si es tuyo, entrá con tu clave; si no, elegí otro.', { a: p.apodoPerdido })
          : T('Poné un apodo para aparecer en el ranking. Es solo tuyo y tus récords se suben solos.'));
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
      if (segModos) segModos.hidden = !!dia;
      if (segModos && !dia) {
        segModos.style.setProperty('--n', modos.length);
        segModos.innerHTML = modos.map(m => `<button type="button" data-m="${m}" aria-pressed="${m === modo}">${T(nombreModo(m))}</button>`).join('');
      }
      const difs = DIFS.filter(d => j.tablas.some(t => modoDe(t) === modo && t.dif === d.id));
      segDifs.style.setProperty('--n', difs.length);
      segDifs.innerHTML = difs.map(d => `<button type="button" data-d="${d.id}" aria-pressed="${d.id === tb.dif}">${iconoDif(d.id, 18)}${T(d.nombre)}</button>`).join('');
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
      const tb = tablaDe(j.id, tid), mio = dia ? diario(j.id).mejor : leer().mejores[j.id + ':' + tid];
      const tuyo = dia ? (mio != null ? T('Tu mejor de hoy: <strong>{v}</strong>', { v: formato(mio, tb) }) : T('Todavía no lo jugaste hoy.'))
        : T('Tu mejor marca: <strong>{v}</strong>', { v: formato(mio, tb) });
      if (!rankingActivo()) { msg(`${T('El ranking online se está preparando.')}<br>${tuyo}`); return; }
      if (navigator.onLine === false) { msg(`${T('Sin conexión. Tus récords se suben cuando vuelvas a tener internet.')}<br>${tuyo}`); return; }
      msg(T('Cargando…'));
      const n = ++pedido;
      try {
        await esperarSubida();
        if (n !== pedido) return;
        const { lista, yo } = await top(j.id, dia ? dia.tablaRanking : tid, 50, { amigos: soloAmigos, ...(dia ? { mio } : {}) });
        if (n !== pedido) return;
        const cosa = dia ? 'el desafío de hoy' : 'este modo';
        if (!lista.length) { msg(T(soloAmigos ? 'Ni vos ni tus amigos jugaron {c} todavía.' : 'Todavía nadie jugó {c}. ¡Sé el primero!', { c: cosa }) + `<br>${tuyo}`); return; }
        ol.innerHTML = '';
        const fila = f => {
          const li = document.createElement('li'); if (f.yo) li.className = 'yo';
          li.innerHTML = `<span class="p${f.puesto <= 3 ? ' m' + f.puesto : ''}">${f.puesto}</span><canvas width="52" height="60"></canvas><span class="n"></span><span class="v">${formato(f.valor, tb)}</span>`;
          const nm = li.querySelector('.n'), sk = SKINS.find(s => s.id === f.skin);
          // el apodo, en su propio span con translate="no" (el observer no tiene que traducir un apodo «Gato»)
          const ap = document.createElement('span'); ap.setAttribute('translate', 'no'); ap.textContent = f.apodo;
          if (sk && sk.legendaria) ap.className = claseNombre(sk);
          nm.appendChild(ap);
          // su maestría en este juego, al lado del apodo
          if (f.maestria > 0) nm.appendChild(insigniaMaestria(f.maestria, j.id));
          if (f.yo) nm.append(T(' (vos)'));
          // el título llega del servidor en español; se pinta con el color de su rareza
          if (f.titulo) {
            const tt = document.createElement('small'); tt.className = 'tt';
            tt.appendChild(pintarTitulo(document.createElement('span'), f.titulo)); nm.appendChild(tt);
          }
          const c = li.querySelector('canvas').getContext('2d'); c.scale(2, 2);
          dibujarCubo(c, 13, 28, 18, { skin: sk || SKINS[0], t: 0, efecto: false });
          // tocando la fila se abre su perfil
          if (f.huella) {
            li.classList.add('ver'); li.tabIndex = 0; li.setAttribute('role', 'button'); li.title = 'Ver perfil';
            const ver = () => verPerfil({ huella: f.huella, apodo: f.apodo, skin: f.skin, titulo: f.titulo, yo: f.yo }, { padre: cerrar });
            li.addEventListener('click', ver);
            li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ver(); } });
          }
          ol.appendChild(li);
          return li;
        };
        lista.forEach(fila);
        if (yo && yo.afuera) { const sep = document.createElement('li'); sep.className = 'sep'; sep.textContent = '···'; ol.appendChild(sep); fila(yo); }
        const mia = ol.querySelector('.yo'); if (mia) mia.scrollIntoView({ block: 'nearest' });
      } catch (e) { if (n === pedido) msg(`${T('No se pudo cargar el ranking. Probá de nuevo en un rato.')}<br>${tuyo}`); }
    }
    function cerrar() { box.remove(); removeEventListener('keydown', tecla, true); if (previo && previo.focus) previo.focus(); if (o.alCerrar) o.alCerrar(); }
    function tecla(e) {
      if (document.getElementById('cc-perfil')) return;   // la tarjeta de perfil abierta encima maneja sus teclas
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); } else if (e.target.tagName !== 'INPUT') e.stopPropagation(); }
    addEventListener('keydown', tecla, true);
    $('.x').addEventListener('click', cerrar);
    box.addEventListener('click', e => { if (e.target === box) cerrar(); });
    const esperando = (f, si) => { for (const el of f.elements) el.disabled = si; };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const r = ponerApodo(input.value);
      if (!r) { ayuda.textContent = T('El apodo tiene que tener entre 3 y 14 letras o números.'); input.focus(); return; }
      esperando(form, true); ayuda.textContent = T('Guardando…');
      const res = await r;
      esperando(form, false);
      if (!res.ok) { ayuda.textContent = res.msg; input.focus(); return; }
      editando = false; input.blur(); pintarPie();
      cargar();
    });
    formClave.addEventListener('submit', async e => {
      e.preventDefault();
      esperando(formClave, true); ayuda.textContent = T('Revisando…');
      const res = await vincular(formClave.elements.a.value, formClave.elements.c.value);
      esperando(formClave, false);
      if (!res.ok) { ayuda.textContent = res.msg; formClave.elements.c.focus(); return; }
      conClave = false; editando = false; document.activeElement.blur && document.activeElement.blur();
      pintarPie(Tlit('¡Listo! Ahora jugás como {a} también en este dispositivo.', { a: res.apodo }));
      cargar();
    });
    cargar();
    $('.x').focus();
    return cerrar;
  }

  // ---------- perfil de otros jugadores ----------
  // Tocando a alguien en el ranking o en tus amigos se abre su tarjeta: personaje, nivel, horas jugadas, juegos más
  // jugados, mejores marcas (con su puesto en el ranking), logros, racha y temporada. Lo de los demás sale de su progreso
  // en la nube con perfil_publico (supabase.sql, «Parte: perfil público»), que devuelve solo lo público; lo tuyo sale de
  // este dispositivo, así tu tarjeta anda también sin internet.
  async function perfilPublico(h) {
    const r = await api('rpc/perfil_publico', { method: 'POST', body: JSON.stringify({ p_huella: String(h || '') }) });
    return r && typeof r === 'object' && !Array.isArray(r) ? r : null;
  }
  // Lo que muestra la tarjeta, a partir de un perfil con la forma del guardado (p) y lo que se sabe aparte (x):
  // x = { conPerfil, apodo, skin, tituloTexto, codigo, creado, marcas: { 'juego:tabla': { v, puesto } } }
  function armarVista(p, x = {}) {
    p = objDe(p);
    const q = { xp: conCurva(p), logros: objDe(p.logros), temporadas: objDe(p.temporadas),
      codigos: Array.isArray(p.codigos) ? p.codigos.filter(c => typeof c === 'string') : [] };
    const con = !!x.conPerfil;
    // solo lo que de verdad tiene desbloqueado (por si el perfil viene raro)
    const de = (lista, id) => { const it = lista.find(k => k.id === id); return con && it && libre(it, q) ? it : null; };
    const libresM = MARCOS.filter(m => libre(m, q));
    const partidas = objDe(p.partidas), tiempo = objDe(p.tiempo), mejores = objDe(p.mejores), marcas = objDe(x.marcas);
    const juegos = JUEGOS.map(j => ({ j, n: Math.max(0, Math.floor(+partidas[j.id] || 0)), s: Math.max(0, +tiempo[j.id] || 0), m: maestria(p, j.id) }))
      .filter(g => g.n || g.s).sort((a, b) => b.n - a.n || b.s - a.s);
    // mejor marca de cada juego, en la dificultad más alta que jugó (la de su perfil o la del ranking, la mejor de las dos)
    const marcasJ = [];
    for (const j of JUEGOS) {
      let el = null;
      for (const tb of j.tablas) {
        const k = j.id + ':' + tb.id, srv = objDe(marcas[k]);
        let v = isFinite(+mejores[k]) && +mejores[k] > 0 ? +mejores[k] : null;
        if (srv.v != null && isFinite(+srv.v) && (v == null || mejor(tb, +srv.v, v))) v = +srv.v;
        if (v == null) continue;
        const nd = DIFS.findIndex(d => d.id === tb.dif);
        if (!el || nd > el.nd) el = { j, tb, v, nd, puesto: srv.v != null && +srv.v === v ? Math.max(1, Math.floor(+srv.puesto || 0)) || null : null };
      }
      if (el) marcasJ.push(el);
    }
    const logros = LOGROS.filter(l => q.logros[l.id]);
    const d = objDe(p.diario), n = Math.floor(ahoraDiario() / DIA_MS);
    const T = temporadaDe(), xpT = Math.max(0, +objDe(q.temporadas[T.n]).xp || 0);
    const fechas = [x.creado ? Date.parse(x.creado) : NaN, ...Object.values(q.logros).map(Number)].filter(v => isFinite(v) && v > 1.5e12);
    return {
      con, apodo: x.apodo || '', codigo: x.codigo || '', xp: q.xp, ...nivelDe(q.xp),
      skin: de(SKINS, p.skin) || SKINS.find(s => s.id === x.skin) || SKINS[0],
      efecto: de(EFECTOS, p.efecto) || EFECTOS[0],
      marco: con ? de(MARCOS, p.marco) || libresM[libresM.length - 1] || null : null,
      titulo: (de(TITULOS, p.titulo) || {}).nombre || x.tituloTexto || '',
      vitrina: con ? vitrinaDe({ logros: q.logros, vitrina: p.vitrina }) : { logros: [], elegida: false },
      total: Math.max(+p.total || 0, juegos.reduce((a, g) => a + g.n, 0)), segundos: juegos.reduce((a, g) => a + g.s, 0),
      juegos, marcas: marcasJ, logros, diamantes: logros.filter(l => l.medalla === 'diamante'),
      legendarias: [...SKINS.map(it => ({ tipo: 'skin', it })), ...EFECTOS.map(it => ({ tipo: 'efecto', it }))].filter(i => i.it.legendaria && libre(i.it, q)),
      racha: d.ultimo === fechaDia(n) || d.ultimo === fechaDia(n - 1) ? Math.max(0, +d.racha || 0) : 0, mejorRacha: Math.max(0, +d.mejorRacha || 0),
      temporada: T, nivelT: Math.min(TEMP_NIVELES, Math.floor(xpT / TEMP_XP)),
      desde: fechas.length ? Math.min(...fechas) : null,
    };
  }
  function estilosPerfil() {
    if (document.getElementById('cc-estilos-perfil')) return;
    const st = document.createElement('style');
    st.id = 'cc-estilos-perfil';
    st.textContent = `
#cc-rank li.ver{cursor:pointer;transition:background .12s}
#cc-rank li.ver:hover{background:rgba(255,204,41,.28)}
#cc-rank li.ver.yo:hover{background:#ffd84f}
#cc-rank li.ver:focus-visible{outline:3px solid #ff5d7d;outline-offset:-2px}
#cc-perfil{position:fixed;inset:0;z-index:9998;display:flex;align-items:flex-end;justify-content:center;background:rgba(29,35,64,.55);box-sizing:border-box;
  padding:12px 12px calc(12px + env(safe-area-inset-bottom,0px));font-family:"Rubik",system-ui,sans-serif;color:${INK}}
@media (min-width:600px) and (min-height:560px){#cc-perfil{align-items:center}}
#cc-perfil *{box-sizing:border-box}
#cc-perfil [hidden]{display:none!important}
#cc-perfil .cc-pf{zoom:var(--ui,1);position:relative;width:100%;max-width:460px;max-height:min(780px,calc((100dvh - 24px) / var(--ui,1)));display:flex;flex-direction:column;
  background:${CREMA};border:3px solid ${INK};border-radius:22px;box-shadow:0 6px 0 ${INK};overflow:hidden;animation:cc-sube .2s ease-out}
#cc-perfil header{display:flex;align-items:center;gap:12px;padding:14px 62px 14px 14px;background:var(--cc-pf,#e9f6ff);border-bottom:3px solid ${INK}}
#cc-perfil header canvas{flex:none;width:104px;height:111px;border-radius:16px;background:rgba(255,255,255,.6);border:2.5px solid ${INK}}
#cc-perfil .pf-quien{flex:1;min-width:0}
#cc-perfil h2{margin:0;font:400 26px/1.05 "Lilita One","Trebuchet MS",sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cc-perfil .pf-tt{display:block;margin-top:3px;padding:2px 0 3px 1px;font-size:13px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cc-perfil .pf-tt:empty{display:none}
#cc-perfil .pf-nv{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-top:8px}
#cc-perfil .pf-nv b{font:400 18px/1 "Lilita One","Trebuchet MS",sans-serif}
#cc-perfil .pf-nv span{font-size:11.5px;font-weight:700;opacity:.7;white-space:nowrap}
#cc-perfil .pf-barra{height:10px;margin-top:4px;border:2px solid ${INK};border-radius:99px;background:#fff;overflow:hidden}
#cc-perfil .pf-barra i{display:block;height:100%;width:0;background:#ffcc29;border-right:2px solid ${INK}}
#cc-perfil .pf-xpt{display:block;margin-top:4px;font-size:11.5px;font-weight:700;opacity:.7}
#cc-perfil .pf-x{position:absolute;top:12px;right:12px;appearance:none;width:44px;height:44px;border-radius:12px;border:2.5px solid ${INK};background:#fff;
  box-shadow:0 3px 0 ${INK};font:700 20px/1 system-ui;color:${INK};cursor:pointer}
#cc-perfil .pf-x:hover{background:#fff4c7}
#cc-perfil .pf-x:active{transform:translateY(2px);box-shadow:0 1px 0 ${INK}}
#cc-perfil .pf-cuerpo{flex:1;min-height:0;overflow-y:auto;padding:12px 14px 14px;display:flex;flex-direction:column;gap:14px}
#cc-perfil .pf-nota{margin:0;padding:10px 12px;border-radius:14px;background:#fff3c4;border:2px dashed rgba(29,35,64,.35);font-size:13px;font-weight:600;line-height:1.4}
#cc-perfil .pf-nota:empty{display:none}
#cc-perfil .pf-chips{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
@media (max-width:330px){#cc-perfil .pf-chips{grid-template-columns:repeat(2,minmax(0,1fr))}}
#cc-perfil .pf-chip{min-width:0;padding:8px 6px 7px;border-radius:14px;background:#fff;border:2.5px solid ${INK};text-align:center}
#cc-perfil .pf-chip .pf-ico{display:block;font-size:17px;line-height:1.1}
#cc-perfil .pf-chip b{display:block;margin-top:2px;font:400 17px/1.1 "Lilita One","Trebuchet MS",sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cc-perfil .pf-chip small{display:block;margin-top:1px;font-size:10.5px;font-weight:700;opacity:.65;line-height:1.2}
#cc-perfil h4{margin:0 0 6px;font:400 17px/1 "Lilita One","Trebuchet MS",sans-serif}
#cc-perfil h4 small{font:700 11.5px "Rubik",system-ui,sans-serif;opacity:.6;margin-left:4px}
#cc-perfil .pf-fav{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:var(--c);border:2.5px solid ${INK};box-shadow:0 3px 0 ${INK}}
#cc-perfil .pf-fav .pf-tag{flex:none;font-size:22px}
#cc-perfil .pf-fav div{min-width:0}
#cc-perfil .pf-fav small{display:block;font-size:11.5px;font-weight:800;opacity:.75;text-transform:uppercase;letter-spacing:.04em}
#cc-perfil .pf-fav b{display:block;font:400 22px/1.05 "Lilita One","Trebuchet MS",sans-serif}
#cc-perfil .pf-fav span{display:block;font-size:12.5px;font-weight:700}
#cc-perfil .pf-jg{display:grid;grid-template-columns:minmax(0,max-content) minmax(40px,1fr) auto auto;align-items:center;gap:4px 8px;padding:5px 0;font-size:13px;font-weight:700}
#cc-perfil .pf-jg .pf-nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cc-perfil .pf-jg .pf-br{height:12px;border-radius:99px;background:#ece8dc;overflow:hidden;border:2px solid ${INK}}
#cc-perfil .pf-jg .pf-br i{display:block;height:100%;border-right:2px solid ${INK}}
#cc-perfil .pf-jg .pf-nn{font-variant-numeric:tabular-nums;text-align:right;min-width:2.2em}
#cc-perfil .pf-jg .pf-hs{font-size:11.5px;opacity:.65;text-align:right;min-width:4.6em;white-space:nowrap}
#cc-perfil .pf-mk{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:12px;background:#fff;border:2px solid rgba(29,35,64,.18)}
#cc-perfil .pf-mk + .pf-mk{margin-top:6px}
#cc-perfil .pf-mk .pf-pt{flex:none;width:10px;height:10px;border-radius:50%;border:2px solid ${INK}}
#cc-perfil .pf-mk .pf-nm{flex:1;min-width:0}
#cc-perfil .pf-mk .pf-nm b{display:block;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cc-perfil .pf-mk .pf-nm small{display:flex;align-items:center;gap:3px;font-size:11px;font-weight:700;opacity:.7;white-space:nowrap;overflow:hidden}
#cc-perfil .pf-mk .pf-nm small .cc-ico{flex:none}
#cc-perfil .pf-mk .pf-v{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
#cc-perfil .pf-mk .pf-pu{flex:none;min-width:38px;padding:3px 6px;border-radius:99px;background:#ece8dc;font:400 13px/1 "Lilita One","Trebuchet MS",sans-serif;text-align:center}
#cc-perfil .pf-mk .pf-pu.pf-m1{background:#ffcc29;box-shadow:inset 0 0 0 2px ${INK}}
#cc-perfil .pf-mk .pf-pu.pf-m2{background:#d7deea;box-shadow:inset 0 0 0 2px ${INK}}
#cc-perfil .pf-mk .pf-pu.pf-m3{background:#e9b48a;box-shadow:inset 0 0 0 2px ${INK}}
#cc-perfil .pf-meds{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}
#cc-perfil .pf-meds .pf-cuenta{font:400 22px/1 "Lilita One","Trebuchet MS",sans-serif;margin-right:auto}
#cc-perfil .pf-meds .pf-cuenta small{font:700 12px "Rubik",system-ui,sans-serif;opacity:.6}
#cc-perfil .pf-med{display:flex;align-items:center;gap:5px;font-weight:800;font-size:14px}
#cc-perfil .pf-med i{width:16px;height:16px;border-radius:50%;border:2px solid ${INK}}
#cc-perfil .pf-dias{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
#cc-perfil .pf-dias span{padding:4px 9px;border-radius:99px;background:#dff8ff;border:2px solid ${INK};font-size:12px;font-weight:800}
#cc-perfil .pf-legs{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:8px;margin-top:10px}
#cc-perfil .pf-leg{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 2px;border-radius:12px;background:#1d2340;color:#fff}
#cc-perfil .pf-leg canvas{width:48px;height:52px}
#cc-perfil .pf-leg small{font-size:10.5px;font-weight:800;text-align:center;line-height:1.15}
#cc-perfil .pf-vacio{margin:0;font-size:13px;font-weight:600;opacity:.7}
#cc-perfil h4 .pf-mini{float:right;appearance:none;margin-top:-4px;min-height:32px;padding:0 12px;border-radius:10px;border:2px solid ${INK};background:#fff;color:${INK};
  font:800 12.5px "Rubik",system-ui,sans-serif;box-shadow:0 2px 0 ${INK};cursor:pointer}
#cc-perfil h4 .pf-mini.pf-on{background:#ffcc29}
#cc-perfil h4 .pf-mini:active{transform:translateY(2px);box-shadow:none}
#cc-perfil .pf-vit{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;clear:both}
#cc-perfil .pf-vl{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;padding:10px 6px 9px;border-radius:16px;background:#fff;
  border:2.5px solid ${INK};box-shadow:0 3px 0 ${INK};text-align:center;color:${INK};font:inherit}
#cc-perfil .pf-vl .cc-med{flex:none;width:46px;height:46px;border-radius:50%;border:3px solid ${INK};display:grid;place-items:center;font:400 22px/1 "Lilita One","Trebuchet MS",sans-serif;color:${INK}}
#cc-perfil .pf-vl b{font-size:12.5px;line-height:1.15;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
#cc-perfil .pf-vl small{line-height:1}
#cc-perfil .pf-vl.pf-vacia{appearance:none;justify-content:center;border-style:dashed;border-color:rgba(29,35,64,.4);box-shadow:none;background:transparent;cursor:pointer;opacity:.75}
#cc-perfil .pf-vl.pf-vacia .cc-med{background:#ece8dc;border-style:dashed;border-color:rgba(29,35,64,.4)}
#cc-perfil .pf-vl.pf-vacia:hover{opacity:1;background:#fff}
#cc-perfil .pf-pick-t{margin:10px 0 6px;font-size:12px;font-weight:800;opacity:.7}
#cc-perfil .pf-pick-t.pf-aviso{opacity:1;color:#c2253f}
#cc-perfil .pf-pick{display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto;padding:2px 4px 4px 2px}
#cc-perfil .pf-op{appearance:none;display:flex;align-items:center;gap:10px;min-height:48px;padding:6px 10px;border-radius:14px;border:2px solid rgba(29,35,64,.2);
  background:#fff;color:${INK};font:inherit;text-align:left;cursor:pointer}
#cc-perfil .pf-op[aria-pressed="true"]{border-color:${INK};box-shadow:0 2px 0 ${INK}}
#cc-perfil .pf-op[aria-disabled="true"]{opacity:.5}
#cc-perfil .pf-op .cc-med{flex:none;width:32px;height:32px;border-radius:50%;border:2.5px solid ${INK};display:grid;place-items:center;font:400 15px/1 "Lilita One","Trebuchet MS",sans-serif;color:${INK}}
#cc-perfil .pf-op .pf-opt{flex:1;min-width:0}
#cc-perfil .pf-op .pf-opt b{display:block;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cc-perfil .pf-op i{flex:none;width:26px;height:26px;border-radius:8px;border:2px solid ${INK};background:#fff;display:grid;place-items:center;font:800 15px/1 system-ui;font-style:normal}
#cc-perfil .pf-op[aria-pressed="true"] i{background:#ffcc29}
#cc-perfil .pf-op:hover:not([aria-disabled="true"]){border-color:${INK}}
#cc-perfil .pf-vl:focus-visible,#cc-perfil .pf-op:focus-visible{outline:3px solid #ff5d7d;outline-offset:2px}
#cc-perfil .pf-fav .pf-mae{display:flex;align-items:center;gap:6px;margin-top:5px;font-size:12px;font-weight:800}
#cc-perfil .pf-fav > div{flex:1}
#cc-perfil .pf-fav .pf-mae .cc-ms{display:inline-flex;margin:0;font-size:12px}
#cc-perfil .pf-fav .pf-mae em{font-style:normal;white-space:nowrap}
#cc-perfil .pf-mbar{flex:1;min-width:30px;height:8px;border:2px solid ${INK};border-radius:99px;background:#fff;overflow:hidden}
#cc-perfil .pf-mbar i{display:block;height:100%;background:${INK}}
#cc-perfil .pf-jg .pf-nm .cc-ms{font-size:10.5px}
#cc-perfil .pf-acciones{display:flex;flex-wrap:wrap;gap:8px;padding:12px 14px 14px;border-top:2px dashed rgba(29,35,64,.22)}
#cc-perfil .pf-acciones:empty{display:none}
#cc-perfil .pf-acciones button{appearance:none;flex:1 1 0;min-width:0;min-height:48px;padding:0 12px;border-radius:14px;border:2.5px solid ${INK};background:#fff;color:${INK};
  font:400 19px "Lilita One","Trebuchet MS",sans-serif;box-shadow:0 3px 0 ${INK};cursor:pointer;white-space:nowrap}
#cc-perfil .pf-acciones button.pf-pri{background:#ffcc29}
#cc-perfil .pf-acciones button:active{transform:translateY(2px);box-shadow:0 1px 0 ${INK}}
#cc-perfil .pf-acciones button:disabled{opacity:.6;cursor:default;transform:none;box-shadow:none}
#cc-perfil .pf-acciones .pf-msg{flex:1 1 100%;margin:0;font-size:12.5px;font-weight:700;opacity:.8}
#cc-perfil .pf-acciones .pf-msg:empty{display:none}
#cc-perfil button:focus-visible{outline:3px solid #ff5d7d;outline-offset:2px}
@media (max-width:400px){#cc-perfil header{gap:10px;padding:12px 58px 12px 12px}#cc-perfil header canvas{width:84px;height:90px}#cc-perfil h2{font-size:22px}
  #cc-perfil .pf-cuerpo{padding-inline:12px}#cc-perfil .pf-acciones{padding-inline:12px}}
`;
    document.head.appendChild(st);
  }
  // Abre la tarjeta. a = { huella, apodo, skin, titulo, yo } (sin huella, o con yo: true, la tuya).
  // o.padre: función que cierra la ventana de abajo (el ranking), para cuando se va a retar o al versus.
  function verPerfil(a = {}, o = {}) {
    estilos(); estilosPerfil();
    const viejo = document.getElementById('cc-perfil');
    if (viejo && viejo._cerrar) viejo._cerrar(true);
    const yo = !!a.yo || !a.huella;
    const previo = document.activeElement;
    const box = document.createElement('div');
    box.id = 'cc-perfil';
    box.innerHTML = `<div class="cc-pf" role="dialog" aria-modal="true" aria-labelledby="cc-pf-ap">
      <header><canvas width="224" height="240" aria-hidden="true"></canvas><div class="pf-quien"><h2 id="cc-pf-ap"></h2><small class="pf-tt"></small>
        <div class="pf-nv"><b class="pf-lv"></b><span class="pf-xpn"></span></div><div class="pf-barra"><i></i></div><small class="pf-xpt"></small></div>
        <button class="pf-x" type="button" aria-label="Cerrar">✕</button></header>
      <div class="pf-cuerpo"></div><div class="pf-acciones"></div></div>`;
    document.body.appendChild(box);
    const $ = s => box.querySelector(s), cuerpo = $('.pf-cuerpo'), acciones = $('.pf-acciones');
    const quieto = menosMovimiento;
    // lo tuyo sale del dispositivo; extraYo es lo que llega del servidor (tus puestos en el ranking y desde cuándo jugás)
    let extraYo = {}, eligiendo = false;
    const yoD = () => { const d = leer(); return { conPerfil: true, apodo: d.apodo || 'Vos', codigo: d.codigoAmigo, ...extraYo }; };
    let vista = yo ? armarVista(leer(), yoD()) : armarVista({}, { apodo: a.apodo, skin: a.skin, tituloTexto: a.titulo });
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const porRango = (x, y) => RANGOS_LOGRO.indexOf(rangoLogro(y)) - RANGOS_LOGRO.indexOf(rangoLogro(x));
    // la vitrina: hasta 3 logros a la vista; en la tuya, «Elegir» abre la lista de los que tenés para marcar cuáles
    function vitrinaHTML(v) {
      const vt = v.vitrina, h = [];
      if (!vt.logros.length && !yo) return '';
      const tarjeta = l => { const r = rangoLogro(l);
        return `<div class="pf-vl cc-lgr-${r}" title="${esc(l.desc)}">${medallaLogro(l)}<b>${esc(l.nombre)}</b><small class="cc-rango cc-rango-${r}">${T(NOMBRE_RANGO[r])}</small></div>`; };
      const nota = !vt.logros.length ? '' : vt.elegida ? '' : T(yo ? 'tus más difíciles · elegí cuáles mostrar' : 'sus más difíciles');
      h.push(`<section class="pf-vitrina"><h4>${T('Vitrina')}${nota ? ` <small>${nota}</small>` : ''}${yo && v.logros.length
        ? `<button class="pf-mini${eligiendo ? ' pf-on' : ''}" type="button" data-vit aria-expanded="${eligiendo}">${eligiendo ? T('Listo') : T('Elegir')}</button>` : ''}</h4>`);
      if (!v.logros.length) h.push(`<p class="pf-vacio">${T('Cuando consigas logros, elegí hasta 3 para mostrar acá.')}</p>`);
      else {
        const vacias = yo ? VITRINA_MAX - vt.logros.length : 0;
        h.push(`<div class="pf-vit">${vt.logros.map(tarjeta).join('')}${`<button class="pf-vl pf-vacia" type="button" data-vit aria-label="${T('Elegir logros para la vitrina')}"><span class="cc-med">+</span><b>${T('Elegí uno')}</b></button>`.repeat(vacias)}</div>`);
      }
      if (yo && eligiendo && v.logros.length) {
        const sel = vt.elegida ? vt.logros.map(l => l.id) : [];
        h.push(`<p class="pf-pick-t" role="status">${T('Marcá hasta {n} · {k} de {n}', { n: VITRINA_MAX, k: sel.length })}</p><div class="pf-pick" role="group" aria-label="${T('Logros para la vitrina')}">${
          [...v.logros].sort(porRango).map(l => {
            const on = sel.includes(l.id), r = rangoLogro(l), lleno = !on && sel.length >= VITRINA_MAX;
            return `<button type="button" class="pf-op${on ? ' cc-lgr-' + r : ''}" data-l="${esc(l.id)}" aria-pressed="${on}"${lleno ? ' aria-disabled="true"' : ''}>${medallaLogro(l)}<span class="pf-opt"><b>${esc(l.nombre)}</b><small class="cc-rango cc-rango-${r}">${T(NOMBRE_RANGO[r])}</small></span><i aria-hidden="true">${on ? '✓' : ''}</i></button>`;
          }).join('')}</div>`);
      }
      h.push('</section>');
      return h.join('');
    }
    function tocarVitrina(e) {
      if (!yo) return;
      const b = e.target.closest('[data-vit],[data-l]');
      if (!b) return;
      if (b.hasAttribute('data-vit')) { eligiendo = !eligiendo; repintar('[data-vit]'); return; }
      if (b.getAttribute('aria-disabled') === 'true') {
        const t = cuerpo.querySelector('.pf-pick-t');
        if (t) { t.textContent = T('Ya elegiste {n}: sacá uno para poner otro.', { n: VITRINA_MAX }); t.classList.add('pf-aviso'); }
        return;
      }
      const d = leer(), vt = vitrinaDe(d), sel = vt.elegida ? vt.logros.map(l => l.id) : [], id = b.dataset.l;
      elegirVitrina(sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
      vibrar(8);
      repintar(`[data-l="${CSS.escape(id)}"]`);
    }
    // vuelve a armar la tarjeta sin perder dónde estabas (scroll de la tarjeta y de la lista, y el foco)
    function repintar(foco) {
      const pick = cuerpo.querySelector('.pf-pick'), sc = cuerpo.scrollTop, sp = pick ? pick.scrollTop : 0;
      vista = armarVista(leer(), yoD()); pintar();
      cuerpo.scrollTop = sc;
      const p2 = cuerpo.querySelector('.pf-pick'); if (p2) p2.scrollTop = sp;
      const f = foco && cuerpo.querySelector(foco); if (f) f.focus({ preventScroll: true });
    }
    let nota = '', codigo = a.codigo || '', vivo = true, raf = 0;
    if (yo && !leer().apodo) nota = 'Poné un apodo en cualquier ranking para que tus amigos puedan ver tu perfil.';

    function pintar() {
      const v = vista;
      $('h2').replaceChildren(); const ap = document.createElement('span'); ap.textContent = v.apodo || '—'; ap.className = claseNombre(v.skin); $('h2').appendChild(ap);
      if (yo && leer().apodo) $('h2').append(' (vos)');
      // el título con el color (y el brillo) de su rareza
      if (v.titulo) $('.pf-tt').replaceChildren(pintarTitulo(document.createElement('span'), v.titulo)); else $('.pf-tt').replaceChildren();
      const conNivel = v.con;
      $('.pf-nv').hidden = $('.pf-barra').hidden = $('.pf-xpt').hidden = !conNivel;
      $('.pf-lv').textContent = 'Lvl ' + v.nivel;
      $('.pf-xpn').textContent = `${v.enNivel.toLocaleString('es-AR')} / ${v.paraSiguiente.toLocaleString('es-AR')} XP`;
      $('.pf-barra i').style.width = Math.round(100 * v.enNivel / v.paraSiguiente) + '%';
      $('.pf-xpt').textContent = `${v.xp.toLocaleString('es-AR')} XP en total`;
      const fav = v.juegos[0];
      $('.cc-pf').style.setProperty('--cc-pf', fav ? `color-mix(in srgb, ${fav.j.color} 30%, #fffaf0)` : '#e9f6ff');

      const h = [];
      h.push(`<p class="pf-nota" role="status"></p>`);
      if (v.con) {
        const desde = v.desde ? new Date(v.desde).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' }).replace('.', '') : '—';
        const chip = (ico, valor, txt) => `<div class="pf-chip"><span class="pf-ico" aria-hidden="true">${ico}</span><b>${valor}</b><small>${txt}</small></div>`;
        h.push(`<div class="pf-chips">${chip('⏱️', horasTexto(v.segundos), 'jugadas')}${chip('🎮', v.total.toLocaleString('es-AR'), v.total === 1 ? 'partida' : 'partidas')}
          ${chip('🏅', `${v.logros.length}/${LOGROS.length}`, 'logros')}${chip('🔥', v.racha, `racha del día · mejor ${v.mejorRacha}`)}
          ${chip('⭐', `Lvl ${v.nivelT}`, `temporada ${v.temporada.nombre}`)}${chip('📅', desde, 'juega desde')}</div>`);
        h.push(vitrinaHTML(v));
        if (fav) {
          const fm = fav.m, falta = fm.max ? 1 : (fm.puntos - fm.desde) / Math.max(1, fm.hasta - fm.desde);
          h.push(`<div class="pf-fav" style="--c:color-mix(in srgb, ${fav.j.color} 45%, #fff)"><span class="pf-tag" aria-hidden="true">⭐</span><div><small>${yo ? 'Tu favorito' : 'Su favorito'}</small>
            <b>${fav.j.nombre}</b><span>${fav.n.toLocaleString('es-AR')} ${fav.n === 1 ? 'partida' : 'partidas'}${fav.s ? ' · ' + horasTexto(fav.s) : ''}</span>
            ${fm.nivel ? `<span class="pf-mae">${insigniaMaestria(fm.nivel, fav.j.id).outerHTML}<em>${T('Maestría')} · ${T(RANGOS_MAESTRIA[fm.rango].nombre)}</em><i class="pf-mbar"><i style="width:${Math.round(100 * Math.min(1, Math.max(0, falta)))}%"></i></i></span>` : ''}</div></div>`);
          const max = Math.max(1, ...v.juegos.map(g => g.n));
          h.push(`<section><h4>${T('Más jugados')} <small>${T('maestría · partidas · tiempo')}</small></h4>${v.juegos.map(g =>
            `<div class="pf-jg"><span class="pf-nm">${g.j.nombre}${insigniaMaestria(g.m.nivel, g.j.id).outerHTML}</span><span class="pf-br"><i style="width:${Math.max(4, Math.round(100 * g.n / max))}%;background:${g.j.color}"></i></span>
            <span class="pf-nn">${g.n.toLocaleString('es-AR')}</span><span class="pf-hs">${g.s ? horasTexto(g.s) : '—'}</span></div>`).join('')}
            ${v.total && !v.segundos ? `<p class="pf-vacio">El tiempo jugado se empezó a contar hace poco.</p>` : ''}</section>`);
        } else h.push(`<p class="pf-vacio">${yo ? 'Todavía no jugaste ninguna partida.' : 'Todavía no jugó ninguna partida.'}</p>`);
      }
      if (v.marcas.length) {
        h.push(`<section><h4>Mejores marcas <small>en la dificultad más alta${v.marcas.some(m => m.puesto) ? ' · puesto' : ''}</small></h4>${v.marcas.map(m => {
          const pu = m.puesto ? `<span class="pf-pu${m.puesto <= 3 ? ' pf-m' + m.puesto : ''}" title="Puesto en el ranking">#${m.puesto.toLocaleString('es-AR')}</span>` : '';
          return `<div class="pf-mk"><i class="pf-pt" style="background:${m.j.color}"></i><span class="pf-nm"><b>${m.j.nombre}</b><small>${iconoDif(m.tb.dif, 14)}${m.tb.nombre}</small></span>
            <span class="pf-v">${formato(m.v, m.tb)}</span>${pu}</div>`;
        }).join('')}</section>`);
      }
      if (v.con) {
        const cuenta = m => v.logros.filter(l => l.medalla === m).length;
        h.push(`<section><h4>Logros</h4><div class="pf-meds"><span class="pf-cuenta">${v.logros.length} <small>de ${LOGROS.length}</small></span>${Object.entries(MEDALLAS).map(([k, m]) =>
          `<span class="pf-med" title="${m.nombre}"><i style="background:${m.color}"></i>${cuenta(k)}</span>`).join('')}</div>
          ${v.diamantes.length ? `<div class="pf-dias">${v.diamantes.map(l => `<span title="${l.desc.replace(/"/g, '&quot;')}">💎 ${l.nombre}</span>`).join('')}</div>` : ''}
          ${v.legendarias.length ? `<div class="pf-legs">${v.legendarias.map((x, k) => `<div class="pf-leg"><canvas width="96" height="104" data-k="${k}"></canvas><small>${x.it.nombre}</small></div>`).join('')}</div>` : ''}</section>`);
      }
      cuerpo.innerHTML = h.join('');
      cuerpo.querySelector('.pf-nota').textContent = nota;
      for (const cv of cuerpo.querySelectorAll('.pf-legs canvas')) {
        const x = v.legendarias[+cv.dataset.k], c = cv.getContext('2d'); c.scale(2, 2);
        if (x.tipo === 'skin') dibujarCubo(c, 24, 46, 24, { skin: x.it, t: 900, efecto: false });
        else dibujarCubo(c, 24, 44, 20, { skin: SKINS[0], t: 900, efecto: x.it.id, marco: false });
      }
      pintarAcciones();
    }

    // botones: retar y versus si es tu amigo; si no, agregarlo
    function pintarAcciones(msg = '') {
      acciones.replaceChildren();
      if (yo) return;
      const d = leer(), es = x => x.huella === a.huella;
      const amigo = d.amigos.find(es), pidio = d.recibidas.find(es), mande = d.enviadas.find(es);
      const boton = (texto, clase, fn) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = texto; if (clase) b.className = 'pf-' + clase;
        if (fn) b.addEventListener('click', () => fn(b)); else b.disabled = true;
        acciones.appendChild(b); return b;
      };
      if (amigo) {
        boton('⚔️ Retar', 'pri', () => {
          cerrarTodo();
          if (window.CuboDuelo) window.CuboDuelo.elegirJuego(amigo);
          else avisar('<div><b>Sin conexión</b><span>Para retar a un amigo hace falta internet.</span></div>');
        });
        boton('📊 Versus', '', () => {
          const fn = o.versus || window.CuboComun.alVersus;
          cerrarTodo();
          if (fn) fn(amigo); else location.href = 'index.html#versus=' + encodeURIComponent(amigo.huella);
        });
      } else if (pidio) {
        boton('✓ Aceptar solicitud', 'pri', async b => {
          b.disabled = true;
          const r = await responderSolicitud(pidio.codigo, true);
          pintarAcciones(!r.ok ? r.msg : r.estado === 'amigos' ? `¡${vista.apodo} ya es tu amigo!` : 'Esa solicitud ya no está.');
        });
      } else if (mande) boton('Solicitud enviada', '', null);
      else if (codigo) {
        boton('➕ Agregar amigo', 'pri', async b => {
          b.disabled = true; b.textContent = 'Mandando…';
          const r = await agregarAmigo(codigo);
          pintarAcciones(!r.ok ? r.msg : r.estado === 'amigos' ? `¡${vista.apodo} ya es tu amigo!` : `Le mandaste una solicitud a ${vista.apodo}. Cuando la acepte, aparece en tus amigos.`);
        });
      }
      if (msg) { const p = document.createElement('p'); p.className = 'pf-msg'; p.setAttribute('role', 'status'); p.textContent = msg; acciones.appendChild(p); }
    }

    // el personaje grande, con su efecto y su brillo, moviéndose
    const ctx = $('header canvas').getContext('2d');
    function cuadro(now) {
      if (!vivo) return;
      if (!document.hidden) {
        ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, 112, 120);
        const t = quieto ? 900 : now;
        dibujarCubo(ctx, 56, 104 - (quieto ? 0 : (Math.sin(now / 420) + 1) * 3), 50,
          { skin: vista.skin, efecto: vista.efecto.id, marco: vista.marco ? vista.marco.id : false, t, mirar: quieto ? 0 : Math.sin(now / 900) });
      }
      raf = requestAnimationFrame(cuadro);
    }

    function cerrar(sinFoco) {
      if (!vivo) return;
      vivo = false; cancelAnimationFrame(raf);
      box.remove(); removeEventListener('keydown', tecla, true); removeEventListener('cubo-amigos', alCambiarAmigos);
      if (!sinFoco && previo && previo.focus && document.contains(previo)) previo.focus();
      if (o.alCerrar) o.alCerrar();
    }
    function cerrarTodo() { cerrar(true); if (o.padre) o.padre(); }
    box._cerrar = cerrar;
    function tecla(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); }
      else if (e.target.tagName !== 'INPUT') e.stopPropagation();   // que el juego de abajo no se mueva
    }
    const alCambiarAmigos = () => { if (vivo) pintarAcciones(); };
    addEventListener('keydown', tecla, true);
    addEventListener('cubo-amigos', alCambiarAmigos);
    $('.pf-x').addEventListener('click', () => cerrar());
    box.addEventListener('click', e => { if (e.target === box) cerrar(); });
    cuerpo.addEventListener('click', tocarVitrina);

    // lo del servidor: el perfil público de los demás; en el tuyo, solo tus puestos en el ranking
    const ponerNota = t => { nota = t; const el = cuerpo.querySelector('.pf-nota'); if (el) el.textContent = t; };
    if (!yo) {
      if (!rankingActivo() || navigator.onLine === false) nota = 'Sin conexión. Para ver el perfil de otros jugadores hace falta internet.';
      else nota = 'Cargando el perfil…';
    }
    pintar();
    requestAnimationFrame(cuadro);
    $('.pf-x').focus();
    (async () => {
      if (!rankingActivo() || navigator.onLine === false) return;
      try {
        const h = yo ? (leer().apodo ? await huella() : '') : a.huella;
        if (!h) return;
        const r = await perfilPublico(h);
        if (!vivo) return;
        if (yo) {
          if (r) { extraYo = { marcas: r.marcas, creado: r.creado }; repintar(); }
          return;
        }
        if (!r) { ponerNota(`No encontramos el perfil de ${a.apodo || 'este jugador'}.`); return; }
        codigo = r.codigo || codigo;
        nota = r.perfil ? '' : `${r.apodo} todavía no subió su progreso: se va a ver cuando vuelva a jugar.`;
        vista = armarVista(r.perfil || {}, { conPerfil: !!r.perfil, apodo: r.apodo, skin: r.skin, tituloTexto: r.titulo, codigo: r.codigo, creado: r.creado, marcas: r.marcas });
        pintar();
      } catch (e) {
        if (!vivo || yo) return;
        ponerNota(e.message === 'ranking 404' ? 'Los perfiles de otros jugadores todavía no están disponibles: falta actualizar el servidor. Probá de nuevo en unos días.'
          : 'No se pudo cargar el perfil. Probá de nuevo en un rato.');
      }
    })();
    return cerrar;
  }

  // ---------- apodo la primera vez ----------
  // La primera vez que alguien entra a jugar sin apodo, se le pregunta cómo se llama: así sale en el ranking sin tener
  // que encontrar el botón adentro del ranking. Se pregunta una sola vez por dispositivo (aunque toque «Ahora no»);
  // después se puede poner o cambiar en cualquier ranking. Los juegos lo muestran solos al cargar (ver abajo); el hub, al tocar Jugar.
  const PEDIDO_KEY = 'cubo-apodo-pedido';
  function pedirApodo() {
    if (leer().apodo || !rankingActivo() || navigator.onLine === false || document.getElementById('cc-rank')) return false;
    try { if (localStorage.getItem(PEDIDO_KEY)) return false; localStorage.setItem(PEDIDO_KEY, '1'); } catch (e) { return false; }
    estilos();
    const previo = document.activeElement;
    const box = document.createElement('div');
    box.id = 'cc-rank';   // el mismo id que el ranking: los juegos ya ignoran sus teclas mientras está abierto
    box.innerHTML = `<div class="cc-rk cc-ap" role="dialog" aria-modal="true" aria-labelledby="cc-ap-t">
      <header><div><h2 id="cc-ap-t">${T('¿Cómo te llamás?')}</h2><small>${T('Tu nombre en el ranking')}</small></div><button class="x" type="button" aria-label="${T('Cerrar')}">✕</button></header>
      <div class="pie"><canvas width="132" height="120" aria-hidden="true"></canvas>
        <p class="intro">${T('Elegí un apodo y tus récords se suben solos al ranking de cada juego. Es solo tuyo: nadie más lo puede usar.')}</p>
        <form class="f-apodo"><input name="a" maxlength="14" autocomplete="nickname" placeholder="${T('Tu apodo (3 a 14 letras)')}" aria-label="${T('Tu apodo')}"><button type="submit">${T('Listo')}</button></form>
        <form class="f-clave" hidden><input name="a" maxlength="14" autocomplete="nickname" placeholder="${T('Tu apodo')}" aria-label="${T('Tu apodo')}">
          <input name="c" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${T('Clave')}" aria-label="${T('Tu clave')}"><button type="submit">${T('Entrar')}</button></form>
        <p class="ayuda" aria-live="polite"></p>
        <div class="botones"><button class="link otro" type="button">${T('Ya tengo apodo en otro dispositivo')}</button><button class="link no" type="button">${T('Ahora no')}</button></div></div></div>`;
    document.body.appendChild(box);
    const $ = q => box.querySelector(q);
    const form = $('.f-apodo'), input = form.querySelector('input'), formClave = $('.f-clave'), ayuda = $('.ayuda'), otro = $('.otro');
    const cv = $('canvas').getContext('2d'); cv.scale(2, 2);
    dibujarCubo(cv, 33, 54, 38, { mirar: 0, t: 0, efecto: false });
    const ayudaBase = T('Después lo podés cambiar desde cualquier ranking.');
    ayuda.textContent = ayudaBase;
    let conClave = false;
    otro.addEventListener('click', () => {
      conClave = !conClave;
      form.hidden = conClave; formClave.hidden = !conClave;
      otro.textContent = T(conClave ? 'Elegir un apodo nuevo' : 'Ya tengo apodo en otro dispositivo');
      ayuda.textContent = conClave ? T('La clave está en el ranking del dispositivo donde ya tenés tu apodo («Jugar en otro dispositivo»).') : ayudaBase;
      setTimeout(() => (conClave ? formClave : form).querySelector('input').focus());
    });
    function cerrar() { box.remove(); removeEventListener('keydown', tecla, true); if (previo && previo.focus) previo.focus(); }
    function tecla(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); } else if (e.target.tagName !== 'INPUT') e.stopPropagation(); }
    addEventListener('keydown', tecla, true);
    $('.x').addEventListener('click', cerrar);
    $('.no').addEventListener('click', cerrar);
    const esperando = (f, si) => { for (const el of f.elements) el.disabled = si; };
    const listo = a => {
      box.querySelector('.cc-ap').innerHTML = `<header><div><h2>${T('¡Hola, <span translate="no"></span>!')}</h2><small>${T('Ya estás en el ranking')}</small></div></header>`;
      box.querySelector('h2 span').textContent = a;
      setTimeout(cerrar, 1300);
    };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const r = ponerApodo(input.value);
      if (!r) { ayuda.textContent = T('El apodo tiene que tener entre 3 y 14 letras o números.'); input.focus(); return; }
      esperando(form, true); ayuda.textContent = T('Guardando…');
      const res = await r;
      esperando(form, false);
      if (!res.ok) { ayuda.textContent = res.msg; input.focus(); return; }
      listo(leer().apodo);
    });
    formClave.addEventListener('submit', async e => {
      e.preventDefault();
      esperando(formClave, true); ayuda.textContent = T('Revisando…');
      const res = await vincular(formClave.elements.a.value, formClave.elements.c.value);
      esperando(formClave, false);
      if (!res.ok) { ayuda.textContent = res.msg; formClave.elements.c.focus(); return; }
      listo(res.apodo);
    });
    setTimeout(() => input.focus({ preventScroll: true }), 50);
    return true;
  }
  // En los juegos se pregunta solo, cuando terminan de cargar. El hub (que tiene portada) lo llama al tocar Jugar.
  // Solo en las páginas del sitio (las que tienen pantalla de carga): no en la plantilla de imágenes para compartir.
  if (document.getElementById('cargando')) {
    addEventListener('load', () => setTimeout(() => { if (!document.getElementById('portada')) pedirApodo(); }, 700));
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
  // Efectos de temporada (y de la racha): se arman con `fx: { tipo, colores }` en EFECTOS, sin código nuevo por efecto.
  function fxTemp(ctx, fx, s, t) {
    const cs = fx.colores, n = cs.length;
    if (fx.tipo === 'orbes') {
      for (let k = 0; k < 5; k++) {
        const a = t / 700 + k * Math.PI * 2 / 5, x = Math.cos(a) * s * 0.86, y = -s * 0.5 + Math.sin(a) * s * 0.32;
        ctx.save(); ctx.shadowColor = cs[k % n]; ctx.shadowBlur = s * 0.25; ctx.fillStyle = cs[k % n];
        ctx.globalAlpha = Math.sin(a) > 0 ? 1 : 0.55;
        ctx.beginPath(); ctx.arc(x, y, s * (0.1 + 0.025 * Math.sin(t / 200 + k)), 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    } else if (fx.tipo === 'anillos') {
      ctx.lineWidth = Math.max(2, s * 0.06);
      for (let k = 0; k < 3; k++) {
        const f = fase(t, 1500, k / 3);
        ctx.globalAlpha = (1 - f) * 0.9; ctx.strokeStyle = cs[k % n];
        ctx.beginPath(); ctx.ellipse(0, -s * 0.04, s * (0.45 + f * 0.75), s * (0.12 + f * 0.2), 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (fx.tipo === 'copos') {
      for (let k = 0; k < 8; k++) {
        const f = fase(t, 2400, k / 8), x = Math.sin(k * 2.7 + t / 900) * s * 0.78, y = -s * 1.55 + f * s * 1.6, r = s * 0.07;
        ctx.save(); ctx.translate(x, y); ctx.rotate(t / 500 + k);
        ctx.globalAlpha = f < 0.85 ? 1 : (1 - f) / 0.15; ctx.fillStyle = cs[k % n];
        ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    } else if (fx.tipo === 'llamitas') {
      for (let k = 0; k < 7; k++) {
        const f = fase(t, 1100, k / 7), x = Math.sin(k * 1.9 + t / 600) * s * 0.62, y = -s * (0.05 + f * 1.4), w = s * 0.12 * (1 - f * 0.6);
        ctx.globalAlpha = 1 - f; ctx.fillStyle = cs[k % n];
        ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w, y - w * 1.4, x, y - w * 2.4);
        ctx.quadraticCurveTo(x + w, y - w * 1.4, x + w, y); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  function efectoDetras(ctx, id, s, t) {
    if (FX_TEMP[id]) { fxTemp(ctx, FX_TEMP[id], s, t); return; }
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
    // ----- partes de las temporadas: se arman con color2 (y color3), así cada temporada las usa con sus colores -----
    neon: { encima(ctx, s, sk, t) {
      ctx.save();
      ctx.shadowColor = sk.color2; ctx.shadowBlur = s * (0.3 + 0.12 * Math.sin(t / 300));
      ctx.strokeStyle = sk.color2; ctx.lineWidth = Math.max(2, s * 0.06);
      rr(ctx, -s / 2 + s * 0.08, -s + s * 0.08, s - s * 0.16, s - s * 0.16, s * 0.14); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = sk.color2; ctx.globalAlpha = 0.9;
      rr(ctx, -s * 0.3, -s * 0.2, s * 0.6, s * 0.05, s * 0.025); ctx.fill(); ctx.globalAlpha = 1;
    } },
    visor: { encima(ctx, s, sk, t) {
      ctx.save();
      ctx.fillStyle = sk.color2; ctx.strokeStyle = INK; ctx.globalAlpha = 0.93;
      rr(ctx, -s * 0.47, -s * 0.74, s * 0.94, s * 0.26, s * 0.11); ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      ctx.clip();
      const f = (t / 1500) % 1;
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.beginPath(); ctx.moveTo(-s * 0.7 + f * s * 1.6, -s * 0.74); ctx.lineTo(-s * 0.6 + f * s * 1.6, -s * 0.74);
      ctx.lineTo(-s * 0.72 + f * s * 1.6, -s * 0.48); ctx.lineTo(-s * 0.82 + f * s * 1.6, -s * 0.48); ctx.closePath(); ctx.fill();
      ctx.restore();
    } },
    gorrito: { encima(ctx, s, sk) {
      ctx.fillStyle = sk.color2; ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.84); ctx.quadraticCurveTo(-s * 0.5, -s * 1.34, 0, -s * 1.34);
      ctx.quadraticCurveTo(s * 0.5, -s * 1.34, s * 0.5, -s * 0.84); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = sk.color3 || CREMA;
      rr(ctx, -s * 0.55, -s * 0.94, s * 1.1, s * 0.17, s * 0.07); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -s * 1.38, s * 0.11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } },
    capa: { detras(ctx, s, sk, t) {
      const o = Math.sin(t / 260) * s * 0.08;
      ctx.fillStyle = sk.color2; ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.82);
      ctx.quadraticCurveTo(-s * 0.78 + o, -s * 0.34, -s * 0.7 + o, s * 0.02); ctx.lineTo(s * 0.7 + o, s * 0.02);
      ctx.quadraticCurveTo(s * 0.78 + o, -s * 0.34, s * 0.4, -s * 0.82); ctx.closePath(); ctx.fill(); ctx.stroke();
    }, encima(ctx, s, sk) {
      ctx.fillStyle = sk.color2; ctx.strokeStyle = INK;
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * s * 0.36, -s * 0.8, s * 0.07, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    } },
    // la legendaria de cada temporada: corona de luz con joyas y chispas que la orbitan
    leyendaT: { encima(ctx, s, sk, t) {
      const base = -s * 0.98;
      ctx.save();
      ctx.shadowColor = sk.glow || sk.color2; ctx.shadowBlur = s * 0.4;
      ctx.fillStyle = sk.color2; ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.moveTo(-s * 0.42, base);
      for (let k = 0; k < 5; k++) {
        const x = -s * 0.42 + k * s * 0.168;
        ctx.lineTo(x + s * 0.084, base - s * (k % 2 ? 0.2 : 0.32) - Math.sin(t / 300 + k) * s * 0.03);
        ctx.lineTo(x + s * 0.168, base);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = sk.color3 || CREMA; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, s * 0.03);
      for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.arc(k * s * 0.2, base - s * 0.07, s * 0.045, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      for (let k = 0; k < 3; k++) {
        const a = t / 650 + k * 2.1, x = Math.cos(a) * s * 0.72, y = -s * 0.55 + Math.sin(a) * s * 0.26, r = s * 0.07;
        ctx.globalAlpha = Math.sin(a) > 0 ? 1 : 0.45; ctx.fillStyle = k % 2 ? sk.color2 : (sk.color3 || CREMA);
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.6, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.6, y); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } },
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
    // ---- Benja (exclusiva): pelo negro corto con flequillo, anteojos finos, cara seria y remera naranja de cuello rojo ----
    benja: {
      piel(ctx, s) {
        // remera naranja con el cuello rojo (casi recto: si baja mucho parece una sonrisa)
        ctx.fillStyle = '#ff9a2e'; ctx.fillRect(-s / 2, -s * 0.14, s, s * 0.14);
        ctx.fillStyle = '#d8343f'; ctx.beginPath(); ctx.moveTo(-s / 2, -s * 0.17); ctx.lineTo(-s * 0.16, -s * 0.17);
        ctx.quadraticCurveTo(0, -s * 0.12, s * 0.16, -s * 0.17); ctx.lineTo(s / 2, -s * 0.17); ctx.lineTo(s / 2, -s * 0.12);
        ctx.lineTo(s * 0.16, -s * 0.12); ctx.quadraticCurveTo(0, -s * 0.07, -s * 0.16, -s * 0.12); ctx.lineTo(-s / 2, -s * 0.12); ctx.closePath(); ctx.fill();
      },
      encima(ctx, s, sk, t, look) {
        const lw = Math.max(1.5, s * 0.045);
        // orejas (van encima: atrás del cuerpo las tapaba el brillo)
        ctx.fillStyle = sk.cuerpo; ctx.strokeStyle = INK; ctx.lineWidth = lw;
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(side * s * 0.52, -s * 0.5, s * 0.08, s * 0.11, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2, side > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.fill(); ctx.stroke();
        }
        // pelo: casquete negro con el flequillo cortito y desparejo
        ctx.fillStyle = '#1f1b24'; ctx.strokeStyle = INK; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(-s * 0.55, -s * 0.66);
        ctx.quadraticCurveTo(-s * 0.6, -s * 1.13, 0, -s * 1.14); ctx.quadraticCurveTo(s * 0.6, -s * 1.13, s * 0.55, -s * 0.66);
        const puntas = [0.5, 0.38, 0.27, 0.15, 0.03, -0.09, -0.21, -0.33, -0.45];
        puntas.forEach((px, i) => {
          const y = -s * (0.8 + (i % 2 ? 0.05 : 0) + Math.abs(px) * 0.04);
          ctx.lineTo(px * s + look * 0.6, i % 2 ? y : -s * (0.76 + Math.abs(px) * 0.04));
        });
        ctx.lineTo(-s * 0.55, -s * 0.78); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.beginPath(); ctx.moveTo(-s * 0.28, -s * 1.02); ctx.quadraticCurveTo(-s * 0.05, -s * 1.08, s * 0.18, -s * 1.03); ctx.stroke();
        // cejas gruesas
        ctx.strokeStyle = '#1f1b24'; ctx.lineWidth = Math.max(2, s * 0.05);
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * s * 0.1 + look, -s * 0.72); ctx.lineTo(side * s * 0.3 + look, -s * 0.73); ctx.stroke(); }
        // anteojos rectangulares finos, con el reflejo en los vidrios
        const ly = -s * 0.68, lw2 = s * 0.31, lh = s * 0.23;
        for (const side of [-1, 1]) {
          const x0 = side * s * 0.2 + look - lw2 / 2;
          ctx.fillStyle = 'rgba(220,240,255,.12)'; rr(ctx, x0, ly, lw2, lh, s * 0.05); ctx.fill();
          ctx.save(); rr(ctx, x0, ly, lw2, lh, s * 0.05); ctx.clip();
          ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(1, s * 0.035);
          ctx.beginPath(); ctx.moveTo(x0 + lw2 * 0.55, ly - s * 0.02); ctx.lineTo(x0 + lw2 * 0.95, ly + lh * 0.75); ctx.stroke();
          ctx.restore();
          ctx.strokeStyle = '#2b3a33'; ctx.lineWidth = Math.max(1.5, s * 0.035); rr(ctx, x0, ly, lw2, lh, s * 0.05); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(-s * 0.2 + look + lw2 / 2, ly + lh * 0.35); ctx.quadraticCurveTo(look, ly + lh * 0.2, s * 0.2 + look - lw2 / 2, ly + lh * 0.35);
        ctx.moveTo(-s * 0.2 + look - lw2 / 2, ly + lh * 0.3); ctx.lineTo(-s * 0.5, ly + lh * 0.25);
        ctx.moveTo(s * 0.2 + look + lw2 / 2, ly + lh * 0.3); ctx.lineTo(s * 0.5, ly + lh * 0.25); ctx.stroke();
        // boca seria, casi recta
        ctx.strokeStyle = '#b5546a'; ctx.lineWidth = Math.max(2, s * 0.05);
        ctx.beginPath(); ctx.moveTo(look - s * 0.09, -s * 0.3); ctx.quadraticCurveTo(look, -s * 0.32, look + s * 0.09, -s * 0.3); ctx.stroke();
      },
    },
    // ---- Piloto (exclusiva de fabri): casco de Fórmula 1 con visor tornasolado, mentonera y alerón ----
    piloto: {
      piel(ctx, s, sk, t, look) {
        const lw = Math.max(1.5, s * 0.04), dx = look * 0.4;
        // franja blanca por el medio del casco, con filetes amarillos
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(-s * 0.13 + dx, -s); ctx.lineTo(s * 0.13 + dx, -s); ctx.lineTo(s * 0.24 + dx, -s * 0.76); ctx.lineTo(-s * 0.24 + dx, -s * 0.76); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.beginPath(); ctx.moveTo(-s * 0.17 + dx, -s); ctx.lineTo(-s * 0.29 + dx, -s * 0.76); ctx.moveTo(s * 0.17 + dx, -s); ctx.lineTo(s * 0.29 + dx, -s * 0.76); ctx.stroke();
        // bandera a cuadros arriba del visor
        const q = s * 0.046;
        for (let i = 0; i < 20; i++) for (let j = 0; j < 2; j++) {
          ctx.fillStyle = (i + j) % 2 ? '#ffffff' : INK;
          ctx.fillRect(-s / 2 + i * q, -s * 0.8 + j * q, q, q);
        }
        // visor oscuro tornasolado
        const vy = -s * 0.71, vh = s * 0.31;
        const g = ctx.createLinearGradient(0, vy, 0, vy + vh);
        g.addColorStop(0, '#161a3a'); g.addColorStop(0.65, '#3a2a6e'); g.addColorStop(1, '#d0567c');
        ctx.fillStyle = g; rr(ctx, -s * 0.47 + dx, vy, s * 0.94, vh, s * 0.1); ctx.fill();
        ctx.save(); rr(ctx, -s * 0.47 + dx, vy, s * 0.94, vh, s * 0.1); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.beginPath(); ctx.moveTo(-s * 0.1 + dx, vy); ctx.lineTo(s * 0.12 + dx, vy); ctx.lineTo(-s * 0.08 + dx, vy + vh); ctx.lineTo(-s * 0.3 + dx, vy + vh); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = INK; ctx.lineWidth = lw; rr(ctx, -s * 0.47 + dx, vy, s * 0.94, vh, s * 0.1); ctx.stroke();
        // mentonera con las ventilaciones
        ctx.fillStyle = '#23262f'; ctx.fillRect(-s / 2, -s * 0.24, s, s * 0.24);
        ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-s / 2, -s * 0.24); ctx.lineTo(s / 2, -s * 0.24); ctx.stroke();
        ctx.fillStyle = '#8a92a6';
        for (const side of [-1, 1]) for (let k = 0; k < 3; k++) { rr(ctx, side * s * 0.16 + dx - s * 0.07, -s * 0.19 + k * s * 0.05, s * 0.14, s * 0.025, s * 0.012); ctx.fill(); }
      },
      encima(ctx, s, sk, t, look, mirar) {
        // alerón chiquito arriba, del lado de atrás
        const atras = mirar > 0 ? -1 : 1, x = atras * s * 0.14;
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.04); ctx.fillStyle = '#23262f';
        for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + k * s * 0.09, -s * 1.03); ctx.lineTo(x + k * s * 0.09, -s * 0.98); ctx.stroke(); }
        rr(ctx, x - s * 0.18, -s * 1.1, s * 0.36, s * 0.07, s * 0.03); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffd23f'; rr(ctx, x - s * 0.14, -s * 1.085, s * 0.28, s * 0.02, s * 0.01); ctx.fill();
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

  // ---------- Pulseada: luchadores con cuerpo y mesa de competencia (los usan el juego y la tarjeta del inicio) ----------
  // Todo se mide en u. Cada luchador se dibuja con el origen en el medio de su cuerpo, a la altura de la tapa de la mesa;
  // d = 1 mira a la derecha (el de la izquierda) y −1 a la izquierda. f (0 a 1) es cuánta fuerza hace: los músculos se
  // inflan y se marcan las venas. La cabeza es el cubo de siempre (la dibuja cada uno, apoyada en −CUELLO), y el brazo que
  // pulsea va aparte porque pasa por encima de la mesa: sale del hombro de adentro (d·HX, HY).
  const pulseada = (() => {
    const CUELLO = 1.92, CABEZA = 1.45, HX = 0.98, HY = -1.6, SEP = 2.95, SHORT = '#353d66';
    const tinta = a => `rgba(29,35,64,${a})`;
    // torso en V: cintura angosta (la tapa la mesa), pecho ancho, trapecios hasta el cuello
    function rutaTorso(c, u, k) {
      const P = (x, y) => [x * u, y * u];
      c.beginPath();
      c.moveTo(...P(-0.66, 0.42));
      c.bezierCurveTo(...P(-0.7, -0.3), ...P(-1.02 * k, -0.78), ...P(-1.04 * k, -1.3));
      c.quadraticCurveTo(...P(-1.1 * k, -1.8), ...P(-0.72, -1.9));
      c.quadraticCurveTo(...P(-0.42, -1.96), ...P(-0.3, -2.1));
      c.lineTo(...P(0.3, -2.1));
      c.quadraticCurveTo(...P(0.42, -1.96), ...P(0.72, -1.9));
      c.quadraticCurveTo(...P(1.1 * k, -1.8), ...P(1.04 * k, -1.3));
      c.bezierCurveTo(...P(1.02 * k, -0.78), ...P(0.7, -0.3), ...P(0.66, 0.42));
      c.closePath();
    }
    // piernas abiertas, zapatillas y short (abajo de la mesa)
    function piernas(c, u, color, lw) {
      c.strokeStyle = INK; c.lineWidth = lw;
      for (const s of [-1, 1]) {
        c.fillStyle = color;
        c.beginPath(); c.moveTo(s * 0.1 * u, 0.7 * u); c.lineTo(s * 0.6 * u, 0.7 * u); c.lineTo(s * 0.66 * u, 1.48 * u); c.lineTo(s * 0.24 * u, 1.48 * u); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = INK; rr(c, s * 0.45 * u - 0.3 * u, 1.4 * u, 0.6 * u, 0.26 * u, 0.1 * u); c.fill();
      }
      c.fillStyle = SHORT;
      c.beginPath(); c.moveTo(-0.7 * u, 0.25 * u); c.lineTo(0.7 * u, 0.25 * u); c.lineTo(0.76 * u, 0.98 * u); c.lineTo(0.06 * u, 0.98 * u);
      c.lineTo(0, 0.8 * u); c.lineTo(-0.06 * u, 0.98 * u); c.lineTo(-0.76 * u, 0.98 * u); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.3)';
      for (const s of [-1, 1]) c.fillRect(s * 0.62 * u - 0.04 * u, 0.4 * u, 0.08 * u, 0.5 * u);
    }
    function cuerpo(c, u, color, d, f, lw) {
      c.save(); c.scale(d, 1); c.lineJoin = 'round'; c.lineCap = 'round';
      piernas(c, u, color, lw);
      const k = 1 + 0.05 * f;
      rutaTorso(c, u, k); c.fillStyle = color; c.fill();
      c.save(); c.clip();
      // volumen: más oscuro a los costados
      const g = c.createLinearGradient(-1.1 * u, 0, 1.1 * u, 0);
      g.addColorStop(0, tinta(0.24)); g.addColorStop(0.3, tinta(0)); g.addColorStop(0.7, tinta(0)); g.addColorStop(1, tinta(0.14));
      c.fillStyle = g; c.fillRect(-1.3 * u, -2.2 * u, 2.6 * u, 2.7 * u);
      // pectorales (con brillo) y abdominales
      c.strokeStyle = tinta(0.42); c.lineWidth = lw * 0.7;
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(s * 0.06 * u, -1.76 * u); c.quadraticCurveTo(s * 0.16 * u, -0.96 * u, s * 0.92 * u, -1.24 * u); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.ellipse(s * 0.46 * u, -1.6 * u, 0.24 * u, 0.08 * u, -s * 0.15, 0, Math.PI * 2); c.fill();
      }
      c.strokeStyle = tinta(0.3); c.lineWidth = lw * 0.55;
      c.beginPath(); c.moveTo(0, -1.02 * u); c.lineTo(0, 0.3 * u);
      for (const y of [-0.68, -0.32, 0.04]) for (const s of [-1, 1]) { c.moveTo(s * 0.08 * u, y * u); c.quadraticCurveTo(s * 0.28 * u, (y - 0.08) * u, s * 0.44 * u, y * u); }
      c.stroke();
      c.restore();
      rutaTorso(c, u, k); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
      c.restore();
    }
    // brazo hombro S → codo E → mano H: deltoides, bíceps (del lado de adentro del codo) y antebrazo de Popeye.
    // Primero va todo el contorno y después todo el relleno, así las partes quedan pegadas en una sola silueta.
    function brazo(c, S, E, H, u, color, f, lw, g = 1) {
      const L1 = Math.hypot(E.x - S.x, E.y - S.y) || 1, ux = (E.x - S.x) / L1, uy = (E.y - S.y) / L1;
      const L2 = Math.hypot(H.x - E.x, H.y - E.y) || 1, vx = (H.x - E.x) / L2, vy = (H.y - E.y) / L2;
      let nx = -uy, ny = ux; const flip = nx * vx + ny * vy < 0; if (flip) { nx = -nx; ny = -ny; }
      let mx = -vy, my = vx; if (mx * ux + my * uy < 0) { mx = -mx; my = -my; }
      const wa = 0.54 * u * g, wf = 0.46 * u * g, del = (0.38 + 0.05 * f) * u * g;
      const bo = (0.1 + 0.08 * f) * u * g;
      const bic = { x: S.x + ux * L1 * 0.47 + nx * bo, y: S.y + uy * L1 * 0.47 + ny * bo, rx: L1 * 0.36, ry: (0.28 + 0.13 * f) * u * g, a: Math.atan2(uy, ux) };
      const ant = { x: E.x + vx * L2 * 0.3 + mx * 0.07 * u * g, y: E.y + vy * L2 * 0.3 + my * 0.07 * u * g, rx: L2 * 0.3, ry: (0.27 + 0.06 * f) * u * g, a: Math.atan2(vy, vx) };
      const formas = e => {
        c.lineWidth = wa + e * 2; c.beginPath(); c.moveTo(S.x, S.y); c.lineTo(E.x, E.y); c.stroke();
        c.lineWidth = wf + e * 2; c.beginPath(); c.moveTo(E.x, E.y); c.lineTo(H.x, H.y); c.stroke();
        for (const o of [bic, ant]) { c.beginPath(); c.ellipse(o.x, o.y, o.rx + e, o.ry + e, o.a, 0, Math.PI * 2); c.fill(); }
        c.beginPath(); c.arc(S.x, S.y, del + e, 0, Math.PI * 2); c.fill();
      };
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = c.fillStyle = INK; formas(lw);
      c.strokeStyle = c.fillStyle = color; formas(0);
      // sombra del lado de afuera del brazo
      c.lineCap = 'butt'; c.strokeStyle = tinta(0.16); c.lineWidth = wa * 0.3;
      c.beginPath(); c.moveTo(S.x - nx * wa * 0.3, S.y - ny * wa * 0.3); c.lineTo(E.x - nx * wa * 0.3, E.y - ny * wa * 0.3); c.stroke();
      c.lineCap = 'round';
      // borde de abajo del bíceps y brillos
      c.strokeStyle = tinta(0.38); c.lineWidth = lw * 0.6; c.beginPath();
      if (flip) c.ellipse(bic.x, bic.y, bic.rx * 0.92, bic.ry * 0.92, bic.a, 0.55, Math.PI - 0.55);
      else c.ellipse(bic.x, bic.y, bic.rx * 0.92, bic.ry * 0.92, bic.a, Math.PI + 0.55, Math.PI * 2 - 0.55);
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,.32)';
      c.beginPath(); c.ellipse(bic.x + nx * bic.ry * 0.4, bic.y + ny * bic.ry * 0.4, bic.rx * 0.5, bic.ry * 0.24, bic.a, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(S.x - del * 0.3, S.y - del * 0.35, del * 0.3, 0, Math.PI * 2); c.fill();
      // venas cuando aprieta fuerte
      if (f > 0.45) {
        c.strokeStyle = tinta((f - 0.45) / 0.55 * 0.45); c.lineWidth = Math.max(1, lw * 0.45); c.beginPath();
        for (let i = 0; i <= 8; i++) {
          const t = 0.2 + i / 8 * 0.62, w = (0.03 + Math.sin(i * 1.7) * 0.05) * u * g;
          const x = E.x + vx * L2 * t + mx * w, y = E.y + vy * L2 * t + my * w;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        for (let i = 0; i <= 5; i++) {
          const t = 0.3 + i / 5 * 0.4, w = (0.06 + Math.sin(i * 2.1) * 0.04) * u * g;
          const x = S.x + ux * L1 * t + nx * w, y = S.y + uy * L1 * t + ny * w;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
      }
      c.restore();
    }
    function puno(c, x, y, u, color, lw, g = 1) {
      const r = 0.4 * u * g;
      c.save(); c.fillStyle = color; c.strokeStyle = INK; c.lineWidth = lw; c.lineCap = 'round';
      rr(c, x - r, y - r, 2 * r, 2 * r, r * 0.65); c.fill(); c.stroke();
      c.lineWidth = Math.max(1.5, lw * 0.6); c.beginPath();
      for (let k = -1; k <= 1; k++) { c.moveTo(x - r * 0.5, y + k * r * 0.45); c.lineTo(x + r * 0.5, y + k * r * 0.45); }
      c.stroke(); c.restore();
    }
    // la otra mano agarra la manija de su lado de la mesa
    function brazoAfuera(c, u, color, d, f, lw) {
      c.save(); c.scale(d, 1);
      const H = { x: -0.55 * u, y: -0.44 * u };
      brazo(c, { x: -HX * u, y: HY * u }, { x: -1.38 * u, y: -0.78 * u }, H, u, color, f * 0.6, lw, 0.9);
      puno(c, H.x, H.y, u, color, lw, 0.85);
      c.restore();
    }
    function almohadilla(c, x, y, w, h, col, lw) {
      c.fillStyle = tinta(0.45); rr(c, x - w / 2, y - h / 2 + h * 0.3, w, h, h * 0.45); c.fill();
      c.fillStyle = col; rr(c, x - w / 2, y - h / 2, w, h, h * 0.45); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.45)'; rr(c, x - w * 0.34, y - h * 0.28, w * 0.68, h * 0.18, h * 0.09); c.fill();
    }
    // mesa de competencia: tapa acolchada vista un poco de arriba, almohadillas para los codos y para tumbar,
    // manijas para la otra mano, frente con estrella y patas de metal
    function mesa(c, cx, yT, u, lw) {
      c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = lw;
      c.fillStyle = '#6f7891'; rr(c, cx - 2.3 * u, yT + 1.0 * u, 4.6 * u, 0.2 * u, 0.08 * u); c.fill(); c.stroke();
      for (const s of [-1, 1]) {
        const x = cx + s * 2.3 * u;
        c.fillStyle = '#8d96a8';
        c.beginPath(); c.moveTo(x - 0.2 * u, yT + 0.55 * u); c.lineTo(x + 0.2 * u, yT + 0.55 * u); c.lineTo(x + 0.3 * u, yT + 1.5 * u); c.lineTo(x - 0.3 * u, yT + 1.5 * u); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(x - 0.1 * u, yT + 0.66 * u, 0.06 * u, 0.74 * u);
        c.fillStyle = '#4a5272'; rr(c, x - 0.5 * u, yT + 1.46 * u, 1.0 * u, 0.2 * u, 0.08 * u); c.fill(); c.stroke();
      }
      c.fillStyle = '#2a3158'; rr(c, cx - 3.85 * u, yT + 0.1 * u, 7.7 * u, 0.52 * u, 0.12 * u); c.fill(); c.stroke();
      c.fillStyle = '#f5b84a'; c.fillRect(cx - 3.74 * u, yT + 0.44 * u, 7.48 * u, 0.07 * u);
      c.fillStyle = '#ffcc29'; c.lineWidth = lw * 0.7; estrella(c, cx, yT + 0.36 * u, 0.2 * u, 5); c.fill(); c.stroke(); c.lineWidth = lw;
      c.fillStyle = '#3a4573';
      c.beginPath(); c.moveTo(cx - 3.45 * u, yT - 0.3 * u); c.lineTo(cx + 3.45 * u, yT - 0.3 * u); c.lineTo(cx + 3.9 * u, yT + 0.16 * u); c.lineTo(cx - 3.9 * u, yT + 0.16 * u); c.closePath(); c.fill(); c.stroke();
      // costura y línea del medio
      c.setLineDash([0.12 * u, 0.1 * u]); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = Math.max(1, lw * 0.4);
      c.beginPath(); c.moveTo(cx - 3.3 * u, yT - 0.22 * u); c.lineTo(cx + 3.3 * u, yT - 0.22 * u); c.lineTo(cx + 3.68 * u, yT + 0.08 * u); c.lineTo(cx - 3.68 * u, yT + 0.08 * u); c.closePath();
      c.moveTo(cx, yT - 0.26 * u); c.lineTo(cx, yT + 0.12 * u); c.stroke();
      c.setLineDash([]); c.strokeStyle = INK; c.lineWidth = lw;
      for (const s of [-1, 1]) {
        almohadilla(c, cx + s * 0.62 * u, yT - 0.08 * u, 0.95 * u, 0.28 * u, '#e9edf5', lw);
        almohadilla(c, cx + s * 1.95 * u, yT - 0.1 * u, 0.8 * u, 0.3 * u, '#ff5d7d', lw);
        const mx = cx + s * (SEP + 0.55) * u;
        c.fillStyle = '#8d96a8'; c.beginPath(); c.ellipse(mx, yT - 0.04 * u, 0.2 * u, 0.07 * u, 0, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#c9d3e3'; rr(c, mx - 0.09 * u, yT - 0.64 * u, 0.18 * u, 0.6 * u, 0.08 * u); c.fill(); c.stroke();
      }
      c.restore();
    }
    return { CUELLO, CABEZA, HX, HY, SEP, cuerpo, brazo, brazoAfuera, puno, mesa };
  })();

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
    const dpr = Math.min(2, window.devicePixelRatio || 1), quieto = menosMovimiento;
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

  // ---------- sombra ----------
  // La sombra es tu mejor partida como curva de progreso (tiempo → escalones, metros o puntos), no las teclas:
  // los niveles salen distintos cada vez, pero la curva sirve igual. Formato pensado para subirse al servidor:
  //   "1:" + puntos separados por coma; cada punto es el delta de ms en base 36 y, si el valor no subió de a 1,
  //   "~" + el delta del valor (base 36, puede ser negativo). Ej.: "1:4b,3k,3f~2". Tope SOMBRA_MAX caracteres.
  //   const g = CC.sombra.grabar({ cada: 0 });  g.marca(ms, valor) cada vez que querás (guarda solo si cambió)
  //   CC.sombra.guardar('escalador', 'sprint', g, valor)   → true si quedó como sombra (la primera o un récord)
  //   const s = CC.sombra.cargar('escalador', 'sprint');   s.valorEn(ms), s.tiempoPara(valor), s.fin, s.max, s.valor
  //   CC.sombra.activa('escalador') / CC.sombra.elegir('escalador', false)   → el interruptor del menú
  const SOMBRA_V = 1, SOMBRA_MAX = 2000, SOMBRAS = 'cubo-sombras', SOMBRA_NO = 'cubo-sombra-no';
  function codificarSombra(pts) {   // pts: [[ms, valor], ...] con ms crecientes desde 0
    let d = [];
    for (let k = 0, t = 0, v = 0; k < pts.length; k++) {
      d.push([Math.max(0, Math.round(pts[k][0] - t)), Math.round(pts[k][1] - v)]);
      t += d[d.length - 1][0]; v += d[d.length - 1][1];
    }
    const texto = () => SOMBRA_V + ':' + d.map(([dt, dv]) => dt.toString(36) + (dv === 1 ? '' : '~' + dv.toString(36))).join(',');
    let s = texto();
    // si no entra, se junta de a pares (las puntas quedan exactas)
    while (s.length > SOMBRA_MAX && d.length > 1) {
      const n = [];
      for (let k = 0; k < d.length; k += 2) n.push(d[k + 1] ? [d[k][0] + d[k + 1][0], d[k][1] + d[k + 1][1]] : d[k]);
      d = n; s = texto();
    }
    return s;
  }
  function decodificarSombra(s) {
    if (typeof s !== 'string' || s.length > SOMBRA_MAX + 50 || !s.startsWith(SOMBRA_V + ':')) return null;
    const pts = [];
    let t = 0, v = 0;
    for (const p of s.slice(2).split(',')) {
      const [a, b] = p.split('~'), dt = parseInt(a, 36), dv = b == null ? 1 : parseInt(b, 36);
      if (!(dt >= 0) || !isFinite(dv)) return null;
      t += dt; v += dv; pts.push([t, v]);
    }
    return pts.length ? pts : null;
  }
  // Una sombra cargada: búsquedas binarias sobre la curva.
  function curvaSombra(pts, extra = {}) {
    const fin = pts[pts.length - 1][0];
    const max = Math.max(...pts.map(p => p[1]));
    return {
      ...extra, puntos: pts, fin, max,
      // valor que tenía la sombra a los `ms`; con suave, interpolado entre puntos (para cosas continuas como metros)
      valorEn(ms, suave) {
        if (ms < pts[0][0]) return suave && pts[0][0] > 0 ? pts[0][1] * Math.max(0, ms) / pts[0][0] : 0;
        let lo = 0, hi = pts.length - 1;
        while (lo < hi) { const m = (lo + hi + 1) >> 1; if (pts[m][0] <= ms) lo = m; else hi = m - 1; }
        if (!suave || lo === pts.length - 1) return pts[lo][1];
        const [t0, v0] = pts[lo], [t1, v1] = pts[lo + 1];
        return v0 + (v1 - v0) * (ms - t0) / ((t1 - t0) || 1);
      },
      // primer ms en que la sombra llegó a `valor` (Infinity si nunca llegó)
      tiempoPara(valor) {
        if (valor <= 0) return 0;
        for (let k = 0; k < pts.length; k++) if (pts[k][1] >= valor) return pts[k][0];
        return Infinity;
      },
    };
  }
  // Sube al servidor las sombras nuevas (las marcadas con `subir`), solo si tenés apodo. Así tus amigos pueden correr contra vos.
  let subiendoSombras = false;
  async function subirSombras() {
    const p = leer();
    if (subiendoSombras || !p.apodo || !rankingActivo() || navigator.onLine === false) return;
    subiendoSombras = true;
    try {
      for (const [clave, x] of Object.entries(leerSombras())) {
        if (!x || !x.subir) continue;
        const [jid, tid] = clave.split(':');
        const ok = await api('rpc/subir_sombra', { method: 'POST', body: JSON.stringify({ p_jugador: p.id, p_juego: jid, p_tabla: tid, p_valor: x.valor, p_curva: x.s }) });
        const todas = leerSombras();   // si mientras tanto hiciste otra sombra, esa queda para la próxima
        if (ok === true && todas[clave] && todas[clave].s === x.s) { delete todas[clave].subir; try { localStorage.setItem(SOMBRAS, JSON.stringify(todas)); } catch (e) {} }
      }
    } catch (e) {}
    subiendoSombras = false;
  }
  addEventListener('online', () => subirSombras());
  setTimeout(() => subirSombras(), 2500);
  // Baja la sombra de un amigo aceptado (el servidor lo revisa). → curva o null si no tiene en esa tabla.
  async function sombraDeAmigo(codigo, jid, tid) {
    const r = await api('rpc/sombra_de_amigo', { method: 'POST', body: JSON.stringify({ p_jugador: leer().id, p_codigo: codigo, p_juego: jid, p_tabla: tid }) });
    const pts = r && decodificarSombra(r.curva);
    return pts ? curvaSombra(pts, { valor: +r.valor }) : null;
  }
  // Ventana para elegir contra qué amigo correr. opciones: [{ tabla, nombre }] (un botón por tabla en cada amigo).
  // alElegir(sombra, amigo, tabla) recibe la curva ya bajada; amigo trae apodo, codigo y skin (objeto de SKINS).
  function elegirSombraAmigo(o) {
    estilos();
    const p = leer(), previo = document.activeElement;
    const box = document.createElement('div');
    box.id = 'cc-rank';
    box.innerHTML = `<div class="cc-rk" role="dialog" aria-modal="true" aria-labelledby="cc-sa-t">
      <header><div><h2 id="cc-sa-t">${T('Sombra de un amigo')}</h2><small></small></div><button class="x" type="button" aria-label="${T('Cerrar')}">✕</button></header>
      <ol aria-live="polite"></ol><div class="pie"><p class="ayuda">${T('Bajás su mejor partida y corrés contra ella. Solo se ven las de amigos aceptados.')}</p></div></div>`;
    document.body.appendChild(box);
    const ol = box.querySelector('ol'), ayuda = box.querySelector('.ayuda');
    box.querySelector('small').textContent = T(o.titulo || (juego(o.juego) || {}).nombre || '');
    function cerrar() { box.remove(); removeEventListener('keydown', tecla, true); if (previo && previo.focus) previo.focus(); }
    function tecla(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); } else e.stopPropagation(); }
    addEventListener('keydown', tecla, true);
    box.querySelector('.x').addEventListener('click', cerrar);
    box.addEventListener('click', e => { if (e.target === box) cerrar(); });
    const msg = t => { ol.innerHTML = '<li class="msg"></li>'; ol.firstChild.textContent = t; };
    if (sinRed()) return msg(sinRed().msg);
    if (!p.apodo) return msg(T('Poné un apodo en el Ranking y sumá amigos para correr contra sus sombras.'));
    if (!p.amigos.length) return msg(T('Todavía no tenés amigos aceptados. Sumalos desde la portada, en Amigos.'));
    for (const a of p.amigos) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="n" translate="no"></span>' + o.opciones.map((x, k) => `<button class="link" type="button" data-k="${k}"></button>`).join('');
      li.querySelector('.n').textContent = a.apodo;
      li.querySelectorAll('button').forEach(b => { b.textContent = T(o.opciones[+b.dataset.k].nombre); b.style.marginLeft = '0'; });
      li.addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b) return;
        const op = o.opciones[+b.dataset.k];
        ayuda.textContent = Tlit('Bajando la sombra de {a}…', { a: a.apodo });
        try {
          const S = await sombraDeAmigo(a.codigo, o.juego, op.tabla);
          if (!S) { ayuda.textContent = Tlit('{a} todavía no tiene sombra en {m}.', { a: a.apodo, m: T(op.nombre) + (o.detalle ? ' (' + T(o.detalle) + ')' : '') }); return; }
          cerrar();
          o.alElegir(S, { apodo: a.apodo, codigo: a.codigo, skin: SKINS.find(s => s.id === a.skin) || SKINS[0] }, op.tabla);
        } catch (err) { ayuda.textContent = T('No se pudo bajar la sombra. Probá de nuevo.'); }
      });
      ol.appendChild(li);
    }
    const b = ol.querySelector('button'); if (b) b.focus();
  }
  function leerSombras() { try { const o = JSON.parse(localStorage.getItem(SOMBRAS)); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  const sombra = {
    VERSION: SOMBRA_V, MAX: SOMBRA_MAX, codificar: codificarSombra, decodificar: decodificarSombra,
    // cada: ms mínimos entre puntos (para juegos donde el valor cambia en cada cuadro)
    grabar(o = {}) {
      const pts = [], cada = o.cada || 0;
      let pendiente = null;   // el último cambio que no se guardó por `cada`
      const poner = (ms, v) => { pts.push([Math.max(0, Math.round(ms)), v]); pendiente = null; };
      return {
        puntos: pts,
        marca(ms, valor) {
          valor = Math.round(valor);
          if (pendiente && ms - pts[pts.length - 1][0] >= cada) poner(...pendiente);
          const u = pts[pts.length - 1];
          if ((pendiente || u || [0, 0])[1] === valor) return;
          if (u && ms - u[0] < cada) pendiente = [ms, valor]; else poner(ms, valor);
        },
        // cierra la curva (guardar() lo llama solo)
        cerrar() { if (pendiente) poner(...pendiente); },
      };
    },
    guardar(jid, tid, g, valor) {
      const pts = g && (g.puntos || g);
      if (!Array.isArray(pts) || !pts.length || !(+valor > 0)) return false;
      if (g.cerrar) g.cerrar();
      const todas = leerSombras(), clave = jid + ':' + tid, vieja = todas[clave];
      if (vieja && !mejor(tablaDe(jid, tid), +valor, vieja.valor)) return false;
      todas[clave] = { s: codificarSombra(pts), valor: +valor, fecha: Date.now(), subir: 1 };
      try { localStorage.setItem(SOMBRAS, JSON.stringify(todas)); } catch (e) { return false; }
      subirSombras();
      return true;
    },
    cargar(jid, tid) {
      const x = leerSombras()[jid + ':' + tid], pts = x && decodificarSombra(x.s);
      return pts ? curvaSombra(pts, { valor: x.valor, fecha: x.fecha, texto: x.s }) : null;
    },
    desde: (s, extra) => { const pts = decodificarSombra(s); return pts ? curvaSombra(pts, extra) : null; },
    subir: subirSombras, deAmigo: sombraDeAmigo, elegirAmigo: elegirSombraAmigo,
    activa(jid) { try { return !(JSON.parse(localStorage.getItem(SOMBRA_NO)) || {})[jid]; } catch (e) { return true; } },
    elegir(jid, si) {
      let o = {};
      try { o = JSON.parse(localStorage.getItem(SOMBRA_NO)) || {}; } catch (e) {}
      if (si) delete o[jid]; else o[jid] = 1;
      try { localStorage.setItem(SOMBRA_NO, JSON.stringify(o)); } catch (e) {}
      return !!si;
    },
    // Juegos de aguantar: una barrita arriba que se llena hasta tu récord ("hasta acá llegaste la otra vez").
    //   const m = CC.sombra.marca('lluvia', 'normal');  m.ver(puntos) en cada cuadro;  m.quitar() al terminar
    marca(jid, tid) {
      const tb = tablaDe(jid, tid), recd = leer().mejores[jid + ':' + tid];
      const nada = { ver() {}, quitar() {}, record: null };
      if (!(recd > 0) || (tb && tb.orden === 'menor')) return nada;
      estilos();
      const el = document.createElement('div');
      el.className = 'cc-marca';
      el.innerHTML = '<i></i><span>🏁</span>';
      el.title = T('Hasta acá llegaste la otra vez: {v}', { v: formato(recd, tb) });
      document.body.appendChild(el);
      const barra = el.firstChild;
      let ultimo = -1, paso = false;
      return {
        record: recd,
        ver(v) {
          const f = Math.max(0, Math.min(1, v / recd)), q = Math.round(f * 200);
          if (q !== ultimo) { ultimo = q; barra.style.width = (f * 100) + '%'; }
          if (!paso && v > recd) {
            paso = true; el.classList.add('paso');
            avisar(`<b>${T('¡Pasaste tu marca!')}</b><br>${T('La otra vez llegaste a {v}', { v: formato(recd, tb) })}`, 2200);
          }
        },
        quitar() { el.remove(); },
      };
    },
    // "+0,8 s" / "−1,2 s" (negativo = vas adelante)
    textoDif(ms) { const s = Math.abs(ms) / 1000; return (ms < 0 ? '−' : '+') + coma(s.toFixed(1)) + ' s'; },
  };

  // ---------- sensación de juego ----------
  // Reducir movimiento: se elige en Opciones de la portada (`cubo-movimiento`: '0' = menos movimiento, '1' = todo).
  // Si nunca se tocó, sigue lo que pide el sistema (prefers-reduced-motion). Los juegos lo leen en CC.menosMovimiento
  // (sin temblor de pantalla ni sacudones); las animaciones CSS de la página se apagan solas con la clase cc-quieto.
  const menosMovimiento = (() => {
    let g = null;
    try { g = localStorage.getItem('cubo-movimiento'); } catch (e) {}
    if (g === '0') return true;
    if (g === '1') return false;
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  })();
  if (menosMovimiento) {
    document.documentElement.classList.add('cc-quieto');
    const st = document.createElement('style');
    st.textContent = 'html.cc-quieto *,html.cc-quieto *::before,html.cc-quieto *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}';
    (document.head || document.documentElement).appendChild(st);
  }
  // Frenar el juego un instante (hitstop): al chocar o perder, la imagen se queda quieta unos ms y el golpe se siente.
  // El juego llama CC.frenar(ms) y en su frame, si CC.frenado(now), dibuja sin avanzar la física.
  let frenadoHasta = 0;
  function frenar(ms = 90) { frenadoHasta = Math.max(frenadoHasta, performance.now() + ms); }
  const frenado = (now = performance.now()) => now < frenadoHasta;
  // Guía de los primeros segundos, sin leer: los botones ← → laten uno y otro con una manito, en las primeras
  // partidas de cada juego (o siempre, con o.siempre). Se va sola al primer toque (guia.listo()) o a los o.ms.
  //   const guia = CC.guia('lluvia', [btnIzq, btnDer]);  …  al primer toque: guia.listo();
  function guia(jid, botones, o = {}) {
    const nada = { listo() {} };
    const els = (botones || []).filter(Boolean);
    if (!els.length || (!o.siempre && (leer().partidas[jid] || 0) >= (o.partidas ?? 3))) return nada;
    if (!document.getElementById('cc-guia-css')) {
      const st = document.createElement('style');
      st.id = 'cc-guia-css';
      st.textContent = `
.cc-guia{animation:cc-guia-late 1.1s ease-in-out infinite;outline:0 solid rgba(255,204,41,.9);outline-offset:2px}
.cc-guia-2,.cc-guia-2 .cc-guia-dedo{animation-delay:.55s}
.cc-guia-dedo{position:absolute;left:50%;top:58%;font-size:34px;line-height:1;pointer-events:none;z-index:2;opacity:0;
  filter:drop-shadow(0 2px 0 rgba(29,35,64,.35));animation:cc-guia-dedo 1.1s ease-in-out infinite}
@keyframes cc-guia-late{0%,45%,100%{outline-width:0}20%{outline-width:6px}}
@keyframes cc-guia-dedo{0%,100%{opacity:0;transform:translate(-50%,14px)}15%{opacity:1;transform:translate(-50%,0)}40%{opacity:0;transform:translate(-50%,-4px)}}
html.cc-quieto .cc-guia{animation:none;outline-width:5px}
html.cc-quieto .cc-guia-dedo{animation:none;opacity:1;transform:translate(-50%,0)}`;
      document.head.appendChild(st);
    }
    const dedos = els.map((el, k) => {
      el.classList.add('cc-guia', k % 2 ? 'cc-guia-2' : 'cc-guia-1');
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      const d = document.createElement('span');
      d.className = 'cc-guia-dedo'; d.textContent = '👆'; d.setAttribute('aria-hidden', 'true');
      el.appendChild(d);
      return d;
    });
    let fuera = false;
    const listo = () => {
      if (fuera) return;
      fuera = true; clearTimeout(timer);
      for (const el of els) el.classList.remove('cc-guia', 'cc-guia-1', 'cc-guia-2');
      for (const d of dedos) d.remove();
    };
    const timer = setTimeout(listo, o.ms || 6000);
    return { listo };
  }

  // ---------- joystick (Gamepad API) ----------
  // Para Steam Deck y joysticks en la compu: los botones se traducen a eventos de teclado, así cada juego los entiende
  // sin cambiar nada. Primer joystick: cruz, palanca izquierda o gatillos L/R → ← →; cruz ↑ ↓ → ↑ ↓ (menús);
  // A → Enter (o toca el botón que tiene el foco); B → Escape; Y → R (reiniciar). Segundo joystick: ← → como A/D
  // (el jugador de arriba en Paleta, el de la izquierda en Pulseada de a dos).
  const JOY_MAPA = [
    { tecla: 'ArrowLeft', code: 'ArrowLeft', b: [14, 4, 6], eje: [0, -1] },
    { tecla: 'ArrowRight', code: 'ArrowRight', b: [15, 5, 7], eje: [0, 1] },
    { tecla: 'ArrowUp', code: 'ArrowUp', b: [12], eje: [1, -1] },
    { tecla: 'ArrowDown', code: 'ArrowDown', b: [13], eje: [1, 1] },
    { tecla: 'Enter', code: 'Enter', b: [0, 9], aceptar: true },
    { tecla: 'Escape', code: 'Escape', b: [1, 8] },
    { tecla: 'r', code: 'KeyR', b: [3] },
  ];
  const JOY_MAPA2 = [
    { tecla: 'a', code: 'KeyA', b: [14, 4, 6, 2], eje: [0, -1] },
    { tecla: 'd', code: 'KeyD', b: [15, 5, 7, 1], eje: [0, 1] },
  ];
  const joyEstado = new Map();   // 'índice:tecla' → apretado
  let joyAndando = false;
  function teclaSintetica(tipo, m) {
    const destino = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body || document;
    destino.dispatchEvent(new KeyboardEvent(tipo, { key: m.tecla, code: m.code, bubbles: true, cancelable: true }));
  }
  function leerJoysticks() {
    let pads = [];
    try { pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(p => p && p.connected); } catch (e) {}
    if (!pads.length) { joyAndando = false; return; }
    pads.slice(0, 2).forEach((p, k) => {
      for (const m of k === 0 ? JOY_MAPA : JOY_MAPA2) {
        const boton = m.b.some(i => p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
        const eje = m.eje && p.axes[m.eje[0]] != null && p.axes[m.eje[0]] * m.eje[1] > 0.5;
        const ahora = !!(boton || eje), clave = k + ':' + m.tecla, antes = !!joyEstado.get(clave);
        if (ahora === antes) continue;
        joyEstado.set(clave, ahora);
        if (ahora && m.aceptar && document.activeElement && document.activeElement !== document.body && document.activeElement.matches('button, [role="radio"], a')) {
          document.activeElement.click();   // A sobre un botón con foco: lo toca
          continue;
        }
        teclaSintetica(ahora ? 'keydown' : 'keyup', m);
      }
    });
    requestAnimationFrame(leerJoysticks);
  }
  function arrancarJoysticks() { if (!joyAndando) { joyAndando = true; requestAnimationFrame(leerJoysticks); } }
  addEventListener('gamepadconnected', arrancarJoysticks);
  addEventListener('gamepaddisconnected', () => {
    // suelta lo que haya quedado apretado
    for (const [clave, si] of joyEstado) if (si) {
      const [k, tecla] = clave.split(':'), m = (k === '0' ? JOY_MAPA : JOY_MAPA2).find(x => x.tecla === tecla);
      if (m) teclaSintetica('keyup', m);
    }
    joyEstado.clear();
  });
  try { if (navigator.getGamepads && [...navigator.getGamepads()].some(p => p && p.connected)) arrancarJoysticks(); } catch (e) {}

  // Chrome bloquea (y avisa en consola) la vibración antes del primer toque del usuario.
  // Se apaga desde Opciones en la portada (cubo-vibrar = '0').
  function vibrar(ms = 12) {
    try { if (localStorage.getItem('cubo-vibrar') === '0') return; } catch (e) {}
    try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) {}
  }
  function volver() { location.href = 'index.html'; }

  window.CuboComun = {
    SKINS, EFECTOS, TITULOS, PASE_MAX, DIFS, DURAS, JUEGOS, LOGROS, MEDALLAS, UMBRALES, canjear, marcar, leyendaTeclas, escalaUI,
    titulo, elegirTitulo, pase, MARCOS, marco, elegirMarco, agregarAmigo, quitarAmigo, refrescarAmigos, versus,
    responderSolicitud, solicitudesNuevas, marcarSolicitudesVistas,
    xpPara, nivelDe, perfil, skin, efecto, elegirSkin, elegirEfecto, libre, nuevos, marcarVistos,
    sumarXP, xpEscala, partida, importarRecord, anotarRecord, revisarLogros, tieneLogro,
    claseNombre, estilos, juego, tablaDe, formato, iconoDif, selectorDif, verRanking, top, ponerApodo, vincular, limpiarApodo, rankingActivo, subirPendientes,
    avisar, vibrar, volver, dibujarCubo, pulseada, morir, sombra, pedirApodo, diario, diarioDe, azar, faltaTexto,
    temporada, misiones, eventoXP, TEMP_XP, sincronizarNube, menosMovimiento, frenar, frenado, guia, T, Tsin: Tlit, textos, idioma, IDIOMAS, ponerIdioma, LOCALE, traducirNodo,
    verPerfil, perfilPublico, horasTexto, empezar,
    RAREZAS, rarezaTitulo, pintarTitulo, rangoLogro, medallaLogro, NOMBRE_RANGO, maestria, maestrias, insigniaMaestria, RANGOS_MAESTRIA,
    vitrinaDe, elegirVitrina, VITRINA_MAX,
  };
  // Duelos 1v1 (cubo-duelo.js): usa la misma conexión a Supabase y escucha las invitaciones en todas las páginas.
  window.CuboComun.RANKING = RANKING;
  const cargarDuelo = () => {
    if (!rankingActivo() || window.CuboDuelo || document.querySelector('script[src$="cubo-duelo.js"]')) return;
    const s = document.createElement('script'); s.src = 'cubo-duelo.js'; s.async = true; document.head.appendChild(s);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cargarDuelo); else cargarDuelo();
})();
