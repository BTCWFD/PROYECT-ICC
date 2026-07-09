/**
 * leaderboard.js — Tabla de clasificación de tiros.
 *
 * Contrato:
 *   GET /api/leaderboard?top=N&period=week|all ->
 *     { "period":"week"|"all",
 *       "entries": [ { "club":string, "world":"moon"|"earth",
 *                       "range":number, "hangTime":number } ] }
 *   Orden: descendente por "range". top: default 5, máximo 50.
 *   period: "all" (histórico, por defecto) o "week" (últimos 7 días).
 *
 * Modelo de programación v4 de Azure Functions, compatible con SWA managed functions.
 */

const { app } = require("@azure/functions");
const store = require("../store");

const DEFAULT_TOP = 5;
const MAX_TOP = 50;

// Ventana del ranking semanal: 7 días en milisegundos.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Normaliza ?period a "week" o "all" (por defecto "all").
 * @param {string|null} raw
 * @returns {"week"|"all"}
 */
function parsePeriod(raw) {
  return String(raw || "").toLowerCase() === "week" ? "week" : "all";
}

/**
 * Normaliza el parámetro de query ?top=N a un entero válido dentro de [1, MAX_TOP].
 * @param {string|null} raw
 * @returns {number}
 */
function parseTop(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TOP;
  return Math.min(n, MAX_TOP);
}

app.http("leaderboard", {
  methods: ["GET"],
  authLevel: "anonymous", // SWA gestiona la autenticación a nivel de plataforma.
  route: "leaderboard",
  handler: async (request, context) => {
    try {
      const top = parseTop(request.query.get("top"));
      const period = parsePeriod(request.query.get("period"));
      // "week" acota a los últimos 7 días; "all" no aplica filtro (sinceMs=0).
      const sinceMs = period === "week" ? Date.now() - WEEK_MS : 0;

      // Top N tiros ya ordenados de mayor a menor alcance por la capa de datos.
      const sorted = await store.getTopShots(top, sinceMs);

      // Proyectamos solo los campos del contrato (sin power/angle).
      const entries = sorted.map((s) => ({
        club: s.club,
        world: s.world,
        range: s.range,
        hangTime: s.hangTime,
      }));

      return {
        status: 200,
        jsonBody: { period, entries },
      };
    } catch (error) {
      context.error("Error en /api/leaderboard:", error);
      return {
        status: 500,
        jsonBody: { error: "internal_error" },
      };
    }
  },
});
