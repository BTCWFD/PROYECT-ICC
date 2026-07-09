/**
 * shots.js — Registro de un nuevo tiro y cálculo de su posición en el ranking.
 *
 * Contrato:
 *   POST /api/shots
 *     body { "club":string, "world":"moon"|"earth", "power":number,
 *            "angle":number, "airResistance":boolean(opcional),
 *            "range":number, "hangTime":number }
 *     -> { "ok":true, "rank":number, "total":number }
 *
 * ANTI-TRAMPAS: el servidor NO confía en range/hangTime del cliente. Aunque el
 * cliente los siga enviando, aquí se IGNORAN y se RECALCULAN con la misma física
 * del cliente (api/src/physics.js) a partir de {world,power,angle,airResistance}.
 *
 * Modelo de programación v4 de Azure Functions, compatible con SWA managed functions.
 */

const { app } = require("@azure/functions");
const store = require("../store");
const { WORLDS, computeTrajectory } = require("../physics");

/**
 * Comprueba que un valor sea un número finito (no NaN, no Infinity).
 * @param {*} v
 * @returns {boolean}
 */
function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Elimina caracteres de control C0/C1 y los overrides de dirección bidireccional
 * (U+202A-U+202E, U+2066-U+2069). Sin esto, un club puede inyectar saltos de
 * línea o invertir el texto del leaderboard público, que se sirve a todos.
 * @param {string} value
 * @returns {string}
 */
function stripUnsafeChars(value) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, "");
}

/**
 * Valida el cuerpo de la petición contra el contrato.
 * @param {*} body
 * @returns {{ ok: boolean, message?: string }}
 */
function validateBody(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "El cuerpo debe ser un objeto JSON." };
  }

  const { club, world, power, angle, airResistance } = body;

  if (typeof club !== "string" || club.trim().length === 0) {
    return { ok: false, message: "'club' debe ser un texto no vacío." };
  }
  // Límite de longitud: evita payloads grandes y crecimiento abusivo del store.
  if (club.trim().length > 64) {
    return { ok: false, message: "'club' no puede superar 64 caracteres." };
  }
  if (!store.VALID_WORLDS.includes(world)) {
    return { ok: false, message: "'world' debe ser 'moon' o 'earth'." };
  }
  // Rangos plausibles: rechazamos negativos y valores absurdos para acotar abuso.
  if (!isFiniteNumber(power) || power < 0 || power > 1000) {
    return { ok: false, message: "'power' debe ser un número entre 0 y 1000." };
  }
  if (!isFiniteNumber(angle) || angle < 0 || angle > 90) {
    return { ok: false, message: "'angle' debe ser un número entre 0 y 90." };
  }
  // airResistance es opcional; si viene, debe ser booleano.
  if (airResistance !== undefined && typeof airResistance !== "boolean") {
    return { ok: false, message: "'airResistance' debe ser booleano." };
  }

  return { ok: true };
}

app.http("shots", {
  methods: ["POST"],
  authLevel: "anonymous", // SWA gestiona la autenticación a nivel de plataforma.
  route: "shots",
  handler: async (request, context) => {
    try {
      // Parseo defensivo del JSON entrante.
      let body;
      try {
        body = await request.json();
      } catch {
        return {
          status: 400,
          jsonBody: { ok: false, error: "JSON inválido en el cuerpo." },
        };
      }

      // Validación del contrato.
      const validation = validateBody(body);
      if (!validation.ok) {
        return {
          status: 400,
          jsonBody: { ok: false, error: validation.message },
        };
      }

      // Saneamos el club ANTES de persistirlo: el leaderboard es público y
      // sirve este texto a todos los clientes. Si tras limpiar queda vacío
      // (p. ej. un club hecho solo de caracteres de control), lo rechazamos.
      const club = stripUnsafeChars(body.club).trim();
      if (!club) {
        return {
          status: 400,
          jsonBody: { ok: false, error: "'club' debe contener caracteres válidos." },
        };
      }

      const world = body.world;
      const power = body.power;
      const angle = body.angle;
      // El cliente puede pedir resistencia del aire, pero solo aplica si el
      // mundo tiene atmósfera (mismo criterio que el cliente).
      const airResistance = Boolean(body.airResistance) && WORLDS[world].hasAtmosphere;

      // RECALCULAMOS la trayectoria con la física del servidor (anti-trampas).
      // Ignoramos por completo body.range / body.hangTime.
      const traj = computeTrajectory({
        gravity: WORLDS[world].gravity,
        speed: power,
        angleDeg: angle,
        airResistance,
      });

      // Normalizamos y persistimos el tiro con los valores RECALCULADOS.
      const shot = {
        club,
        world,
        power,
        angle,
        range: traj.range,
        hangTime: traj.flightTime,
      };

      // Calculamos el rank ANTES de insertar (1 = mejor alcance).
      const rank = await store.rankForRange(shot.range);

      await store.addShot(shot);
      const total = await store.totalShots();

      return {
        status: 201,
        jsonBody: { ok: true, rank, total },
      };
    } catch (error) {
      context.error("Error en /api/shots:", error);
      return {
        status: 500,
        jsonBody: { ok: false, error: "internal_error" },
      };
    }
  },
});
