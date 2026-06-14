/**
 * events.js — Endpoint de analítica de la ICC.
 *
 * Contrato:
 *   POST /api/events
 *     body { "event":string, "props":object(opcional) }
 *     -> { "ok":true }
 *
 * REGLAS:
 *   - NUNCA debe romper la UX: SIEMPRE responde { ok:true } con status 200,
 *     incluso si el evento es inválido o el guardado falla (fire-and-forget).
 *   - Sin PII: solo se persisten el nombre del evento y props genéricas.
 *   - Persiste en la tabla "events" si hay conexión; si no, es un no-op.
 *
 * Modelo de programación v4 de Azure Functions, compatible con SWA managed functions.
 */

const { app } = require("@azure/functions");
const store = require("../store");

// Eventos de analítica permitidos. Se ignoran silenciosamente los desconocidos.
const VALID_EVENTS = [
  "page_view",
  "shot_executed",
  "milestone_reached",
  "record_beaten",
  "club_named",
  "share_clicked",
];

app.http("events", {
  methods: ["POST"],
  authLevel: "anonymous", // SWA gestiona la autenticación a nivel de plataforma.
  route: "events",
  handler: async (request, context) => {
    try {
      // Parseo defensivo: si el JSON es inválido, igualmente respondemos ok.
      let body;
      try {
        body = await request.json();
      } catch {
        body = null;
      }

      const event = body && typeof body.event === "string" ? body.event : null;
      const props =
        body && body.props && typeof body.props === "object" ? body.props : undefined;

      // Solo persistimos eventos de la lista permitida.
      if (event && VALID_EVENTS.includes(event)) {
        // try/catch que traga errores: la analítica nunca debe afectar a la UX.
        try {
          await store.addEvent(event, props);
        } catch (err) {
          context.warn("Fallo al persistir evento de analítica:", err);
        }
      }

      // SIEMPRE ok: fire-and-forget desde el cliente.
      return {
        status: 200,
        jsonBody: { ok: true },
      };
    } catch (error) {
      // Incluso ante errores inesperados respondemos ok para no romper la UX.
      context.error("Error en /api/events:", error);
      return {
        status: 200,
        jsonBody: { ok: true },
      };
    }
  },
});
