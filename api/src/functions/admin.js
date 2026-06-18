/**
 * admin.js — Endpoint protegido del PANEL DE ADMIN de la ICC.
 *
 * Contrato:
 *   GET /api/admin/stats
 *     Autenticación por clave de administrador, leída de:
 *       - cabecera "x-admin-key: <clave>"  (preferente)
 *       - query "?key=<clave>"             (alternativa)
 *
 *   Seguridad FAIL-CLOSED:
 *     - Si process.env.ADMIN_KEY NO está definido  -> 503 { ok:false, error }.
 *     - Si la clave provista no coincide o falta    -> 401 { ok:false, error }.
 *       (comparación en tiempo ~constante: longitud + XOR acumulado, sin early-return)
 *     - Solo si coincide                            -> 200 con el payload del panel.
 *
 *   Respuesta 200:
 *     {
 *       ok:true,
 *       waitlist:    { total:number, recent: [ {email, club, source} ] },
 *       leaderboard: { total:number, top:    [ {club, world, range, hangTime} ] },
 *       events:      { total:number, counts: { <event>: number, ... } },
 *       funnel:      { page_view, shot_executed, share_clicked, waitlist_signup }
 *     }
 *
 *   Nunca se expone la clave ni errores internos crudos. Fallo interno -> 500
 *   { ok:false, error:"internal_error" }.
 *
 * Modelo de programación v4 de Azure Functions, compatible con SWA managed functions.
 * La autenticación de plataforma es "anonymous"; la verificación real de ADMIN_KEY
 * se hace AQUÍ, en el handler.
 */

const { app } = require("@azure/functions");
const store = require("../store");

// Nº de entradas recientes de la waitlist que devolvemos.
const RECENT_LIMIT = 50;
// Tamaño del top del leaderboard según el contrato.
const TOP_LIMIT = 10;

/**
 * Compara dos cadenas en tiempo ~constante para evitar ataques de temporización.
 * Estrategia: acumula diferencias mediante XOR sobre TODOS los caracteres y combina
 * además la diferencia de longitud, sin retornos anticipados ("early-return").
 * @param {string} a
 * @param {string} b
 * @returns {boolean} true si son idénticas.
 */
function timingSafeEqual(a, b) {
  const sa = String(a == null ? "" : a);
  const sb = String(b == null ? "" : b);
  // La diferencia de longitud ya marca desigualdad, pero seguimos recorriendo
  // para no filtrar información por el tiempo de ejecución.
  let diff = sa.length ^ sb.length;
  const max = Math.max(sa.length, sb.length);
  for (let i = 0; i < max; i += 1) {
    // charCodeAt fuera de rango devuelve NaN; usamos 0 para mantener el bucle estable.
    const ca = i < sa.length ? sa.charCodeAt(i) : 0;
    const cb = i < sb.length ? sb.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

app.http("admin-stats", {
  methods: ["GET"],
  authLevel: "anonymous", // SWA: anónimo a nivel de plataforma; verificamos ADMIN_KEY abajo.
  route: "admin/stats",
  handler: async (request, context) => {
    try {
      // FAIL-CLOSED: sin ADMIN_KEY configurada, el panel queda inaccesible (503).
      const adminKey = process.env.ADMIN_KEY;
      if (!adminKey) {
        return {
          status: 503,
          jsonBody: { ok: false, error: "admin_not_configured" },
        };
      }

      // Clave provista por el cliente: cabecera preferente, query como alternativa.
      const provided =
        request.headers.get("x-admin-key") || request.query.get("key") || "";

      // Comparación en tiempo ~constante; sin coincidencia -> 401 genérico.
      if (!timingSafeEqual(provided, adminKey)) {
        return {
          status: 401,
          jsonBody: { ok: false, error: "unauthorized" },
        };
      }

      // --- A partir de aquí la petición está autenticada: construimos el payload. ---

      // Lecturas en paralelo (todas de SOLO LECTURA).
      const [recent, waitlistTotal, top, shotsTotal, counts] = await Promise.all([
        store.listWaitlist(RECENT_LIMIT),
        store.waitlistCount(),
        store.getTopShots(TOP_LIMIT),
        store.totalShots(),
        store.eventCounts(),
      ]);

      // Waitlist: proyectamos solo los campos del contrato.
      const waitlistRecent = (recent || []).map((e) => ({
        email: e.email,
        club: e.club || "",
        source: e.source || "",
      }));

      // Leaderboard: top 10 desc por range, solo campos del contrato.
      const leaderboardTop = (top || []).map((s) => ({
        club: s.club,
        world: s.world,
        range: s.range,
        hangTime: s.hangTime,
      }));

      // Total de eventos = suma de todos los conteos por tipo.
      const safeCounts = counts || {};
      const eventsTotal = Object.values(safeCounts).reduce(
        (acc, n) => acc + (Number(n) || 0),
        0
      );

      // Funnel derivado de events.counts (0 si el evento no existe).
      const funnel = {
        page_view: safeCounts.page_view || 0,
        shot_executed: safeCounts.shot_executed || 0,
        share_clicked: safeCounts.share_clicked || 0,
        waitlist_signup: safeCounts.waitlist_signup || 0,
      };

      return {
        status: 200,
        jsonBody: {
          ok: true,
          waitlist: { total: waitlistTotal, recent: waitlistRecent },
          leaderboard: { total: shotsTotal, top: leaderboardTop },
          events: { total: eventsTotal, counts: safeCounts },
          funnel,
        },
      };
    } catch (error) {
      // Nunca filtramos detalles internos al cliente.
      context.error("Error en /api/admin/stats:", error);
      return {
        status: 500,
        jsonBody: { ok: false, error: "internal_error" },
      };
    }
  },
});
