/*
 * ICC - Landing para inversionistas
 * Ingenieria de interacciones (JS vanilla, sin dependencias).
 *
 * Responsabilidades:
 *  - Header: anade/quita la clase "scrolled" segun el scroll vertical.
 *  - Reveal: IntersectionObserver que muestra los elementos .reveal al entrar en viewport.
 *  - Contadores: anima los .counter de 0 a data-target (con data-suffix), respetando reduced-motion.
 *  - Smooth scroll accesible para los enlaces de ancla del nav.
 *  - Menu movil: alterna la clase "open" en .nav-links mediante .nav-toggle (degrada si no existe).
 *
 * Todo el codigo va dentro de un IIFE y es defensivo: nada se rompe si falta un elemento.
 * Compatible con la Content Security Policy estricta (sin inline, sin recursos externos).
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Utilidades y preferencias del usuario
  // ---------------------------------------------------------------------------

  // Consulta de media query para respetar la preferencia de movimiento reducido.
  var reduceMotionQuery =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;

  // Devuelve true si el usuario pidio reducir el movimiento (se consulta en vivo).
  function prefersReducedMotion() {
    return !!(reduceMotionQuery && reduceMotionQuery.matches);
  }

  // ---------------------------------------------------------------------------
  // Header: clase "scrolled" cuando se hace scroll mas alla de 40px
  // ---------------------------------------------------------------------------

  function initHeaderScroll() {
    var header = document.querySelector(".site-header");
    if (!header) {
      return; // No hay header: nada que hacer.
    }

    var SCROLL_THRESHOLD = 40;
    var ticking = false; // Para limitar el trabajo a un frame por scroll.

    function applyScrolledState() {
      if (window.scrollY > SCROLL_THRESHOLD) {
        header.classList.add("scrolled");
      } else {
        header.classList.remove("scrolled");
      }
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(applyScrolledState);
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    applyScrolledState(); // Estado inicial correcto (por si la pagina carga ya scrolleada).
  }

  // ---------------------------------------------------------------------------
  // Contadores animados (.counter)
  // ---------------------------------------------------------------------------

  // Formatea un numero con separadores de miles segun el locale del navegador.
  function formatNumber(value) {
    try {
      return Math.round(value).toLocaleString();
    } catch (err) {
      // Fallback ultra defensivo si toLocaleString no esta disponible.
      return String(Math.round(value));
    }
  }

  // Pinta el valor final del contador (sin animar) respetando el sufijo.
  function setCounterFinal(el) {
    var target = parseFloat(el.getAttribute("data-target"));
    var suffix = el.getAttribute("data-suffix") || "";
    if (isNaN(target)) {
      return;
    }
    el.textContent = formatNumber(target) + suffix;
  }

  // Anima un contador de 0 hasta data-target con un easing suave (~1.5s).
  function animateCounter(el) {
    var target = parseFloat(el.getAttribute("data-target"));
    var suffix = el.getAttribute("data-suffix") || "";

    // Si el dato no es valido, no animamos: dejamos lo que hubiera.
    if (isNaN(target)) {
      return;
    }

    // Si se pide reducir movimiento, mostramos el valor final directo.
    if (prefersReducedMotion()) {
      setCounterFinal(el);
      return;
    }

    var DURATION = 1500; // ms
    var startTime = null;

    // Easing suave: easeOutCubic (rapido al principio, frena al final).
    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function step(timestamp) {
      if (startTime === null) {
        startTime = timestamp;
      }
      var elapsed = timestamp - startTime;
      var progress = Math.min(elapsed / DURATION, 1);
      var eased = easeOutCubic(progress);
      var current = target * eased;

      el.textContent = formatNumber(current) + suffix;

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        // Aseguramos el valor exacto al terminar.
        el.textContent = formatNumber(target) + suffix;
      }
    }

    window.requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------------------
  // Reveal de elementos + arranque de contadores al entrar en viewport
  // ---------------------------------------------------------------------------

  function initReveal() {
    var revealEls = Array.prototype.slice.call(
      document.querySelectorAll(".reveal")
    );
    var counterEls = Array.prototype.slice.call(
      document.querySelectorAll(".counter")
    );

    // Marca un .reveal como visible.
    function showReveal(el) {
      el.classList.add("is-visible");
    }

    // Si no hay IntersectionObserver o se reduce movimiento, mostramos todo de una.
    if (typeof window.IntersectionObserver !== "function") {
      revealEls.forEach(showReveal);
      counterEls.forEach(setCounterFinal);
      return;
    }

    // Observer para los elementos .reveal (se dispara una sola vez por elemento).
    var revealObserver = new window.IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            showReveal(entry.target);
            observer.unobserve(entry.target); // Solo una vez.
          }
        });
      },
      { root: null, rootMargin: "0px 0px -10% 0px", threshold: 0.15 }
    );

    revealEls.forEach(function (el) {
      revealObserver.observe(el);
    });

    // Observer dedicado para los contadores (anima al entrar, una sola vez).
    var counterObserver = new window.IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target); // Solo una vez.
          }
        });
      },
      { root: null, threshold: 0.4 }
    );

    counterEls.forEach(function (el) {
      counterObserver.observe(el);
    });
  }

  // ---------------------------------------------------------------------------
  // Smooth scroll accesible para anclas del nav (y cualquier ancla interna)
  // ---------------------------------------------------------------------------

  function initSmoothScroll() {
    // Capturamos clicks en enlaces que apuntan a un ancla del mismo documento.
    var anchorLinks = Array.prototype.slice.call(
      document.querySelectorAll('a[href^="#"]')
    );

    if (!anchorLinks.length) {
      return;
    }

    anchorLinks.forEach(function (link) {
      link.addEventListener("click", function (event) {
        var href = link.getAttribute("href");

        // Ignoramos "#" o vacios: no son destinos reales.
        if (!href || href === "#") {
          return;
        }

        var target = null;
        try {
          target = document.querySelector(href);
        } catch (err) {
          return; // Selector invalido: dejamos el comportamiento por defecto.
        }

        if (!target) {
          return; // No existe el destino: no interceptamos.
        }

        event.preventDefault();

        // Cerramos el menu movil si estuviera abierto.
        closeMobileMenu();

        // Scroll suave salvo que se pida reducir movimiento.
        var behavior = prefersReducedMotion() ? "auto" : "smooth";
        try {
          target.scrollIntoView({ behavior: behavior, block: "start" });
        } catch (err) {
          // Fallback para navegadores sin soporte de opciones en scrollIntoView.
          target.scrollIntoView();
        }

        // Accesibilidad: movemos el foco al destino sin provocar otro salto.
        moveFocusTo(target);

        // Actualizamos el hash en la URL sin recargar (mejora navegacion/atras).
        if (window.history && typeof window.history.pushState === "function") {
          window.history.pushState(null, "", href);
        }
      });
    });
  }

  // Mueve el foco a un elemento garantizando que sea enfocable temporalmente.
  function moveFocusTo(target) {
    var hadTabindex = target.hasAttribute("tabindex");
    if (!hadTabindex) {
      target.setAttribute("tabindex", "-1");
    }
    try {
      target.focus({ preventScroll: true });
    } catch (err) {
      target.focus();
    }
    // Limpiamos el tabindex temporal para no alterar el orden de tabulacion.
    if (!hadTabindex) {
      target.addEventListener(
        "blur",
        function handler() {
          target.removeAttribute("tabindex");
          target.removeEventListener("blur", handler);
        }
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Menu movil: alterna "open" en .nav-links con el boton .nav-toggle
  // ---------------------------------------------------------------------------

  // Referencias compartidas para que el smooth scroll pueda cerrar el menu.
  var navToggleEl = null;
  var navLinksEl = null;

  function closeMobileMenu() {
    if (navLinksEl && navLinksEl.classList.contains("open")) {
      navLinksEl.classList.remove("open");
      if (navToggleEl) {
        navToggleEl.setAttribute("aria-expanded", "false");
      }
    }
  }

  function initMobileMenu() {
    navToggleEl = document.querySelector(".nav-toggle");
    navLinksEl = document.querySelector(".nav-links");

    // Si no existe el boton o la lista, degradamos sin error.
    if (!navToggleEl || !navLinksEl) {
      return;
    }

    // Estado ARIA inicial.
    navToggleEl.setAttribute("aria-expanded", "false");

    navToggleEl.addEventListener("click", function () {
      var isOpen = navLinksEl.classList.toggle("open");
      navToggleEl.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    // Cerrar con la tecla Escape para accesibilidad.
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" || event.key === "Esc") {
        closeMobileMenu();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Arranque: inicializamos todo cuando el DOM esta listo
  // ---------------------------------------------------------------------------

  function init() {
    initHeaderScroll();
    initMobileMenu();
    initReveal();
    initSmoothScroll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    // El DOM ya estaba listo (por ejemplo, script con defer ya parseado).
    init();
  }
})();
