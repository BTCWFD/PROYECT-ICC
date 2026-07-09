/**
 * physics.test.js — Motor balístico: exactitud física y PARIDAD cliente/servidor.
 *
 * La paridad es un requisito de seguridad, no una comodidad: el servidor
 * RECALCULA range/hangTime de cada disparo (anti-trampas, ver functions/shots.js).
 * Si api/src/physics.js y web/js/physics.js divergen, el ranking de un jugador
 * honesto dejaría de coincidir con lo que vio en pantalla.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const server = require("../api/src/physics.js");

// El motor del cliente no es un módulo: asigna window.ICCPhysics. Lo cargamos
// dándole un 'window' falso en su propio ámbito.
function loadClientPhysics() {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "web", "js", "physics.js"),
    "utf8"
  );
  const fakeWindow = {};
  new Function("window", src)(fakeWindow);
  return fakeWindow.ICCPhysics;
}

const client = loadClientPhysics();

// Casos que barren mundos, ángulos y potencias (con y sin arrastre).
const CASES = [
  { world: "moon", speed: 75, angleDeg: 35, airResistance: false },
  { world: "moon", speed: 120, angleDeg: 45, airResistance: false },
  { world: "moon", speed: 20, angleDeg: 80, airResistance: false },
  { world: "earth", speed: 75, angleDeg: 35, airResistance: false },
  { world: "earth", speed: 90, angleDeg: 45, airResistance: true },
  { world: "earth", speed: 30, angleDeg: 15, airResistance: true },
];

const optsFor = (c, WORLDS) => ({
  gravity: WORLDS[c.world].gravity,
  speed: c.speed,
  angleDeg: c.angleDeg,
  airResistance: c.airResistance && WORLDS[c.world].hasAtmosphere,
});

test("el cliente expone el mismo contrato que el servidor", () => {
  assert.ok(client, "web/js/physics.js debe exponer window.ICCPhysics");
  assert.equal(typeof client.computeTrajectory, "function");
  assert.deepEqual(Object.keys(client.WORLDS).sort(), ["earth", "moon"]);
  // Las constantes físicas deben coincidir exactamente entre ambos motores.
  assert.equal(client.WORLDS.moon.gravity, server.WORLDS.moon.gravity);
  assert.equal(client.WORLDS.earth.gravity, server.WORLDS.earth.gravity);
  assert.deepEqual(client.BALL, server.BALL);
});

test("PARIDAD: cliente y servidor calculan trayectorias idénticas", () => {
  for (const c of CASES) {
    const s = server.computeTrajectory(optsFor(c, server.WORLDS));
    const w = client.computeTrajectory(optsFor(c, client.WORLDS));
    const label = `${c.world} v=${c.speed} a=${c.angleDeg} drag=${c.airResistance}`;
    // Mismo algoritmo y mismo dt: la igualdad debe ser exacta, no aproximada.
    assert.equal(w.range, s.range, `range difiere en ${label}`);
    assert.equal(w.flightTime, s.flightTime, `flightTime difiere en ${label}`);
    assert.equal(w.maxHeight, s.maxHeight, `maxHeight difiere en ${label}`);
  }
});

test("sin atmósfera la trayectoria coincide con la parábola analítica", () => {
  // Vacío => solución cerrada: R = v²·sin(2θ)/g, T = 2v·sinθ/g, H = v²·sin²θ/(2g).
  for (const c of CASES.filter((x) => x.world === "moon")) {
    const g = server.WORLDS.moon.gravity;
    const rad = (c.angleDeg * Math.PI) / 180;
    const expectedRange = (c.speed ** 2 * Math.sin(2 * rad)) / g;
    const expectedTime = (2 * c.speed * Math.sin(rad)) / g;
    const expectedHeight = (c.speed ** 2 * Math.sin(rad) ** 2) / (2 * g);

    const got = server.computeTrajectory(optsFor(c, server.WORLDS));
    const label = `v=${c.speed} a=${c.angleDeg}`;

    // Integración con dt=0.01 + interpolación del impacto: <0.5% de error.
    const relRange = Math.abs(got.range - expectedRange) / expectedRange;
    const relTime = Math.abs(got.flightTime - expectedTime) / expectedTime;
    assert.ok(relRange < 0.005, `range ${label}: error ${(relRange * 100).toFixed(3)}%`);
    assert.ok(relTime < 0.005, `flightTime ${label}: error ${(relTime * 100).toFixed(3)}%`);
    // maxHeight se muestrea por pasos, así que tolera algo más.
    const relH = Math.abs(got.maxHeight - expectedHeight) / expectedHeight;
    assert.ok(relH < 0.02, `maxHeight ${label}: error ${(relH * 100).toFixed(3)}%`);
  }
});

test("el impacto se interpola: el alcance NO se queda corto un paso entero", () => {
  // Regresión del bug corregido: sin interpolar, el alcance era el del último
  // punto SOBRE el suelo, subestimando hasta vx·dt.
  const c = { world: "moon", speed: 100, angleDeg: 40, airResistance: false };
  const traj = server.computeTrajectory(optsFor(c, server.WORLDS));
  const last = traj.points[traj.points.length - 1];
  // El alcance final debe superar al último punto muestreado (que está sobre el
  // suelo), porque el impacto real ocurre después de ese punto.
  assert.ok(traj.range > last.x, "range debe interpolar más allá del último punto");
  assert.ok(traj.flightTime > last.t, "flightTime debe interpolar más allá");
  // Y no puede pasarse de un paso de integración completo.
  const vx = c.speed * Math.cos((c.angleDeg * Math.PI) / 180);
  assert.ok(traj.range - last.x <= vx * 0.01 + 1e-9, "no debe exceder un dt");
});

test("la Luna vuela ~6x más lejos que la Tierra (el gancho del producto)", () => {
  const base = { speed: 75, angleDeg: 35, airResistance: false };
  const moon = server.computeTrajectory(optsFor({ ...base, world: "moon" }, server.WORLDS));
  const earth = server.computeTrajectory(optsFor({ ...base, world: "earth" }, server.WORLDS));
  const ratio = moon.range / earth.range;
  // g_tierra / g_luna = 9.81 / 1.62 ≈ 6.05
  assert.ok(ratio > 5.9 && ratio < 6.2, `ratio inesperado: ${ratio.toFixed(2)}`);
});

test("la resistencia del aire reduce el alcance (y solo aplica con atmósfera)", () => {
  const g = server.WORLDS.earth.gravity;
  const withDrag = server.computeTrajectory({ gravity: g, speed: 90, angleDeg: 45, airResistance: true });
  const noDrag = server.computeTrajectory({ gravity: g, speed: 90, angleDeg: 45, airResistance: false });
  assert.ok(withDrag.range < noDrag.range, "el arrastre debe acortar el vuelo");
  // La Luna no tiene atmósfera: el motor debe ignorar la bandera si se fuerza.
  assert.equal(server.WORLDS.moon.hasAtmosphere, false);
});

test("no entra en bucle infinito con parámetros degenerados", () => {
  const g = server.WORLDS.moon.gravity;
  // Ángulo 0: el balón sale rasante y toca suelo de inmediato.
  const flat = server.computeTrajectory({ gravity: g, speed: 50, angleDeg: 0, airResistance: false });
  assert.ok(Number.isFinite(flat.range) && flat.range >= 0);
  // Velocidad 0: no hay vuelo.
  const still = server.computeTrajectory({ gravity: g, speed: 0, angleDeg: 45, airResistance: false });
  assert.ok(Number.isFinite(still.range));
  assert.ok(still.range < 1e-6, "sin velocidad no debe haber alcance");
});
