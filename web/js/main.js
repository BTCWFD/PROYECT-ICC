/**
 * main.js — Cableado de la interfaz del simulador.
 *
 * Conecta los controles (club, mundo, potencia, ángulo, toggles) con el motor
 * de física y el renderizador, y actualiza la telemetría en pantalla.
 *
 * Incorpora el "Modo Control de Supervisión": concepto central del whitepaper
 * de la ICC. Al operar un robot en la Luna desde la Tierra, las señales sufren
 * una latencia de ida y vuelta (RTT) de ~3 s. En este modo, al patear el
 * operador envía una INTENCIÓN y debe esperar esa cuenta regresiva antes de que
 * el robot ejecute el disparo.
 *
 * Además integra (con degradación elegante) la API gestionada de Azure
 * Functions para registrar disparos y mostrar un Top 5 de clasificatorias.
 */

(function () {
  const { WORLDS, computeTrajectory } = window.ICCPhysics;
  const canvas = document.getElementById("sim");
  const sim = new window.Simulator(canvas);

  // Latencia de ida y vuelta Tierra-Luna simulada (ms). ~3 s según whitepaper.
  const SUPERVISION_RTT_MS = 3000;

  // URL base relativa de la API gestionada (Azure Static Web Apps expone /api).
  const API_BASE = "/api";

  // Estado de la UI.
  const state = {
    club: "",
    world: "moon",
    power: 75,
    angle: 35,
    airResistance: false,
    ghost: true,
    supervision: false,
  };

  // Bandera de bloqueo: evita disparos dobles mientras hay un envío en curso.
  let sending = false;
  // Temporizadores activos del modo supervisión (para poder cancelarlos).
  let latencyRaf = null;
  let latencyTimeout = null;

  // Referencias del DOM.
  const els = {
    club: document.getElementById("club"),
    worldBtns: document.querySelectorAll("#world button"),
    power: document.getElementById("power"),
    powerVal: document.getElementById("powerVal"),
    angle: document.getElementById("angle"),
    angleVal: document.getElementById("angleVal"),
    airResistance: document.getElementById("airResistance"),
    ghost: document.getElementById("ghost"),
    supervision: document.getElementById("supervision"),
    kick: document.getElementById("kick"),
    reset: document.getElementById("reset"),
    // Botón de sonido (mute) de los SFX.
    sfxToggle: document.getElementById("sfxToggle"),
    status: document.getElementById("status"),
    mRange: document.getElementById("mRange"),
    mHeight: document.getElementById("mHeight"),
    mTime: document.getElementById("mTime"),
    mGravity: document.getElementById("mGravity"),
    // Indicador de latencia.
    latency: document.getElementById("latency"),
    latencyCount: document.getElementById("latencyCount"),
    latencyFill: document.getElementById("latencyFill"),
    // Clasificatorias.
    leaderboard: document.getElementById("leaderboard"),
    leaderboardList: document.getElementById("leaderboardList"),
    // Lienzo (para la sacudida de impacto).
    sim: canvas,
  };

  // Etiqueta original del botón de saque (para restaurarla tras el vuelo).
  const KICK_LABEL = els.kick.textContent;

  // ----- Overlay de celebración (clímax del disparo) -----
  // Se construye dinámicamente y se superpone al lienzo dentro de .stage.
  const stage = canvas.closest(".stage");
  const celebration = document.createElement("div");
  celebration.className = "shot-celebration";
  celebration.setAttribute("aria-hidden", "true");
  celebration.innerHTML =
    '<span class="celebration-kicker">Operación Primer Toque</span>' +
    '<h2 class="celebration-title"></h2>' +
    '<div class="celebration-range"></div>' +
    '<div class="celebration-club"></div>' +
    '<div class="celebration-record" hidden>★ Nuevo récord personal</div>' +
    '<button id="share" class="share-btn" type="button">📣 Compartir mi hazaña</button>';
  stage.appendChild(celebration);
  els.celebration = celebration;
  els.celebTitle = celebration.querySelector(".celebration-title");
  els.celebRange = celebration.querySelector(".celebration-range");
  els.celebClub = celebration.querySelector(".celebration-club");
  els.celebRecord = celebration.querySelector(".celebration-record");
  els.share = celebration.querySelector("#share");
  // Referencias de los estados del leaderboard (vacío / error).
  els.leaderboardEmpty = document.getElementById("leaderboardEmpty");
  els.leaderboardError = document.getElementById("leaderboardError");

  // Datos del último disparo (para la tarjeta compartible y los eventos).
  let lastShot = null;
  // Bandera: el evento club_named se emite solo la primera vez que hay club.
  let clubNamedTracked = false;

  /** Envuelve ICCAnalytics.track de forma segura (nunca rompe la UX). */
  function track(event, props) {
    try {
      if (window.ICCAnalytics && typeof window.ICCAnalytics.track === "function") {
        window.ICCAnalytics.track(event, props);
      }
    } catch (_err) {
      /* la analítica jamás interrumpe el simulador */
    }
  }

  // ----- Integración de AUDIO (ICCSfx) — degradación elegante -----
  // Si js/sfx.js no se cargó (window.ICCSfx ausente), sfx() es un no-op y nada
  // se rompe. El AudioContext es perezoso (se activa en el primer gesto).
  /** Reproduce un efecto sintetizado por nombre de forma segura. */
  function sfx(name) {
    try {
      if (window.ICCSfx && typeof window.ICCSfx.play === "function") {
        window.ICCSfx.play(name);
      }
    } catch (_err) {
      /* el audio jamás interrumpe el simulador */
    }
  }

  // ----- Integración de PROGRESIÓN (ICCGame) — degradación elegante -----
  /** Procesa un disparo en el motor de juego; devuelve su resultado o null. */
  function gameOnShot(payload) {
    try {
      if (window.ICCGame && typeof window.ICCGame.onShot === "function") {
        return window.ICCGame.onShot(payload);
      }
    } catch (_err) {
      /* la progresión jamás interrumpe el simulador */
    }
    return null;
  }

  function trajectoryFor(worldKey, { withGhostColor } = {}) {
    const world = WORLDS[worldKey];
    const traj = computeTrajectory({
      gravity: world.gravity,
      speed: state.power,
      angleDeg: state.angle,
      airResistance: state.airResistance && world.hasAtmosphere,
    });
    if (withGhostColor) traj.color = world.trail;
    return traj;
  }

  function setMetrics({ range, maxHeight, flightTime }) {
    els.mRange.textContent = `${range.toFixed(1)} m`;
    els.mHeight.textContent = `${maxHeight.toFixed(1)} m`;
    els.mTime.textContent = `${flightTime.toFixed(2)} s`;
    els.mGravity.textContent = `${WORLDS[state.world].gravity.toFixed(2)} m/s²`;
  }

  function ghostTrajectory() {
    if (!state.ghost) return null;
    const other = state.world === "moon" ? "earth" : "moon";
    return trajectoryFor(other, { withGhostColor: true });
  }

  /**
   * Ejecuta físicamente el disparo: calcula la trayectoria, anima y actualiza
   * la telemetría. Es la lógica de disparo "inmediata" original, reutilizada
   * tanto en modo directo como tras la latencia del modo supervisión.
   */
  function executeShot() {
    const world = WORLDS[state.world];
    const traj = trajectoryFor(state.world);
    const ghost = ghostTrajectory();

    // Analítica: disparo ejecutado (sin PII, solo parámetros de juego).
    track("shot_executed", {
      world: state.world,
      power: state.power,
      angle: state.angle,
    });

    // Audio: golpe al balón en el momento del saque y silbido del vuelo.
    sfx("kick");
    sfx("whoosh");

    // Bloqueo + feedback en el botón mientras el balón está en vuelo.
    setSending(true);
    els.kick.textContent = "Volando…";
    els.status.textContent = "El L-Striker conecta. El balón surca el vacío lunar…";

    // Count-up del alcance en vivo durante el vuelo.
    sim.onProgress = (p) => {
      if (p) els.mRange.textContent = `${p.x.toFixed(0)} m`;
    };

    sim.animate(world, traj, ghost, {
      onImpact: () => {
        // Audio: aterrizaje del balón en el momento del impacto.
        sfx("impact");
        // Sacudida del visor y destello de la métrica de alcance.
        els.sim.classList.remove("shake");
        void els.sim.offsetWidth; // reinicia la animación
        els.sim.classList.add("shake");
        els.mRange.classList.remove("flash");
        void els.mRange.offsetWidth;
        els.mRange.classList.add("flash");
      },
      onComplete: () => {
        setMetrics(traj);
        setSending(false);
        els.kick.textContent = KICK_LABEL;

        const compare =
          state.world === "moon"
            ? ` Seis veces más lejos que en la Tierra (~${(ghost ? ghost.range : trajectoryFor("earth").range).toFixed(0)} m).`
            : "";
        els.status.textContent =
          `Vuelo lunar de ${traj.range.toFixed(0)} m en ${traj.flightTime.toFixed(1)} s.${compare}`;

        celebrate(traj);
      },
    });

    // Intento de integración con la API (no bloquea ni rompe el simulador).
    submitShot(traj);
  }

  // Récord personal de alcance (persistente en el navegador).
  function getRecord() {
    return Number(localStorage.getItem("icc_record") || 0);
  }

  /** Muestra el overlay de celebración con un hito acorde al alcance. */
  function celebrate(traj) {
    const range = traj.range;
    const prevRecord = getRecord();
    const isRecord = range > prevRecord;
    if (isRecord) localStorage.setItem("icc_record", String(Math.round(range)));

    let title;
    if (range >= 300) title = "¡HAZAÑA HISTÓRICA!";
    else if (range >= 100) title = "¡Vuelo orbital!";
    else title = "Saque registrado";

    const club = (state.club || "").trim();
    els.celebTitle.textContent = title;
    els.celebRange.textContent = `${range.toFixed(0)} m`;
    els.celebClub.textContent = club ? `${club} · L-Striker 01` : "L-Striker 01";
    els.celebRecord.hidden = !isRecord;

    // Guarda el último disparo para la tarjeta compartible y el botón #share.
    lastShot = {
      club,
      world: state.world,
      range: Math.round(range),
      milestone: title,
    };

    // Analítica: hito alcanzado (vuelo orbital / hazaña histórica).
    if (range >= 100) {
      track("milestone_reached", {
        world: state.world,
        range: Math.round(range),
        milestone: title,
      });
    }
    // Analítica: récord personal batido.
    if (isRecord && prevRecord > 0) {
      track("record_beaten", {
        world: state.world,
        range: Math.round(range),
        previous: Math.round(prevRecord),
      });
    }

    // Audio: fanfarria de récord (solo si supera una marca previa real).
    if (isRecord && prevRecord > 0) sfx("record");

    // ----- Progresión (ICCGame): procesa el disparo tras el impacto -----
    // Le pasamos el resultado físico ya conocido; el motor calcula XP, nivel,
    // rango, combo, logros y reto diario, actualiza su HUD y muestra sus
    // propios overlays (nivel/logro). Aquí solo sonorizamos esos hitos.
    const gameResult = gameOnShot({
      range: Math.round(range),
      world: state.world,
      hangTime: Number(traj.flightTime.toFixed(2)),
      power: state.power,
      angle: state.angle,
      club,
      isRecord,
    });
    if (gameResult) {
      // Audio: subida de nivel y desbloqueo de logros (si los hubo).
      if (gameResult.leveledUp) sfx("levelup");
      if (
        Array.isArray(gameResult.achievementsUnlocked) &&
        gameResult.achievementsUnlocked.length
      ) {
        sfx("achievement");
      }
    }

    els.celebration.classList.remove("show");
    void els.celebration.offsetWidth;
    els.celebration.classList.add("show");
  }

  /** Activa/desactiva el botón de patear según haya un envío en curso. */
  function setSending(value) {
    sending = value;
    els.kick.disabled = value;
  }

  /**
   * Muestra la cuenta regresiva de latencia RTT y ejecuta el disparo al final.
   * Robusto: no permite reentradas (sending) y deshabilita el botón.
   */
  function kickWithSupervision() {
    setSending(true);
    els.latency.hidden = false;
    els.status.textContent =
      "Intención de saque transmitida desde el Centro de Control en la Tierra. Propagando señal…";

    const start = performance.now();

    const tick = (now) => {
      const elapsed = now - start;
      const remaining = Math.max(0, SUPERVISION_RTT_MS - elapsed);
      const pct = Math.min(100, (elapsed / SUPERVISION_RTT_MS) * 100);
      els.latencyCount.textContent = `${(remaining / 1000).toFixed(1)} s`;
      els.latencyFill.style.width = `${pct}%`;
      if (remaining > 0) {
        latencyRaf = requestAnimationFrame(tick);
      }
    };
    latencyRaf = requestAnimationFrame(tick);

    latencyTimeout = setTimeout(() => {
      cancelAnimationFrame(latencyRaf);
      els.latencyCount.textContent = "0.0 s";
      els.latencyFill.style.width = "100%";
      els.latency.hidden = true;
      els.latencyFill.style.width = "0%";
      setSending(false);
      executeShot();
    }, SUPERVISION_RTT_MS);
  }

  /** Punto de entrada del botón "¡Patear!". */
  function kick() {
    if (sending) return; // bloqueo anti doble disparo
    if (state.supervision) {
      kickWithSupervision();
    } else {
      executeShot();
    }
  }

  function refreshIdle() {
    sim.idle(WORLDS[state.world]);
    setMetrics(trajectoryFor(state.world));
  }

  // ----- Integración con la API (degradación elegante) -----

  /**
   * Registra el disparo en la API y refresca el Top 5. Todo va envuelto en
   * try/catch: si la API no responde (p. ej. abierto como file://), se ignora
   * silenciosamente y el simulador sigue funcionando con normalidad.
   */
  async function submitShot(traj) {
    const club = (state.club || "").trim();
    if (!club) return; // sin club no hay clasificatoria que registrar

    try {
      await fetch(`${API_BASE}/shots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          club,
          world: state.world,
          power: state.power,
          angle: state.angle,
          // El servidor RECALCULA range/hangTime con esta bandera (anti-trampas);
          // los enviamos por compatibilidad pero el servidor usa los suyos.
          airResistance: state.airResistance && WORLDS[state.world].hasAtmosphere,
          range: Number(traj.range.toFixed(2)),
          hangTime: Number(traj.flightTime.toFixed(2)),
        }),
      });
    } catch (_err) {
      // API no disponible: degradación elegante, no rompemos nada.
      return;
    }

    refreshLeaderboard();
  }

  /**
   * Obtiene y pinta el Top 5 de clasificatorias. En vez de ocultarse, muestra
   * estados claros: vacío (aún sin disparos) o error discreto (API no responde).
   * El panel permanece siempre visible para no romper el layout.
   */
  async function refreshLeaderboard() {
    try {
      const res = await fetch(`${API_BASE}/leaderboard`);
      if (!res.ok) throw new Error("respuesta no OK");
      const data = await res.json();
      const entries = Array.isArray(data.entries) ? data.entries.slice(0, 5) : [];
      renderLeaderboard(entries);
    } catch (_err) {
      // API no disponible (p. ej. file://): estado de error discreto, sin ocultar.
      els.leaderboardList.innerHTML = "";
      if (els.leaderboardEmpty) els.leaderboardEmpty.hidden = true;
      if (els.leaderboardError) els.leaderboardError.hidden = false;
    }
  }

  function renderLeaderboard(entries) {
    // Sin entradas: mostramos el estado vacío invitando a participar.
    if (!entries.length) {
      els.leaderboardList.innerHTML = "";
      if (els.leaderboardError) els.leaderboardError.hidden = true;
      if (els.leaderboardEmpty) els.leaderboardEmpty.hidden = false;
      return;
    }
    // Hay entradas: ocultamos estados vacío/error y pintamos la lista.
    if (els.leaderboardEmpty) els.leaderboardEmpty.hidden = true;
    if (els.leaderboardError) els.leaderboardError.hidden = true;
    els.leaderboardList.innerHTML = "";
    entries.forEach((e) => {
      const li = document.createElement("li");

      const club = document.createElement("span");
      club.className = "lb-club";
      club.textContent = e.club;

      const world = document.createElement("span");
      world.className = "lb-world";
      world.textContent = e.world === "earth" ? "🌍" : "🌕";

      const range = document.createElement("span");
      range.className = "lb-range";
      range.textContent = `${Number(e.range).toFixed(0)} m`;

      li.append(club, world, range);
      els.leaderboardList.appendChild(li);
    });
  }

  // ----- Eventos -----
  els.club.addEventListener("input", () => {
    state.club = els.club.value;
    // Analítica: primera vez que el usuario nombra su club (sin enviar el nombre).
    if (!clubNamedTracked && els.club.value.trim()) {
      clubNamedTracked = true;
      track("club_named");
    }
  });

  // Botón "Compartir mi hazaña": genera la tarjeta del último disparo.
  els.share.addEventListener("click", () => {
    track("share_clicked", lastShot ? { world: lastShot.world } : {});
    const data = lastShot || {
      club: (state.club || "").trim(),
      world: state.world,
      range: 0,
      milestone: "",
    };
    try {
      if (window.ICCShare && typeof window.ICCShare.shareFeat === "function") {
        window.ICCShare.shareFeat(data);
      }
    } catch (_err) {
      /* compartir nunca rompe la UX */
    }
  });

  els.worldBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.world = btn.dataset.world;
      els.worldBtns.forEach((b) => {
        const active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-checked", String(active));
      });
      refreshIdle();
      els.status.textContent = `Mundo seleccionado: ${WORLDS[state.world].name}. Listo para patear.`;
    });
  });

  els.power.addEventListener("input", () => {
    state.power = Number(els.power.value);
    els.powerVal.textContent = state.power;
  });

  els.angle.addEventListener("input", () => {
    state.angle = Number(els.angle.value);
    els.angleVal.textContent = state.angle;
  });

  els.airResistance.addEventListener("change", () => {
    state.airResistance = els.airResistance.checked;
  });

  els.ghost.addEventListener("change", () => {
    state.ghost = els.ghost.checked;
  });

  els.supervision.addEventListener("change", () => {
    state.supervision = els.supervision.checked;
    els.status.textContent = state.supervision
      ? "Modo Control de Supervisión activado: cada saque sufrirá ~3 s de latencia Tierra-Luna."
      : "Modo directo: los saques se ejecutan de inmediato.";
  });

  els.kick.addEventListener("click", () => {
    // Sonido de interfaz al pulsar la acción principal (antes del bloqueo).
    if (!sending) sfx("ui");
    kick();
  });
  els.reset.addEventListener("click", () => {
    sfx("ui");
    // Cancelar cualquier cuenta regresiva de latencia en curso.
    cancelAnimationFrame(latencyRaf);
    clearTimeout(latencyTimeout);
    els.latency.hidden = true;
    els.latencyFill.style.width = "0%";
    els.celebration.classList.remove("show");
    els.kick.textContent = KICK_LABEL;
    setSending(false);
    refreshIdle();
    els.status.textContent = "Robot L-Striker en posición. Listo para el primer toque.";
  });

  // ----- Inicialización del motor de progresión (ICCGame) -----
  // Monta el HUD de juego sobre el lienzo. Defensivo: si ICCGame no existe,
  // simplemente no se monta nada y el simulador funciona igual.
  (function initGame() {
    try {
      if (window.ICCGame && typeof window.ICCGame.init === "function") {
        // game.js espera un ELEMENTO en hudMount (no un id). Pasamos el nodo
        // real; si no existe, ICCGame.init recurre a #game-hud por defecto.
        window.ICCGame.init({ hudMount: document.getElementById("game-hud") });
      }
    } catch (_err) {
      /* la progresión jamás interrumpe el simulador */
    }
  })();

  // ----- Toggle de sonido (ICCSfx) -----
  // Sincroniza el aspecto del botón con el estado real de ICCSfx. Si el módulo
  // de audio no existe, ocultamos el botón para no ofrecer un control inerte.
  (function initSfxToggle() {
    const btn = els.sfxToggle;
    if (!btn) return;
    const hasSfx =
      window.ICCSfx &&
      typeof window.ICCSfx.setMuted === "function" &&
      typeof window.ICCSfx.isMuted === "function";
    if (!hasSfx) {
      btn.hidden = true; // sin audio disponible: no mostramos el control
      return;
    }
    // Refleja el estado de silencio en el icono y la accesibilidad.
    const sync = () => {
      let muted = false;
      try {
        muted = !!window.ICCSfx.isMuted();
      } catch (_err) {
        muted = false;
      }
      btn.textContent = muted ? "🔇" : "🔊";
      btn.setAttribute("aria-pressed", String(muted));
      btn.setAttribute("aria-label", muted ? "Activar el sonido" : "Silenciar el sonido");
      btn.classList.toggle("is-muted", muted);
    };
    btn.addEventListener("click", () => {
      try {
        const next = !window.ICCSfx.isMuted();
        window.ICCSfx.setMuted(next);
        // Pequeño feedback audible solo al ACTIVAR (no al silenciar).
        if (!next) sfx("ui");
      } catch (_err) {
        /* el toggle jamás rompe la UX */
      }
      sync();
    });
    sync();
  })();

  // Estado inicial.
  refreshIdle();
  // Carga inicial del Top 5 (si la API está disponible).
  refreshLeaderboard();
  // Analítica: vista de página al cargar.
  track("page_view");
})();
