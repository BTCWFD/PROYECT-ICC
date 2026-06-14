/**
 * physics.js — Motor de física balística de la ICC (versión servidor).
 *
 * COPIA FIEL del motor del cliente (web/js/physics.js). Se porta a CommonJS para
 * que el backend pueda RECALCULAR el alcance y el tiempo de vuelo de cada disparo
 * con EXACTAMENTE la misma física, sin confiar en los valores enviados por el
 * cliente (anti-trampas). Cualquier cambio aquí debe replicarse en el cliente y
 * viceversa para mantener resultados idénticos.
 *
 * Modelo newtoniano de proyectil resuelto por integración numérica
 * (Euler semi-implícito), lo bastante preciso para fines de visualización.
 */

const WORLDS = {
  moon: {
    name: "Luna",
    gravity: 1.62,      // m/s²
    hasAtmosphere: false, // sin aire: trayectoria parabólica perfecta
    surface: "#c9cdd6",
    sky: "#02030a",
    ball: "#ffffff",
    trail: "#ffd35b",
  },
  earth: {
    name: "Tierra",
    gravity: 9.81,      // m/s²
    hasAtmosphere: true,
    surface: "#2f7d46",
    sky: "#0a1a33",
    ball: "#ffffff",
    trail: "#4ea1ff",
  },
};

// Parámetros del balón reglamentario (FIFA, reforzado para vacío).
const BALL = {
  mass: 0.43,          // kg
  radius: 0.11,        // m
  dragCoeff: 0.25,     // Cd adimensional de una esfera lisa
  airDensity: 1.225,   // kg/m³ (atmósfera terrestre a nivel del mar)
};

/**
 * Calcula la trayectoria completa de un disparo.
 *
 * @param {object} opts
 * @param {number} opts.gravity        Aceleración gravitatoria (m/s²)
 * @param {number} opts.speed          Velocidad inicial (m/s)
 * @param {number} opts.angleDeg       Ángulo de disparo (grados)
 * @param {boolean} opts.airResistance Aplicar arrastre aerodinámico
 * @returns {{points: Array<{x:number,y:number,t:number}>, range:number, maxHeight:number, flightTime:number}}
 */
function computeTrajectory({ gravity, speed, angleDeg, airResistance }) {
  const angle = (angleDeg * Math.PI) / 180;
  let x = 0;
  let y = 0;
  let vx = speed * Math.cos(angle);
  let vy = speed * Math.sin(angle);

  const dt = 0.01; // paso de integración (s)
  const points = [{ x: 0, y: 0, t: 0 }];
  let t = 0;
  let maxHeight = 0;

  // Coeficiente de arrastre: F_drag = ½·ρ·Cd·A·v². Aceleración = F/m.
  const area = Math.PI * BALL.radius * BALL.radius;
  const k = airResistance
    ? (0.5 * BALL.airDensity * BALL.dragCoeff * area) / BALL.mass
    : 0;

  // Límite de seguridad para evitar bucles infinitos (vuelos muy largos en la Luna).
  const MAX_STEPS = 200000;
  let steps = 0;

  while (y >= 0 && steps < MAX_STEPS) {
    const v = Math.hypot(vx, vy);
    const ax = -k * v * vx;
    const ay = -gravity - k * v * vy;

    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;
    t += dt;
    steps++;

    if (y > maxHeight) maxHeight = y;
    if (y >= 0) points.push({ x, y, t });
  }

  // Interpolación lineal del punto de impacto exacto (y = 0).
  const last = points[points.length - 1];
  const range = last.x;
  const flightTime = last.t;

  return { points, range, maxHeight, flightTime };
}

// Exposición como módulo CommonJS (entorno Node de Azure Functions).
module.exports = { WORLDS, BALL, computeTrajectory };
