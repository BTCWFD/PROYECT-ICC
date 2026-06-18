# UX_ASSET_BRIEF.md — Brief de Assets y Navegación

**Proyecto:** Interplanetary Champions Cup · Operación «Primer Toque»
**Documento de:** Director de producto/diseño
**Para:** agente UX/UI (crea SVG + motion + CSS de navegación) y generación de arte fotorreal.
**Alcance:** inventario de assets a crear, guía de mejoras de navegación PC y MÓVIL, y prompt-spec para el arte fotorreal faltante.

---

## 0. Sistema de diseño (tokens — usar SIEMPRE)

Tema oscuro espacial. Los tokens ya existen en `web/css/styles.css` (`:root`). **No redefinir colores a mano**; consumir variables.

| Token         | Valor      | Uso                                            |
|---------------|------------|------------------------------------------------|
| `--bg`        | `#05070f`  | Fondo base (negro espacial).                   |
| `--panel`     | `#0e1424`  | Paneles/tarjetas.                              |
| `--panel-2`   | `#141c33`  | Superficies elevadas, inputs.                  |
| `--text`      | `#e8eefc`  | Texto principal.                               |
| `--accent`    | `#5b8cff`  | **Azul** — progreso, foco, enlaces, acción.    |
| `--accent-2`  | `#ffd35b`  | **Dorado** — recompensa, récord, logro, estatus.|

**Semántica de color:** azul = sistema/progreso/acción; dorado = recompensa/celebración/élite. Mantener este contraste de significado en toda la UI gamificada.

**Logo:** `web/assets/logo.png` (también `docs/ICC_LOGO.png` en alta resolución). Ya hay `web/assets/teaser-poster.svg` como referencia de estilo SVG existente.

**Restricciones CSP (obligatorias):** prohibido `style=""`, `<style>`, `<script>` inline, `on*=""`, fuentes/CDN externos. Todo CSS en archivos `.css`, JS en `.js`, mismo origen. Mutar estilo vía JS (`el.style.x`, `classList`) **sí** se permite. Respetar `prefers-reduced-motion`. Objetivos táctiles ≥ 44×44 px.

---

## 1. Inventario de assets a crear (SVG + motion)

Todos los SVG: limpios, sin scripts, con `viewBox`, colores por `currentColor`/tokens cuando aplique, optimizados (sin metadatos de editor). Guardar en `web/assets/icons/` (iconografía) y `web/assets/illustrations/` (escenas SVG). El **motion** se define en `web/css/` (animaciones CSS) o como SMIL ligero dentro del SVG cuando sea autocontenido.

### 1.1 Iconografía del HUD y la gamificación (SVG monocromo, 24×24, trazo 2)

| Archivo                        | Concepto                         | Notas                                  |
|--------------------------------|----------------------------------|----------------------------------------|
| `icons/xp.svg`                 | Estrella/destello de XP          | Relleno dorado en estado activo.       |
| `icons/level.svg`              | Galón/chevron de nivel           | Apilable para rangos.                   |
| `icons/combo.svg`              | Llama de combo                   | Anima en pulso al subir.                |
| `icons/streak.svg`            | Fuego de racha diaria            | Variante con número.                    |
| `icons/medal.svg`              | Medalla de logro                 | Cinta dorada.                           |
| `icons/target.svg`            | Diana (reto diario/precisión)    |                                         |
| `icons/trophy.svg`            | Trofeo (clasificatorias)         |                                         |
| `icons/sound-on.svg` / `sound-off.svg` | Mute/unmute             | Toggle de `ICCSfx`.                     |
| `icons/moon.svg` / `earth.svg` | Selector de mundo                | Sustituir emojis por SVG nítidos.       |
| `icons/sim.svg` / `missions.svg` / `ranking.svg` | Bottom-nav móvil | 3 destinos.                             |

### 1.2 Insignias de rango (SVG, 64×64, con dorado de élite)

`badges/recluta.svg`, `operador.svg`, `piloto.svg`, `capitan.svg`, `leyenda-lunar.svg`.
- Progresión visual: de gris/azul tenue (Recluta) a dorado con brillo (Leyenda Lunar).
- Coherentes con los rangos de `docs/GAME_DESIGN.md` §2.4.

### 1.3 Insignias de logro (SVG, 48×48)

Una por logro de `GAME_DESIGN.md` §3 (`primer_toque`, `cien_metros`, `vuelo_orbital`, `hazana_historica`, `hang_time`, `francotirador`, `combo_5`, `combo_10`, `gravedad_dual`, `supervisor`, `madrugador`, `racha_3`, `racha_7`, `centenario`, `leyenda`).
- Estado bloqueado (gris/silueta) y desbloqueado (color + dorado).

### 1.4 Ilustraciones SVG de escena (decorativas, ligeras)

| Archivo                              | Uso                                              |
|--------------------------------------|--------------------------------------------------|
| `illustrations/star-field.svg`       | Campo de estrellas de fondo (tileable).          |
| `illustrations/lunar-horizon.svg`    | Horizonte lunar con la Tierra en el cielo.       |
| `illustrations/robot-lstriker.svg`   | Robot L-Striker estilizado (coherente con el del canvas en `simulator.js`). |
| `illustrations/trajectory-arc.svg`   | Arco de trayectoria decorativo para secciones.   |

### 1.5 Motion (animaciones — CSS en `web/css/`)

| Animación                | Dónde                              | Regla reduce-motion             |
|--------------------------|------------------------------------|---------------------------------|
| Count-up de XP           | Número del HUD (lo dispara el JS del motor). | Mostrar valor final directo.    |
| Llenado de barra de nivel| Barra del HUD.                     | Salto sin transición.           |
| Pulso de combo "×N"      | Chip de combo.                     | Sin escala.                     |
| Toast de logro (slide-in)| Esquina/superior.                  | Aparecer sin desplazamiento.    |
| Partículas de celebración| Overlay de nivel/rango.            | Omitir.                         |
| Parpadeo de récord (★)   | Badge de récord.                   | Estado fijo iluminado.          |
| Transiciones de vista    | Cambios de pestaña/nav.            | Fundido corto o instantáneo.    |

**Implementación:** definir `@media (prefers-reduced-motion: reduce)` en cada `.css` para anular keyframes/transiciones. Nada de animación inline en el HTML.

---

## 2. Guía de mejoras de navegación

### 2.1 Jerarquía visual (común)

1. **Marca + estado de progresión** (rango/nivel) arriba — identidad y "quién soy".
2. **Escenario (canvas)** — el héroe interactivo, máximo protagonismo.
3. **Controles de disparo** — agrupados, el botón de saque dominante.
4. **Recompensa/feedback** (HUD, telemetría, logros) — secundario pero siempre visible.
5. **Social/captación** (leaderboard, waitlist) — al final del flujo.

Usar tamaño, peso y el dorado `--accent-2` para marcar lo importante (récord, logro, rango élite). El azul `--accent` guía la acción (botón de saque, foco).

### 2.2 Navegación PC (escritorio)

- **Nav superior fija** (sticky): logo + título a la izquierda; a la derecha, chip de **rango/nivel**, **XP**, **combo** y botón de **mute**. Se queda visible al hacer scroll.
- **Layout de dos columnas** (ya existe `.layout`): escenario a la izquierda, panel de control a la derecha. Mantenerlo; el HUD de juego (`#game-hud`) se integra en la franja superior o sobre el panel.
- **Atajos de teclado** (mejora): `Espacio` = patear, `R` = reiniciar, `M` = mute. Visibles en un tooltip de ayuda. Foco siempre visible (`outline` con `--accent`).
- **Hover states** claros en botones/segmented; transiciones de 120–180 ms.

### 2.3 Navegación MÓVIL

- **Bottom-nav fija** (3 destinos): **Simulador** / **Misiones** (reto diario + medallero de logros) / **Ranking** (leaderboard). Iconos de §1.1, etiquetas cortas, objetivo ≥ 44 px, estado activo en `--accent`. Respetar `env(safe-area-inset-bottom)`.
- **HUD compacto superior fijo:** una franja con barra de nivel + XP + chip de combo. El medallero completo se abre en panel deslizante (bottom-sheet) desde "Misiones".
- **Botón de saque grande y alcanzable** por el pulgar (zona inferior, sin tapar el canvas). El `reset` y el `mute` como secundarios.
- **Layout en una columna:** escenario arriba (aspect-ratio estable para evitar saltos), controles debajo. El canvas debe escalar sin desbordar (`max-width: 100%`).
- **Gestos táctiles:**
  - Sliders cómodos al pulgar (alto de pista ≥ 24 px, thumb ≥ 28 px).
  - (Mejora) arrastre vertical sobre el canvas para ajustar ángulo; horizontal para potencia. No-MVP.
  - Bottom-sheet de Misiones/Ranking arrastrable y cerrable con swipe-down.
- **Sin hover-only:** toda acción accesible por tap. Evitar tooltips dependientes de hover.

### 2.4 Transiciones

- Entre destinos (móvil) y al abrir overlays: fundido + leve desplazamiento, 150–220 ms, anulado por reduce-motion.
- Overlays de celebración: entrada con escala suave (1→1.02→1) y salida por fundido.

### 2.5 Accesibilidad

- Contraste AA mínimo sobre `--bg` (verificar dorado sobre paneles).
- `aria-live="polite"` en HUD de XP/estado; `role="status"` en mensajes; foco gestionado al abrir/cerrar bottom-sheets.
- Objetivos táctiles ≥ 44×44 px; espaciado suficiente entre controles.
- `prefers-reduced-motion`: ruta sin animaciones en todo.
- Etiquetas y `alt` descriptivos; iconos decorativos con `aria-hidden`.

### 2.6 Performance

- SVG inline o como `<img>`/`background` desde CSS (mismo origen). Evitar PNG pesados en UI; reservar bitmaps para el arte fotorreal del hero.
- Imágenes fotorreales: servir tamaños responsivos y formato moderno; `loading="lazy"` salvo el hero.
- Animar solo `transform`/`opacity` (compositor). Evitar layout thrashing.
- Sin fuentes externas (CSP): usar el stack de sistema ya empleado (`Segoe UI, sans-serif`).
- Reservar dimensiones del canvas/hero para no provocar CLS.

---

## 3. Prompt-spec para arte fotorreal (generador de imágenes)

Arte faltante que un generador de imágenes debe producir. Entregar en **16:9** (desktop/hero) y **9:16** (móvil/social). Guardar en `web/assets/` (p. ej. `hero-3.png`, `robot-hero.png`, `lunar-scene.png`) y versiones `@2x`. Ya existen `hero-1.png` y `hero-2.png` como referencia de dirección.

### 3.1 Estilo y paleta (común a todos)

- **Estilo:** cinematográfico fotorrealista, ciencia-ficción near-future creíble (estética tipo SpaceX/NASA-punk), no caricaturesco.
- **Paleta:** negros y azules profundos del espacio (`#05070f`, `#0e1424`), acentos en **azul** `#5b8cff` (luz fría, propulsores, HUD) y **dorado** `#ffd35b` (luz cálida, reflejos de logro, sol rasante). Alto contraste, sombras profundas, una fuente de luz dominante.
- **Atmósfera:** vacío lunar, polvo de regolito suspendido, sin atmósfera azul; cielo negro estrellado con la **Tierra** visible (azul-verde) en el horizonte.
- **Calidad:** profundidad de campo, grano sutil de película, reflejos metálicos físicamente plausibles, sin texto incrustado ni marcas de agua.

### 3.2 Piezas concretas

**A) Hero principal — "El Primer Toque"**
- Encuadre: robot futbolista L-Striker en el instante de patear un balón sobre la superficie lunar; estela de polvo de regolito flotando en baja gravedad; la Tierra al fondo en el cielo negro.
- Composición: regla de tercios, espacio negativo a un lado para titular/CTA (no incrustar texto). Iluminación rasante dorada + reborde azul frío.
- Formatos: **16:9** (`hero-3.png`, foco horizontal con cielo a la derecha) y **9:16** (`hero-3-portrait.png`, robot vertical, Tierra arriba).

**B) Robot L-Striker — retrato de personaje**
- Encuadre: 3/4, cuerpo bípedo atlético con **piernas digitígradas tipo resorte** (coherente con el robot del canvas), chasis blanco-perla `#cfd8ea` con acentos azules `#5b8cff` y un sensor óptico dorado `#ffd35b`. Detalle mecánico creíble (actuadores, juntas, paneles).
- Fondo: estudio oscuro o hangar lunar con luz volumétrica azul.
- Formatos: **16:9** y **9:16**.

**C) Escena lunar — estadio del vacío**
- Encuadre: panorámica de un "campo" demarcado en regolito bajo cúpulas/estructuras ligeras; gradas o torres de iluminación; la Tierra dominante en el cielo. Sensación de evento deportivo interplanetario.
- Uso: fondo de secciones, separadores, social.
- Formatos: **16:9** y **9:16**.

### 3.3 Reglas de entrega

- Sin texto, logotipos ni marcas de agua dentro de la imagen (el texto va en HTML/CSS).
- Coherencia de continuidad: mismo robot, misma paleta y misma dirección de luz entre piezas.
- Exportar optimizado para web (peso contenido) y proveer recorte/seguro para el punto focal en ambos formatos.

---

## 4. Qué hacer y dónde (resumen accionable)

| Tarea                                   | Archivos a crear/editar                              | Responsable |
|-----------------------------------------|------------------------------------------------------|-------------|
| Iconos del HUD/gamificación             | `web/assets/icons/*.svg`                             | UX/UI       |
| Insignias de rango y logro              | `web/assets/badges/*.svg`                           | UX/UI       |
| Ilustraciones SVG de escena             | `web/assets/illustrations/*.svg`                    | UX/UI       |
| CSS de HUD/overlays/"juice" + motion    | `web/css/game.css` (y/o `web/css/styles.css` propio)| UX/UI + juego |
| Nav superior fija (PC) + bottom-nav (móvil) | CSS en `web/css/` + marcado en `web/index.html` (integrador) | UX/UI (estilo) |
| Estados reduce-motion                   | `@media (prefers-reduced-motion: reduce)` en cada `.css` | UX/UI    |
| Arte fotorreal (hero/robot/escena)      | `web/assets/*.png` (16:9 y 9:16) vía generador      | Generación de imágenes |

**Coherencia obligatoria con `docs/GAME_DESIGN.md`:** rangos (§2.4), logros (§3) y eventos de "juice"/SFX (§6, §11). El HUD se monta en `#game-hud`; el arte y los iconos deben encajar con los contratos `window.ICCGame` y `window.ICCSfx` sin que las piezas se vean entre sí.

**Restricción transversal:** todo bajo CSP estricta (sin inline, sin externos, mismo origen) y con soporte `file://` + `local:4280`.
