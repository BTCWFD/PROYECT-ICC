/**
 * simulator.js — Renderizado del simulador sobre <canvas>.
 *
 * Dibuja la escena (cielo, superficie, robot L-Striker, balón y estela) y
 * anima la trayectoria calculada por physics.js. Escala automáticamente el
 * mundo para que el disparo completo quepa en el lienzo.
 */

class Simulator {
  constructor(canvas) {
    this.ctx = canvas.getContext("2d");
    this.W = canvas.width;
    this.H = canvas.height;
    this.groundY = this.H - 60;      // línea de suelo en píxeles
    this.originX = 90;               // posición horizontal del robot
    this.scale = 4;                  // píxeles por metro (se recalcula)
    this.anim = null;
    this.onProgress = null;          // callback(point) durante la animación
  }

  /** Ajusta la escala para que la trayectoria entre completa con margen. */
  fit(trajectory, ghost) {
    const all = [trajectory, ghost].filter(Boolean);
    const maxX = Math.max(...all.map((t) => t.range), 10);
    const maxY = Math.max(...all.map((t) => t.maxHeight), 5);
    const usableW = this.W - this.originX - 40;
    const usableH = this.groundY - 40;
    this.scale = Math.min(usableW / maxX, usableH / maxY);
  }

  toPx(p) {
    return {
      x: this.originX + p.x * this.scale,
      y: this.groundY - p.y * this.scale,
    };
  }

  clear(world) {
    const { ctx } = this;
    ctx.fillStyle = world.sky;
    ctx.fillRect(0, 0, this.W, this.H);

    // Estrellas (deterministas para no parpadear).
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (let i = 0; i < 70; i++) {
      const sx = (i * 137.5) % this.W;
      const sy = (i * 71.3) % (this.groundY - 20);
      ctx.fillRect(sx, sy, 1.2, 1.2);
    }

    // Tierra en el cielo si estamos en la Luna.
    if (world.name === "Luna") {
      ctx.beginPath();
      ctx.arc(this.W - 90, 80, 26, 0, Math.PI * 2);
      ctx.fillStyle = "#3b6fb5";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.W - 84, 74, 10, 0, Math.PI * 2);
      ctx.fillStyle = "#56d07a";
      ctx.fill();
    }

    // Superficie.
    ctx.fillStyle = world.surface;
    ctx.fillRect(0, this.groundY, this.W, this.H - this.groundY);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.moveTo(0, this.groundY);
    ctx.lineTo(this.W, this.groundY);
    ctx.stroke();
  }

  /** Dibuja una regla de distancia sobre el suelo. */
  drawRuler(range) {
    const { ctx } = this;
    const stepMeters = niceStep(range);
    ctx.fillStyle = "rgba(232,238,252,0.5)";
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    for (let m = 0; m <= range + stepMeters; m += stepMeters) {
      const px = this.originX + m * this.scale;
      if (px > this.W - 10) break;
      ctx.fillRect(px, this.groundY, 1, 6);
      ctx.fillText(`${m} m`, px, this.groundY + 20);
    }
    ctx.textAlign = "start";
  }

  /** Robot L-Striker estilizado. */
  drawRobot() {
    const { ctx } = this;
    const x = this.originX - 26;
    const y = this.groundY;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#cfd8ea";
    ctx.strokeStyle = "#5b8cff";
    ctx.lineWidth = 2;
    // Piernas digitígradas (invertidas, como resorte).
    ctx.beginPath();
    ctx.moveTo(4, 0); ctx.lineTo(10, -16); ctx.lineTo(4, -30);
    ctx.moveTo(18, 0); ctx.lineTo(12, -16); ctx.lineTo(18, -30);
    ctx.stroke();
    // Torso.
    ctx.fillRect(4, -52, 14, 24);
    // Cabeza con sensor óptico.
    ctx.fillRect(6, -66, 10, 12);
    ctx.fillStyle = "#ffd35b";
    ctx.fillRect(9, -62, 4, 4);
    ctx.restore();
  }

  drawTrail(points, count, color, dashed) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = dashed ? 1.5 : 2.5;
    if (dashed) ctx.setLineDash([5, 6]);
    ctx.globalAlpha = dashed ? 0.5 : 1;
    ctx.beginPath();
    const n = Math.min(count, points.length);
    for (let i = 0; i < n; i++) {
      const p = this.toPx(points[i]);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawBall(point, color) {
    const { ctx } = this;
    const p = this.toPx(point);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** Renderiza un fotograma completo. */
  render(world, trajectory, frame, ghost) {
    this.clear(world);
    this.drawRuler(trajectory.range);
    this.drawRobot();
    if (ghost) this.drawTrail(ghost.points, ghost.points.length, ghost.color, true);
    this.drawTrail(trajectory.points, frame, world.trail, false);
    const idx = Math.min(frame, trajectory.points.length) - 1;
    if (idx >= 0) this.drawBall(trajectory.points[idx], world.ball);
  }

  /** Anima el disparo. Llama a onProgress con el punto actual. */
  animate(world, trajectory, ghost) {
    cancelAnimationFrame(this.anim);
    this.fit(trajectory, ghost);
    let frame = 1;
    const total = trajectory.points.length;
    const stepsPerFrame = Math.max(1, Math.floor(total / 180)); // ~3 s de animación

    const tick = () => {
      this.render(world, trajectory, frame, ghost);
      if (this.onProgress) {
        const idx = Math.min(frame, total) - 1;
        this.onProgress(trajectory.points[idx]);
      }
      if (frame < total) {
        frame += stepsPerFrame;
        this.anim = requestAnimationFrame(tick);
      } else {
        this.render(world, trajectory, total, ghost);
      }
    };
    tick();
  }

  /** Dibuja el estado inicial en reposo. */
  idle(world) {
    cancelAnimationFrame(this.anim);
    this.clear(world);
    this.drawRobot();
    this.drawBall({ x: 0, y: 0 }, world.ball);
  }
}

/** Devuelve un paso de regla "redondo" (1,2,5 × 10ⁿ) cercano a range/8. */
function niceStep(range) {
  const raw = Math.max(range / 8, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return step * mag;
}

window.Simulator = Simulator;
