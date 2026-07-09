# Prompt Pack — Media de alto impacto para ICC (Google Gemini / Veo / Imagen)

> El plan de rediseño ([DESIGN_PLAN.md](./DESIGN_PLAN.md)) identifica la **media como el riesgo
> principal**: el lenguaje SpaceX quita sombras, gradientes y color de la interfaz porque el color
> lo aporta un cohete despegando en 4K. Sin media potente, el minimalismo no se ve premium: se ve
> vacío. Este documento existe para cubrir ese hueco.

---

## 0. Las siete reglas (léelas antes de generar nada)

Estas reglas no son estéticas: son **requisitos técnicos** del diseño que vamos a construir encima.

1. **Nunca pidas texto en la imagen.** Los generadores lo deforman, y además el título va en HTML
   (por accesibilidad, SEO y traducción). Cualquier logo o palabra en la media es un defecto.
2. **La media se oscurece al 50%.** SpaceX aplica `backdrop-filter: brightness(.5)` sobre todo.
   Genera pensando en eso: si la imagen ya nace oscura, quedará negra. **Pide exposición media-alta
   y alto rango dinámico**, y deja que el CSS la apague.
3. **Espacio negativo obligatorio.** El texto se ancla a un tercio de la pantalla
   (`left: 100px`, `top: 13-15%`). El sujeto debe vivir en el **tercio opuesto**. Pide
   explícitamente "composición descentrada, sujeto a la derecha, cielo vacío a la izquierda".
4. **Casi monocromo.** Negro, gris regolito, blanco. **Un solo acento: el dorado `#ffd35b`**
   (decisión de marca), en la luz, no en el objeto. Nada de azules cian ni magentas de ciencia
   ficción barata.
5. **Cero movimiento de cámara nervioso.** Nada de drones, zooms rápidos ni cortes. El registro es
   *masa que se mueve despacio*: derivas lentísimas, órbitas largas, planos fijos con un solo
   elemento en movimiento.
6. **16:9 para escritorio y una versión 9:16 para móvil.** Un recorte central de un 16:9 pierde
   la composición descentrada. Genera las dos.
7. **Sin música ni voz.** Veo genera audio; lo descartamos. El vídeo se sirve `muted` + `playsinline`.

---

## 1. Plantilla base

Copia esto y sustituye `[ESCENA]`. El resto es el ADN visual de ICC y no debería cambiar.

```
[ESCENA]

Estilo: fotografía cinematográfica documental, óptica anamórfica 40mm, apertura f/2.8.
Realismo fotográfico extremo, sin estilización, sin ilustración, sin render 3D evidente.
Referencia: fotografía de misión de la NASA, cinematografía de Denis Villeneuve.

Paleta: monocromática. Negro absoluto del espacio, grises fríos del regolito lunar,
blanco puro. Único acento cálido: un dorado ámbar (#ffd35b) presente SOLO como luz
de borde (rim light) o destello, nunca como color de un objeto.

Iluminación: una única fuente dura y direccional (el Sol, sin atmósfera que la difunda),
sombras larguísimas y de bordes nítidos, negros profundos sin relleno. Alto rango
dinámico; imagen expuesta a medios altos (se oscurecerá un 50% en post).

Composición: encuadre descentrado. El sujeto ocupa el tercio DERECHO. El tercio
IZQUIERDO es vacío negativo (cielo negro, terreno vacío) reservado para texto.
Horizonte bajo. Mucho aire.

Cámara: [MOVIMIENTO]. Ningún corte. Ningún zoom brusco.

Negativo: sin texto, sin logos, sin marcas de agua, sin personas, sin banderas,
sin colores cian/magenta/púrpura, sin lens flares de JJ Abrams, sin nebulosas de
colores, sin estrellas exageradas, sin HUD, sin interfaces, sin sombras suaves,
sin niebla, sin partículas de polvo flotando en el vacío (no hay aire en la Luna).
```

---

## 2. Prompts por página

### 2.1 `/` — Simulador (hero, vídeo en bucle) · **la pieza más importante**

`[ESCENA]`:
> Un robot humanoide bípedo, blanco mate y gris, de pie sobre la superficie de la Luna,
> inmóvil, en posición de saque frente a un balón de fútbol blanco y negro apoyado en el
> regolito. Detrás y muy arriba, la Tierra como una canica azul pequeñísima y lejana,
> desenfocada. El robot no se mueve. Solo el polvo de regolito, levantado hace un instante,
> desciende en cámara ultralenta por la gravedad de 1/6 g, cayendo en línea recta sin flotar.

`[MOVIMIENTO]`:
> plano fijo, con una deriva lateral imperceptible de izquierda a derecha (menos de 2 grados
> en 10 segundos). La cámara no busca al sujeto; el sujeto ya está ahí.

**Por qué funciona:** el clímax del producto es el disparo. El hero debe ser el **instante
anterior** — tensión contenida, no acción. Y el polvo cayendo *recto y lento* es la firma visual
de 1/6 g: comunica la física sin explicarla.

---

### 2.2 `investors.html` — Hero (imagen fija)

`[ESCENA]`:
> Plano general amplísimo de un valle lunar. En el tercio derecho, muy pequeño y solitario, un
> único robot humanoide de pie junto a un balón. La escala es aplastante: el robot ocupa menos
> del 8% del encuadre. Sombras kilométricas proyectadas desde la derecha. El terreno se pierde
> hacia un horizonte curvo y negro.

`[MOVIMIENTO]`: `imagen fija`

**Por qué funciona:** a un inversor no le vendes un robot, le vendes **la escala de la
oportunidad**. Un sujeto diminuto en un vacío enorme dice "esto es enorme y estamos solos" mejor
que cualquier gráfico.

---

### 2.3 `leaderboard.html` — Fondo (imagen fija, muy oscura)

`[ESCENA]`:
> Detalle macro de la superficie lunar: regolito gris, un cráter poco profundo, y la huella nítida
> de un balón que rebotó una sola vez. Nada más. Luz rasante desde el borde derecho que revela la
> textura del polvo. El resto es sombra.

`[MOVIMIENTO]`: `imagen fija`

**Por qué:** el ranking necesita un fondo que **no compita con los datos**. Textura, no espectáculo.

---

### 2.4 `press.html` — Hero (imagen fija)

`[ESCENA]`:
> El robot humanoide fotografiado de perfil, de cintura para arriba, sobre fondo negro absoluto.
> Iluminación de estudio de un solo lado (rim light dorado marcando el contorno). Fotografía de
> producto industrial: se leen los paneles, los actuadores, los tornillos. Sin fondo, sin contexto.

`[MOVIMIENTO]`: `imagen fija`

**Por qué:** la prensa necesita **el objeto**, aislado y descargable. Es la foto que acaba en un
artículo.

---

### 2.5 `onepager.html` — Fondo (imagen fija, casi negra)

`[ESCENA]`:
> La curvatura del limbo lunar contra el negro del espacio, vista desde una órbita baja. Una única
> línea de luz dorada recorre el borde. Nueve décimas partes del encuadre son negro puro.

`[MOVIMIENTO]`: `imagen fija`

**Por qué:** el one-pager es denso en texto. El fondo debe ser **casi nada**.

---

### 2.6 `teaser.html` — Pieza cinematográfica (vídeo)

`[ESCENA]`:
> El balón blanco y negro, en primerísimo plano, abandonando el pie del robot. Congela el instante
> del impacto y ábrelo: el balón gira lentamente sobre sí mismo mientras se aleja en línea recta,
> sin caer, hacia el vacío negro. La superficie lunar se hunde bajo él. El robot queda atrás,
> pequeño, inmóvil, mirando.

`[MOVIMIENTO]`:
> la cámara sigue al balón desde detrás, a su misma velocidad, en una toma continua de 8 segundos.
> Sin corte.

**Por qué:** esto es "El Primer Toque". Es el activo de marketing de toda la operación.

---

### 2.7 `gallery.html`

**No generes media.** El plan recomienda **sacarla del deploy público**: es una herramienta interna
de assets, hoy publicada como callejón sin salida.

---

### 2.8 `og-cover` — Portada social (reemplazo)

`[ESCENA]`: usa la **2.2** (valle lunar, robot diminuto a la derecha).

Genera a **1200×630 exactos**. El tercio izquierdo debe quedar **completamente vacío**: ahí se
compone el texto en SVG, como ya hacemos hoy. No pidas el texto a Gemini.

---

## 3. Especificación técnica

| Pieza | Formato | Dimensiones | Peso máximo | Notas |
|---|---|---|---|---|
| Hero `/` (vídeo) | AV1 (`.webm`) + H.264 (`.mp4`) fallback | 1920×1080 y 1080×1920 | **< 2,5 MB** | `muted playsinline loop`, 10 s |
| Póster del hero | AVIF + WebP + JPG | 1920×1080 | < 150 KB | `<video poster>`; se ve antes que el vídeo |
| Teaser (vídeo) | AV1 + H.264 | 1920×1080 | < 6 MB | Bajo demanda, no autoplay |
| Heroes fijos | AVIF + WebP | 2560×1440 | < 250 KB | `srcset` con 1280 y 1920 |
| Fondos | AVIF + WebP | 1920×1080 | < 120 KB | Muy oscuros: comprimen bien |
| `og-cover.png` | PNG | **1200×630** | < 1 MB | PNG obligatorio (los scrapers no leen SVG) |

**Restricción de CSP:** `img-src 'self' data:` y `font-src 'self'`. **Toda la media debe
autoalojarse** en `web/assets/`. Nada de CDNs externos: la CSP los bloquea.

---

## 4. Bucle sin costura (el problema real de Veo)

Veo no genera bucles perfectos. Dos salidas honestas:

- **La buena:** genera 12 s, recorta los 10 centrales y aplica un **crossfade de 0,5 s** entre el
  final y el principio (`ffmpeg` con `xfade`). Con una deriva de cámara tan lenta, la costura es
  invisible.
- **La barata:** no hagas bucle. Reproduce una vez y **congela en el último fotograma**
  (`onended → pause()`). Con una escena casi estática, nadie lo nota.

Reencodeo de referencia:

```bash
# AV1 (moderno, mucho más ligero)
ffmpeg -i hero.mp4 -c:v libsvtav1 -crf 38 -preset 6 -an -vf scale=1920:1080 hero.webm
# H.264 (fallback universal)
ffmpeg -i hero.mp4 -c:v libx264 -crf 26 -preset slow -an -movflags +faststart hero.mp4
# Póster desde el primer fotograma
ffmpeg -i hero.mp4 -frames:v 1 -q:v 2 hero-poster.jpg
```

`-an` elimina el audio que Veo añade y que no queremos.

---

## 5. Cómo saber si el resultado sirve

Antes de meter una pieza en el repo, pásale estas cuatro preguntas:

1. **¿Sobrevive al `brightness(.5)`?** Ábrela y bájale el brillo a la mitad. ¿Sigue leyéndose el
   sujeto? Si no, está subexpuesta.
2. **¿Cabe el titular?** Superpón un rectángulo en el tercio izquierdo. ¿Pisa algo importante?
3. **¿Hay algún color que no sea negro, gris, blanco o dorado?** Si lo hay, fuera.
4. **¿Se ve generada por IA?** Manos raras, físicas imposibles, polvo flotando en el vacío,
   estrellas de más. La Luna no tiene atmósfera: **nada flota, nada se difumina, nada brilla en
   halo**. Este es el fallo más común y el más delator.
