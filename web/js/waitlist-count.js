/**
 * waitlist-count.js — Contador en vivo de la lista de espera (prueba social).
 *
 * Consume GET /api/waitlist/count -> { total, cap } y muestra un mensaje de
 * prueba social/escasez encima del formulario de waitlist del hero:
 *   - pocos registros   -> "Ya somos N operadores a bordo."
 *   - cerca del tope     -> "Quedan solo X plazas de las 1.000."
 *   - tope alcanzado     -> "Lista completa · N operadores."
 *
 * Autoinyecta su propio nodo tras el <p class="waitlist-lead"> de CADA bloque
 * .waitlist, de modo que NO requiere tocar el resto del HTML ni el componente
 * waitlist.js. Tras un envío del formulario, refresca el conteo.
 *
 * Todo defensivo: si la API no responde (p. ej. file://) simplemente no muestra
 * nada y la UX del hero queda intacta. IIFE sin módulos.
 */

(function () {
  "use strict";

  var ENDPOINT = "/api/waitlist/count";
  var DEFAULT_CAP = 1000;
  // A partir de este porcentaje del tope, cambiamos a mensaje de escasez.
  var SCARCITY_RATIO = 0.7;

  /** Construye (o reutiliza) el nodo del contador dentro de un bloque waitlist. */
  function ensureNode(waitlistEl) {
    var existing = waitlistEl.querySelector(".waitlist-count");
    if (existing) return existing;
    var p = document.createElement("p");
    p.className = "waitlist-count";
    p.setAttribute("role", "status");
    p.setAttribute("aria-live", "polite");
    p.hidden = true;
    var lead = waitlistEl.querySelector(".waitlist-lead");
    if (lead && lead.parentNode) {
      lead.parentNode.insertBefore(p, lead.nextSibling);
    } else {
      waitlistEl.insertBefore(p, waitlistEl.firstChild);
    }
    return p;
  }

  /** Formatea un entero con separador de miles en es-ES (1.234). */
  function fmt(n) {
    try {
      return Number(n).toLocaleString("es-ES");
    } catch (_e) {
      return String(n);
    }
  }

  /** Compone el mensaje según total/cap y lo pinta en todos los contadores. */
  function paint(total, cap) {
    total = Math.max(0, Math.floor(Number(total) || 0));
    cap = Math.floor(Number(cap) || DEFAULT_CAP);

    var text = "";
    var scarce = false;
    if (total <= 0) {
      text = ""; // sin registros aún: no mostramos un "0" desangelado
    } else if (cap > 0 && total >= cap) {
      text = "Lista completa · " + fmt(total) + " operadores a bordo.";
    } else if (cap > 0 && total >= cap * SCARCITY_RATIO) {
      var left = cap - total;
      scarce = true;
      text = "Quedan solo " + fmt(left) + " plazas de las " + fmt(cap) + ".";
    } else {
      text = "Ya somos " + fmt(total) + " operadores a bordo.";
    }

    var nodes = document.querySelectorAll(".waitlist-count");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!text) {
        el.hidden = true;
        el.textContent = "";
        el.classList.remove("is-scarce");
        continue;
      }
      el.textContent = text;
      el.classList.toggle("is-scarce", scarce);
      el.hidden = false;
    }
  }

  /** Pide el conteo a la API y lo pinta (silencioso ante fallos). */
  function refresh() {
    try {
      fetch(ENDPOINT)
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (data) {
          if (!data || typeof data.total !== "number") return;
          paint(data.total, data.cap || DEFAULT_CAP);
        })
        .catch(function () {
          /* API no disponible: no mostramos nada, sin romper el hero. */
        });
    } catch (_e) {
      /* Entorno sin fetch: degradación silenciosa. */
    }
  }

  /**
   * Tras enviar un formulario de waitlist, el total sube. Refrescamos sin tocar
   * waitlist.js: escuchamos el submit en captura y re-consultamos con un pequeño
   * retardo para dar tiempo al POST. Idempotente y defensivo.
   */
  function wireRefreshOnSignup() {
    document.addEventListener(
      "submit",
      function (ev) {
        try {
          var t = ev.target;
          if (t && t.classList && t.classList.contains("waitlist-form")) {
            setTimeout(refresh, 1500);
          }
        } catch (_e) {
          /* nada */
        }
      },
      true
    );
  }

  function init() {
    try {
      var blocks = document.querySelectorAll(".waitlist");
      if (!blocks.length) return;
      for (var i = 0; i < blocks.length; i++) ensureNode(blocks[i]);
      wireRefreshOnSignup();
      refresh();
    } catch (_e) {
      /* Sin DOM utilizable: no hacemos nada. */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Exposición mínima para poder refrescar manualmente si hiciera falta.
  window.ICCWaitlistCount = { refresh: refresh };
})();
