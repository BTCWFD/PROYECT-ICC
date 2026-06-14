/**
 * health.js — Endpoint de salud del servicio.
 *
 * Contrato:
 *   GET /api/health -> { "status":"ok", "service":"icc-api", "version":"1.0.0" }
 *
 * Modelo de programación v4 de Azure Functions, compatible con SWA managed functions.
 */

const { app } = require("@azure/functions");

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous", // SWA gestiona la autenticación a nivel de plataforma.
  route: "health",
  handler: async (_request, context) => {
    try {
      return {
        status: 200,
        jsonBody: {
          status: "ok",
          service: "icc-api",
          version: "1.0.0",
        },
      };
    } catch (error) {
      context.error("Error en /api/health:", error);
      return {
        status: 500,
        jsonBody: { error: "internal_error" },
      };
    }
  },
});
