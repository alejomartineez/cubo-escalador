# Cubo Escalador

Juegos de navegador livianos que se juegan solo con dos flechas, izquierda y derecha.

**Jugar:** https://alejomartineez.github.io/cubo-escalador/

| Juego | De qué se trata |
|---|---|
| Cubo Escalador | Subí escalones en zigzag. Si errás, el cubo queda mareado medio segundo. Modos Sprint 100, 30 segundos y Libre (hasta el espacio). |
| Lluvia | Movete entre carriles y esquivá los bloques que caen. |
| Clasificador | Mandá cada cubo a la caja de su color. |
| Equilibrio | Corregí la tabla para que no te tire el viento. |
| Ritmo | Tocá cada flecha justo cuando llega a la línea, al ritmo de la música. |

Controles: `←` `→` o `A` `D` en la compu; botones grandes o tocar cada mitad de la pantalla en el celular.

## Cómo actualizar el sitio

Los juegos están en los `.html` de la raíz. Después de cambiar alguno:

```bash
node build.mjs
git add -A
git commit -m "Actualizar juegos"
git push
```

`build.mjs` arma la carpeta `docs/`, que es la que publica GitHub Pages. Para sumar un juego nuevo, agregalo a la lista `GAMES` de `build.mjs`.
