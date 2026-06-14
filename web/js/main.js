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
  };

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
    setMetrics(traj);

    sim.onProgress = (p) => {
      if (p) {
        els.mRange.textContent = `${p.x.toFixed(1)} m`;
      }
    };
    sim.animate(world, traj, ghost);

    const compare =
      state.world === "moon"
        ? `En la Tierra ese mismo disparo llegaría a ~${(ghost ? ghost.range : trajectoryFor("earth").range).toFixed(0)} m.`
        : "";
    els.status.textContent =
      `¡Saque ejecutado en ${world.name}! Alcance: ${traj.range.toFixed(0)} m · vuelo: ${traj.flightTime.toFixed(1)} s. ${compare}`;

    // Restaurar la métrica final tras la animación.
    setTimeout(() => setMetrics(traj), 200 + 16);

    // Intento de integración con la API (no bloquea ni rompe el simulador).
    submitShot(traj);
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

  /** Obtiene y pinta el Top 5 de clasificatorias. Oculta el panel si falla. */
  async function refreshLeaderboard() {
    try {
      const res = await fetch(`${API_BASE}/leaderboard`);
      if (!res.ok) throw new Error("respuesta no OK");
      const data = await res.json();
      const entries = Array.isArray(data.entries) ? data.entries.slice(0, 5) : [];
      renderLeaderboard(entries);
    } catch (_err) {
      // API no disponible: ocultamos la sección sin molestar al usuario.
      els.leaderboard.hidden = true;
    }
  }

  function renderLeaderboard(entries) {
    if (!entries.length) {
      els.leaderboard.hidden = true;
      return;
    }
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
    els.leaderboard.hidden = false;
  }

  // ----- Eventos -----
  els.club.addEventListener("input", () => {
    state.club = els.club.value;
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

  els.kick.addEventListener("click", kick);
  els.reset.addEventListener("click", () => {
    // Cancelar cualquier cuenta regresiva de latencia en curso.
    cancelAnimationFrame(latencyRaf);
    clearTimeout(latencyTimeout);
    els.latency.hidden = true;
    els.latencyFill.style.width = "0%";
    setSending(false);
    refreshIdle();
    els.status.textContent = "Reiniciado. Listo para el saque inicial interplanetario.";
  });

  // Estado inicial.
  refreshIdle();
  // Carga inicial del Top 5 (si la API está disponible).
  refreshLeaderboard();
})();
