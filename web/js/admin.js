/**
 * admin.js — Lógica del Panel de Administración ICC.
 *
 * Flujo:
 *   1) Pantalla de acceso con input de clave (type=password).
 *   2) Al "Entrar" hace GET /api/admin/stats con cabecera x-admin-key.
 *      - 200  -> guarda la clave en sessionStorage, muestra el dashboard
 *                y renderiza los datos.
 *      - 401  -> "clave incorrecta".
 *      - 503  -> "panel no configurado".
 *      - red  -> mensaje genérico de error de conexión.
 *   3) Botón "Salir" que limpia sessionStorage y vuelve al acceso.
 *
 * Seguridad/robustez de cliente:
 *   - Los datos del servidor se pintan SIEMPRE con textContent (nunca
 *     innerHTML) para evitar inyección de HTML.
 *   - La clave solo vive en sessionStorage (se borra al cerrar pestaña o
 *     al pulsar "Salir"). Nunca se imprime en pantalla ni en la URL.
 *
 * IIFE, sin módulos, same-origin (compatible con la SWA y file://).
 */

(function () {
  "use strict";

  // Endpoint de la API gestionada (Azure Static Web Apps expone /api).
  var ENDPOINT = "/api/admin/stats";

  // Clave de sessionStorage donde guardamos la clave de admin de la sesión.
  var STORAGE_KEY = "icc_admin_key";

  // Mensajes de UI centralizados (coherencia y traducción única).
  var MSG = {
    checking: "Verificando clave…",
    empty: "Introduce la clave de administración.",
    wrong: "Clave incorrecta.",
    notConfigured: "Panel no configurado.",
    network: "No se pudo conectar con el servidor. Inténtalo de nuevo.",
    badResponse: "Respuesta inesperada del servidor.",
    loading: "Cargando datos…",
    loaded: "Datos actualizados.",
    refreshing: "Actualizando…",
  };

  // Pasos del embudo en orden, con su etiqueta legible.
  var FUNNEL_STEPS = [
    { key: "page_view", label: "Visitas (page_view)" },
    { key: "shot_executed", label: "Disparos (shot_executed)" },
    { key: "share_clicked", label: "Compartidos (share_clicked)" },
    { key: "waitlist_signup", label: "Altas waitlist (waitlist_signup)" },
  ];

  // Cache de referencias del DOM (se rellena en init).
  var el = {};

  /* ---------------------------------------------------------------
     Utilidades de almacenamiento (defensivas: sessionStorage puede
     no estar disponible en algunos contextos/privacidad).
     --------------------------------------------------------------- */

  function saveKey(key) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, key);
    } catch (_err) {
      /* Si falla, seguimos en memoria durante la sesión actual. */
    }
  }

  function readKey() {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) || "";
    } catch (_err) {
      return "";
    }
  }

  function clearKey() {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch (_err) {
      /* ignorar */
    }
  }

  /* ---------------------------------------------------------------
     Formateadores numéricos.
     --------------------------------------------------------------- */

  /** Formatea un número entero con separadores de miles (es-ES). */
  function fmtNumber(value) {
    var n = Number(value);
    if (!isFinite(n)) return "0";
    try {
      return n.toLocaleString("es-ES");
    } catch (_err) {
      return String(Math.round(n));
    }
  }

  /**
   * Calcula y formatea un porcentaje (parte/base) con un decimal.
   * Devuelve "—" si la base es 0 (evita división por cero).
   */
  function fmtPercent(part, base) {
    var b = Number(base);
    var p = Number(part);
    if (!isFinite(b) || b <= 0 || !isFinite(p)) return "—";
    var pct = (p / b) * 100;
    // Un decimal, sustituyendo el punto por coma (locale es-ES).
    return pct.toFixed(1).replace(".", ",") + " %";
  }

  /** Ancho de barra del embudo (0-100) respecto a la base. */
  function barWidth(part, base) {
    var b = Number(base);
    var p = Number(part);
    if (!isFinite(b) || b <= 0 || !isFinite(p)) return 0;
    var w = (p / b) * 100;
    if (w < 0) w = 0;
    if (w > 100) w = 100;
    return w;
  }

  /* ---------------------------------------------------------------
     Mensajería de la pantalla de acceso.
     --------------------------------------------------------------- */

  function showLoginMsg(text, kind) {
    if (!el.loginMsg) return;
    el.loginMsg.textContent = text;
    el.loginMsg.classList.remove("is-error", "is-info");
    if (kind === "error") el.loginMsg.classList.add("is-error");
    else if (kind === "info") el.loginMsg.classList.add("is-info");
    el.loginMsg.hidden = false;
  }

  function hideLoginMsg() {
    if (!el.loginMsg) return;
    el.loginMsg.hidden = true;
  }

  function setDashStatus(text, isError) {
    if (!el.dashStatus) return;
    el.dashStatus.textContent = text;
    if (isError) el.dashStatus.classList.add("is-error");
    else el.dashStatus.classList.remove("is-error");
  }

  /* ---------------------------------------------------------------
     Alternancia entre pantalla de acceso y dashboard.
     --------------------------------------------------------------- */

  function showDashboard() {
    if (el.loginScreen) el.loginScreen.hidden = true;
    if (el.dashboard) el.dashboard.hidden = false;
  }

  function showLogin() {
    if (el.dashboard) el.dashboard.hidden = true;
    if (el.loginScreen) el.loginScreen.hidden = false;
  }

  /* ---------------------------------------------------------------
     Petición a la API.
     --------------------------------------------------------------- */

  /**
   * Solicita /api/admin/stats con la clave dada.
   * @param {string} key
   * @returns {Promise<{status:number, data:object|null}>}
   */
  async function fetchStats(key) {
    var response = await fetch(ENDPOINT, {
      method: "GET",
      headers: { "x-admin-key": key },
      cache: "no-store",
    });
    var data = null;
    try {
      data = await response.json();
    } catch (_err) {
      data = null;
    }
    return { status: response.status, data: data };
  }

  /* ---------------------------------------------------------------
     Renderizado del dashboard. Todos los datos del servidor se
     pintan con textContent (nunca innerHTML).
     --------------------------------------------------------------- */

  function setText(node, text) {
    if (node) node.textContent = text;
  }

  /** Vacía un nodo de forma segura (sin innerHTML). */
  function clearNode(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /** Crea una celda <td> con texto y clase opcional. */
  function makeCell(text, className) {
    var td = document.createElement("td");
    td.textContent = text;
    if (className) td.className = className;
    return td;
  }

  /** Crea una fila de "tabla vacía" abarcando varias columnas. */
  function makeEmptyRow(colspan, text) {
    var tr = document.createElement("tr");
    var td = document.createElement("td");
    td.colSpan = colspan;
    td.className = "table-empty";
    td.textContent = text;
    tr.appendChild(td);
    return tr;
  }

  /** KPIs principales. */
  function renderKpis(stats) {
    var waitlistTotal = stats.waitlist && stats.waitlist.total;
    var shotsTotal = stats.leaderboard && stats.leaderboard.total;
    var eventsTotal = stats.events && stats.events.total;
    setText(el.kpiWaitlist, fmtNumber(waitlistTotal || 0));
    setText(el.kpiShots, fmtNumber(shotsTotal || 0));
    setText(el.kpiEvents, fmtNumber(eventsTotal || 0));
  }

  /** Embudo de conversión: cuenta, porcentaje y barra por paso. */
  function renderFunnel(stats) {
    var funnel = stats.funnel || {};
    // Base del embudo: las visitas (page_view).
    var base = Number(funnel.page_view) || 0;

    for (var i = 0; i < FUNNEL_STEPS.length; i++) {
      var step = FUNNEL_STEPS[i];
      var count = Number(funnel[step.key]) || 0;

      var li = el.funnelList
        ? el.funnelList.querySelector('[data-step="' + step.key + '"]')
        : null;
      if (!li) continue;

      var countEl = li.querySelector(".funnel-count");
      var pctEl = li.querySelector(".funnel-pct");
      var fillEl = li.querySelector(".funnel-fill");

      setText(countEl, fmtNumber(count));
      // El primer paso (base) siempre es 100% si tiene datos.
      if (i === 0) {
        setText(pctEl, base > 0 ? "100 %" : "—");
      } else {
        setText(pctEl, fmtPercent(count, base));
      }
      if (fillEl) {
        var width = i === 0 ? (base > 0 ? 100 : 0) : barWidth(count, base);
        // La anchura se aplica vía estilo calculado (no es estilo inline
        // de marcado HTML; es una propiedad dinámica permitida por CSP).
        fillEl.style.width = width + "%";
      }
    }
  }

  /** Tabla de últimos leads de la waitlist. */
  function renderWaitlist(stats) {
    var body = el.waitlistBody;
    if (!body) return;
    clearNode(body);

    var recent =
      stats.waitlist && Array.isArray(stats.waitlist.recent)
        ? stats.waitlist.recent
        : [];

    if (recent.length === 0) {
      body.appendChild(makeEmptyRow(3, "Sin leads todavía."));
      return;
    }

    for (var i = 0; i < recent.length; i++) {
      var lead = recent[i] || {};
      var tr = document.createElement("tr");
      tr.appendChild(makeCell(lead.email != null ? String(lead.email) : "—"));
      tr.appendChild(
        makeCell(lead.club ? String(lead.club) : "—")
      );
      tr.appendChild(
        makeCell(lead.source ? String(lead.source) : "—")
      );
      body.appendChild(tr);
    }
  }

  /** Tabla Top 10 del leaderboard. */
  function renderLeaderboard(stats) {
    var body = el.leaderboardBody;
    if (!body) return;
    clearNode(body);

    var top =
      stats.leaderboard && Array.isArray(stats.leaderboard.top)
        ? stats.leaderboard.top
        : [];

    if (top.length === 0) {
      body.appendChild(makeEmptyRow(5, "Sin disparos todavía."));
      return;
    }

    for (var i = 0; i < top.length; i++) {
      var row = top[i] || {};
      var tr = document.createElement("tr");
      // El líder (#1) recibe tratamiento dorado.
      if (i === 0) tr.className = "is-leader";

      tr.appendChild(makeCell(String(i + 1), "num"));
      tr.appendChild(makeCell(row.club ? String(row.club) : "—"));
      tr.appendChild(makeCell(row.world ? String(row.world) : "—"));
      tr.appendChild(
        makeCell(row.range != null ? fmtNumber(row.range) + " m" : "—", "num")
      );
      tr.appendChild(
        makeCell(
          row.hangTime != null ? formatHang(row.hangTime) : "—",
          "num"
        )
      );
      body.appendChild(tr);
    }
  }

  /** Formatea el tiempo de vuelo (segundos con 1 decimal). */
  function formatHang(value) {
    var n = Number(value);
    if (!isFinite(n)) return "—";
    return n.toFixed(1).replace(".", ",") + " s";
  }

  /** Tabla de desglose de eventos por tipo. */
  function renderEvents(stats) {
    var body = el.eventsBody;
    if (!body) return;
    clearNode(body);

    var counts =
      stats.events && stats.events.counts && typeof stats.events.counts === "object"
        ? stats.events.counts
        : {};

    var keys = Object.keys(counts);
    if (keys.length === 0) {
      body.appendChild(makeEmptyRow(2, "Sin eventos todavía."));
      return;
    }

    // Orden descendente por conteo para destacar lo más relevante.
    keys.sort(function (a, b) {
      return (Number(counts[b]) || 0) - (Number(counts[a]) || 0);
    });

    for (var i = 0; i < keys.length; i++) {
      var name = keys[i];
      var tr = document.createElement("tr");
      tr.appendChild(makeCell(String(name)));
      tr.appendChild(makeCell(fmtNumber(counts[name]), "num"));
      body.appendChild(tr);
    }
  }

  /** Renderiza el dashboard completo a partir del objeto de stats. */
  function renderDashboard(stats) {
    if (!stats || typeof stats !== "object") return;
    renderKpis(stats);
    renderFunnel(stats);
    renderWaitlist(stats);
    renderLeaderboard(stats);
    renderEvents(stats);
  }

  /* ---------------------------------------------------------------
     Carga de datos: traduce el estado HTTP a UX.
     --------------------------------------------------------------- */

  /**
   * Intenta cargar el dashboard con la clave dada.
   * @param {string} key
   * @param {boolean} fromLogin  true si viene de la pantalla de acceso
   *        (los errores se muestran ahí); false si es refresco interno.
   * @returns {Promise<boolean>} true si autenticó y renderizó.
   */
  async function loadDashboard(key, fromLogin) {
    if (!key) {
      if (fromLogin) showLoginMsg(MSG.empty, "error");
      return false;
    }

    if (fromLogin) {
      showLoginMsg(MSG.checking, "info");
      if (el.loginBtn) el.loginBtn.disabled = true;
    } else {
      setDashStatus(MSG.refreshing, false);
      if (el.refreshBtn) el.refreshBtn.disabled = true;
    }

    var result;
    try {
      result = await fetchStats(key);
    } catch (_err) {
      // Fallo de red / file:// / API caída.
      if (fromLogin) {
        showLoginMsg(MSG.network, "error");
        if (el.loginBtn) el.loginBtn.disabled = false;
      } else {
        setDashStatus(MSG.network, true);
        if (el.refreshBtn) el.refreshBtn.disabled = false;
      }
      return false;
    }

    if (fromLogin && el.loginBtn) el.loginBtn.disabled = false;
    if (!fromLogin && el.refreshBtn) el.refreshBtn.disabled = false;

    // 200: éxito.
    if (result.status === 200 && result.data && result.data.ok) {
      saveKey(key);
      hideLoginMsg();
      showDashboard();
      renderDashboard(result.data);
      setDashStatus(MSG.loaded, false);
      return true;
    }

    // 401: clave incorrecta o ausente.
    if (result.status === 401) {
      clearKey();
      if (fromLogin) {
        showLoginMsg(MSG.wrong, "error");
      } else {
        // La sesión dejó de ser válida: volvemos al acceso.
        showLogin();
        showLoginMsg(MSG.wrong, "error");
      }
      return false;
    }

    // 503: panel no configurado (falta ADMIN_KEY en el servidor).
    if (result.status === 503) {
      if (fromLogin) {
        showLoginMsg(MSG.notConfigured, "error");
      } else {
        setDashStatus(MSG.notConfigured, true);
      }
      return false;
    }

    // Cualquier otro estado: respuesta inesperada.
    if (fromLogin) {
      showLoginMsg(MSG.badResponse, "error");
    } else {
      setDashStatus(MSG.badResponse, true);
    }
    return false;
  }

  /* ---------------------------------------------------------------
     Manejadores de eventos.
     --------------------------------------------------------------- */

  function onLoginSubmit(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    var key = el.adminKey && el.adminKey.value ? el.adminKey.value.trim() : "";
    loadDashboard(key, true);
  }

  function onRefresh() {
    var key = readKey();
    if (!key) {
      showLogin();
      return;
    }
    loadDashboard(key, false);
  }

  function onLogout() {
    clearKey();
    if (el.adminKey) el.adminKey.value = "";
    hideLoginMsg();
    showLogin();
  }

  /* ---------------------------------------------------------------
     Inicialización.
     --------------------------------------------------------------- */

  function init() {
    el.loginScreen = document.getElementById("loginScreen");
    el.loginForm = document.getElementById("loginForm");
    el.loginBtn = document.getElementById("loginBtn");
    el.loginMsg = document.getElementById("loginMsg");
    el.adminKey = document.getElementById("adminKey");

    el.dashboard = document.getElementById("dashboard");
    el.dashStatus = document.getElementById("dashStatus");
    el.refreshBtn = document.getElementById("refreshBtn");
    el.logoutBtn = document.getElementById("logoutBtn");

    el.kpiWaitlist = document.getElementById("kpiWaitlist");
    el.kpiShots = document.getElementById("kpiShots");
    el.kpiEvents = document.getElementById("kpiEvents");

    el.funnelList = document.getElementById("funnelList");
    el.waitlistBody = document.getElementById("waitlistBody");
    el.leaderboardBody = document.getElementById("leaderboardBody");
    el.eventsBody = document.getElementById("eventsBody");

    if (el.loginForm) {
      el.loginForm.addEventListener("submit", onLoginSubmit);
    }
    if (el.refreshBtn) {
      el.refreshBtn.addEventListener("click", onRefresh);
    }
    if (el.logoutBtn) {
      el.logoutBtn.addEventListener("click", onLogout);
    }

    // Si ya hay una clave en sessionStorage, intentamos reanudar la sesión
    // automáticamente (sin pedirla de nuevo). Si falla, vuelve al acceso.
    var savedKey = readKey();
    if (savedKey) {
      showLoginMsg(MSG.checking, "info");
      loadDashboard(savedKey, true);
    }
  }

  // Auto-arranque robusto.
  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  } catch (_err) {
    /* Entorno sin document: no hacemos nada. */
  }
})();
