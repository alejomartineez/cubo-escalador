# Cubo Escalador

Juegos de navegador livianos que se juegan solo con dos flechas, izquierda y derecha.

**Jugar:** https://alejomartineez.github.io/cubo-escalador/

La pantalla principal muestra un juego por slide. Todos los juegos suman XP al mismo perfil: subís de nivel y desbloqueás personajes, que se ven en todos los juegos.

| Juego | De qué se trata |
|---|---|
| Escalador | Subí escalones en zigzag. Si errás, el cubo queda mareado medio segundo. Modos Sprint 100, 30 segundos y Libre (hasta el espacio). |
| Lluvia | Movete entre carriles y esquivá los bloques que caen. |
| Clasificador | Mandá cada cubo a la caja de su forma. |
| Equilibrio | Corregí la cuerda floja para que no te tire el viento. |
| Ritmo | Tocá cada flecha justo cuando llega a la línea, al ritmo de la música. |

Controles: `←` `→` o `A` `D` en la compu, `R` reinicia la partida; botones grandes y ↻ en el celular. Lluvia, Clasificador, Equilibrio y Ritmo tienen Fácil, Normal y Difícil.

## Archivos

- `hub.html`: pantalla principal (sale como `index.html`).
- `cubo-escalador.html`, `modo-*.html`: los juegos.
- `cubo-comun.js`: perfil compartido (nivel, XP, personajes, récords) y el dibujo del cubo.

## Cómo actualizar el sitio

Después de cambiar algo:

```bash
node build.mjs
git add -A
git commit -m "Actualizar juegos"
git push
```

`build.mjs` arma la carpeta `docs/`, que es la que publica GitHub Pages. Para sumar un juego, agregalo a la lista `PAGES` de `build.mjs` y a `JUEGOS` en `hub.html`.
