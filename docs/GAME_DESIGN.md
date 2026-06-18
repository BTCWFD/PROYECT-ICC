# GAME_DESIGN.md — Gamificación AAA del Simulador ICC

**Proyecto:** Interplanetary Champions Cup · Operación «Primer Toque»
**Documento de:** Director de producto/diseño
**Para:** equipo de juego (implementa `web/js/game.js` y `web/js/sfx.js`) y agente de integración (`web/js/main.js`, `web/js/simulator.js`).
**Objetivo:** convertir el simulador de física lunar en un bucle de juego adictivo, con "juice" AAA, progresión persistente y UX móvil táctil — sin romper el simulador actual y respetando la CSP estricta del sitio.

---

## 0. Principios rectores

1. **No romper nada.** El simulador ya funciona en `file://` y en `local:4280`. La gamificación se acopla con **degradación elegante**: si `window.ICCGame` o `window.ICCSfx` no existen, el simulador sigue disparando igual.
2. **Contratos primero.** `window.ICCGame` y `window.ICCSfx` son las únicas superficies de acoplamiento. Quien integra (`main.js`) solo llama a esos métodos; quien implementa el motor no toca `main.js`.
3. **CSP estricta.** Prohibido inline styles/`<style>`/`<script>` inline/`on*=`/recursos externos. Todo CSS en `.css`, JS en `.js`, mismo origen. Mutar estilo vía JS (`el.style.x`, `classList`) **sí** está permitido. Audio **sintetizado** con Web Audio (sin archivos).
4. **Accesibilidad.** Respetar `prefers-reduced-motion` en toda animación de "juice". Overlays con `aria-live`/`role` adecuados. Foco visible. Objetivos táctiles ≥ 44×44 px.
5. **Persistencia local.** Toda la progresión vive en `localStorage` (`icc_game`). Sin login, sin servidor obligatorio. El leaderboard del backend es independiente y opcional.
6. **Estética espacial.** Tema oscuro; `--accent` azul `#5b8cff`, `--accent-2` dorado `#ffd35b`. Las recompensas usan el dorado; el progreso usa el azul.

---

## 1. Bucle de juego (core loop)

El bucle de un disparo, de 8 a 15 segundos, diseñado para "una más":

```
  AJUSTAR            DISPARAR           RESOLVER            RECOMPENSAR          ENGANCHAR
 (potencia,    →    (kick + whoosh,  →  (vuelo lunar,   →  (count-up XP,     →  (combo activo,
  ángulo,            polvo lunar)        impacto +          barra de nivel,      reto diario
  mundo, club)                           screen-shake)      logros, SFX)         pendiente,
                                                                                 récord a batir)
```

- **Micro-bucle (cada disparo):** ajustar → disparar → ver resultado → ganar XP → ver progreso. Latencia de recompensa < 1 s tras el impacto.
- **Meso-bucle (cada sesión):** subir niveles, completar el reto diario, encadenar combos, escalar de rango.
- **Macro-bucle (entre días):** mantener la racha diaria, desbloquear logros raros, perseguir el rango "Leyenda Lunar" y el récord personal.

**Gancho de retorno:** el reto diario se renueva cada día (medianoche local). La racha se rompe si se salta un día. El HUD siempre muestra "lo siguiente" (XP que falta para el nivel, progreso del reto).

---

## 2. Sistema de XP, niveles y rangos

### 2.1 Cálculo de XP por disparo

`onShot({ range, world, hangTime, power, angle, club, isRecord })` calcula XP así:

```
xpBase      = round(range)                         // 1 XP por metro de alcance
bonusHang   = round(hangTime * 4)                  // premia el "hang-time" lunar
bonusMundo  = (world === 'moon') ? 1.0 : 1.25      // la Tierra es más difícil → leve extra
bonusPrecis = anguloOptimo(angle)                  // ver 2.2 (0..0.15 extra)
bonusCombo  = 1 + min(combo, 10) * 0.05            // hasta +50% por combo de 10
bonusRecord = isRecord ? 1.5 : 1.0                 // récord personal: ×1.5

xpGained = round( (xpBase + bonusHang) * bonusMundo * (1 + bonusPrecis) * bonusCombo * bonusRecord )
```

- Todos los multiplicadores se redondean al entero final. Nunca negativo. Mínimo 1 XP por disparo válido.
- El "ángulo óptimo" sin aire es 45°; cuanto más cerca, mayor `bonusPrecis` (campana centrada en 45°, ancho ±25°).

### 2.2 Función de ángulo óptimo (referencia)

```
anguloOptimo(angle) = 0.15 * max(0, 1 - (abs(angle - 45) / 25))
```

### 2.3 Curva de niveles

XP **acumulada** total para alcanzar cada nivel (crecimiento suave, no exponencial agresivo):

```
xpParaNivel(n) = round( 50 * n^1.6 )     // n = 1,2,3...
```

| Nivel | XP acumulada aprox. | Disparos buenos aprox. |
|-------|--------------------:|-----------------------:|
| 1     | 0                   | inicio                 |
| 2     | 50                  | 1–2                    |
| 3     | 151                 | 3–5                    |
| 5     | 359                 | ~10                    |
| 10    | 1.585               | ~35                    |
| 20    | 5.024               | ~110                   |
| 30    | 9.704               | ~200                   |

`leveledUp` es `true` cuando un disparo cruza uno o más umbrales (puede subir varios niveles de golpe si el récord da mucho XP — el motor lo gestiona en bucle).

### 2.4 Rangos (sabor lunar/fútbol)

Los rangos se derivan del **nivel** (no del XP directo) para que el HUD sea legible:

| Rango          | Nivel mín. | Tono           |
|----------------|-----------:|----------------|
| Recluta        | 1          | gris/azul tenue |
| Operador       | 5          | azul `--accent` |
| Piloto         | 10         | azul intenso    |
| Capitán        | 18         | dorado tenue    |
| Leyenda Lunar  | 28         | dorado `--accent-2` + brillo |

Al cambiar de rango se dispara un overlay especial (más vistoso que un nivel normal) y `ICCSfx.play('levelup')`.

---

## 3. Logros (achievements)

Lista concreta con `id`, nombre y condición. Persistidos en `icc_game.achievements` (array de `id`). Se evalúan en cada `onShot` y al cambiar de día. Cada uno se desbloquea **una sola vez**.

| id                  | Nombre                     | Condición                                                        |
|---------------------|----------------------------|------------------------------------------------------------------|
| `primer_toque`      | Primer Toque               | Primer disparo registrado.                                       |
| `cien_metros`       | Club de los 100            | Un disparo con `range ≥ 100 m`.                                  |
| `vuelo_orbital`     | Vuelo Orbital              | Un disparo con `range ≥ 300 m`.                                  |
| `hazana_historica`  | Hazaña Histórica           | Un disparo con `range ≥ 500 m`.                                  |
| `hang_time`         | Suspendido en el Vacío     | `hangTime ≥ 8 s` en un disparo (solo plausible en la Luna).      |
| `francotirador`     | Francotirador              | Disparo con `angle` entre 43° y 47° y `range ≥ 200 m`.          |
| `combo_5`           | En Racha                   | Alcanzar un combo de 5.                                          |
| `combo_10`          | Imparable                  | Alcanzar un combo de 10.                                         |
| `gravedad_dual`     | Físico Planetario          | Disparar al menos una vez en la Luna **y** en la Tierra.        |
| `supervisor`        | Control de Supervisión     | Completar un disparo con el modo supervisión (latencia 3 s).    |
| `madrugador`        | Operador Diario            | Completar el reto diario por primera vez.                       |
| `racha_3`           | Constancia                 | Racha diaria de 3 días.                                          |
| `racha_7`           | Semana Lunar               | Racha diaria de 7 días.                                          |
| `centenario`        | Centenario                 | 100 disparos totales (`totalShots ≥ 100`).                       |
| `leyenda`           | Leyenda Lunar              | Alcanzar el rango Leyenda Lunar (nivel 28).                      |

**Notas de implementación:**
- `gravedad_dual` y otros que dependen de historial guardan banderas auxiliares en `icc_game` (p. ej. `worldsPlayed: {moon, earth}`).
- `onShot` devuelve `achievementsUnlocked: [{id, nombre}]` con **solo los desbloqueados en ese disparo** (puede ser varios). El motor muestra su propio overlay encolando si hay más de uno.

---

## 4. Reto diario

- Un objetivo simple que se renueva cada día (clave `icc_game.daily.fecha` = `YYYY-MM-DD` local).
- Estructura: `daily: { id, descripcion, meta, progreso, completado }`.
- Tipos rotativos (elegir de forma determinista por fecha, p. ej. `hash(fecha) % N`):

| id                | Descripción                                  | meta |
|-------------------|----------------------------------------------|-----:|
| `daily_distancia` | Acumula 600 m de alcance total hoy           | 600  |
| `daily_disparos`  | Realiza 10 disparos hoy                       | 10   |
| `daily_record`    | Supera tu récord personal hoy                 | 1    |
| `daily_combo`     | Alcanza un combo de 6                         | 6    |
| `daily_orbital`   | Logra 3 vuelos orbitales (≥300 m) hoy        | 3    |

- `onShot` actualiza `daily.progreso` y, al cruzar `meta`, marca `completado: true`, otorga **XP bonus** (p. ej. `+150 XP`) y dispara overlay + `ICCSfx.play('achievement')`.
- Completar el reto suma a la **racha diaria** (`icc_game.streak`). Si al cargar la fecha guardada es anterior a ayer, la racha se reinicia a 0.

---

## 5. Combos y rachas

- **Combo de sesión:** contador en memoria (no persistido) que sube +1 por cada disparo "bueno" consecutivo.
  - "Bueno" = `range ≥ 60 m` (umbral configurable). Un disparo flojo (o el botón Reiniciar) **rompe el combo** a 0.
  - El combo multiplica el XP (ver 2.1) y alimenta los logros `combo_5` / `combo_10`.
  - El HUD muestra el combo como "×N" con animación de pulso; al llegar a 5 y 10 hay micro-celebración.
- **Racha diaria (streak):** persistida; cuenta días consecutivos con el reto diario completado. Alimenta `racha_3` / `racha_7`. Se muestra como "🔥 N días" en el HUD.

---

## 6. "Juice" (sensación AAA)

El simulador ya aporta: polvo de regolito, cámara lenta en el ápice, anillo de impacto, `shake` del visor y `flash` de la métrica. La capa de juego **añade**:

| Efecto             | Dónde / Cómo                                                                 | Respeta reduce-motion |
|--------------------|------------------------------------------------------------------------------|-----------------------|
| Count-up de XP     | El número de XP sube de 0 a `xpGained` con easing (~600 ms) en el HUD.       | Sí (muestra final)    |
| Barra de nivel     | Se llena animada hacia el % del nivel; al llegar a 100% destella y resetea.  | Sí                    |
| Pop de combo       | "×N" escala 1→1.3→1 con `transform` (vía JS, no inline HTML).                | Sí                    |
| Screen-shake extra | En récord o subida de rango, sacudida breve del contenedor del HUD.          | Sí (se omite)         |
| Partículas doradas | Overlay de nivel/logro lanza chispas (canvas o divs animados por JS).        | Sí (se omite)         |
| Toast de logro     | Tarjeta deslizante con ícono + nombre; se encola si hay varios.             | Sí (aparece sin slide)|
| SFX                | `ICCSfx.play(...)` en kick, whoosh, impact, levelup, achievement, ui, record.| n/a (audio)           |

**Regla de oro:** todo el "juice" se implementa mutando estilo/clases vía JS y CSS en `.css`. Nada inline. Si `prefers-reduced-motion: reduce`, se omiten sacudidas/partículas y los números aparecen ya en su valor final.

---

## 7. Economía y recompensas

Sin moneda dura ni compras. La "economía" es de **progresión y estatus**:

- **XP** → niveles → rangos (estatus visible).
- **Logros** → colección (medallero en el HUD/panel).
- **Reto diario** → XP bonus + racha (incentivo de retorno).
- **Récord personal** (`icc_record`, ya existente) → multiplicador ×1.5 de XP al batirlo y badge "★ récord".
- **Leaderboard del backend** (independiente) → estatus social opcional cuando hay club + API.

No hay penalizaciones de XP (nunca resta); romper combo o racha es el único "costo".

---

## 8. Modos de juego

Tres modos que reutilizan el mismo simulador. El MVP implementa **Práctica**; Desafío y Clasificatorias son evolución.

| Modo            | Descripción                                                                                 | Estado |
|-----------------|---------------------------------------------------------------------------------------------|--------|
| **Práctica**    | Libre. Ajusta todo, dispara sin límite. Gana XP, logros, reto diario, combos. (Por defecto) | MVP    |
| **Desafío**     | Objetivos puntuales (p. ej. "supera 250 m con ≤80 de potencia"). Serie de retos con estrellas.| Fase 2 |
| **Clasificatorias** | Ronda con N intentos; cuenta el mejor; envía al leaderboard del backend si hay club.    | Fase 2 |

El selector de modo es un control segmentado (como el de Mundo). En MVP puede no existir UI y asumirse Práctica.

---

## 9. UX móvil táctil

- **Bottom-nav fija** (móvil): accesos a Simulador / Misiones (reto+logros) / Ranking. Objetivos ≥ 44 px.
- **HUD compacto** en móvil: barra de nivel + XP + combo en una franja superior fija; el medallero se abre en panel deslizante.
- **Gestos:** los sliders de potencia/ángulo deben ser cómodos al pulgar; considerar arrastre vertical sobre el canvas como atajo de ángulo (mejora futura, no MVP).
- **Botón de saque** grande y "pulgar-friendly", fijo y alcanzable.
- **Mute** accesible (botón de sonido) que llama a `ICCSfx.setMuted(...)`; estado persistido por el motor de SFX.
- **Reduce-motion / datos:** sin partículas pesadas en móvil de gama baja; degradar a transiciones simples.

*(El detalle visual y de navegación lo desarrolla el agente UX/UI; ver `docs/UX_ASSET_BRIEF.md`.)*

---

## 10. Contrato `window.ICCGame` (motor de progresión)

**Archivo:** `web/js/game.js`. Persiste en `localStorage` bajo la clave `icc_game`. Carga **antes** de `main.js` en `index.html` (lo cablea el agente de integración). Expone:

```js
window.ICCGame = {
  /**
   * Monta o actualiza el HUD de progresión.
   * @param {{ hudMount: HTMLElement }} opts  Elemento donde montar (#game-hud).
   */
  init({ hudMount }) { /* ... */ },

  /**
   * Procesa un disparo: calcula XP, niveles, rango, combo, logros y reto diario.
   * Actualiza el HUD y, si hay leveledUp o logros, muestra su PROPIO overlay
   * animado (respetando prefers-reduced-motion). Persiste el estado.
   *
   * @param {object} shot
   * @param {number}  shot.range     Alcance del disparo (m).
   * @param {string}  shot.world     'moon' | 'earth'.
   * @param {number}  shot.hangTime  Tiempo de vuelo (s).
   * @param {number}  shot.power     Potencia usada (m/s).
   * @param {number}  shot.angle     Ángulo usado (grados).
   * @param {string}  shot.club      Nombre del club (puede ir vacío).
   * @param {boolean} shot.isRecord  ¿Batió el récord personal?
   * @returns {{
   *   xpGained: number,
   *   totalXp: number,
   *   level: number,
   *   leveledUp: boolean,
   *   rank: string,
   *   combo: number,
   *   achievementsUnlocked: Array<{id:string, nombre:string}>,
   *   daily: { meta:number, progreso:number, completado:boolean }
   * }}
   */
  onShot(shot) { /* ... */ },

  /**
   * Estado actual para lectura externa (HUD secundario, paneles, debug).
   * @returns {{
   *   xp:number, level:number, rank:string,
   *   totalShots:number, bestRange:number,
   *   achievements: Array<{id:string, nombre:string}>,
   *   daily: { id:string, descripcion:string, meta:number, progreso:number, completado:boolean }
   * }}
   */
  getState() { /* ... */ },
};
```

**Esquema persistido sugerido (`icc_game`):**

```jsonc
{
  "v": 1,                        // versión de esquema (para migraciones)
  "xp": 0,                       // XP total acumulada
  "level": 1,
  "totalShots": 0,
  "bestRange": 0,
  "achievements": ["primer_toque"],   // ids desbloqueados
  "worldsPlayed": { "moon": true, "earth": false },
  "streak": 0,                   // racha diaria
  "daily": {
    "fecha": "2026-06-18",
    "id": "daily_distancia",
    "meta": 600,
    "progreso": 120,
    "completado": false
  }
}
```

**Reglas del motor:**
- Defensivo: si `localStorage` falla (modo privado), opera en memoria sin romper.
- `onShot` es idempotente respecto a logros (no re-otorga).
- El HUD se monta en un `#game-hud` que el integrador añade al DOM; si no existe, `init` lo crea o no hace nada (no rompe).
- Todos los overlays propios del motor usan CSS de `web/css/game.css` (archivo del equipo de juego), nunca inline.

---

## 11. Contrato `window.ICCSfx` (efectos sintetizados)

**Archivo:** `web/js/sfx.js`. Audio **100% sintetizado** con Web Audio API; **sin archivos** de audio (cumple CSP de mismo origen sin recursos externos). Expone:

```js
window.ICCSfx = {
  /**
   * Reproduce un efecto sintetizado.
   * @param {'kick'|'whoosh'|'impact'|'levelup'|'achievement'|'ui'|'record'} name
   */
  play(name) { /* ... */ },

  /** Silencia/activa globalmente (persistido en localStorage 'icc_muted'). */
  setMuted(bool) { /* ... */ },

  /** @returns {boolean} estado de silencio actual. */
  isMuted() { /* ... */ },
};
```

**Reglas del motor de audio:**
- **AudioContext perezoso:** se crea/reanuda en el **primer gesto** del usuario (click/touch/tecla), no al cargar — para no violar la política de autoplay.
- **Defensivo:** si Web Audio no existe o falla, todos los métodos son no-ops silenciosos (nunca lanzan).
- Cada efecto es un sonido corto sintetizado (osciladores + envolventes), p. ej.:
  - `kick`: golpe corto grave (impacto seco).
  - `whoosh`: barrido de ruido filtrado (balón surcando el vacío).
  - `impact`: thud + cola breve.
  - `levelup`: arpegio ascendente (azul→dorado, sensación de logro).
  - `achievement`: campanilla doble brillante.
  - `ui`: click sutil para controles.
  - `record`: fanfarria corta (la más vistosa).
- Mute persistido en `localStorage` (`icc_muted`); `play` respeta el estado de mute.

---

## 12. Integración esperada (lo que hará `main.js`, para referencia)

El agente de integración cablea, con degradación elegante, dentro del `onComplete`/`onImpact` del disparo:

```js
// Pseudocódigo de referencia (NO es responsabilidad de este documento implementarlo).
if (window.ICCSfx) ICCSfx.play('kick');          // al patear
// ... durante el vuelo: ICCSfx.play('whoosh') una vez
// en onImpact:
if (window.ICCSfx) ICCSfx.play('impact');
// en onComplete:
const res = window.ICCGame
  ? ICCGame.onShot({ range: traj.range, world: state.world,
      hangTime: traj.flightTime, power: state.power, angle: state.angle,
      club: state.club, isRecord })
  : null;
if (res && window.ICCSfx) {
  if (res.leveledUp) ICCSfx.play('levelup');
  if (res.achievementsUnlocked.length) ICCSfx.play('achievement');
  if (isRecord) ICCSfx.play('record');
}
```

`#game-hud` se añade al DOM (HTML del integrador) y `ICCGame.init({ hudMount })` se invoca al arranque. Si los módulos no están, todo se omite y el simulador funciona como hoy.

---

## 13. Resumen de archivos (quién toca qué)

| Archivo                | Responsable        | Contenido                                           |
|------------------------|--------------------|-----------------------------------------------------|
| `web/js/game.js`       | Equipo de juego    | `window.ICCGame` (XP, niveles, rangos, logros, reto, HUD, overlays). |
| `web/js/sfx.js`        | Equipo de juego    | `window.ICCSfx` (audio sintetizado Web Audio).      |
| `web/css/game.css`     | Equipo de juego/UX | Estilos del HUD, overlays, toasts, "juice".         |
| `web/index.html`       | Integrador         | `#game-hud`, `<script>` de game.js/sfx.js (antes de main.js). |
| `web/js/main.js`       | Integrador         | Llamadas a `ICCGame.onShot` / `ICCSfx.play` con degradación. |
| `docs/UX_ASSET_BRIEF.md` | Dirección (este rol) | Assets, navegación PC/móvil, prompt-spec de arte.  |

**Definición de hecho (DoD) del MVP gamificado:**
1. Disparar otorga XP visible con count-up y sube niveles/rangos.
2. Al menos 8 logros funcionando y persistidos.
3. Reto diario que se renueva y suma racha.
4. Combos que multiplican XP y se muestran en el HUD.
5. SFX sintetizados en los 7 eventos, con mute persistido.
6. Todo respeta CSP y `prefers-reduced-motion`, y degrada con elegancia.
