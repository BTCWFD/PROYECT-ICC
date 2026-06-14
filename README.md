# 🌕 Interplanetary Champions Cup (ICC)

> _"Validación del Entretenimiento Multiplanetario a través de Robótica Autónoma Supervisada"_

La **Interplanetary Champions Cup (ICC)** es una plataforma de validación para la robótica
de consumo en entornos de baja gravedad, con la visión final de un torneo de fútbol en un
domo lunar presurizado. La estrategia de salida al mercado se ejecuta mediante la
**"Operación Primer Toque"**: llevar un solo robot humanoide a la Luna para realizar el
primer saque inicial interplanetario.

Este repositorio contiene la documentación estratégica y el **primer entregable técnico de la
Fase 1**: el _Simulador Web de Física Lunar_.

---

## 📦 Contenido del repositorio

```
PROYECT-ICC/
├── README.md             ← este archivo
├── docs/                 ← white papers y documentación estratégica
│   ├── WHITEPAPER_ICC_V3.pdf        (versión vigente)
│   ├── WHITEPAPER_ICC_V2.pdf
│   ├── WHITEPAPER_ICWC_V1.pdf
│   ├── OPERACION_PRIMER_TOQUE.pdf   (plan de marketing del MVP)
│   └── EVOLUCION.md                 (comparativa de versiones del white paper)
└── web/                  ← Fase 1: Simulador Web de Física Lunar
    ├── index.html
    ├── css/styles.css
    └── js/
        ├── physics.js    (motor de física: gravedad, vacío, trayectoria)
        ├── simulator.js  (renderizado en canvas)
        └── main.js       (UI e interacción)
```

---

## 🚀 El Simulador de Física Lunar (Fase 1)

Demuestra de forma visual e interactiva **por qué la baja gravedad lunar (1/6 g) convierte
al fútbol en un espectáculo nuevo**: el balón vuela cientos de metros y permanece segundos
en el aire ("hang-time"), exactamente el efecto que busca la "Operación Primer Toque".

### Características

- ⚽ Simula el "Primer Toque": un robot **L-Striker** patea un balón.
- 🌍 vs 🌕 **Comparativa Tierra/Luna** en tiempo real (con y sin resistencia del aire).
- 🎛️ Controles de **potencia** y **ángulo** de disparo.
- 📊 Métricas en vivo: **alcance**, **altura máxima** y **tiempo de vuelo**.
- 🧮 Física newtoniana real: `g_luna = 1.62 m/s²`, `g_tierra = 9.81 m/s²`.

### Cómo ejecutarlo

No requiere instalación ni dependencias. Opción más simple:

```bash
# Abrir directamente en el navegador
web/index.html
```

O sirviéndolo localmente (recomendado):

```bash
cd web
python -m http.server 8000
# luego abrir http://localhost:8000
```

---

## 🛰️ Hardware de referencia: Robot "L-Striker Mark I"

Atleta robótico estandarizado, optimizado para la gravedad lunar (1.62 m/s²):

| Subsistema       | Especificación                       | Justificación en 1/6 g                                 |
|------------------|--------------------------------------|--------------------------------------------------------|
| Locomoción       | Piernas digitígradas (invertidas)    | Resortes para saltos altos y amortiguar caídas de 10 m |
| Estabilidad aérea| Giroscopios de reacción (CMG)        | Reorientación en vuelo durante el largo *hang-time*    |
| Tracción         | Anclaje activo (garras retráctiles)  | Frenar y girar sin resbalar (fricción mínima)          |
| Carcasa          | Compuesto térmico/anti-polvo         | Regolito abrasivo y -130 °C a +120 °C                  |

---

## 🗺️ Roadmap (según White Paper V3.0)

- **Fase 1 — Hype Digital (meses 0-12):** Simulador web de física lunar + clasificatorias virtuales. ← _estamos aquí_
- **Fase 2 — MVP "Primer Toque" (meses 12-24):** un robot + un balón en la Luna; saque inicial interplanetario.
- **Fase 3 — Liga ICC (año 3+):** domo geodésico, múltiples unidades y "asientos virtuales" (VR tickets).

---

## 📄 Documentación

La carpeta [`docs/`](docs/) contiene los white papers oficiales y la
[comparativa de su evolución](docs/EVOLUCION.md) (de ICWC a ICC).

> **Clasificación:** Confidencial / Estratégico — Oficina del CTO.
