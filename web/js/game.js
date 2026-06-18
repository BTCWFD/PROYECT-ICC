/**
 * game.js — Motor de gamificación de la ICC (window.ICCGame).
 *
 * Implementa un sistema de progresión persistido en localStorage para el
 * simulador de física lunar: XP por disparo, niveles con curva creciente,
 * 5 rangos, combo/racha, reto diario y >=8 logros.
 *
 * Diseño:
 *  - DEGRADACIÓN ELEGANTE: nada lanza fuera; si falta el HUD o localStorage,
 *    el motor sigue computando en memoria sin romper al simulador.
 *  - SIN INLINE: todo el estilo vive en game.css; aquí solo se mutan clases y
 *    se asignan estilos vía element.style (permitido por la CSP).
 *  - Respeta prefers-reduced-motion: los overlays se muestran igual pero el CSS
 *    desactiva las animaciones; además acortamos su permanencia.
 *
 * Contrato público:
 *   window.ICCGame.init({ hudMount })
 *   window.ICCGame.onShot({ range, world, hangTime, power, angle, club, isRecord })
 *   window.ICCGame.getState()
 */
(function () {
  "use strict";

  // Clave de persistencia.
  const STORAGE_KEY = "icc_game";

  // ----- Definición de rangos (lunar/fútbol) -----
  // Cada rango se desbloquea al alcanzar su nivel mínimo. El emblema es un
  // glifo ligero (sin recursos externos) coherente con el tema espacial.
  const RANKS = [
    { id: "recluta", nombre: "Recluta", emblema: "✦", minLevel: 1 },
    { id: "operador", nombre: "Operador", emblema: "◆", minLevel: 4 },
    { id: "piloto", nombre: "Piloto", emblema: "▲", minLevel: 8 },
    { id: "capitan", nombre: "Capitán", emblema: "★", minLevel: 13 },
    { id: "leyenda", nombre: "Leyenda Lunar", emblema: "☾", minLevel: 20 },
  ];

  // ----- Definición de logros (>=8) -----
  // Cada logro tiene una condición evaluada sobre el estado + el contexto del
  // disparo recién procesado. Se devuelve true para desbloquear.
  const ACHIEVEMENTS = [
    {
      id: "primer_toque",
      nombre: "Primer Toque",
      desc: "Ejecuta tu primer saque.",
      icono: "⚽",
      cond: (s) => s.totalShots >= 1,
    },
    {
      id: "vuelo_orbital",
      nombre: "Vuelo Orbital",
      desc: "Supera los 100 m en un disparo.",
      icono: "🛰️",
      cond: (s, ctx) => ctx.range >= 100,
    },
    {
      id: "kilometro",
      nombre: "Kilómetro Lunar",
      desc: "Alcanza 1000 m en un solo vuelo.",
      icono: "🚀",
      cond: (s, ctx) => ctx.range >= 1000,
    },
    {
      id: "colgado",
      nombre: "Suspensión Prolongada",
      desc: "Logra un hang-time de 10 s o más.",
      icono: "⏱️",
      cond: (s, ctx) => (ctx.hangTime || 0) >= 10,
    },
    {
      id: "veterano",
      nombre: "Veterano de Cancha",
      desc: "Acumula 25 disparos.",
      icono: "🎖️",
      cond: (s) => s.totalShots >= 25,
    },
    {
      id: "bi_mundial",
      nombre: "Bi-Mundial",
      desc: "Vuela un balón en la Tierra y en la Luna.",
      icono: "🌍",
      cond: (s) => !!(s.worldsPlayed && s.worldsPlayed.earth && s.worldsPlayed.moon),
    },
    {
      id: "record",
      nombre: "Rompe-Récords",
      desc: "Bate tu récord personal de alcance.",
      icono: "🏆",
      cond: (s, ctx) => !!ctx.isRecord,
    },
    {
      id: "racha5",
      nombre: "En Racha",
      desc: "Encadena un combo de 5 disparos.",
      icono: "🔥",
      cond: (s) => s.combo >= 5,
    },
    {
      id: "reto_diario",
      nombre: "Misión del Día",
      desc: "Completa el reto diario.",
      icono: "📅",
      cond: (s) => !!(s.daily && s.daily.completado),
    },
  ];

  // ----- Catálogo de retos diarios -----
  // Se elige uno de forma determinista por fecha (mismo reto durante el día).
  const DAILY_CHALLENGES = [
    { tipo: "range", meta: 300, label: "Supera los 300 m en un disparo." },
    { tipo: "range", meta: 600, label: "Vuela un balón más de 600 m." },
    { tipo: "shots", meta: 5, label: "Ejecuta 5 saques hoy." },
    { tipo: "hangTime", meta: 8, label: "Consigue 8 s de hang-time." },
    { tipo: "combo", meta: 3, label: "Encadena un combo de 3 disparos." },
  ];

  // ----- Curva de XP por nivel -----
  // XP total acumulada necesaria para alcanzar `level`. Curva creciente suave.
  // nivel 1 = 0 XP; cada nivel pide más que el anterior.
  function xpForLevel(level) {
    if (level <= 1) return 0;
    // Curva cuadrática moderada: ~120 al nivel 2, crece de forma agradable.
    return Math.round(80 * Math.pow(level - 1, 1.6));
  }

  // Deriva el nivel a partir de la XP total acumulada.
  function levelFromXp(xp) {
    let level = 1;
    while (xpForLevel(level + 1) <= xp) level++;
    return level;
  }

  // Rango correspondiente a un nivel dado.
  function rankForLevel(level) {
    let current = RANKS[0];
    for (const r of RANKS) {
      if (level >= r.minLevel) current = r;
    }
    return current;
  }

  // ----- Utilidades de fecha -----
  // Clave de día local (YYYY-MM-DD) para anclar racha/reto diario.
  function todayKey() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  // Índice determinista (estable durante el día) para elegir el reto.
  function dailyIndexFor(key) {
    let h = 0;
    for (let i = 0; i < key.length; i++) {
      h = (h * 31 + key.charCodeAt(i)) >>> 0;
    }
    return h % DAILY_CHALLENGES.length;
  }

  // ----- Estado en memoria -----
  let state = defaultState();
  let hud = null; // referencias del HUD montado (o null si no hay)
  let overlayHost = null; // contenedor de overlays (creado perezosamente)
  let prefersReducedMotion = false;

  function defaultState() {
    return {
      xp: 0,
      level: 1,
      totalShots: 0,
      bestRange: 0,
      combo: 0,
      bestCombo: 0,
      lastShotTs: 0,
      achievements: [], // ids desbloqueados
      worldsPlayed: { earth: false, moon: false },
      daily: null, // { fecha, tipo, meta, label, progreso, completado }
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
        // Sanea sub-objetos que pudieran faltar tras una migración.
        if (!state.worldsPlayed) state.worldsPlayed = { earth: false, moon: false };
        if (!Array.isArray(state.achievements)) state.achievements = [];
      }
    } catch (_err) {
      // localStorage no disponible o corrupto: seguimos con estado por defecto.
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_err) {
      // Sin persistencia: el motor sigue funcionando en memoria.
    }
  }

  // Garantiza que el reto diario corresponde a HOY (lo regenera si cambió el día).
  function ensureDaily() {
    const key = todayKey();
    if (!state.daily || state.daily.fecha !== key) {
      const def = DAILY_CHALLENGES[dailyIndexFor(key)];
      state.daily = {
        fecha: key,
        tipo: def.tipo,
        meta: def.meta,
        label: def.label,
        progreso: 0,
        completado: false,
      };
    }
    return state.daily;
  }

  // ----- Cálculo de XP de un disparo -----
  // XP = base por alcance + bonus por record / hang-time / combo.
  function computeXp(ctx, comboAfter) {
    const range = Math.max(0, ctx.range || 0);
    // Base proporcional al alcance (1 XP por cada ~5 m), con suelo de 5 XP.
    let xp = Math.max(5, Math.round(range / 5));
    // Bonus por récord personal.
    if (ctx.isRecord) xp += 30;
    // Bonus por hang-time alto (vuelo espectacular).
    const ht = ctx.hangTime || 0;
    if (ht >= 10) xp += 25;
    else if (ht >= 6) xp += 12;
    // Bonus de combo: +10% por cada eslabón a partir del 2º (tope x2).
    const comboMult = Math.min(2, 1 + Math.max(0, comboAfter - 1) * 0.1);
    xp = Math.round(xp * comboMult);
    return xp;
  }

  // Combo: se mantiene si el disparo ocurre dentro de la ventana; si no, reinicia.
  // Ventana generosa (90 s) para no castigar al usuario que lee la telemetría.
  const COMBO_WINDOW_MS = 90 * 1000;

  // ----- API pública -----

  /** Inicializa el motor y monta/actualiza el HUD en hudMount (o #game-hud). */
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
    ensureDaily();
    save();

    const mount =
      opts.hudMount ||
      (typeof document !== "undefined" && document.getElementById("game-hud"));
    if (mount) {
      buildHud(mount);
      renderHud();
    }
    return getState();
  }

  /**
   * Procesa un disparo y devuelve el resultado de la progresión.
   * Defensivo: nunca lanza; ante datos inválidos usa valores neutros.
   */
  function onShot(ctx) {
    ctx = ctx || {};
    ensureDaily();

    const now = Date.now();
    const prevLevel = state.level;

    // --- Combo / racha ---
    if (state.lastShotTs && now - state.lastShotTs <= COMBO_WINDOW_MS) {
      state.combo = (state.combo || 0) + 1;
    } else {
      state.combo = 1;
    }
    state.lastShotTs = now;
    if (state.combo > state.bestCombo) state.bestCombo = state.combo;

    // --- Contadores básicos ---
    state.totalShots = (state.totalShots || 0) + 1;
    const range = Math.max(0, ctx.range || 0);
    if (range > state.bestRange) state.bestRange = Math.round(range);

    // Mundos jugados (para el logro Bi-Mundial).
    if (ctx.world === "earth" || ctx.world === "moon") {
      state.worldsPlayed[ctx.world] = true;
    }

    // --- XP y nivel ---
    const xpGained = computeXp(ctx, state.combo);
    state.xp = (state.xp || 0) + xpGained;
    state.level = levelFromXp(state.xp);
    const leveledUp = state.level > prevLevel;
    const rankObj = rankForLevel(state.level);

    // --- Reto diario ---
    updateDaily(ctx, range);

    // --- Logros ---
    const achievementsUnlocked = evaluateAchievements(ctx);

    save();

    // --- HUD + overlays ---
    renderHud();
    if (leveledUp) showLevelUpOverlay(state.level, rankObj);
    if (achievementsUnlocked.length) {
      // Encolamos para no solapar con el overlay de nivel.
      achievementsUnlocked.forEach((a, i) =>
        scheduleAchievementOverlay(a, (leveledUp ? 1 : 0) + i)
      );
    }

    return {
      xpGained,
      totalXp: state.xp,
      level: state.level,
      leveledUp,
      rank: rankObj.nombre,
      combo: state.combo,
      achievementsUnlocked: achievementsUnlocked.map((a) => ({
        id: a.id,
        nombre: a.nombre,
      })),
      daily: {
        meta: state.daily.meta,
        progreso: state.daily.progreso,
        completado: state.daily.completado,
      },
    };
  }

  /** Devuelve una instantánea segura (copia) del estado para terceros. */
  function getState() {
    const rankObj = rankForLevel(state.level);
    return {
      xp: state.xp,
      level: state.level,
      rank: rankObj.nombre,
      totalShots: state.totalShots,
      bestRange: state.bestRange,
      achievements: state.achievements.slice(),
      daily: state.daily
        ? {
            label: state.daily.label,
            meta: state.daily.meta,
            progreso: state.daily.progreso,
            completado: state.daily.completado,
          }
        : null,
    };
  }

  // ----- Lógica de reto diario -----
  function updateDaily(ctx, range) {
    const d = state.daily;
    if (!d || d.completado) return;
    switch (d.tipo) {
      case "range":
        // Mejor alcance del día: tomamos el máximo observado.
        d.progreso = Math.max(d.progreso, Math.round(range));
        break;
      case "shots":
        d.progreso += 1;
        break;
      case "hangTime":
        d.progreso = Math.max(d.progreso, Math.round((ctx.hangTime || 0) * 10) / 10);
        break;
      case "combo":
        d.progreso = Math.max(d.progreso, state.combo);
        break;
      default:
        break;
    }
    if (d.progreso >= d.meta) d.completado = true;
  }

  // ----- Lógica de logros -----
  function evaluateAchievements(ctx) {
    const unlocked = [];
    for (const a of ACHIEVEMENTS) {
      if (state.achievements.indexOf(a.id) !== -1) continue;
      let ok = false;
      try {
        ok = !!a.cond(state, ctx);
      } catch (_err) {
        ok = false;
      }
      if (ok) {
        state.achievements.push(a.id);
        unlocked.push(a);
      }
    }
    return unlocked;
  }

  // ================= HUD =================

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /** Construye el esqueleto del HUD dentro de `mount` (idempotente). */
  function buildHud(mount) {
    try {
      mount.innerHTML = "";
      mount.classList.add("icc-hud");

      // Fila superior: emblema de rango + nivel + combo.
      const top = el("div", "hud-top");

      const rankBox = el("div", "hud-rank");
      const emblem = el("span", "hud-emblem");
      const rankText = el("div", "hud-rank-text");
      const rankName = el("span", "hud-rank-name");
      const levelLine = el("span", "hud-level");
      rankText.append(rankName, levelLine);
      rankBox.append(emblem, rankText);

      const combo = el("div", "hud-combo");
      const comboLabel = el("span", "hud-combo-label", "Combo");
      const comboVal = el("span", "hud-combo-val", "x0");
      combo.append(comboLabel, comboVal);

      top.append(rankBox, combo);

      // Barra de XP con texto superpuesto.
      const xpWrap = el("div", "hud-xp");
      const xpBar = el("div", "hud-xp-bar");
      const xpFill = el("div", "hud-xp-fill");
      xpBar.appendChild(xpFill);
      const xpText = el("div", "hud-xp-text");
      xpWrap.append(xpBar, xpText);

      // Reto diario.
      const daily = el("div", "hud-daily");
      const dailyHead = el("div", "hud-daily-head");
      const dailyIcon = el("span", "hud-daily-icon", "🎯");
      const dailyLabel = el("span", "hud-daily-label");
      dailyHead.append(dailyIcon, dailyLabel);
      const dailyBar = el("div", "hud-daily-bar");
      const dailyFill = el("div", "hud-daily-fill");
      dailyBar.appendChild(dailyFill);
      const dailyProg = el("div", "hud-daily-prog");
      daily.append(dailyHead, dailyBar, dailyProg);

      mount.append(top, xpWrap, daily);

      hud = {
        mount,
        emblem,
        rankName,
        levelLine,
        comboVal,
        comboChip: combo,
        xpFill,
        xpText,
        rankBox,
        dailyLabel,
        dailyFill,
        dailyProg,
        daily,
      };
    } catch (_err) {
      hud = null; // si algo falla, el HUD queda inactivo sin romper nada
    }
  }

  /** Refresca todos los valores del HUD a partir del estado actual. */
  function renderHud() {
    if (!hud) return;
    try {
      const rankObj = rankForLevel(state.level);
      hud.emblem.textContent = rankObj.emblema;
      hud.rankName.textContent = rankObj.nombre;
      hud.levelLine.textContent = `Nivel ${state.level}`;
      // Marca el rango por id para tematizar el color del emblema vía CSS.
      hud.rankBox.dataset.rank = rankObj.id;

      // Progreso de XP dentro del nivel actual.
      const curBase = xpForLevel(state.level);
      const nextBase = xpForLevel(state.level + 1);
      const span = Math.max(1, nextBase - curBase);
      const into = Math.max(0, state.xp - curBase);
      const pct = Math.max(0, Math.min(100, (into / span) * 100));
      hud.xpFill.style.width = `${pct}%`;
      hud.xpText.textContent = `${into} / ${span} XP`;

      // Combo.
      hud.comboVal.textContent = `x${state.combo || 0}`;
      hud.comboChip.classList.toggle("is-hot", (state.combo || 0) >= 3);

      // Reto diario.
      const d = state.daily;
      if (d) {
        hud.dailyLabel.textContent = d.label;
        const dpct = Math.max(0, Math.min(100, (d.progreso / d.meta) * 100));
        hud.dailyFill.style.width = `${dpct}%`;
        hud.dailyProg.textContent = d.completado
          ? "¡Completado! ✓"
          : `${d.progreso} / ${d.meta}`;
        hud.daily.classList.toggle("is-done", !!d.completado);
      }
    } catch (_err) {
      // Un fallo de render nunca debe afectar al simulador.
    }
  }

  // ================= Overlays =================

  function ensureOverlayHost() {
    if (overlayHost && document.body.contains(overlayHost)) return overlayHost;
    if (typeof document === "undefined" || !document.body) return null;
    overlayHost = el("div", "icc-overlays");
    overlayHost.setAttribute("aria-live", "polite");
    document.body.appendChild(overlayHost);
    return overlayHost;
  }

  // Duración de permanencia de un overlay (acortada con reduce-motion).
  function overlayDuration() {
    return prefersReducedMotion ? 1400 : 2600;
  }

  function showLevelUpOverlay(level, rankObj) {
    const host = ensureOverlayHost();
    if (!host) return;
    const card = el("div", "icc-overlay icc-overlay--level");
    card.setAttribute("role", "status");

    const halo = el("div", "ovl-halo");
    const kicker = el("div", "ovl-kicker", "ASCENSO");
    const title = el("div", "ovl-title", `Nivel ${level}`);
    const sub = el("div", "ovl-sub", `Rango: ${rankObj.emblema} ${rankObj.nombre}`);
    card.append(halo, kicker, title, sub);

    presentOverlay(host, card);
  }

  function scheduleAchievementOverlay(achievement, slot) {
    // Escalona la aparición para que no se solapen varios overlays.
    const delay = slot * (prefersReducedMotion ? 400 : 700);
    setTimeout(() => showAchievementOverlay(achievement), delay);
  }

  function showAchievementOverlay(a) {
    const host = ensureOverlayHost();
    if (!host) return;
    const card = el("div", "icc-overlay icc-overlay--ach");
    card.setAttribute("role", "status");

    const icon = el("div", "ovl-ach-icon", a.icono || "🏅");
    const body = el("div", "ovl-ach-body");
    const kicker = el("div", "ovl-kicker", "LOGRO DESBLOQUEADO");
    const name = el("div", "ovl-ach-name", a.nombre);
    const desc = el("div", "ovl-ach-desc", a.desc || "");
    body.append(kicker, name, desc);
    card.append(icon, body);

    presentOverlay(host, card);
  }

  // Inserta el overlay, dispara la animación de entrada y lo retira al final.
  function presentOverlay(host, card) {
    try {
      host.appendChild(card);
      // Reflow para garantizar la transición de entrada.
      void card.offsetWidth;
      card.classList.add("show");

      const stay = overlayDuration();
      setTimeout(() => {
        card.classList.remove("show");
        card.classList.add("hide");
        setTimeout(() => {
          if (card.parentNode) card.parentNode.removeChild(card);
        }, 500);
      }, stay);
    } catch (_err) {
      // Si el overlay falla, lo ignoramos: la progresión ya quedó guardada.
    }
  }

  // ----- Exposición global -----
  window.ICCGame = {
    init,
    onShot,
    getState,
    // Expuesto para pruebas/depuración (no forma parte del contrato mínimo).
    _RANKS: RANKS,
    _ACHIEVEMENTS: ACHIEVEMENTS.map((a) => ({ id: a.id, nombre: a.nombre })),
  };
})();
