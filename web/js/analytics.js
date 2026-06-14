/**
 * analytics.js — Analítica de cliente (fire-and-forget).
 *
 * Expone window.ICCAnalytics.track(event, props) que envía un POST a
 * /api/events SIN bloquear ni romper nunca la experiencia de usuario:
 * todo va envuelto en try/catch, no se espera la respuesta y cualquier
 * fallo (API caída, abierto como file://, sin red) se ignora en silencio.
 *
 * Sin PII: solo se envían el nombre del evento y propiedades de juego
 * (mundo, potencia, ángulo, etc.). Debe incluirse ANTES de main.js.
 */

(function () {
  // URL base relativa de la API gestionada (Azure Static Web Apps expone /api).
  const API_BASE = "/api";

  // Eventos válidos según el contrato compartido del Lote 2. Se filtran en
  // cliente para evitar ruido; el servidor también los valida.
  const VALID_EVENTS = [
    "page_view",
    "shot_executed",
    "milestone_reached",
    "record_beaten",
    "club_named",
    "share_clicked",
  ];

  /**
   * Registra un evento de analítica. Nunca lanza ni interrumpe la UX.
   *
   * @param {string} event  Nombre del evento (debe estar en VALID_EVENTS).
   * @param {object} [props] Propiedades opcionales (sin PII).
   */
  function track(event, props) {
    try {
      if (!event || VALID_EVENTS.indexOf(event) === -1) return;

      const body = JSON.stringify({
        event,
        props: props && typeof props === "object" ? props : {},
      });

      // sendBeacon es ideal para fire-and-forget (sobrevive a la descarga de
      // página y no bloquea). Si no está disponible, caemos a fetch.
      if (navigator && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(`${API_BASE}/events`, blob);
        return;
      }

      // fetch fire-and-forget: no se espera (await) ni se lee la respuesta.
      fetch(`${API_BASE}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(function () {
        /* fallo silencioso: la analítica nunca rompe la UX */
      });
    } catch (_err) {
      // Cualquier error (sin red, file://, etc.) se ignora deliberadamente.
    }
  }

  // Exposición global (sin módulos para que funcione con file://).
  window.ICCAnalytics = { track };
})();
