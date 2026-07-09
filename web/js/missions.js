/**
 * missions.js — Panel de Misiones del simulador.
 *
 * Hace VISIBLE lo que el motor de progresión (js/game.js) ya calculaba pero no
 * mostraba en ningún sitio: el reto diario y el catálogo completo de logros
 * (desbloqueados y bloqueados).
 *
 * Integración sin invasión:
 *  - Autoinyecta su sección en el <aside class="panel">, antes del leaderboard.
 *  - Se refresca envolviendo window.ICCGame.onShot (main.js lo resuelve en cada
 *    disparo, así que el wrapper se aplica sin tocar main.js ni game.js).
 *  - Si ICCGame no existe, no monta nada y el simulador sigue intacto.
 *
 * IIFE, sin módulos (funciona con file://). Todo va en try/catch suave.
 */

(function () {
  "use strict";

  /** Acceso seguro al motor de juego. */
  function game() {
    return window.ICCGame && typeof window.ICCGame.getState === "function"
      ? window.ICCGame
      : null;
  }

  var root = null; // sección .missions
  var dailyEl = null; // bloque del reto diario
  var gridEl = null; // rejilla de logros

  /** Construye el esqueleto del panel e inserta antes del leaderboard. */
  function mount() {
    var panel = document.querySelector("aside.panel");
    if (!panel || panel.querySelector(".missions")) return false;

    root = document.createElement("div");
    root.className = "missions";

    var h2 = document.createElement("h2");
    h2.textContent = "🎯 Misiones";
    root.appendChild(h2);

    dailyEl = document.createElement("div");
    dailyEl.className = "mission-daily";
    root.appendChild(dailyEl);

    gridEl = document.createElement("ul");
    gridEl.className = "mission-grid";
    root.appendChild(gridEl);

    // Insertamos antes del leaderboard para que las misiones queden por encima
    // de la clasificatoria; si no existe, al final del panel.
    var lb = panel.querySelector("#leaderboard");
    if (lb) panel.insertBefore(root, lb);
    else panel.appendChild(root);
    return true;
  }

  /** Pinta el bloque del reto diario (barra de progreso + estado). */
  function renderDaily(daily) {
    dailyEl.innerHTML = "";
    if (!daily) {
      dailyEl.hidden = true;
      return;
    }
    dailyEl.hidden = false;

    var head = document.createElement("div");
    head.className = "mission-daily-head";

    var label = document.createElement("span");
    label.className = "mission-daily-label";
    label.textContent = "📅 " + (daily.label || "Reto del día");

    var count = document.createElement("strong");
    count.className = "mission-daily-count";
    var meta = Number(daily.meta) || 0;
    var prog = Math.min(Number(daily.progreso) || 0, meta);
    count.textContent = daily.completado ? "¡Completado!" : prog + " / " + meta;

    head.append(label, count);

    var bar = document.createElement("div");
    bar.className = "mission-bar";
    var fill = document.createElement("div");
    fill.className = "mission-bar-fill";
    var pct = meta > 0 ? Math.min(100, (prog / meta) * 100) : 0;
    fill.style.width = (daily.completado ? 100 : pct) + "%";
    bar.appendChild(fill);

    dailyEl.classList.toggle("is-done", !!daily.completado);
    dailyEl.append(head, bar);
  }

  /** Pinta la rejilla de logros: desbloqueados en color, bloqueados atenuados. */
  function renderAchievements(catalog, unlockedIds) {
    gridEl.innerHTML = "";
    var unlocked = {};
    for (var i = 0; i < unlockedIds.length; i++) unlocked[unlockedIds[i]] = true;

    for (var j = 0; j < catalog.length; j++) {
      var a = catalog[j];
      var isOn = !!unlocked[a.id];

      var li = document.createElement("li");
      li.className = "mission-tile" + (isOn ? " is-unlocked" : "");
      // El título nativo da la descripción en escritorio; el aria-label la da a
      // lectores de pantalla junto con el estado.
      li.setAttribute("title", a.nombre + " — " + a.desc);
      li.setAttribute(
        "aria-label",
        a.nombre + ". " + a.desc + ". " + (isOn ? "Desbloqueado." : "Bloqueado.")
      );

      var icon = document.createElement("span");
      icon.className = "mission-icon";
      icon.setAttribute("aria-hidden", "true");
      // Los bloqueados muestran un candado en vez del icono, para no spoilear.
      icon.textContent = isOn ? a.icono : "🔒";

      var name = document.createElement("span");
      name.className = "mission-name";
      name.textContent = a.nombre;

      li.append(icon, name);
      gridEl.appendChild(li);
    }
  }

  /** Relee el estado del motor y repinta todo el panel. */
  function render() {
    var g = game();
    if (!g || !root) return;
    try {
      var state = g.getState();
      var catalog =
        typeof g.getAchievements === "function" ? g.getAchievements() : [];
      renderDaily(state.daily);
      renderAchievements(catalog, state.achievements || []);
    } catch (_err) {
      /* un fallo de pintado nunca debe romper el simulador */
    }
  }

  /**
   * Envuelve ICCGame.onShot para repintar tras cada disparo. main.js resuelve
   * window.ICCGame.onShot en el momento de llamar, así que basta sustituirlo.
   */
  function wrapOnShot() {
    var g = game();
    if (!g || typeof g.onShot !== "function" || g.__missionsWrapped) return;
    var original = g.onShot;
    g.onShot = function () {
      var result = original.apply(this, arguments);
      // El repintado va después de que el motor actualice su estado.
      try { render(); } catch (_err) { /* nada */ }
      return result;
    };
    g.__missionsWrapped = true;
  }

  function init() {
    try {
      if (!game()) return; // sin motor de progresión: no montamos nada
      if (!mount()) return;
      wrapOnShot();
      render();
    } catch (_err) {
      /* Sin DOM utilizable o motor roto: el simulador sigue igual. */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.ICCMissions = { render: render };
})();
