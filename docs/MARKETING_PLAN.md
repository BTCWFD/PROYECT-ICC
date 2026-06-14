# Plan de Lanzamiento — Fase 1: Hype Digital (90 días)

> **Interplanetary Champions Cup (ICC) · Operación «Primer Toque»**
> El Apolo 11 del entretenimiento. Fútbol robótico en la Luna.
> Narrativa madre: **«atleta, no máquina»** — el L-Striker no es un robot, es el
> primer deportista interplanetario.

Este documento define la campaña de **90 días (12 semanas)** de la **Fase 1 (Hype
Digital)**: el periodo previo al MVP físico en el que ICC no vende hardware, vende
**un movimiento cultural**. No tenemos un robot en la Luna todavía; tenemos un
simulador vivo en producción, una historia irresistible y la oportunidad de
convertir a desconocidos en **operadores fundadores**.

---

## 1. Objetivo y métrica norte

**Objetivo de la fase:** construir una comunidad de early-adopters validada y medible
que demuestre tracción ante inversores pre-seed, antes de gastar un solo dólar en
hardware lunar.

### Métrica norte (North Star)
**Leads cualificados en la waitlist** = personas que dejan su email para ser de los
**«primeros 1.000 operadores»**. Es la métrica que mejor predice valor futuro:
intención de uso real + permiso de contacto + tamaño de la comunidad fundadora.

### Métricas de apoyo (el «cuadro de mando» de la fase)
| Métrica | Qué mide | Meta a 90 días |
|---|---|---|
| **Leads en waitlist** (norte) | Demanda capturada y contactable | **1.000 emails** |
| **Tasa de disparo** (`shot_executed` / `page_view`) | Calidad del producto como gancho | **≥ 45 %** |
| **Compartidos** (`share_clicked`) | Viralidad / coeficiente K | **≥ 1.500 compartidos** |
| Visitantes únicos al simulador | Cima del embudo | 25.000 |
| Tasa de conversión visita → lead | Eficiencia del embudo | ≥ 4 % |
| Retos a clubes/influencers respondidos | Validación de marca | ≥ 10 respuestas públicas |

> **Embudo objetivo:** 25.000 visitas → 45 % disparan (≈11.250) → 4 % se apuntan
> (≈1.000 leads). Cada palanca creativa de abajo existe para mover uno de estos números.

### Instrumentación (ya disponible)
- Eventos del simulador vía `window.ICCAnalytics.track` (`page_view`, `shot_executed`,
  `share_clicked`, `record_beaten`, `milestone_reached`).
- Alta de lead vía `track('waitlist_signup')` (lo dispara `web/js/waitlist.js`).
- Contador de waitlist devuelto por `POST /api/waitlist` → `{ ok:true, total }`.
- Persistencia en tabla **`waitlist`** de Table Storage (RowKey = email saneado).

---

## 2. Las 3 grandes piezas creativas

La campaña se sostiene sobre tres piezas que se refuerzan entre sí: el **misterio**
atrae, el **juego** retiene y demuestra, y la **waitlist** convierte.

### Pieza 1 — Teaser críptico: «El juego cambia de cancha. 2026»
**Qué es:** una campaña de intriga sin logo ni explicación. Solo el **balón lunar**
(la pelota sobre el regolito, con la Tierra al fondo) y una frase:

> **«El juego cambia de cancha. 2026.»**

**Por qué funciona:** el cerebro odia los huecos de información. Sin contexto, el
espectador investiga, comenta y especula. Convertimos la ausencia de explicación en
el motor del alcance orgánico.

**Formatos:** vídeo vertical de 6–10 s (balón que entra lento en cámara y queda
flotando en gravedad lunar), carteles estáticos, GIF para hilos. Cierre siempre con
el mismo plano del balón sobre la Luna. **Sin marca durante la Semana 1–2.**

**Llamada a la acción:** ninguna explícita al principio (solo el misterio). A partir
de la revelación, el teaser enlaza al simulador.

### Pieza 2 — Reto del simulador: **#ICCFirstTouch**
**Qué es:** el simulador (ya vivo en producción) se convierte en un **reto social**.
«¿Cuán lejos puedes mandar el balón en la Luna?». La física baja (1,62 m/s²) produce
disparos espectaculares de hang-time imposible: contenido nativo para clip.

**Mecánica:**
- Tabla de clasificación pública (leaderboard persistente, tabla `shots`).
- Hashtag oficial **#ICCFirstTouch**; el botón de compartir genera el copy y el enlace.
- **Retos directos** a clubes y creadores: *«@[club], vuestro mejor jugador maneja el
  balón en la Tierra. ¿Y en la Luna? Demostradlo.»*
- Ranking semanal: el récord de la semana recibe difusión oficial + acceso anticipado.

**Por qué funciona:** transforma una métrica de producto (**tasa de disparo**) en un
acto social (**compartidos**), y cada clip lleva tráfico de vuelta al simulador →
embudo hacia la waitlist. Es prueba de producto y motor viral a la vez.

**Llamada a la acción:** «Dispara → comparte tu récord → únete a la lista».

### Pieza 3 — Waitlist: **«Sé de los primeros 1.000 operadores»**
**Qué es:** el destino de conversión. No pedimos «suscríbete a la newsletter»;
ofrecemos **estatus fundacional**: ser uno de los **1.000 operadores** que estrenarán
el control del L-Striker.

**Oferta de valor del lead (por qué dejar el email):**
- Plaza numerada entre los **primeros 1.000 operadores**.
- Aviso prioritario del **Primer Toque** (el evento real).
- Acceso anticipado a retos, rankings y *drops* (incl. el NFT del primer toque).
- Badge de «Operador Fundador» en la comunidad.

**Mecánica (contrato de producto):**
- Formulario `web/js/waitlist.js` auto-cableado en cada `<form class="waitlist-form">`.
- `POST /api/waitlist` con `{ email, club?, source }`; deduplica por email.
- Mensaje de éxito contractual: **«Estás en la lista. Te avisaremos del Primer Toque.»**
- El campo `club` (opcional) nutre la narrativa de rivalidad entre clubes.
- El contador `total` se usa como **prueba social** («Ya somos 642 operadores»).

**Escasez real:** el «1.000» no es decorativo; comunica que las plazas fundacionales
son finitas. Cuando el contador se acerque, se usa como urgencia: *«Quedan 80 plazas.»*

---

## 3. Calendario semana a semana (12 semanas)

Tres actos de cuatro semanas: **Misterio → Juego → Conversión**. Las acciones se
solapan (la waitlist se abre pronto), pero cada acto tiene un foco dominante.

**Canales:** X/Twitter (X), TikTok/Reels (TT/RL), LinkedIn (LI), Prensa/PR, Email (EM).
**Responsables tipo:** *Community Lead* (CL), *Creador de contenido/Video* (CC),
*Growth/Analytics* (GR), *PR/Comunicación* (PR), *Founder/Portavoz* (FD).

### Acto I — «El Misterio» (Semanas 1–4) · Foco: alcance e intriga

| Semana | Canal | Acción | Responsable | KPI de control |
|---|---|---|---|---|
| **1** | X, TT/RL | Lanzar teaser «El juego cambia de cancha. 2026» (balón lunar, **sin marca**). Sembrar en comunidades de fútbol, espacio y robótica. | CC, CL | Impresiones, guardados, comentarios «¿qué es esto?» |
| **1** | (infra) | Abrir waitlist en silencio (humo): captura desde día 1 vía enlace en bio. | GR | Primeros 50 leads |
| **2** | X, TT/RL | Segunda oleada de teaser: micro-pistas (regolito, gravedad, «1,62»). Responder a la especulación sin confirmar. | CL, CC | Tasa de comentarios, *quote tweets* |
| **2** | LI | Post enigmático del founder: «Llevamos meses trabajando en algo que parece imposible.» | FD | Alcance LI, conexiones |
| **3** | X, TT/RL | **Revelación parcial:** el teaser muestra por primera vez la silueta del L-Striker pateando. Tagline «atleta, no máquina». | CC | CTR al simulador |
| **3** | EM | Primer email a los early-leads: «Tú lo viste primero. Esto es ICC.» | CL | Tasa de apertura ≥ 45 % |
| **4** | X, LI, PR | **Revelación total + apertura pública del simulador.** Nota de prensa: «El Apolo 11 del entretenimiento ya se puede jugar.» | PR, FD | Menciones de prensa, pico de visitas |
| **4** | TT/RL | Vídeo «cómo se ve un disparo en la Luna» → invitación al reto. | CC | `shot_executed`, compartidos |

**KPI de fase (fin S4):** 5.000 visitas acumuladas · 200 leads · 3 menciones de prensa.

### Acto II — «El Juego» (Semanas 5–8) · Foco: tasa de disparo y compartidos

| Semana | Canal | Acción | Responsable | KPI de control |
|---|---|---|---|---|
| **5** | X, TT/RL | Lanzar reto **#ICCFirstTouch** con leaderboard público. Plantilla de compartir lista. | CL, GR | `share_clicked`, altas en ranking |
| **5** | EM | Email a waitlist: «Defiende tu plaza: marca tu récord en el ranking.» | CL | CTR al simulador |
| **6** | X, TT/RL | **Retos a clubes** (LaLiga, Premier) y **a influencers** de fútbol/gaming/espacio. | FD, CL | Respuestas públicas de cuentas grandes |
| **6** | LI | Caso «producto vivo en producción»: tracción + arquitectura serverless barata. | FD, GR | Alcance entre inversores/operadores |
| **7** | TT/RL | Serie de clips «mejores toques de la semana» (UGC reempaquetado). | CC | Visualizaciones, tasa de guardado |
| **7** | X | Hilo de datos: «Esto es lo que la gravedad lunar le hace a un balón» (educativo + viral). | GR, CC | Alcance del hilo, clics |
| **8** | TT/RL, X | **Ranking de mitad de campaña:** difusión del récord top + acceso anticipado al campeón. | CL | Pico de compartidos |
| **8** | EM | Prueba social del contador: «Ya somos N operadores. Quedan plazas.» | CL | Conversión email → lead |

**KPI de fase (fin S8):** tasa de disparo ≥ 45 % · 600 leads · ≥ 5 retos respondidos.

### Acto III — «La Conversión» (Semanas 9–12) · Foco: cerrar los 1.000 operadores

| Semana | Canal | Acción | Responsable | KPI de control |
|---|---|---|---|---|
| **9** | Todos | Pivotar todos los CTA a la waitlist: «Sé de los primeros 1.000 operadores.» | CL, GR | Tasa visita → lead |
| **9** | TT/RL | Vídeo narrativo «atleta, no máquina»: el L-Striker como primer deportista interplanetario. | CC, FD | Visualizaciones, sentimiento |
| **10** | X, LI, PR | Empezar a comunicar **escasez real**: «Quedan < 300 plazas fundacionales.» | PR, CL | Velocidad de altas/día |
| **10** | EM | Email «invita y sube de posición»: referidos hacia la waitlist. | GR | Leads por referido |
| **11** | X, TT/RL | **Gran final del reto #ICCFirstTouch:** campeón de campaña + difusión masiva. | CL, CC | Pico de compartidos y leads |
| **11** | PR | Segunda ronda de prensa: «1.000 personas ya quieren operar un robot en la Luna.» | PR, FD | Menciones, backlinks |
| **12** | Todos | **Cierre simbólico de las 1.000 plazas** + teaser del puente a Fase 2 (MVP). | FD, CL | Meta de 1.000 leads |
| **12** | EM, LI | Email de cierre a operadores fundadores + informe de tracción para inversores. | FD, GR | Leads finales, materiales de inversión |

**KPI de fase (fin S12 / norte):** **1.000 leads** · ≥ 1.500 compartidos · informe de
tracción listo para la ronda pre-seed.

---

## 4. Mensajes y copys de ejemplo

> Tono: épico pero cercano; misterio en el acto I, comunidad en el II, urgencia en el
> III. Siempre «atleta, no máquina». Evitar tecnicismos; vender el momento, no el motor.

### Teaser (Acto I)
- **X:** «El juego cambia de cancha. 2026.» *(solo el balón lunar, sin enlace)*
- **X (pista):** «1,62 m/s². Ahí, el balón no cae. Vuela. 2026.»
- **TikTok/Reels (guion 8 s):** *negro → un balón entra flotando lentísimo sobre el
  regolito → la Tierra asoma al fondo → texto: «El juego cambia de cancha. 2026.»*
- **LinkedIn (founder):** «Llevamos meses con una idea que la mayoría llamaría
  imposible. En unas semanas dejará de serlo. #PrimerToque»

### Reto del simulador (Acto II)
- **X:** «Tu mejor disparo, pero en la Luna. ¿Cuánto hang-time aguantas?
  Juega → comparte → #ICCFirstTouch ⚽🌕»
- **Reto a club:** «@[Club], vuestro 9 domina el balón en la Tierra. ¿Y a 384.000 km,
  con un sexto de gravedad? Que lo demuestre. #ICCFirstTouch»
- **Reto a influencer:** «@[Creador], te lanzamos el primer reto interplanetario.
  Bate este récord en el simulador o admite que la Luna gana. #ICCFirstTouch»
- **UGC reempaquetado:** «Toque de la semana. La física lunar no perdona. 🌕»

### Waitlist (Acto III)
- **Hero del formulario:** «Sé de los primeros 1.000 operadores.»
- **Subtítulo:** «El L-Striker espera órdenes. Reserva tu plaza fundacional.»
- **Éxito (contractual):** «Estás en la lista. Te avisaremos del Primer Toque.»
- **Prueba social:** «Ya somos {total} operadores. Las plazas fundacionales son 1.000.»
- **Urgencia (S10+):** «Quedan menos de 300 plazas. Después, lista de espera.»
- **Email de bienvenida:** «Bienvenido, Operador. Tú estuviste antes del Primer Toque.
  Cuando un robot patee un balón en la Luna —el Apolo 11 del entretenimiento— tú ya
  estabas dentro.»

### Narrativa madre — «atleta, no máquina» (L-Striker)
El L-Striker **no es un robot**: es el **primer deportista interplanetario**. No habla
de servos ni de giroscopios; habla de un atleta entrenado para un único gesto histórico.
Cada pieza repite la misma idea emocional: *no estamos construyendo una máquina que
patea, estamos formando al primer jugador que disputará un partido fuera de la Tierra.*
El público no se apunta a un producto tecnológico; se apunta a **estar presente en el
Apolo 11 del entretenimiento** — y a operarlo.

---

## 5. Presupuesto cualitativo: orgánico primero, paid después

La Fase 1 es deliberadamente **orgánica**. El activo más valioso —un simulador real,
gratis, compartible— ya está desplegado y su coste marginal es casi nulo (Static Web
App Free + Functions + Table Storage). La estrategia:

1. **Orgánico primero (Semanas 1–8):** todo el alcance inicial procede de intriga, UGC
   del reto y retos a cuentas grandes. Cero gasto en medios; presupuesto solo en
   **producción de contenido** (vídeo del teaser, plantillas, edición de clips).
2. **Validar antes de pagar:** no se invierte en paid hasta confirmar que la **tasa de
   disparo** y los **compartidos** superan sus metas. Si el orgánico no engancha, el
   paid solo amplificaría un mensaje débil.
3. **Paid después (Semanas 9–12), quirúrgico:** una vez validado el embudo, presupuesto
   acotado para **reorientar (retargeting)** a quienes dispararon pero no se apuntaron,
   y para amplificar el clip ganador de #ICCFirstTouch hacia audiencias afines (fútbol,
   gaming, espacio). Objetivo: **bajar el coste por lead**, no comprar alcance frío.

**Principio rector:** cada dólar de paid debe ir detrás de una pieza orgánica ya
probada. El hype se gana; luego se compra escala.
