/**
 * shots.js — Registro de un nuevo tiro y cálculo de su posición en el ranking.
 *
 * Contrato:
 *   POST /api/shots
 *     body { "club":string, "world":"moon"|"earth", "power":number,
 *            "angle":number, "range":number, "hangTime":number }
 *     -> { "ok":true, "rank":number, "total":number }
 *
 * Modelo de programación v4 de Azure Functions, compatible con SWA managed functions.
 */

const { app } = require("@azure/functions");
const store = require("../store");

/**
 * Comprueba que un valor sea un número finito (no NaN, no Infinity).
 * @param {*} v
 * @returns {boolean}
 */
function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
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

  const { club, world, power, angle, range, hangTime } = body;

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
  if (!isFiniteNumber(range) || range < 0 || range > 1e7) {
    return { ok: false, message: "'range' debe ser un número no negativo." };
  }
  if (!isFiniteNumber(hangTime) || hangTime < 0 || hangTime > 1e6) {
    return { ok: false, message: "'hangTime' debe ser un número no negativo." };
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

      // Normalizamos y persistimos el tiro en el store en memoria.
      const shot = {
        club: body.club.trim(),
        world: body.world,
        power: body.power,
        angle: body.angle,
        range: body.range,
        hangTime: body.hangTime,
      };

      // Calculamos el rank ANTES de insertar (1 = mejor alcance).
      const rank = store.rankForRange(shot.range);

      store.addShot(shot);
      const total = store.totalShots();

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
