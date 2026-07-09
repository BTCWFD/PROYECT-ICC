/**
 * leaderboard.js — Página del ranking global (leaderboard.html).
 *
 * Consume GET /api/leaderboard?period=week|all&top=20 y pinta la tabla.
 * El conmutador de periodo (Semana / Histórico) recarga la lista.
 *
 * Todo defensivo (try/catch, estados de carga/vacío/error): si la API no
 * responde —p. ej. abierto como file://— muestra un estado claro sin romperse.
 * IIFE sin módulos para funcionar también con file://.
 */

(function () {
  "use strict";

  var API = "/api/leaderboard";
  var TOP = 20;

  // Estado actual del periodo seleccionado.
  var currentPeriod = "week";
  // Token de petición para ignorar respuestas obsoletas (si se cambia de
  // pestaña rápido, solo pintamos la última solicitada).
  var reqSeq = 0;

  function $(id) { return document.getElementById(id); }

  var els = {
    list: $("lbList"),
    loading: $("lbLoading"),
    empty: $("lbEmpty"),
    error: $("lbError"),
    tabs: null,
  };

  /** Muestra exactamente uno de los estados (o ninguno) y oculta el resto. */
  function setState(which) {
    if (els.loading) els.loading.hidden = which !== "loading";
    if (els.empty) els.empty.hidden = which !== "empty";
    if (els.error) els.error.hidden = which !== "error";
  }

  var WORLD_EMOJI = { earth: "🌍", moon: "🌕" };

  /** Crea una fila del ranking (elementos, sin innerHTML: a prueba de XSS). */
  function renderRow(entry, index) {
    var li = document.createElement("li");
    li.className = "lb-row";
    if (index < 3) li.className += " is-podium-" + (index + 1);

    var pos = document.createElement("span");
    pos.className = "lb-pos";
    pos.textContent = index < 3 ? ["🥇", "🥈", "🥉"][index] : String(index + 1);

    var club = document.createElement("span");
    club.className = "lb-club";
    // textContent neutraliza cualquier HTML/control del nombre de club.
    club.textContent = entry && entry.club ? String(entry.club) : "—";

    var world = document.createElement("span");
    world.className = "lb-world";
    world.textContent = WORLD_EMOJI[entry && entry.world] || "🌕";
    world.setAttribute("title", entry && entry.world === "earth" ? "Tierra" : "Luna");

    var range = document.createElement("span");
    range.className = "lb-range";
    range.textContent = Math.round(Number(entry && entry.range) || 0) + " m";

    var hang = document.createElement("span");
    hang.className = "lb-hang";
    var h = Number(entry && entry.hangTime);
    hang.textContent = Number.isFinite(h) ? h.toFixed(1) + " s" : "—";

    li.append(pos, club, world, range, hang);
    return li;
  }

  /** Pinta la lista completa a partir de las entradas recibidas. */
  function render(entries) {
    els.list.innerHTML = "";
    if (!entries || !entries.length) {
      setState("empty");
      return;
    }
    setState(null);
    var frag = document.createDocumentFragment();
    for (var i = 0; i < entries.length; i++) {
      frag.appendChild(renderRow(entries[i], i));
    }
    els.list.appendChild(frag);
  }

  /** Carga el ranking del periodo dado desde la API. */
  function load(period) {
    var mySeq = ++reqSeq;
    setState("loading");
    els.list.innerHTML = "";

    var url = API + "?period=" + encodeURIComponent(period) + "&top=" + TOP;
    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (mySeq !== reqSeq) return; // respuesta obsoleta: la ignoramos
        var entries = data && Array.isArray(data.entries) ? data.entries : [];
        render(entries);
      })
      .catch(function () {
        if (mySeq !== reqSeq) return;
        setState("error");
      });
  }

  /** Cablea el conmutador de periodo (pestañas). */
  function wireTabs() {
    var tabs = document.querySelectorAll(".lb-tab");
    els.tabs = tabs;
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener("click", function () {
        var period = this.getAttribute("data-period") === "all" ? "all" : "week";
        if (period === currentPeriod) return;
        currentPeriod = period;
        for (var j = 0; j < tabs.length; j++) {
          var active = tabs[j] === this;
          tabs[j].classList.toggle("is-active", active);
          tabs[j].setAttribute("aria-selected", String(active));
        }
        load(period);
      });
    }
  }

  function init() {
    try {
      if (!els.list) return;
      wireTabs();
      load(currentPeriod);
    } catch (_err) {
      // Ante cualquier fallo de arranque, mostramos el estado de error.
      try { setState("error"); } catch (_e) { /* nada más que hacer */ }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
