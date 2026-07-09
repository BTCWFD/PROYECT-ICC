> ## Nota de metodología y límites de este informe
>
> Generado por un equipo de **44 agentes** (5 auditores por dimensión + 1 verificador
> adversarial por hallazgo + 4 investigadores web + 4 lentes de ideación + síntesis).
>
> **Auditoría — fiable.** 30 hallazgos brutos → **18 confirmados, 12 refutados**. Cada
> hallazgo pasó por un verificador independiente cuya única tarea era *refutarlo* leyendo
> el código, con la carga de la prueba invertida. Los 12 refutados eran, en su mayoría,
> deriva documento↔código o opiniones de diseño presentadas como bugs.
>
> **Investigación — parcialmente fallida. Léase con cuidado.** De 4 líneas de investigación:
> - `tecnologia` ✅ devolvió datos reales con fuentes fechadas (es la única citada en §3).
> - `espacio` ❌ y `growth-gaming` ❌ devolvieron texto de relleno (`resumen: "x"`,
>   `afirmacion: "a"`, `fuente: "b"`) que pasó la validación de esquema sin aportar nada.
> - `financiacion` ❌ falló por completo (superó el tope de reintentos del esquema).
>
> **Consecuencia:** toda afirmación de este informe sobre **mercado de gaming/growth,
> economía de misiones lunares o panorama de financiación está SIN RESPALDO.** La §4
> (lluvia de ideas) se generó con ese contexto degradado: sus ideas siguen ancladas a la
> auditoría y al código real, pero sus justificaciones de mercado no están verificadas.
> No usar ante inversores sin investigación propia.

---

# Informe para el Fundador — ICC (Interplanetary Champions Cup)

**Fecha:** 9 de julio de 2026 · **Autor:** Lead técnico · **Alcance:** auditoría de la Fase 1 (simulador web + clasificatorias + waitlist), estado del arte y hoja de ruta.

---

## 1. Resumen ejecutivo

- **Producción está funcionalmente caída y no es un bug de código: es facturación.** La suscripción de Azure (`33317e68-…`) está deshabilitada y en solo-lectura. Los estáticos se sirven por CDN (todas las HTML dan 200, `/api/health` da 200), pero `/api/leaderboard` y `/api/waitlist/count` dan 500. **Esto invalida hoy casi todos los quick wins de crecimiento**: referidos, contador de escasez, OG dinámica y captación de leads dependen del store, que no responde. **Acción cero, previa a todo lo demás: reactivar la suscripción.** Sin eso, cualquier campaña quema tráfico contra un embudo muerto.

- **El bloqueo operativo es además invisible.** `/api/health` devuelve `{status:'ok'}` estático sin sondear el store (`api/src/functions/health.js:16`), así que un monitor externo vería verde durante un outage total. Una demo a inversores se rompería en vivo sin aviso previo.

- **Hay un riesgo de coste sin techo en la propia API.** `POST /api/shots` no tiene rate-limiting y ejecuta 2 full-scans de tabla + un bucle de física de hasta ~123k iteraciones por petición anónima (`shots.js:144`). Sobre una suscripción cuya facturación ya tumbó producción, esto no es teórico: es un vector de agotamiento de coste/DoS.

- **La progresión del juego es explotable y contradice su propio diseño.** El combo se encadena por proximidad temporal (90 s) sin mirar el alcance y se persiste; el logro "Rompe-Récords" +30 XP se otorga en el primer disparo de cualquiera; la racha diaria —el gancho de retorno macro documentado— no existe en el código. Se puede subir de nivel y sacar logros pulsando "Patear" con tiros de 0 m. El estatus deja de significar habilidad.

- **Un activo de 6,7 MB bloquea el render de todas las páginas.** `assets/logo.png` (6.721.162 bytes) se usa como favicon y logo de header a 48 px con `loading="eager"` en 8 páginas; `hero-1/2.png` suman ~13 MB más en `investors.html`. Es el único hallazgo P0 y es puro peso muerto sobre el LCP móvil.

- **La landing de captación (`investors.html`) está desinstrumentada y sin las palancas del plan de marketing.** No carga `analytics.js` (no se mide la conversión visita→lead, KPI ≥4% prometido a inversores) ni `waitlist-count.js`, y aunque lo cargara el selector no casa. La prueba social/escasez que el MARKETING_PLAN considera central nunca se pinta.

- **La buena noticia estratégica: el estado del arte valida la tesis Split-Brain, no la desafía.** El primer partido humanoide 11v11 de RoboCup sobre hardware real (5-jul-2026) y la convergencia independiente de la industria hacia arquitecturas de dos velocidades (planificador lento + ejecutor RL rápido) refuerzan el relato. El reto propio de la ICC se estrecha a "adaptar patada/regate a 1/6 g en simulación", no a resolver locomoción base.

---

## 2. Auditoría verificada

18 hallazgos sobrevivieron a verificación adversarial. Ordenados por severidad:

| Sev | Dimensión | Hallazgo | Archivo:línea | Fix |
|-----|-----------|----------|---------------|-----|
| **P0** | frontend | `logo.png` de 6,7 MB como favicon + logo header (48 px) en 8 páginas con `loading="eager"`; `hero-1/2.png` ~6,5 MB c/u en investors | `web/index.html:44` | Exportar logo optimizado (~5-20 KB) a tamaño real + favicon multi-size; recomprimir heros a WebP/AVIF <200 KB |
| **P1** | seguridad-api | Sin rate-limiting: cada `POST /api/shots` hace 2 full-scans (`rankForRange`+`totalShots`) + bucle de física ~123k iter | `api/src/functions/shots.js:144` | Rate-limit por IP/token en shots/waitlist/events; eliminar doble full-scan (usar `$top`/contador cacheado); cap duro a power/angle antes de `computeTrajectory` |
| **P1** | seguridad-api | `/api/events` persiste `props` arbitrarias del cliente verbatim (`JSON.stringify`), rompiendo el contrato "Sin PII" y permitiendo bloat sin cota | `api/src/functions/events.js:47` | Allowlist de claves con tipos/longitudes acotadas; truncar y capar tamaño antes de persistir |
| **P1** | fisica-gameplay | El combo encadena con cualquier disparo en 90 s (sin mirar alcance) y se persiste → XP-farming y logros racha5/daily_combo con tiros de 0 m | `web/js/game.js:284` | Incrementar combo solo si `range>=60`, romperlo a 0 si no; no persistir `combo`/`lastShotTs` |
| **P1** | fisica-gameplay | La racha diaria persistida (`streak`) y los logros `racha_3`/`racha_7` están en GAME_DESIGN §4-5 pero **no existen en el código** | `web/js/game.js:166` | Añadir `streak`+`lastDailyDate`, incrementar/reiniciar en `ensureDaily`, crear logros e indicador "🔥 N días" en HUD |
| **P1** | frontend | `investors.html` queda **en blanco** si el JS no ejecuta: casi todo el contenido lleva `.reveal { opacity:0 }` y solo IntersectionObserver lo revela | `web/css/investors.css:1255` | Fallback sin-JS: `.reveal` visible por defecto, ocultar solo bajo clase `html.js`; o `<noscript>` que fuerce `opacity:1` |
| **P1** | infra-cicd | Drift de IaC: `main.parameters.json` declara `iccsimulatorst01` (no existe); la cuenta real es `iccsimstore01` | `infra/main.parameters.json:18` | Corregir a `iccsimstore01` e importar el recurso existente para que Bicep sea fuente de verdad |
| **P1** | producto-negocio | El contador de escasez ("Quedan <300 plazas") nunca aparece en investors: no se incluye `waitlist-count.js` y el selector busca `.waitlist`/`.waitlist-lead` pero la sección usa `id`, no clase | `web/investors.html:764` | Incluir el script y añadir `class="waitlist"` + nodo `.waitlist-lead` al `#waitlist` |
| **P2** | seguridad-api | `EMAIL_RE` admite caracteres de control no-whitespace; `sanitizeEmailKey` no los elimina → `createEntity` falla no-409 → 500 (no 400) y email crudo llega a admin | `api/src/functions/waitlist.js:25` | Endurecer `EMAIL_RE` y hacer que `sanitizeEmailKey` elimine `\u0000-\u001f` antes del RowKey |
| **P2** | seguridad-api | Backend memoria/Table se fija solo al importar; fallo de Table en runtime da 500 sin degradar; `createTable().catch(()=>{})` traga todos los errores | `api/src/store.js:384` | Degradar a memoria ante fallo runtime (o marcar salud); no tragar errores de `createTable` (distinguir 409 del resto) |
| **P2** | fisica-gameplay | Logro "Rompe-Records" + 30 XP se otorgan en el **primer disparo** de todo jugador (`prevRecord` arranca en 0); el SFX sí está protegido, evidenciando la inconsistencia | `web/js/main.js:368` | Marcar record solo si `prevRecord>0 && round(range)>prevRecord`, igual que el gate del SFX |
| **P2** | fisica-gameplay | El botón Reiniciar no rompe el combo, contra GAME_DESIGN §5 | `web/js/main.js:769` | Exponer `ICCGame.resetCombo()` y llamarlo desde el handler de reset |
| **P2** | frontend | `og:image`/`twitter:image` apuntan a un SVG; ningún scraper social (FB, X, LinkedIn, WhatsApp, Slack, Telegram) renderiza SVG → previews sin imagen en todo el funnel | `web/index.html:19` | Generar `og-cover.png` 1200×630 y apuntar las 3 páginas a él |
| **P2** | frontend-a11y | `<label for="world">` apunta a un `<div role="radiogroup">` (no etiquetable) → grupo sin nombre accesible; además sin navegación por flechas ni roving tabindex | `web/index.html:103` | Nombrar con `aria-labelledby`/`aria-label`; implementar flechas + roving tabindex, o usar radios nativos |
| **P2** | frontend-a11y | Todo `#game-hud` es `aria-live="polite"`: lee el HUD completo tras cada disparo, tapando `#status` | `web/index.html:68` | Quitar `aria-live` del contenedor; marcar como live solo el dato puntual relevante |
| **P2** | infra-cicd | Acciones de GitHub sin pin a SHA en el workflow que despliega a prod con el deploy token | `.github/workflows/azure-static-web-apps.yml:56` | Fijar cada acción a SHA completo + Dependabot/Renovate |
| **P2** | infra-cicd | `/api/health` devuelve `ok` sin sondear el store: ciego a la caída actual de producción | `api/src/functions/health.js:16` | `?deep=1` que haga `waitlistCount()`/`listEntities` con timeout y devuelva 503 si el store no responde |
| **P2** | producto-negocio | `investors.html` no carga `analytics.js`: no se mide `page_view` ni conversión visita→lead (KPI ≥4% del plan) | `web/investors.html:763` | Incluir `analytics.js` antes de `waitlist.js` y disparar `ICCAnalytics.track('page_view')` |

**Nota de confianza:** de la auditoría completa se **refutaron 12 hallazgos** tras verificación adversarial, y merece la pena decir por qué, porque sube la señal del resto. Se descartaron por tres razones recurrentes: (1) *la plataforma ya mitiga* — p. ej. el "sin límite de tamaño de body" lo cubre el `MaxRequestBodySize` de SWA/Kestrel antes de `request.json()`; (2) *drift doc↔código sin impacto de usuario* — la curva de XP, los umbrales de rango y la semántica del reto diario difieren de GAME_DESIGN.md, pero el documento es un brief interno aspiracional, no un contrato público, y el código es internamente consistente con lo que el usuario lee; (3) *opinión de diseño presentada como bug* — el leaderboard devolviendo 500 (no vacío) ante backend caído es correcto: distingue "0 tiros" de "no se pudo contactar". También se confirmó como **falso positivo ya descartado** que `api/local.settings.json` sea una fuga de secreto (está en `.gitignore`, nunca se commiteó). El hecho de que un tercio largo de los candidatos no sobreviviera es la razón por la que los 18 de arriba sí son accionables.

---

## 3. Estado del arte y mercado

La investigación técnica es sólida y, en conjunto, **acerca la tesis Split-Brain en lugar de alejarla**. Lo relevante y fechado:

- **RoboCup, primer partido humanoide 11v11 sobre hardware real (5-jul-2026, plataforma Booster K1).** B-Human venció 4-0 a HTWK con correr, chutar y levantarse entrenados por deep RL. Retos abiertos citados: comunicación, recuperación tras fallos, táctica y posicionamiento — que son exactamente la capa de *intención* que la ICC asigna al humano. Fuente: https://letsdatascience.com/news/robocup-stages-first-11-vs-11-humanoid-match-f8ee756b (6-jul-2026). **Salvedad honesta:** la fuente NO especifica el nivel de autonomía a bordo ni las tasas de caída; el copy de marketing no debe afirmar lo que la fuente no sostiene.
- **NVIDIA Jetson Thor (Blackwell) en GA (25-ago-2025):** 2.070 TFLOPS FP4, 128 GB, 130 W. El "cerebro de ejecución local" que exige el Split-Brain ya es hardware comercial. Fuente: https://nvidianews.nvidia.com/news/nvidia-blackwell-powered-jetson-thor-now-available-accelerating-the-age-of-general-robotics
- **Convergencia independiente a arquitecturas de dos velocidades:** VLM planificador a 5-10 Hz + ejecutor ligero (diffusion/flow-matching) a 50-100 Hz con *action chunking*, porque los VLA solos no alcanzan control fino a 50-100 Hz en edge. Es, literalmente, un diseño split-brain. Fuentes: https://arxiv.org/pdf/2604.24447 y https://hyscaler.com/insights/vision-language-action-vla-guide/
- **Ejecución autónoma a bordo robusta a latencia/desconexión ya es producto:** Gemini Robotics On-Device (DeepMind), probado en el humanoide Apollo, se adapta con 50-100 demostraciones. Fuente: https://deepmind.google/blog/gemini-robotics-on-device-brings-ai-to-local-robotic-devices/ y https://arxiv.org/pdf/2510.03342
- **Teleoperación con retardo → control compartido/supervisado con VR** (Distributed Supervisory Control, RL TD3 para sub-tareas). Es el marco académico casi literal de la ICC. Fuentes: https://www.tandfonline.com/doi/abs/10.1080/10447318.2026.2633203 y https://link.springer.com/article/10.1007/s11042-025-21024-5
- **RL para habilidades de fútbol específicas madura rápido:** Dribble Master, motores de patada reactivos, Humanoid Goalkeeper, pipelines Sim2Real sobre Unitree G1 / Booster T1-K1. Fuentes: https://arxiv.org/pdf/2505.12679, https://arxiv.org/pdf/2510.18002, https://arxiv.org/pdf/2512.12437
- **Generalización VLA en alza:** Physical Intelligence pi-0.7 (abr-2026) ejecuta tareas nunca entrenadas. Fuente: https://internet-pros.com/blog/vision-language-action-models-robotics-2026/
- **La brecha de frecuencia persiste** (EdgeVLA ~7x, FASTER con scheduling adaptativo): confirma que un modelo monolítico no basta y hace falta el ejecutor RL rápido separado. Fuentes: https://arxiv.org/pdf/2511.05642 y la guía VLA citada.

**Conclusión de mercado:** todas las tendencias verificadas empujan hacia la separación intención/ejecución de la ICC, y estrechan su riesgo técnico propio a adaptar políticas de patada/regate ya resueltas a 1/6 g en simulación.

**Transparencia sobre lo que NO se pudo sustentar:** las líneas de investigación etiquetadas **"espacio"** y **"growth-gaming"** volvieron vacías (contenido de marcador de posición: `x`, `a/b/c`). No aportan nada y no deben citarse como si existieran. Cualquier afirmación sobre el mercado de gaming/growth o el ángulo espacial concreto está **sin respaldo** a día de hoy y requeriría una investigación propia antes de usarse ante inversores.

---

## 4. Lluvia de ideas

Agrupadas por horizonte y deduplicadas entre lentes (varias ideas se repetían: instrumentación de investors, rate-limiting, health con sonda real, contador de escasez).

### AHORA (0-3 meses) — desbloquear, tapar fugas, ganar lo barato

| Idea | Esfuerzo | Impacto | Riesgo que la tumba |
|------|----------|---------|---------------------|
| **Reactivar la suscripción Azure + corregir el drift de IaC** (`iccsimstore01`) | S (operativo) | Crítico | No es técnico: es facturación. Sin esto, todo lo de crecimiento es humo |
| **Guardarraíl de coste: rate-limiting + fin de los full-scans en `/api/shots`** (token-bucket por IP, `$top`, cap a power/angle) | M | Alto | El rate-limit en memoria no es consistente entre instancias Functions; es un primer techo, no sustituye APIM/Front Door |
| **Optimizar assets: logo <20 KB + favicon multi-size + heros a WebP <200 KB** | S | Alto (LCP/datos móviles) | Ninguno real; es peso muerto puro |
| **Arreglar el combo a la spec + matar el XP-farming + record solo si `prevRecord>0` + Reiniciar rompe combo** | S | Alto | Nerf percibido por usuarios con estado guardado; migrar esquema (`v:2`) sin borrar XP ganada |
| **Racha diaria real (`streak`) + logros `racha_3`/`racha_7` + "🔥 N días" en HUD** | M | Alto (retención D1/D7) | Depende de medianoche local; necesita tolerancia "ayer o antes" bien probada para no regalar/romper rachas |
| **Instrumentar y armar `investors.html`: `analytics.js` + `page_view` + contador de escasez con selector corregido** | S | Medio-Alto | Con el store en 500, el contador no se ve hasta reactivar Azure; la analítica sí queda lista ya. Duplicar `page_view` server-side (adblockers) |
| **Fallback sin-JS en `investors.html`** (`.reveal` visible por defecto) | S | Medio (no perder inversores ante fallo JS) | Ninguno; es cumplir el principio de degradación elegante ya declarado |
| **OG image PNG estático 1200×630 en las 3 páginas** | S | Alto (CTR de cada link ya compartido) | Si el dominio final cambia, hay que regenerar; trivial |
| **Meter URL de vuelta + QR dentro de la tarjeta de `share.js` y del texto de `navigator.share`** | S | Alto | Bajo; QR inline sin CDN. Si el dominio final no está fijado, la URL quemada en imágenes ya compartidas queda obsoleta |
| **`/api/health` con sonda real (`?deep=1`) + banner "modo offline" en el front** | S-M | Alto (visibilidad de outage) | La sonda no debe cargar el store frágil; lectura mínima y devolver `degraded`, no 500 |

### SIGUIENTE (3-9 meses) — profundizar producto y crecimiento

| Idea | Esfuerzo | Impacto | Riesgo que la tumba |
|------|----------|---------|---------------------|
| **"Bate tu fantasma": ghost del récord personal, 100% cliente** (independiente del backend caído) | M | Medio | Sobrecarga del canvas puede tirar 60 fps en móvil; la estela guardada puede diferir del recálculo anti-trampas del servidor |
| **Deep-link de reto 1v1 (ghost)** `/?reto=club~range~world` — UGC competitivo coste-cero, verificable por física determinista | M | Alto | Sin el enlace de vuelta en el share (idea de QR arriba), el reto no viaja: hacer primero esa idea |
| **Medallero / colección de logros persistente** (hoy los logros aparecen 2,6 s y desaparecen) | M | Medio | Con solo 9 logros se completa rápido; depende de ampliar catálogo (racha_3/7) para tener recorrido |
| **Onboarding "Primer Toque": coach de 3 pasos que enseña el hang-time lunar** | M | Medio | Overlay mal medido sube el rebote; saltable en 1 toque, respetar `reduce-motion`, no bloquear si el JS falla |
| **Referidos sobre la waitlist con código único + salto de posición** | L | Alto (K>0 sin presupuesto) | Requiere store operativo + rate-limiting + dedupe de email real, o se infla trivialmente con altas falsas |
| **Modo Intención: solver de balística inversa como demo literal del Split-Brain** (`/api/solve`) | M | Alto (venta B2B técnica en 30 s) | El solver con aire (Newton-Raphson) puede no converger en ángulos extremos; acotar dominio + fallback analítico sin aire |
| **Prueba de paridad del gemelo digital + model card + test de física cliente/servidor en CI** | S | Medio (due-diligence técnico) | Bajo; la sonda no debe cargar el store frágil |
| **Página-campaña "De RoboCup a la Luna" (newsjacking)** | M | Medio (PR orgánico gratis) | La ventana mediática se cierra en días; el copy debe evitar afirmar autonomía/tasas de caída que la fuente no verificó |

### APUESTA (9+ meses) — plataforma y monetización

| Idea | Esfuerzo | Impacto | Riesgo que la tumba |
|------|----------|---------|---------------------|
| **Benchmark abierto "ICC Lunar Kick": spec máquina-legible + pista de bots + cliente de referencia** | M-L | Alto (convierte el sim en infraestructura B2B) | **No debe salir sin resolver antes el rate-limiting (P1)**: una pista programática sobre 2 full-scans + bucle de CPU es un vector de coste/DoS directo |
| **Sandbox de políticas: partner sube `kick(intent)->{power,angle}` y se puntúa** | L | Alto (leads técnicos cualificados) | Ejecución de código de terceros = superficie RCE; limitar a DSL declarativo de parámetros o isolated-vm con timeouts, o es un agujero neto |
| **Página `/partners`: dossier Split-Brain instrumentado + captación B2B segmentada** | M | Medio | El formulario depende del store (hoy 500); sin backend los leads se pierden en silencio |
| **Demo de latencia + action-chunking** (por qué el split-brain gana con enlace pobre) | M | Alto (argumento B2B difícil de transmitir con palabras) | Si el modelo de latencia es de juguete, un revisor técnico lo detecta; debe basarse en un lazo de control real |
| **Modo Desafío con misiones temáticas de robótica** (Fase 2, rejugabilidad) | L | Medio | Alcance grande; si las metas no son alcanzables con la física real no enganchan |
| **Monetización honesta a 12m: tramo "Founding Operator" con depósito reembolsable (Stripe)** | L | Alto (willingness-to-pay dura, no "N en lista") | Cobrar depósitos activa obligaciones legales/fiscales y de reembolso; empezar simbólico con términos explícitos |
| **Anti-roadmap explícito: congelar qué NO construir** (robot físico, VLA propio, tokenomics — EXXO no aplica) | M | Medio | Un modo "intención" scripteado puede leerse como truco; enmarcarlo como maqueta de producto, no como capacidad ML |

---

## 5. Recomendación

### Las 3 cosas que haría esta semana, en orden

1. **Reactivar la suscripción de Azure y arreglar el drift de IaC.** Es el bloqueo raíz: mientras el store dé 500, el leaderboard, la waitlist, los referidos y el contador de escasez están muertos, y cualquier tráfico que atraigas se desperdicia. En el mismo movimiento, corregir `main.parameters.json` (`iccsimulatorst01` → `iccsimstore01`) para que nadie redeploye la infra y cree una cuenta huérfana vacía. Coste: operativo, casi cero código.

2. **Cerrar el guardarraíl de coste antes de reabrir tráfico: rate-limiting + fin de los full-scans en `/api/shots`, y `/api/health` con sonda real.** No reactives la API a un mundo hostil dejando abierto un endpoint anónimo que hace 2 escaneos completos de tabla + ~123k iteraciones de CPU por llamada, sobre la misma suscripción cuya facturación ya te tumbó una vez. Y arregla la sonda de salud en el mismo PR: no puedes operar a ciegas ante el próximo outage.

3. **Ganar lo barato de alto impacto en el front: optimizar `logo.png`/heros (P0), OG en PNG, y arreglar el combo + record del primer tiro.** Son cambios pequeños, sin dependencia del backend, que mejoran LCP móvil, el CTR de cada link ya compartido, y devuelven integridad a la progresión del juego. Se pueden mergear el mismo día que el punto 2.

### Una cosa que NO haría todavía, y por qué

**No lanzaría el benchmark abierto de bots ni el sandbox de políticas de terceros.** Son la apuesta de plataforma más atractiva del lote, pero abrir una pista programática *antes* de resolver el rate-limiting y los full-scans (P1) convierte tu activo B2B en un vector de coste/DoS con la puerta de par en par — y el sandbox añade encima superficie de RCE por ejecución de código externo. Es exactamente el orden equivocado: primero el guardarraíl (recomendación 2), luego, si acaso, la plataforma. Sacarlo ahora sería construir la fachada de la casa sobre unos cimientos que ya sabemos que se hunden.