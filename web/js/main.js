/**
 * main.js — Cableado de la interfaz del simulador.
 *
 * Conecta los controles (mundo, potencia, ángulo, toggles) con el motor de
 * física y el renderizador, y actualiza la telemetría en pantalla.
 */

(function () {
  const { WORLDS, computeTrajectory } = window.ICCPhysics;
  const canvas = document.getElementById("sim");
  const sim = new window.Simulator(canvas);

  // Estado de la UI.
  const state = {
    world: "moon",
    power: 75,
    angle: 35,
    airResistance: false,
    ghost: true,
  };

  // Referencias del DOM.
  const els = {
    worldBtns: document.querySelectorAll("#world button"),
    power: document.getElementById("power"),
    powerVal: document.getElementById("powerVal"),
    angle: document.getElementById("angle"),
    angleVal: document.getElementById("angleVal"),
    airResistance: document.getElementById("airResistance"),
    ghost: document.getElementById("ghost"),
    kick: document.getElementById("kick"),
    reset: document.getElementById("reset"),
    status: document.getElementById("status"),
    mRange: document.getElementById("mRange"),
    mHeight: document.getElementById("mHeight"),
    mTime: document.getElementById("mTime"),
    mGravity: document.getElementById("mGravity"),
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

  function kick() {
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
  }

  function refreshIdle() {
    sim.idle(WORLDS[state.world]);
    setMetrics(trajectoryFor(state.world));
  }

  // ----- Eventos -----
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

  els.kick.addEventListener("click", kick);
  els.reset.addEventListener("click", () => {
    refreshIdle();
    els.status.textContent = "Reiniciado. Listo para el saque inicial interplanetario.";
  });

  // Estado inicial.
  refreshIdle();
})();
