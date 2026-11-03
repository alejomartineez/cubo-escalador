# Cubo Escalador

Juegos de navegador livianos que se juegan solo con dos flechas, izquierda y derecha.

**Jugar:** https://alejomartineez.github.io/cubo-escalador/

Se instala como app en el celu (botón **Instalar** arriba, o en iPhone: Compartir → Agregar a inicio) y funciona sin conexión.

La pantalla principal muestra un juego por slide. Todos los juegos suman XP al mismo perfil: subís de nivel, desbloqueás personajes y efectos, conseguís logros y competís en el ranking online.

| Juego | De qué se trata |
|---|---|
| Escalador | Subí escalones en zigzag. Si errás, el cubo queda mareado. Sprint 100, 30 segundos, Libre (hasta el espacio) y Lava, en Normal, Extremo y Maestro. |
| Lluvia | Movete entre carriles y esquivá los bloques que caen. |
| Clasificador | Mandá cada cubo a la caja de su color. |
| Equilibrio | Corregí la tabla para que no te tire el viento. |
| Ritmo | Tocá el lado de cada nota justo cuando llega a la línea. |
| Vóley | Movete y devolvé la pelota a rivales cada vez mejores. |
| Paseo | Alterná las flechas para caminar con tu mascota sin que se escape. |
| Serpiente | Doblás a la izquierda o a la derecha según hacia dónde vas. |
| Cohete | Cada flecha prende un propulsor. |
| Esquí | Slalom entre banderas, cada vez más rápido. |
| Pulseada | Alterná lo más rápido que puedas para ganarle al rival. |

Controles: `←` `→` o `A` `D` en la compu, `R` reinicia; botones grandes y ↻ en el celu. Todos los juegos tienen Fácil, Normal, Difícil, Extremo y Maestro.

## Progreso

- **XP:** depende de qué tan bien jugaste (por ejemplo, en Sprint 100 un tiempo más bajo da más XP). Récord personal +25 %. Dificultad: Fácil ×1, Normal ×1,5, Difícil ×2, Extremo ×3, Maestro ×4.
- **Personajes y efectos:** 34 personajes y 12 efectos; la mayoría se desbloquea por nivel y algunos solo con logros.
- **Legendarias:** 6 personajes que brillan. Tres salen con secretos (logros ocultos) y tres con códigos que se canjean en Personaje. En `cubo-comun.js` solo se guarda el hash de cada código (`CODIGOS`); para agregar uno: `node -e "console.log(require('crypto').createHash('sha256').update('cubo:' + 'MICODIGO').digest('hex'))"` (en mayúsculas, sin espacios ni guiones).
- **Logros:** bronce, plata, oro y diamante, pensados para un jugador promedio (por ejemplo, Sprint 100 en menos de 20 s, 14 s, 12 s y 11 s).
- **Ranking:** online por juego y dificultad, con apodo. Guarda la mejor marca de cada jugador.

## Archivos

- `hub.html`: pantalla principal (sale como `index.html`).
- `cubo-escalador.html`, `modo-*.html`: los juegos.
- `cubo-comun.js`: perfil compartido (nivel, XP, personajes, efectos, logros, récords), ranking, selector de dificultad y el dibujo del cubo.
- `supabase.sql`: tablas y función del ranking. Se corre una vez en el SQL Editor de Supabase.
- `build.mjs`: arma `docs/` con las páginas, el manifest, los íconos y el service worker para jugar sin conexión.

## Cómo actualizar el sitio

Después de cambiar algo:

```bash
node build.mjs
git add -A
git commit -m "Actualizar juegos"
git push
```

`build.mjs` arma la carpeta `docs/`, que es la que publica GitHub Pages. Para sumar un juego, agregalo a `PAGES` en `build.mjs`, a `JUEGOS` en `cubo-comun.js` y su dibujo a `DIBUJOS` en `hub.html`.
