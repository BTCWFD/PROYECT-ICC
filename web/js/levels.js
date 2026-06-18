/**
 * levels.js — Motor de niveles / modo campaña de la ICC (window.ICCLevels).
 *
 * Implementa un modo de juego misión a misión con objetivos, estrellas (1-3)
 * y progresión por desbloqueo: un nivel se abre al pasar el anterior. Persiste
 * en localStorage('icc_levels').
 *
 * Diseño y restricciones (alineado con game.js):
 *  - DEGRADACIÓN ELEGANTE: nada lanza fuera; si falta el DOM o localStorage, el
 *    motor sigue computando en memoria y el juego libre nunca se rompe.
 *  - SIN INLINE: todo el estilo vive en levels.css; aquí solo se mutan clases y
 *    se asignan estilos vía element.style (permitido por la CSP estricta).
 *  - Respeta prefers-reduced-motion (las animaciones las apaga el CSS).
 *
 * Contrato público (window.ICCLevels):
 *   init({ mount })            -> renderiza el selector de niveles.
 *   getActiveLevel()           -> null (juego libre) | objeto de nivel.
 *   setActiveLevel(id) / clearActiveLevel()
 *   evaluate({ range, hangTime, maxHeight, world })
 *                              -> { passed, stars, mensaje, unlockedNext }.
 *   onChange(cb)               -> notifica cambios del nivel activo.
 */
(function () {
  "use strict";

  // Clave de persistencia (independiente de icc_game).
  const STORAGE_KEY = "icc_levels";

  /**
   * Catálogo de niveles (dificultad creciente).
   *
   * Cada nivel define:
   *  - id, numero, nombre, descripcion.
   *  - mundo: 'moon' | 'earth' | null (libre: el jugador elige el mundo).
   *  - objetivo: condición principal a superar:
   *      { tipo:'distancia', valor }                 -> range >= valor (m)
   *      { tipo:'hangtime',  valor }                 -> hangTime >= valor (s)
   *      { tipo:'zona', valor(radio), xMeters, radio }-> aterrizar dentro del radio
   *        de xMeters (|range - xMeters| <= radio).
   *  - targets: dianas a dibujar en el lienzo (el simulador las pinta).
   *  - par: referencia de excelencia; las estrellas se dan por margen sobre el par.
   */
  const LEVELS = [
    {
      id: "saque_prueba",
      numero: 1,
      nombre: "Saque de prueba",
      descripcion: "Primer contacto. Lanza el balón a 100 m sobre el regolito.",
      mundo: "moon",
      objetivo: { tipo: "distancia", valor: 100 },
      targets: [{ xMeters: 100, radiusMeters: 18 }],
      par: 160,
    },
    {
      id: "vuelo_orbital",
      numero: 2,
      nombre: "Vuelo orbital",
      descripcion: "Aprovecha la baja gravedad: supera los 500 m de un solo toque.",
      mundo: "moon",
      objetivo: { tipo: "distancia", valor: 500 },
      targets: [{ xMeters: 500, radiusMeters: 40 }],
      par: 700,
    },
    {
      id: "suspension",
      numero: 3,
      nombre: "Hang-time",
      descripcion: "Mantén el balón suspendido 15 s o más en el cielo lunar.",
      mundo: "moon",
      objetivo: { tipo: "hangtime", valor: 15 },
      targets: [],
      par: 22,
    },
    {
      id: "diana_lunar",
      numero: 4,
      nombre: "Diana lunar",
      descripcion: "Precisión: haz aterrizar el balón dentro de la diana a 400 m.",
      mundo: "moon",
      objetivo: { tipo: "zona", valor: 50, xMeters: 400, radio: 50 },
      targets: [{ xMeters: 400, radiusMeters: 50 }],
      par: 22, // margen (m) de excelencia respecto al centro
    },
    {
      id: "gravedad_terrestre",
      numero: 5,
      nombre: "Gravedad terrestre",
      descripcion: "Reto en la Tierra: con 1 g y aire, alcanza los 90 m.",
      mundo: "earth",
      objetivo: { tipo: "distancia", valor: 90 },
      targets: [{ xMeters: 90, radiusMeters: 14 }],
      par: 130,
    },
    {
      id: "precision",
      numero: 6,
      nombre: "Tiro de precisión",
      descripcion: "Zona estrecha en la Luna: aterriza a 750 m con poco margen.",
      mundo: "moon",
      objetivo: { tipo: "zona", valor: 30, xMeters: 750, radio: 30 },
      targets: [{ xMeters: 750, radiusMeters: 30 }],
      par: 12,
    },
    {
      id: "doble_diana",
      numero: 7,
      nombre: "Pasillo de balizas",
      descripcion: "Cruza el pasillo y aterriza en la baliza lejana a 1100 m.",
      mundo: "moon",
      objetivo: { tipo: "zona", valor: 60, xMeters: 1100, radio: 60 },
      // Dianas decorativas de referencia + la diana objetivo final.
      targets: [
        { xMeters: 500, radiusMeters: 22 },
        { xMeters: 800, radiusMeters: 22 },
        { xMeters: 1100, radiusMeters: 60 },
      ],
      par: 24,
    },
    {
      id: "maraton_lunar",
      numero: 8,
      nombre: "Maratón lunar",
      descripcion: "Resistencia balística: lanza el balón más allá de los 2 km.",
      mundo: "moon",
      objetivo: { tipo: "distancia", valor: 2000 },
      targets: [{ xMeters: 2000, radiusMeters: 90 }],
      par: 2600,
    },
    {
      id: "libre_maestro",
      numero: 9,
      nombre: "Desafío libre",
      descripcion: "Tú eliges el mundo. Supera los 300 m donde quieras.",
      mundo: null, // juego libre: el mundo activo lo fija el jugador
      objetivo: { tipo: "distancia", valor: 300 },
      targets: [{ xMeters: 300, radiusMeters: 28 }],
      par: 480,
    },
    {
      id: "leyenda",
      numero: 10,
      nombre: "Leyenda",
      descripcion: "El reto definitivo: 25 s de hang-time en la Luna.",
      mundo: "moon",
      objetivo: { tipo: "hangtime", valor: 25 },
      targets: [],
      par: 32,
    },
  ];

  // Índice id -> nivel para búsquedas O(1).
  const BY_ID = LEVELS.reduce(function (acc, lv) {
    acc[lv.id] = lv;
    return acc;
  }, {});

  // ----- Estado en memoria -----
  let state = defaultState();
  let listeners = []; // suscriptores de onChange
  let prefersReducedMotion = false;
  let ui = null; // referencias del selector montado (o null)

  function defaultState() {
    return {
      // El primer nivel siempre está desbloqueado.
      desbloqueados: [LEVELS[0].id],
      // Estrellas obtenidas por nivel: { id: 0..3 }.
      estrellas: {},
      // Nivel activo (id) o null => juego libre.
      activo: null,
    };
  }

  // ----- Persistencia (defensiva) -----
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state = Object.assign(defaultState(), parsed);
        if (!Array.isArray(state.desbloqueados) || !state.desbloqueados.length) {
          state.desbloqueados = [LEVELS[0].id];
        }
        if (!state.estrellas || typeof state.estrellas !== "object") {
          state.estrellas = {};
        }
        // El nivel activo debe seguir existiendo; si no, juego libre.
        if (state.activo && !BY_ID[state.activo]) state.activo = null;
      }
    } catch (_err) {
      // localStorage no disponible o corrupto: estado por defecto.
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_err) {
      // Sin persistencia: el motor sigue en memoria.
    }
  }

  function isUnlocked(id) {
    return state.desbloqueados.indexOf(id) !== -1;
  }

  function unlock(id) {
    if (id && BY_ID[id] && !isUnlocked(id)) {
      state.desbloqueados.push(id);
    }
  }

  function nextLevelOf(id) {
    const idx = LEVELS.findIndex(function (lv) {
      return lv.id === id;
    });
    if (idx === -1 || idx + 1 >= LEVELS.length) return null;
    return LEVELS[idx + 1];
  }

  // Vista pública de un nivel (copia defensiva, sin exponer el array interno).
  function publicLevel(lv) {
    if (!lv) return null;
    return {
      id: lv.id,
      numero: lv.numero,
      nombre: lv.nombre,
      descripcion: lv.descripcion,
      mundo: lv.mundo,
      objetivo: Object.assign({}, lv.objetivo),
      targets: (lv.targets || []).map(function (t) {
        return { xMeters: t.xMeters, radiusMeters: t.radiusMeters };
      }),
      par: lv.par,
    };
  }

  // ----- Notificación de cambios -----
  function notify() {
    const active = getActiveLevel();
    listeners.forEach(function (cb) {
      try {
        cb(active);
      } catch (_err) {
        // Un suscriptor defectuoso no debe tumbar a los demás.
      }
    });
  }

  // ================= API pública =================

  /** Inicializa el motor y renderiza el selector en mount (o #levels-mount). */
  function init(opts) {
    opts = opts || {};
    try {
      prefersReducedMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_err) {
      prefersReducedMotion = false;
    }

    load();
    save();

    const mount =
      opts.mount ||
      (typeof document !== "undefined" && document.getElementById("levels-mount"));
    if (mount) {
      buildSelector(mount);
      renderSelector();
    }
    return getActiveLevel();
  }

  /** Nivel activo (copia pública) o null en juego libre. */
  function getActiveLevel() {
    if (!state.activo) return null;
    return publicLevel(BY_ID[state.activo]);
  }

  /** Fija el nivel activo si está desbloqueado. Devuelve el nivel o null. */
  function setActiveLevel(id) {
    if (!BY_ID[id] || !isUnlocked(id)) return null;
    state.activo = id;
    save();
    renderSelector();
    notify();
    return getActiveLevel();
  }

  /** Vuelve al juego libre. */
  function clearActiveLevel() {
    if (state.activo === null) return;
    state.activo = null;
    save();
    renderSelector();
    notify();
  }

  /**
   * Evalúa el resultado de un disparo contra el nivel activo.
   * Defensivo: si no hay nivel activo o datos inválidos, devuelve no superado.
   *
   * @param {{range:number, hangTime:number, maxHeight:number, world:string}} r
   * @returns {{passed:boolean, stars:number, mensaje:string, unlockedNext:boolean}}
   */
  function evaluate(r) {
    r = r || {};
    const lv = state.activo ? BY_ID[state.activo] : null;
    if (!lv) {
      return { passed: false, stars: 0, mensaje: "Juego libre.", unlockedNext: false };
    }

    // Si el nivel exige un mundo concreto y el disparo fue en otro, no cuenta.
    if (lv.mundo && r.world && r.world !== lv.mundo) {
      const nombreMundo = lv.mundo === "earth" ? "la Tierra" : "la Luna";
      return {
        passed: false,
        stars: 0,
        mensaje: "Este nivel se juega en " + nombreMundo + ".",
        unlockedNext: false,
      };
    }

    const range = Math.max(0, Number(r.range) || 0);
    const hang = Math.max(0, Number(r.hangTime) || 0);

    let passed = false;
    let stars = 0;
    let mensaje = "";

    const obj = lv.objetivo || {};

    if (obj.tipo === "distancia") {
      passed = range >= obj.valor;
      stars = passed ? starsByExcess(range, obj.valor, lv.par) : 0;
      mensaje = passed
        ? "¡Objetivo logrado! " + Math.round(range) + " m."
        : "Te faltaron " + Math.max(0, Math.round(obj.valor - range)) + " m.";
    } else if (obj.tipo === "hangtime") {
      passed = hang >= obj.valor;
      stars = passed ? starsByExcess(hang, obj.valor, lv.par) : 0;
      mensaje = passed
        ? "¡Suspensión de " + hang.toFixed(1) + " s!"
        : "Solo " + hang.toFixed(1) + " s de " + obj.valor + " s.";
    } else if (obj.tipo === "zona") {
      const radio = obj.radio || obj.valor || 0;
      const error = Math.abs(range - obj.xMeters);
      passed = error <= radio;
      // En zona, las estrellas premian la cercanía al centro (par = margen ideal).
      stars = passed ? starsByProximity(error, radio, lv.par) : 0;
      mensaje = passed
        ? "¡Diana! A " + Math.round(error) + " m del centro."
        : "Caíste a " + Math.round(error) + " m (zona ±" + Math.round(radio) + " m).";
    } else {
      mensaje = "Objetivo desconocido.";
    }

    // Persistir mejor marca de estrellas y desbloquear el siguiente nivel.
    let unlockedNext = false;
    if (passed) {
      const prevStars = state.estrellas[lv.id] || 0;
      if (stars > prevStars) state.estrellas[lv.id] = stars;
      const next = nextLevelOf(lv.id);
      if (next && !isUnlocked(next.id)) {
        unlock(next.id);
        unlockedNext = true;
      }
      save();
      renderSelector();
    }

    return { passed: passed, stars: stars, mensaje: mensaje, unlockedNext: unlockedNext };
  }

  /**
   * Estrellas por superar un mínimo apuntando a un par (valor de excelencia).
   * 1★ = cumple el mínimo; 2★ = a medio camino del par; 3★ = alcanza/supera el par.
   */
  function starsByExcess(value, min, par) {
    if (value < min) return 0;
    if (!par || par <= min) return value >= min ? 3 : 1;
    if (value >= par) return 3;
    const mid = min + (par - min) * 0.55;
    if (value >= mid) return 2;
    return 1;
  }

  /**
   * Estrellas por proximidad en retos de zona: cuanto menor el error, mejor.
   * par = margen (m) que merece 3★. error <= par => 3★; <= radio/2 => 2★; resto 1★.
   */
  function starsByProximity(error, radio, par) {
    if (error > radio) return 0;
    const ideal = par || radio * 0.25;
    if (error <= ideal) return 3;
    if (error <= radio * 0.5) return 2;
    return 1;
  }

  /** Suscribe un callback a los cambios de nivel activo. Devuelve un des-suscriptor. */
  function onChange(cb) {
    if (typeof cb !== "function") return function () {};
    listeners.push(cb);
    return function () {
      listeners = listeners.filter(function (fn) {
        return fn !== cb;
      });
    };
  }

  // ================= Selector de niveles (UI) =================

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /** Construye el esqueleto del selector dentro de `mount` (idempotente). */
  function buildSelector(mount) {
    try {
      mount.innerHTML = "";
      mount.classList.add("icc-levels");

      // Cabecera con título y botón de juego libre.
      const head = el("div", "lvl-head");
      const title = el("h2", "lvl-title", "Modo Campaña");
      const free = el("button", "lvl-free-btn", "Juego libre");
      free.type = "button";
      free.addEventListener("click", function () {
        clearActiveLevel();
      });
      head.append(title, free);

      // Resumen de progreso (estrellas totales / niveles superados).
      const summary = el("div", "lvl-summary");

      // Rejilla de tarjetas.
      const grid = el("div", "lvl-grid");

      mount.append(head, summary, grid);

      // Construye una tarjeta por nivel (se actualizan en renderSelector).
      const cards = {};
      LEVELS.forEach(function (lv) {
        const card = el("button", "lvl-card");
        card.type = "button";
        card.dataset.level = lv.id;

        const num = el("span", "lvl-num", String(lv.numero));
        const lock = el("span", "lvl-lock");
        // Candado decorativo (glifo ligero, sin recursos externos).
        lock.textContent = "🔒";
        lock.setAttribute("aria-hidden", "true");

        const name = el("span", "lvl-name", lv.nombre);
        const desc = el("span", "lvl-desc", lv.descripcion);

        // Etiqueta de mundo / objetivo.
        const meta = el("span", "lvl-meta", metaLabel(lv));

        // Tres estrellas (se rellenan según la mejor marca).
        const starsRow = el("span", "lvl-stars");
        const starNodes = [];
        for (let i = 0; i < 3; i++) {
          const s = el("span", "lvl-star", "★");
          s.setAttribute("aria-hidden", "true");
          starsRow.appendChild(s);
          starNodes.push(s);
        }

        card.append(num, lock, name, desc, meta, starsRow);

        card.addEventListener("click", function () {
          // Solo se puede elegir si está desbloqueado.
          if (!isUnlocked(lv.id)) return;
          setActiveLevel(lv.id);
        });

        grid.appendChild(card);
        cards[lv.id] = { card: card, stars: starNodes, lock: lock };
      });

      ui = { mount: mount, grid: grid, summary: summary, free: free, cards: cards };
    } catch (_err) {
      ui = null; // si algo falla, el selector queda inactivo sin romper nada
    }
  }

  // Etiqueta breve de mundo + objetivo para la tarjeta.
  function metaLabel(lv) {
    const mundo =
      lv.mundo === "earth" ? "🌍 Tierra" : lv.mundo === "moon" ? "🌕 Luna" : "✦ Libre";
    const obj = lv.objetivo || {};
    let goal = "";
    if (obj.tipo === "distancia") goal = "≥ " + obj.valor + " m";
    else if (obj.tipo === "hangtime") goal = "≥ " + obj.valor + " s aire";
    else if (obj.tipo === "zona")
      goal = "diana " + obj.xMeters + " m (±" + (obj.radio || obj.valor) + ")";
    return mundo + " · " + goal;
  }

  /** Refresca el estado visual del selector (bloqueos, estrellas, activo). */
  function renderSelector() {
    if (!ui) return;
    try {
      let totalStars = 0;
      let cleared = 0;

      LEVELS.forEach(function (lv) {
        const ref = ui.cards[lv.id];
        if (!ref) return;
        const unlocked = isUnlocked(lv.id);
        const got = state.estrellas[lv.id] || 0;
        totalStars += got;
        if (got > 0) cleared++;

        ref.card.classList.toggle("is-locked", !unlocked);
        ref.card.classList.toggle("is-active", state.activo === lv.id);
        ref.card.classList.toggle("is-cleared", got > 0);
        ref.card.disabled = !unlocked;
        ref.card.setAttribute("aria-pressed", state.activo === lv.id ? "true" : "false");

        // Estrellas: rellena tantas como la mejor marca.
        ref.stars.forEach(function (s, i) {
          s.classList.toggle("is-on", i < got);
        });
      });

      ui.summary.textContent =
        "★ " + totalStars + " / " + LEVELS.length * 3 + " · " +
        cleared + " / " + LEVELS.length + " niveles superados";

      ui.free.classList.toggle("is-active", state.activo === null);
    } catch (_err) {
      // Un fallo de render nunca debe afectar al simulador.
    }
  }

  // ----- Exposición global -----
  window.ICCLevels = {
    init: init,
    getActiveLevel: getActiveLevel,
    setActiveLevel: setActiveLevel,
    clearActiveLevel: clearActiveLevel,
    evaluate: evaluate,
    onChange: onChange,
    // Expuesto para depuración (no forma parte del contrato mínimo).
    _LEVELS: LEVELS.map(publicLevel),
  };
})();
