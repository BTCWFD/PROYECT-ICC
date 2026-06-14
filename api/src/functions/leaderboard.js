/**
 * leaderboard.js — Tabla de clasificación de tiros.
 *
 * Contrato:
 *   GET /api/leaderboard ->
 *     { "entries": [ { "club":string, "world":"moon"|"earth",
 *                       "range":number, "hangTime":number } ] }
 *   Orden: descendente por "range".
 *
 * Modelo de programación v4 de Azure Functions, compatible con SWA managed functions.
 */

const { app } = require("@azure/functions");
const store = require("../store");

app.http("leaderboard", {
  methods: ["GET"],
  authLevel: "anonymous", // SWA gestiona la autenticación a nivel de plataforma.
  route: "leaderboard",
  handler: async (_request, context) => {
    try {
      // Tiros ya ordenados de mayor a menor alcance por el store.
      const sorted = store.getSortedShots();

      // Proyectamos solo los campos del contrato (sin power/angle).
      const entries = sorted.map((s) => ({
        club: s.club,
        world: s.world,
        range: s.range,
        hangTime: s.hangTime,
      }));

      return {
        status: 200,
        jsonBody: { entries },
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
