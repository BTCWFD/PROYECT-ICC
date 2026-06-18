# Informe Principal — ICC vs. el estado tecnológico del planeta (jun 2026)

> Análisis elaborado por un equipo de 8 agentes (5 analistas de tecnología con investigación
> web verificada + síntesis del white paper + analítica de viabilidad/TRL + lead integrador).
> Todas las cifras de estado del arte están ancladas a fuentes públicas de 2025-2026.

---

## 1. Síntesis del white paper (qué propone la ICC)

La **Interplanetary Champions Cup (ICC)** es una liga de **fútbol robótico 4 vs 4 en un domo
lunar presurizado**, planteada como **plataforma de validación de robótica de consumo en baja
gravedad** (1/6 g). Su tesis técnica:

- **Problema:** la latencia Tierra-Luna (~2,5-3 s RTT) hace **imposible el control directo** (joystick).
- **Solución "Split-Brain" / Control de Supervisión:** el humano en Tierra envía **intenciones de
  alto nivel** por VR; el robot en la Luna ejecuta con **Edge AI (RL)** localmente (0 ms locales).
- **Hardware "L-Striker":** piernas digitígradas, giroscopios de reacción, anclaje activo, carcasa térmica/anti-regolito.
- **Go-to-market "Operación Primer Toque":** llevar **un** robot + **un** balón a la Luna y dar el
  primer saque interplanetario. Marketing-first.
- **Fases:** F1 (0-12m) hype digital + simulador (ya desplegado) → F2 (12-24m) MVP Primer Toque →
  F3 (3+ años) liga + domo + VR tickets.

---

## 2. Estado tecnológico real del planeta (lo que de verdad existe hoy)

| Área | Madurez (TRL) | Estado del arte 2025-2026 |
|---|---|---|
| **Robótica humanoide** | Habilidades atléticas aisladas **TRL 7-8** · fútbol integrado autónomo **TRL 3-4** | Unitree H1/G1 corren 2-3,3 m/s, saltan, hacen volteretas y patean (RL+sim-to-real). Pero en los *World Humanoid Robot Games* (Beijing, ago-2025) los partidos fueron "caídas constantes al menor contacto". Despliegues reales (Figure en BMW) son **estructurados y supervisados**. |
| **Edge AI / RL para control** | Capa baja **TRL 6-8** · autonomía reflexiva alta **TRL 4-5** | Control RL on-device maduro (50-100 Hz en Jetson). **Jetson Thor** (ago-2025, 2.070 TFLOPS) habilita VLA/transformers en el borde. Los modelos Visión-Lenguaje-Acción **se degradan severamente fuera de distribución**. Patrón real: *razonamiento lento (~6-7 Hz) supervisando control rápido (100 Hz)*. |
| **Aterrizaje/lanzamiento lunar** | **TRL 7-9 desigual**, misión-dependiente | El vehículo existe y sobra masa, pero **ningún operador ha encadenado 2 alunizajes plenos**; fiabilidad de descenso **20-40%** (fallo recurrente: altímetro/LRF láser). Firefly Blue Ghost es la referencia con éxito. Starship no es vía para cargas pequeñas antes de 2027. |
| **Teleoperación con retardo / supervisión** | **TRL 6-7** en tareas estructuradas | El paradigma "humano envía intención, robot ejecuta local" **está validado** en analogía espacial (ISS, satellite servicing). Pero el *predictive display* **no sirve cuando hay contacto físico** — y el fútbol es contacto continuo. |
| **Medios inmersivos / VR** | Streaming inmersivo **TRL 7-9** · asiento robótico **TRL 5-6** | NBA inmersivo, **Cosm** (domos comunales 27 m/12K), ligas de robots (URKL, BattleBots Pro 2026). Las piezas existen por separado; nadie las integró para fútbol/combate robótico. La base de headsets de consumo es **pequeña y cayó en 2025**. |

---

## 3. Analítica: afirmaciones de la ICC vs. realidad

| Subsistema | Veredicto | TRL | Brecha principal |
|---|---|---|---|
| Simulador web (F1) + hype | 🟢 **viable-hoy** | 9 | Sin brecha técnica; reto de producto/marketing. **El activo a explotar ya.** |
| Control de supervisión (latencia ~3 s) | 🟡 **viable-corto** | 6-7 | Probado en tareas estructuradas; falla con **contacto físico**. *El núcleo conceptual es sólido.* |
| Edge AI / autonomía reflexiva local | 🟡 **viable-corto** | 6 (acotado) / 4-5 (abierto) | Robustez fuera de distribución, detección de fallos, garantías de seguridad. |
| Transporte + alunizaje (~30 kg) | 🟡 **viable-corto (alto riesgo)** | 7-9 | **Reproducibilidad**: nadie encadenó 2 alunizajes. ~50-70% prob. de fracaso. |
| Coleccionable / NFT del primer toque | 🟢 **viable-hoy (riesgo de mercado)** | 8-9 | Técnicamente trivial; mercado NFT deportivo **-11% en 2025**. |
| VR tickets / asientos virtuales | 🟡 **viable-corto** | 5-7 | Falta integración y masa de headsets; **el modelo domo escala mejor**. |
| **Robot jugador autónomo (L-Striker jugando)** | 🟠 **viable-largo** | 3-4 | Tolerancia al contacto, percepción robusta, táctica multi-agente, energía, uptime industrial. **Hoy se caen con un roce.** |
| **Domo lunar presurizado / estadio (F3)** | 🔴 **especulativo** | 1-2 | No es robótica: es **hábitat espacial completo**. Horizonte de décadas. *La afirmación más débil.* |

---

## 4. Lluvia de ideas (ancladas a lo que HOY es posible)

**Ahora (0-12m):**
1. **Pivotar el MVP a "Primer Toque" literal** — UN robot, UN saque balístico en 1/6 g (patada aislada es TRL 7-8; esquiva todo lo inmaduro).
2. **"Mundial de Fútbol Robótico en Tierra"** como liga-precursora con Unitree G1 *Comp* (ya se vende para retos de fútbol) → IP y viewership ya.
3. **Comunicar la arquitectura real** "planificador VLA lento + política RL rápida on-device" como corazón técnico defendible (promete TRL 6, no TRL 4).
4. **Gemelo digital RL abierto** en el simulador ya desplegado → competición de políticas de la comunidad (crowdsourcing de skills + hype).
5. **Contenido "making-of" volumétrico** del entrenamiento y la patada en torre de caída/parábola (mercado volumetric ~26% CAGR).

**6-12 meses:**
6. **Alianza de carga secundaria con Firefly** (único con alunizaje pleno) exigiendo datos del sensor de descenso + **opción de segundo intento + seguro**.
7. **Patrocinio en el robot del Primer Toque** como activo publicitario único (no depende de que exista liga) — el flujo de ingresos más robusto.
8. **Reposicionar el NFT** como certificado histórico irrepetible (no colección especulativa) o evitarlo como pilar recurrente.
9. **Alianza con un laboratorio RoboCup / equipo universitario** para táctica multi-agente y recuperación de caídas (justo los gaps TRL 3-4).

**1-3 años:**
10. **Monetizar vía domo comunal tipo Cosm** (asientos colectivos sin headset) antes que VR tickets individuales.
11. **Posicionar la ICC como plataforma B2B** de validación de control supervisado bajo latencia interplanetaria → vender dataset/banco de pruebas a fabricantes y agencias (la tesis más sólida).

**3+ años:**
12. **Diferir explícitamente el domo y la liga a 2035+** como visión aspiracional (modelo SpaceX), nunca como roadmap comprometido.

---

## 5. Riesgos principales

1. **Misión dominante:** alunizaje exitoso solo 20-40%. Sin segundo intento + seguro, un fracaso destruye el hito y la credibilidad.
2. **Sobrepromesa tecnológica:** el WP sugiere fútbol 4v4 autónomo (TRL 3-4) como cercano. Separar visión de entregable o se pierde credibilidad al primer escrutinio.
3. **Domo presurizado (TRL 1-2):** depende de infraestructura lunar inexistente; comprometerlo es riesgo reputacional.
4. **Baja gravedad + regolito sin validación sim-to-real:** el RL está entrenado en 1 g; no hay garantía de transferencia a 1/6 g, polvo, vacío y térmica.
5. **Mercado de monetización:** NFTs (-11% en 2025) y base de headsets pequeña hacen frágiles dos pilares de ingreso.
6. **Energía/batería, uptime, ventana competitiva** (URKL/BattleBots/Cosm avanzan en Tierra) y **coste/cadencia de lanzamiento** aún inestables.

---

## 6. Veredicto final

**Puntuación de viabilidad por fase:**
- **Fase 1 (simulador + hype): 9/10 hoy.**
- **Fase 2 (Primer Toque): 6/10** (sube a 7 con seguro; cuello de botella = alunizaje 20-40%).
- **Fase 3 (liga en domo): 3/10** — el subsistema más débil; horizonte 2035+.

**Lo más sólido:** el control supervisado bajo latencia (el diagnóstico y la arquitectura Split-Brain son correctos y honestos). **Lo más débil:** el domo lunar y el fútbol autónomo de contacto.

> **Titular honesto:** *"El fútbol robótico lunar no está listo: la liga es ciencia-ficción hasta
> ~2035. Pero el primer saque interplanetario de la historia podría patearse en menos de dos años,
> si el cohete sobrevive al descenso."*

**Recomendación:** **Adelante, con re-encuadre obligatorio.** Pivotar al *Primer Toque* literal,
ejecutar y monetizar la Fase 1 hoy, blindar la misión (Firefly + seguro + segundo intento),
comunicar separando lo **validado** de lo **aspiracional**, diferir el domo a 2035+, y consolidar
la **tesis B2B de dataset** + una alianza RoboCup. Ejecutar solo los hitos de **0 a 24 meses**.

---

### Tres conclusiones
1. **Diagnóstico correcto, ambición física sobrevendida.** El Split-Brain ya está validado; el fútbol autónomo y el domo están a una década o más.
2. **El único hito lunar realista a 2 años es el Primer Toque.** La patada aislada es factible; el cuello de botella es el alunizaje.
3. **El valor es monetizable hoy y no depende de la Luna:** simulador, hype, patrocinio y tesis B2B de dataset. NFT y VR-tickets individuales conviene reposicionarlos.

> _Fuentes: CNBC, Smithsonian, arXiv (2512.06571, 2205.02824, 2512.03913, 2512.01996), NVIDIA,
> RAI Institute, Robotics&Automation News, robostore, lumichats, entre otras (jun 2026). Estado del
> arte sujeto a evolución rápida; revalidar antes de decisiones de capital._
