/**
 * ui-mobile.js — Ergonomía de la interfaz del SIMULADOR en móvil.
 *
 * Responsabilidades (todas defensivas y aditivas; NO tocan main.js):
 *  1) Botón flotante "Patear" (FAB) cómodo para el pulgar, que REUTILIZA el
 *     botón #kick existente (dispara su .click()); no duplica la lógica de
 *     saque, supervisión, audio ni gamificación.
 *  2) Acordeón del panel en pantallas pequeñas: agrupa secciones secundarias
 *     (ajustes avanzados, telemetría, clasificatorias, lista de espera) en
 *     <details> colapsables para que los controles principales queden a mano y
 *     el contenido no se apile interminablemente.
 *
 * Principios:
 *  - IIFE; nunca lanza (todo va en try/catch suave). Si algo falta, no hace
 *    nada y el simulador sigue intacto.
 *  - Conserva los IDs y nodos originales (solo los reubica en el DOM), de modo
 *    que las referencias y listeners cacheados por main.js siguen funcionando.
 *  - Degrada en escritorio: el CSS deja el acordeón siempre abierto sin
 *    cabecera, y el FAB solo se muestra en móvil (display via media query).
 *  - Respeta prefers-reduced-motion (las transiciones viven en el CSS).
 */
(function () {
  "use strict";

  // Punto de corte que consideramos "móvil" para el acordeón. Debe coincidir
  // con el media query de styles.css (max-width: 600px).
  var MOBILE_MAX = 600;
  var mql = null;
  try {
    mql = window.matchMedia("(max-width: " + MOBILE_MAX + "px)");
  } catch (_err) {
    mql = null;
  }

  /** Crea un <img> de icono same-origin, decorativo (no afecta accesibilidad). */
  function icon(name) {
    var img = document.createElement("img");
    img.src = "assets/ui/" + name;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    return img;
  }

  // -----------------------------------------------------------------------
  // 1) BOTÓN FLOTANTE "PATEAR" (FAB)
  // -----------------------------------------------------------------------
  function setupKickFab() {
    var kick = document.getElementById("kick");
    if (!kick) return; // sin botón real no hay nada que delegar

    var fab = document.createElement("button");
    fab.type = "button";
    fab.className = "kick-fab";
    // Mantiene el texto visible (accesibilidad) + icono decorativo.
    fab.appendChild(icon("icon-kick.svg"));
    var label = document.createElement("span");
    label.textContent = "Patear";
    fab.appendChild(label);
    fab.setAttribute("aria-label", "Patear (ejecutar saque)");

    // Reutiliza el botón existente: NO reimplementa la lógica de disparo.
    fab.addEventListener("click", function () {
      try {
        // Respeta el bloqueo anti-doble-disparo de main.js: si #kick está
        // deshabilitado, no hacemos nada.
        if (kick.disabled) return;
        kick.click();
      } catch (_err) {
        /* el FAB jamás rompe la UX */
      }
    });

    document.body.appendChild(fab);

    // Sincroniza el estado ocupado/deshabilitado del FAB con el de #kick
    // (main.js alterna kick.disabled durante el vuelo / la latencia).
    function sync() {
      var busy = !!kick.disabled;
      fab.disabled = busy;
      fab.classList.toggle("is-busy", busy);
    }
    sync();
    try {
      var mo = new MutationObserver(sync);
      mo.observe(kick, { attributes: true, attributeFilter: ["disabled"] });
    } catch (_err) {
      /* sin MutationObserver el FAB sigue funcionando, solo sin sincronía fina */
    }
  }

  // -----------------------------------------------------------------------
  // 2) ACORDEÓN DEL PANEL (solo móvil)
  // -----------------------------------------------------------------------
  // Definición de secciones colapsables. Cada una agrupa nodos YA existentes
  // del panel por sus selectores, en orden. Conservamos los nodos (los movemos
  // dentro de un <details>), nunca los recreamos.
  var SECTIONS = [
    {
      id: "acc-avanzado",
      title: "Ajustes avanzados",
      iconName: "icon-info.svg",
      open: false,
      selectors: [".toggles", "#latency"],
    },
    {
      id: "acc-telemetria",
      title: "Telemetría",
      iconName: "icon-ball.svg",
      open: false,
      selectors: [".metrics", ".hint"],
    },
    {
      id: "acc-ranking",
      title: "Clasificatorias",
      iconName: "icon-trophy.svg",
      open: false,
      selectors: ["#leaderboard"],
    },
    {
      id: "acc-waitlist",
      title: "Lista de espera",
      iconName: "icon-rocket.svg",
      open: false,
      selectors: [".waitlist"],
    },
  ];

  // Marca para saber si el acordeón ya está montado (idempotencia).
  var accordionBuilt = false;

  /** Construye los <details> del acordeón a partir de las secciones. */
  function buildAccordion() {
    if (accordionBuilt) return;
    var panel = document.querySelector(".panel");
    if (!panel) return;

    SECTIONS.forEach(function (sec) {
      // Reúne los nodos objetivo presentes en el panel (en orden de selector).
      var nodes = [];
      sec.selectors.forEach(function (sel) {
        var el = panel.querySelector(sel);
        if (el) nodes.push(el);
      });
      if (!nodes.length) return; // nada que agrupar para esta sección

      // El <details> se inserta en la posición del PRIMER nodo del grupo.
      var first = nodes[0];

      var details = document.createElement("details");
      details.className = "panel-accordion";
      details.id = sec.id;
      if (sec.open) details.open = true;

      var summary = document.createElement("summary");
      var titleWrap = document.createElement("span");
      titleWrap.className = "acc-title";
      titleWrap.appendChild(icon(sec.iconName));
      var titleText = document.createElement("span");
      titleText.textContent = sec.title;
      titleWrap.appendChild(titleText);
      summary.appendChild(titleWrap);
      // Chevron decorativo (rotación gestionada por CSS).
      var chevron = document.createElement("span");
      chevron.className = "acc-chevron";
      chevron.setAttribute("aria-hidden", "true");
      summary.appendChild(chevron);
      details.appendChild(summary);

      var body = document.createElement("div");
      body.className = "acc-body";
      details.appendChild(body);

      // Inserta el <details> antes del primer nodo y traslada los nodos dentro.
      panel.insertBefore(details, first);
      nodes.forEach(function (n) {
        body.appendChild(n); // mover preserva el nodo, sus IDs y listeners
      });
    });

    accordionBuilt = true;
  }

  // -----------------------------------------------------------------------
  // Arranque
  // -----------------------------------------------------------------------
  function init() {
    try {
      setupKickFab();
    } catch (_err) {
      /* el FAB es opcional */
    }

    // El acordeón solo aporta en móvil. Lo construimos una vez si la pantalla
    // es pequeña ahora o pasa a serlo. En escritorio NO reestructuramos el DOM;
    // así la experiencia de PC queda idéntica a la original.
    try {
      var maybeBuild = function () {
        if (!mql || mql.matches) buildAccordion();
      };
      maybeBuild();
      if (mql) {
        // Si el usuario rota o cambia de tamaño hacia móvil, montamos entonces.
        var onChange = function () {
          if (mql.matches) buildAccordion();
        };
        if (typeof mql.addEventListener === "function") {
          mql.addEventListener("change", onChange);
        } else if (typeof mql.addListener === "function") {
          mql.addListener(onChange); // navegadores antiguos
        }
      }
    } catch (_err) {
      /* el acordeón es opcional */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
