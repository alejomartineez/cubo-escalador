# Cubo Escalador

Juegos de navegador livianos que se juegan solo con dos flechas, izquierda y derecha.

**Jugar:** https://alejomartineez.github.io/cubo-escalador/

Se instala como app en el celu (botón **Instalar** arriba, o en iPhone: Compartir → Agregar a inicio) y funciona sin conexión.

La pantalla principal muestra un juego por slide. Todos los juegos suman XP al mismo perfil: subís de nivel, desbloqueás personajes y efectos, conseguís logros y competís en el ranking online.

| Juego | De qué se trata |
|---|---|
| Escalador | Subí escalones en zigzag. Si errás, el cubo queda mareado. Sprint 100, 30 segundos, Libre (hasta el espacio) y Lava, en Normal, Extremo y Maestro. En Extremo y Maestro el escalón se rompe si te quedás quieto (2 s y 1,6 s). |
| Lluvia | Movete entre carriles y esquivá los bloques que caen. |
| Clasificador | Mandá cada cubo a la caja de su color. |
| Equilibrio | Corregí la tabla para que no te tire el viento. |
| Ritmo | Tocá el lado de cada nota justo cuando llega a la línea. Modo Infinito (el BPM sube) y modo Canciones: 3 temas CC0 de Juhani Junkala con la partitura sacada del audio y estrellas por precisión. Tiene un calibrador en dos pruebas, como Clone Hero o Rhythm Quest (aparece la primera vez y queda en el menú): con el sonido mide cuánto te adelantás o atrasás, y con la imagen si tu pantalla o tus auriculares tienen demora, y corre las notas para que coincidan. Al terminar una partida, si tocaste corrido para un lado, ofrece corregirlo. |
| Vóley | Movete y devolvé la pelota a rivales cada vez mejores. |
| Paseo | Alterná las flechas para caminar con tu mascota sin que se escape. |
| Serpiente | Doblás a la izquierda o a la derecha según hacia dónde vas. |
| Cohete | Cada flecha prende un propulsor. |
| Esquí | Slalom entre banderas, cada vez más rápido. |
| Pulseada | Alterná lo más rápido que puedas para ganarle al rival. |

Controles: `←` `→` o `A` `D` en la compu, `R` reinicia; botones grandes y ↻ en el celu. Todos los juegos tienen Fácil, Normal, Difícil, Extremo y Maestro.

## Progreso

- **XP:** depende de qué tan bien jugaste (por ejemplo, en Sprint 100 un tiempo más bajo da más XP). Récord personal +25 %. Dificultad: Fácil ×1, Normal ×1,5, Difícil ×2, Extremo ×3, Maestro ×4.
- **Personajes, efectos y títulos:** 39 personajes, 19 efectos y 22 títulos; la mayoría se desbloquea por nivel y algunos solo con logros.
- **Nivel:** un solo camino del nivel 1 al 100 (pestaña Nivel en la pantalla principal). Cada nivel da algo: personaje, efecto, brillo o título. Lo que no sale por nivel se gana con logros o códigos.
- **Legendarias:** 6 personajes que brillan y 5 efectos. Salen con secretos (logros ocultos) o con códigos que se canjean en Personaje. Un código puede dar varias cosas: en `CODIGOS` va una lista con ids de skins o `fx:<id>` para efectos. En `cubo-comun.js` solo se guarda el hash de cada código (`CODIGOS`); para agregar uno: `node -e "console.log(require('crypto').createHash('sha256').update('cubo:' + 'MICODIGO').digest('hex'))"` (en mayúsculas, sin espacios ni guiones). Un personaje puede tener muerte propia (`muerte` en `SKINS`, por ahora solo Geo, que se parte en pedazos con una onda expansiva): los juegos llaman a `CC.morir()` cuando chocás o perdés.
- **Logros:** bronce, plata, oro y diamante, pensados para un jugador promedio (por ejemplo, Sprint 100 en menos de 20 s, 14 s, 12 s y 11 s).
- **Ranking:** online por juego y dificultad. Cada apodo es de una sola persona y se muestra siempre con su skin actual. Para usar el mismo apodo en otro dispositivo, el ranking te da una clave. Guarda la mejor marca de cada jugador.
- **Amigos y versus:** cada jugador con apodo tiene un código de amigo de 6 letras. Con él se agrega a alguien (botón de amigos arriba a la derecha), se ve el ranking solo con amigos, se juega un versus (tu mejor marca contra la suya en cada modo que jugaron los dos) y se lo reta a un 1v1 en vivo en Pulseada o Escalador (`cubo-duelo.js`, por Supabase Realtime).

## Archivos

- `hub.html`: pantalla principal (sale como `index.html`).
- `cubo-escalador.html`, `modo-*.html`: los juegos.
- `cubo-comun.js`: perfil compartido (nivel, XP, personajes, efectos, logros, récords), ranking, selector de dificultad y el dibujo del cubo.
- `supabase.sql`: tablas y función del ranking. Se corre una vez en el SQL Editor de Supabase.
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
