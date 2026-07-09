# Plan de Rediseño ICC — Hacia un producto premium y de alto impacto

> Auditoría de 5 agentes (dirección de arte, sistema visual, UX/flujos, movimiento/rendimiento,
> accesibilidad) contrastada contra el **CSS de producción real de spacex.com**.
> Todas las cifras de este documento están verificadas ejecutando comandos sobre el repo,
> no estimadas. Fecha: 2026-07-09.

---

## 1. El diagnóstico, en una frase

**SpaceX construye jerarquía con ausencia. ICC la construye con acumulación.**

En cada eje donde SpaceX resta, ICC suma. No es una diferencia de gusto: es medible.

| Eje | spacex.com (verificado en su CSS) | ICC hoy (medido en `web/css/`) |
|---|---|---|
| Fondo | `#000` negro puro | **3 negros divergentes**: `#05070f`, `#04060d`, `#05080f` |
| Texto | `#F0F0FA` — nunca blanco puro | `#e8eefc` / `#eef3ff` (2 valores) |
| Color de acento | **1 solo hex de color** en toda la hoja | **69 hex distintos**, 41 de ellos hardcodeados |
| `box-shadow` | **Cero. Ninguna.** | **50 sombras únicas** |
| Gradientes | Cero. Oscurecen con `backdrop-filter: brightness(.5)` | Omnipresentes |
| `border-radius` | Aparece **1 vez** en todo el sitio | **20 valores distintos** |
| Pesos tipográficos | **Uno** (400). El bold es otro archivo | Mezcla de 500/600/700/800 |
| Escala tipográfica | h1 48px, h2 48px, h3 20px, body 16px | **51 tamaños distintos**, con pasos de 0,5px |
| Jerarquía | Por tamaño, MAYÚSCULAS y opacidad | Por peso y color |
| Layout | Secciones `height: max(100vh, 941px)` full-bleed | Grid de 2 columnas encajonado |
| Movimiento | `translateY + fade`, `.75s ease-in-out`, escalonado 0/.5s/1s | **6 `cubic-bezier` distintos** + pulsos infinitos |
| Tokens | Sistema único | **10 archivos con `:root`**; `--accent` copiado a mano 5 veces |

**Traducción:** el problema no es que ICC "necesite más diseño". Es que tiene demasiado, sin sistema.
El camino a premium es *quitar*, no añadir.

---

## 2. Una advertencia que conviene leer antes de empezar

**Aplicar SpaceX literalmente al simulador sería un error.**

SpaceX vende confianza en ingeniería: quietud, monocromo, cero feedback lúdico. ICC tiene un
**juego** en el corazón, y un juego necesita *juice*: color funcional, respuesta inmediata,
celebración. Si le quitamos el movimiento y el color al simulador, quedará elegante y muerto.

Por eso el plan separa dos registros:

- **Superficies de marca** (landing, inversores, prensa, one-pager, ranking, teaser):
  SpaceX puro. Negro, monocromo, mayúsculas, full-bleed, quietud.
- **Superficie de juego** (el simulador y su HUD): mismo *sistema* (tipografía, negro, tokens,
  cero sombras gratuitas), pero **conserva color funcional y movimiento** — el color pasa a
  significar algo (estado, mundo, éxito) en vez de decorar.

Regla que lo unifica: **el color solo aparece cuando comunica**. En marca lo aporta la media
(el balón, la Luna, la Tierra). En juego lo aporta el estado.

---

## 3. Fases

### Fase 0 — Bugs que están costando dinero ahora mismo

No son "diseño". Son fallos que anulan trabajo ya hecho. Van primero.

| # | Bug | Evidencia | Impacto |
|---|---|---|---|
| 0.1 | **El botón "Compartir" se apaga solo a los 2,4 s** | `.shot-celebration.show { animation: celebrate 2.4s forwards }` acaba en `opacity:0`; `#share` vive dentro (`main.js:106`) | Mata el bucle viral en su punto de máxima intención |
| 0.2 | **El canvas nunca escala por `devicePixelRatio`** | Cero menciones en `simulator.js` | El producto **se ve borroso** en todo móvil y todo Mac |
| 0.3 | **El bucle `idle()` no para nunca** | `requestAnimationFrame` perpetuo; ningún `visibilitychange` en `web/js/` | Repinta a 60 fps con la pestaña oculta; quema batería |
| 0.4 | **Un disparo épico no puntúa si no escribiste el club antes** | `main.js: if (!club) return;` sin prompt | Se pierde el score y el lead |
| 0.5 | **La landing de inversores no está enlazada desde ningún sitio** | `index.html` solo enlaza a `leaderboard.html` | El activo de negocio es inalcanzable desde el activo de tracción |

### Fase 1 — Fundamentos: un solo sistema

Sin esto, cualquier rediseño se vuelve a descoser.

1. **`tokens.css` único**, importado por todos. Colapsa los namespaces paralelos
   (`--lvl-*`, `--op-*`, `--hud-*`, `--accent-*`) sobre los 3 colores de marca.
   Elimina los 3 negros divergentes → **`#000`**.
2. **Escala tipográfica**: de 51 tamaños a ~8. Un solo peso para texto, uno para display.
   Titulares en MAYÚSCULAS con `letter-spacing: .02em`.
3. **Escala de espaciado**: de ~18 valores arbitrarios a 4/8/12/16/24/40/64.
4. **Sistema de movimiento**: de 6 curvas a **1 dominante** — `cubic-bezier(.16,1,.3,1)`
   (expo-out: la sensación de masa que frena sola) — y 4 duraciones
   (`120ms` UI · `320ms` · `600ms` · `900ms` cine).
   **Fuera `--ease-back`**: el rebote es lo contrario de "pesado".
5. **Purga**: eliminar las 50 sombras y los gradientes decorativos. Profundidad por
   **contraste y espacio**, no por sombra.
6. **Un componente = una definición**. Hoy hay **4 sistemas de botón incompatibles**
   (4 paddings, 3 radios, 2 escalas tipográficas).

### Fase 2 — Estructura: dejar respirar

7. **Hero real en `/`**. Hoy el usuario aterriza directo en un panel de sliders. Necesita
   una promesa antes que un control: *"Dispara un balón en la Luna. Vuela 6× más lejos."*
   Un CTA. Nada más. Los controles aparecen después (progressive disclosure).
8. **Canvas full-bleed**. El simulador es el producto: debe ocupar el viewport, no una celda
   de grid junto a los sliders.
9. **Aligerar el panel**. Hoy acumula ~10 bloques. Separar *jugar* (mundo, potencia, ángulo,
   patear) de *meta-juego* (misiones, logros, ranking, ajustes).
10. **Nav global consistente** en las 7 páginas: `SIMULADOR · RANKING · INVERSORES · PRENSA`.
    Sacar `gallery.html` del deploy público (es una herramienta interna).

### Fase 3 — El clímax

11. **El primer toque lunar es EL momento** y hoy dura menos que un parpadeo. Debe ser
    sostenido y cinematográfico: trayectoria congelada, cámara con desaceleración larga,
    tarjeta de resultado **persistente** (la cierra el usuario, no un temporizador) con
    *Compartir · Reintentar · Fijar mi récord*.
12. **Capturar en la euforia**: pedir club/email justo después del hito, no en un formulario
    aparte al fondo del panel.

### Fase 4 — Rendimiento y pulido

13. Canvas de producción: DPR, fondo estático cacheado en offscreen (hoy se repintan 133
    estrellas y se aloca un `createLinearGradient` **cada frame**), pausa por
    `visibilitychange` e `IntersectionObserver`.
14. Solo animar `transform` y `opacity`. Hoy se animan `width`, `top`, `height`,
    `box-shadow` y `backdrop-filter` (todas fuerzan layout o paint).
15. `defer` en los 12 scripts de `index.html`.
16. Menores de a11y: telemetría en región `aria-live`; breakpoint de 320px en `investors`;
    `.sfx-toggle` a 44×44px.

---

## 4. Lo que la auditoría NO encontró

Vale tanto como lo que encontró, porque acota el trabajo:

- **No hay ningún fallo de contraste.** Los ratios se calcularon con la fórmula WCAG; todos los
  pares pasan AA. El más flojo es `--muted-2` a 5.60:1.
- **El foco visible, los landmarks y la jerarquía de encabezados están correctos.**
- **El resultado del disparo sí se anuncia** a lectores de pantalla (`#status`, `aria-live`).
- **La ingeniería defensiva del JS es sólida**: todos los módulos degradan con elegancia.
- El scroll usa `IntersectionObserver` con throttle por `rAF`. Bien planteado.

Una auditoría anterior había marcado a11y como P0 crítico (menú móvil ausente, focus-trap
inexistente, contraste insuficiente). **Los tres eran falsos positivos**, comprobados uno a uno.

---

## 5. Decisiones tomadas (2026-07-09)

1. **Tipografía → `D-DIN`, autoalojada.**
   Resultó que la fuente exacta de SpaceX **es libre**: Datto la encargó a Monotype y la liberó
   bajo **SIL Open Font License 1.1** (uso comercial, modificación y autoalojado permitidos).
   Repositorio: <https://github.com/amcchord/datto-d-din> — trae `.woff2` en Regular, Bold,
   Condensed y Expanded, con `OFL-1.1.txt`.
   **Restricción:** la CSP del sitio es `font-src 'self'`, así que los `.woff2` van en
   `web/assets/fonts/` con `@font-face` local. Google Fonts por CDN quedaría **bloqueado**.
   *Matiz:* DIN es una grotesca industrial, no una geométrica pura tipo Futura. Cumple el
   requisito (libre, técnica, uppercase-first), pero conviene nombrarla bien.

2. **Color → se conserva el dorado `#ffd35b` como firma de la ICC.**
   Monocromo (negro `#000`, off-white `#F0F0FA`, grises) en todas las superficies, con el dorado
   reservado a **el logro y la luz**: récord batido, logro desbloqueado, rim light de la media.
   Nunca como color de relleno decorativo. El azul `#5b8cff` se degrada a color **funcional**
   dentro del simulador (estado/mundo), no de marca.

3. **Alcance → las 7 páginas.**
   Con la salvedad del propio plan: `gallery.html` sale del deploy público (herramienta interna).

4. **Media → generada con Google Gemini (Veo / Imagen).**
   Prompt pack completo, con reglas, especificación técnica y criterios de aceptación, en
   [MEDIA_PROMPTS.md](./MEDIA_PROMPTS.md).
   Sigue siendo **el riesgo principal del plan** (ver §6): la calidad final del rediseño está
   acotada por la calidad de esta media, no por el CSS.

---

## 6. Riesgo principal

El minimalismo no perdona. SpaceX puede permitirse una pantalla negra con cuatro palabras
porque detrás hay un cohete despegando en 4K. Si quitamos las sombras, los gradientes y el
color sin poner **media de alto impacto** en su lugar, no obtendremos un producto premium:
obtendremos una página vacía.

El orden correcto es: **sistema → media → sustracción**. No al revés.
