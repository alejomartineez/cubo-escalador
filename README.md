# TwoFingers

Juegos de navegador livianos que se juegan solo con dos flechas, izquierda y derecha.

**Jugar:** https://alejomartineez.github.io/cubo-escalador/

Se instala como app en el celu (botón **Instalar** arriba, o en iPhone: Compartir → Agregar a inicio) y funciona sin conexión.

La pantalla principal muestra un juego por slide. Todos los juegos suman XP al mismo perfil: subís de nivel, desbloqueás personajes y efectos, conseguís logros y competís en el ranking online.

| Juego | De qué se trata |
|---|---|
| Escalador | Subí escalones en zigzag. Si errás, el cubo queda mareado. Sprint 100, 30 segundos, Libre (hasta el espacio) y Lava, en Normal, Extremo y Maestro. En Extremo y Maestro el escalón se rompe si te quedás quieto (2 s y 1,6 s). |
| Lluvia | Movete entre carriles y esquivá los bloques que caen. |
| Ritmo | Tocá el lado de cada nota justo cuando llega a la línea. Modo Infinito (el BPM sube) y modo Canciones: 3 temas CC0 de Juhani Junkala con la partitura sacada del audio y estrellas por precisión. Tiene un calibrador en dos pruebas, como Clone Hero o Rhythm Quest (aparece la primera vez y queda en el menú): con el sonido mide cuánto te adelantás o atrasás, y con la imagen si tu pantalla o tus auriculares tienen demora, y corre las notas para que coincidan. Al terminar una partida, si tocaste corrido para un lado, ofrece corregirlo. |
| Vóley | Movete y devolvé la pelota a rivales cada vez mejores. |
| Zigzag | Una flecha sube sola en diagonal: `←` la manda para la izquierda y `→` para la derecha. Pasá por un túnel en zigzag que se angosta y acelera, con salas llenas de pinches. El túnel siempre tiene paso (el camino es una línea a 45°, como la flecha). Se mide en metros. |
| Esquí | Slalom entre banderas, cada vez más rápido. |
| Pulseada | Alterná lo más rápido que puedas para ganarle al rival. |

Controles: `←` `→` o `A` `D` en la compu, `R` reinicia; botones grandes y ↻ en el celu. Todos los juegos tienen Fácil, Normal, Difícil, Extremo y Maestro.

## Progreso

- **XP:** depende de qué tan bien jugaste (por ejemplo, en Sprint 100 un tiempo más bajo da más XP). Récord personal +25 %. Dificultad: Fácil ×1, Normal ×1,5, Difícil ×2, Extremo ×3, Maestro ×4.
- **Personajes, efectos y títulos:** 39 personajes, 19 efectos y 22 títulos; la mayoría se desbloquea por nivel y algunos solo con logros.
- **Nivel:** un solo camino del nivel 1 al 100 (pestaña Nivel en la pantalla principal). Cada nivel da algo: personaje, efecto, brillo o título. Lo que no sale por nivel se gana con logros o códigos.
- **Legendarias:** 10 personajes que brillan (4 son exclusivas, hechas a pedido para una persona: Dev, Sonrisa de metal, McLovin (la de Benja) y Piloto) y 5 efectos. Salen con secretos (logros ocultos) o con códigos que se canjean en Personaje. Un código puede dar varias cosas: en `CODIGOS` va una lista con ids de skins o `fx:<id>` para efectos. En `cubo-comun.js` solo se guarda el hash de cada código (`CODIGOS`); para agregar uno: `node -e "console.log(require('crypto').createHash('sha256').update('cubo:' + 'MICODIGO').digest('hex'))"` (en mayúsculas, sin espacios ni guiones). Un personaje puede tener muerte propia (`muerte` en `SKINS`, por ahora solo Geo, que se parte en pedazos con una onda expansiva): los juegos llaman a `CC.morir()` cuando chocás o perdés.
- **Logros:** bronce, plata, oro y diamante, pensados para un jugador promedio (por ejemplo, Sprint 100 en menos de 20 s, 14 s, 12 s y 11 s).
- **Premios de juegos que ya no están:** Clasificador, Equilibrio, Paseo y Cohete se sacaron. Sus premios pasaron a otros logros de diamante: Cajita a Ritmo, Huellitas a Vóley, y Equilibrista y Estela espacial a Zigzag. Quien ya los había ganado los sigue teniendo (`antes` en `SKINS`/`EFECTOS` guarda el logro viejo).
- **Apodo la primera vez:** al entrar a jugar por primera vez (Jugar en la portada del hub, o al abrir un juego directo por link) aparece «¿Cómo te llamás?» para elegir el apodo del ranking, o entrar con la clave de otro dispositivo (`CC.pedirApodo`). Sale una sola vez por dispositivo (`cubo-apodo-pedido`), aunque toques «Ahora no»; después se cambia desde cualquier ranking.
- **Ranking:** online por juego y dificultad. Cada apodo es de una sola persona y se muestra siempre con su skin actual. Para usar el mismo apodo en otro dispositivo, el ranking te da una clave. Guarda la mejor marca de cada jugador.
- **Sombra:** jugás contra tu mejor partida, como un cubo transparente que muestra cómo avanzaste esa vez. No repite las teclas (los niveles salen distintos cada vez): es una curva de progreso, tiempo → escalones, metros o toques. La lógica está en `CC.sombra` (`cubo-comun.js`): `grabar()` junta los puntos, `guardar()` la deja como sombra si es la primera o mejor que la anterior de esa tabla, y `cargar()` la devuelve con `valorEn(ms)` y `tiempoPara(valor)`. Se guarda en `localStorage` (`cubo-sombras`) como un texto corto: `"1:"` + los saltos de ms en base 36 (y `~` + el salto del valor si no subió de a 1). Si pasa de 2.000 caracteres, se juntan los puntos de a pares.
  - **Escalador** (Sprint 100 y 30 segundos, por tabla y dificultad): el cubo fantasma sube a su ritmo y arriba a la derecha dice cuánto vas adelante o atrás (Sprint: «−1,2 s» en verde si vas adelante; 30 s: en escalones). En Extremo y Maestro no se dibuja si está en escalones que todavía no ves. El interruptor **Sombra: sí/no** del menú se recuerda (`cubo-sombra-no`).
  - **Pulseada:** la sombra es tu ronda de mejor ritmo (toques/s). **👻 Contra tu sombra** (en el menú y en el fin) es una ronda donde el rival empuja con esa curva, pasada por el mismo filtro que tu fuerza. Si le ganás, tu ronda pasa a ser la sombra. No suma al ranking.
  - **Esquí:** la sombra baja por el medio de las puertas de esta pista, a los metros que llevabas en ese segundo, y queda mareada donde te caíste. También tiene interruptor en el menú.
  - **Lluvia y Zigzag:** una barrita arriba de todo que se llena hasta tu récord (`CC.sombra.marca`): «hasta acá llegaste la otra vez». Cuando lo pasás se pone dorada y avisa. En Zigzag, además, hay una línea amarilla en el túnel a la altura de tu récord.
- **Amigos y versus:** cada jugador con apodo tiene un código de amigo de 6 letras. Poner el código de alguien (botón de amigos arriba a la derecha) le manda una **solicitud**; no son amigos hasta que la acepta. Solo los amigos aceptados, de los dos lados, se ven en el ranking de amigos, tienen versus (tu mejor marca contra la suya en cada modo que jugaron los dos) y se retan a un 1v1 en vivo en Pulseada o Escalador (`cubo-duelo.js`, por Supabase Realtime).
  - **El flujo:** A pone el código de B → a B le aparece en la hoja de Amigos, en *Te quieren agregar*, con **Aceptar** y **Rechazar**, y el botón Amigos muestra un numerito con las solicitudes que todavía no vio. A la ve en *Esperando que acepten* y la puede cancelar. Si B acepta (o si B también puso el código de A), quedan amigos. Si B rechaza, a A le sigue figurando pendiente y no le vuelve a llegar a B. Sacar a un amigo lo saca de los dos lados y cancela los retos pendientes entre ellos.
  - **Del lado del servidor:** la tabla `amistades` de `supabase.sql` es la que manda (el navegador solo guarda una copia). Nadie la lee directo: se usa por funciones (`pedir_amistad`, `responder_amistad`, `quitar_amistad`, `mis_amigos`). `retar` solo deja retar a un amigo aceptado, `mis_retos` solo devuelve retos de amigos y `responder_reto` no deja aceptar el de alguien que ya no es amigo. El aviso en vivo por Realtime solo hace que el juego le pregunte a `mis_retos`, así que un mensaje armado a mano no muestra nada.
  - **Sombra de un amigo:** en el menú de Escalador, **👥 Amigo** abre la lista de amigos aceptados con un botón para Sprint 100 y otro para 30 s (en la dificultad elegida). Recién ahí se baja su sombra (`sombra_de_amigo`, que solo la devuelve si son amigos aceptados) y corrés contra su cubo transparente, con su personaje. Tu sombra se sube sola cuando hacés una nueva (`subir_sombra`, una por jugador, juego y tabla, hasta 2.100 caracteres), solo si tenés apodo; si no hay internet, queda marcada y se sube después.
  - **Los amigos de antes** (cuando agregar era directo y se guardaban en cada dispositivo) se suben solos la primera vez que se abre la versión nueva con apodo (`migrar_amigos`): cada uno queda como solicitud tuya, y si el otro también te tenía agregado, quedan amigos sin que nadie tenga que aceptar. No se pierde ninguno: los que eran de un solo lado esperan que el otro acepte.

## Archivos

- `hub.html`: pantalla principal (sale como `index.html`). Al entrar muestra la portada (Jugar, Opciones y redes): el cubo de la pantalla de carga salta hasta ella (`window.alSalirCarga`, que llama `build.mjs`). Las redes van en `REDES` y las opciones (sonido de todos los juegos, vibración, ver la portada) en `OPCIONES`.
- `cubo-escalador.html`, `modo-*.html`: los juegos.
- `cubo-comun.js`: perfil compartido (nivel, XP, personajes, efectos, logros, récords), ranking, selector de dificultad y el dibujo del cubo.
- `supabase.sql`: tablas y funciones del ranking, los amigos, los retos y las sombras. Está armado por partes, una por cada vez que cambió el esquema: cuando se agrega una parte, se corre solo esa en el SQL Editor de Supabase (correr el archivo entero de nuevo falla en la vista `ranking`).
- `build.mjs`: arma `docs/` con las páginas, el manifest, los íconos y el service worker para jugar sin conexión.
- `paginas.mjs`: la lista de páginas con su descripción (la que aparece al compartir el link).
- `musica/`: las canciones de Ritmo (mp3) y `canciones.json` con BPM, desfase y la fuerza de cada semicorchea (de ahí sale la partitura de cada dificultad). `canciones.json` sale del audio con `python musica/analizar.py` (necesita numpy y ffmpeg): correrlo cada vez que se cambia o se suma una canción.
- `og.mjs` y `og/`: las imágenes que se ven al compartir el link (una por juego), dibujadas con Chrome a partir de `og/plantilla.html`.

## Cómo actualizar el sitio

Después de cambiar algo:

```bash
node build.mjs
git add -A
git commit -m "Actualizar juegos"
git push
```

`build.mjs` arma la carpeta `docs/`, que es la que publica GitHub Pages. Para sumar un juego, agregalo a `PAGES` en `paginas.mjs` (y corré `node og.mjs` para su imagen), a `JUEGOS` en `cubo-comun.js` y su dibujo a `DIBUJOS` en `hub.html`.
