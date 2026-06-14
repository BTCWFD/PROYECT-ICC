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
    this.particles = [];             // polvo lunar (regolito)
    this.rings = [];                 // anillos de impacto
    // Respeta la preferencia de movimiento reducido del sistema (a11y).
    this.reduceMotion = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
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
    const n = Math.min(count, points.length);
    if (dashed) {
      // Trayectoria fantasma del otro mundo: línea discontinua tenue.
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 6]);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const p = this.toPx(points[i]);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    // Estela viva: se afina y aclara hacia el origen (sensación de velocidad).
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = color;
    for (let i = 1; i < n; i++) {
      const a = this.toPx(points[i - 1]);
      const b = this.toPx(points[i]);
      const t = i / n;
      ctx.globalAlpha = 0.15 + 0.85 * t;
      ctx.lineWidth = 0.5 + 3 * t;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBall(point, color) {
    const { ctx } = this;
    const p = this.toPx(point);
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** Genera polvo lunar (regolito) en un punto. gravityScale ajusta la caída. */
  spawnDust(xPx, yPx, count, gravityScale) {
    for (let i = 0; i < count; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const speed = 0.6 + Math.random() * 2.2;
      this.particles.push({
        x: xPx, y: yPx,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: 1,
        decay: 0.012 + Math.random() * 0.02,
        g: 0.05 * gravityScale,
        r: 1 + Math.random() * 1.8,
      });
    }
  }

  /** Anillo de impacto expansivo al aterrizar el balón. */
  spawnImpact(xPx, yPx, color) {
    this.rings.push({ x: xPx, y: yPx, r: 4, life: 1, color });
  }

  updateEffects() {
    this.particles.forEach((p) => {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
    });
    this.particles = this.particles.filter((p) => p.life > 0 && p.y < this.groundY + 4);
    this.rings.forEach((r) => { r.r += 1.6; r.life -= 0.05; });
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  drawEffects() {
    const { ctx } = this;
    ctx.save();
    this.particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life) * 0.8;
      ctx.fillStyle = "#d9dde6";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    this.rings.forEach((r) => {
      ctx.globalAlpha = Math.max(0, r.life) * 0.6;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
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
    this.drawEffects();
  }

  /**
   * Anima el disparo de forma cinematográfica:
   *  - Avance por tiempo real (delta-time), no por fotogramas fijos.
   *  - Cámara lenta cerca del ápice para resaltar el "hang-time" lunar.
   *  - Polvo lunar al patear y anillo de impacto al aterrizar.
   * Respeta prefers-reduced-motion: muestra el resultado al instante.
   *
   * @param {object} opts { onImpact?:fn, onComplete?:fn }
   */
  animate(world, trajectory, ghost, opts = {}) {
    cancelAnimationFrame(this.anim);
    this.fit(trajectory, ghost);
    this.particles = [];
    this.rings = [];
    const total = trajectory.points.length;
    const gScale = world.gravity / 9.81;

    // Índice del ápice (altura máxima) para la cámara lenta.
    let apexIdx = 0, maxY = -1;
    for (let i = 0; i < total; i++) {
      if (trajectory.points[i].y > maxY) { maxY = trajectory.points[i].y; apexIdx = i; }
    }
    const landingPx = this.toPx(trajectory.points[total - 1]);

    // Accesibilidad: sin animación, resultado inmediato.
    if (this.reduceMotion) {
      this.render(world, trajectory, total, ghost);
      if (this.onProgress) this.onProgress(trajectory.points[total - 1]);
      if (opts.onImpact) opts.onImpact();
      if (opts.onComplete) opts.onComplete();
      return;
    }

    // Polvo del saque inicial.
    this.spawnDust(this.originX, this.groundY, 14, gScale);

    const baseDuration = 2200;       // ms nominales de vuelo
    const idxPerMs = total / baseDuration;
    let idxFloat = 0;
    let last = null;
    let impacted = false;
    let settle = 0;                  // fotogramas extra para que se asienten los efectos

    const tick = (now) => {
      if (last == null) last = now;
      const dt = Math.min(now - last, 50);
      last = now;

      if (idxFloat < total - 1) {
        // Cámara lenta cerca del ápice (hang-time).
        const dist = Math.abs(idxFloat - apexIdx) / total;
        const slow = dist < 0.12 ? 0.4 : 1;
        idxFloat = Math.min(total - 1, idxFloat + dt * idxPerMs * slow);
      } else if (!impacted) {
        impacted = true;
        this.spawnDust(landingPx.x, landingPx.y, 18, gScale);
        this.spawnImpact(landingPx.x, landingPx.y, world.trail);
        if (opts.onImpact) opts.onImpact();
      } else {
        settle++;
      }

      const frame = Math.floor(idxFloat) + 1;
      this.updateEffects();
      this.render(world, trajectory, frame, ghost);
      if (this.onProgress) {
        const idx = Math.min(frame, total) - 1;
        this.onProgress(trajectory.points[idx]);
      }

      // Continúa hasta aterrizar y dejar asentar los efectos (~40 frames).
      if (!impacted || settle < 40 || this.particles.length || this.rings.length) {
        this.anim = requestAnimationFrame(tick);
      } else if (opts.onComplete) {
        opts.onComplete();
      }
    };
    this.anim = requestAnimationFrame(tick);
  }

  /** Dibuja el estado inicial en reposo. */
  idle(world) {
    cancelAnimationFrame(this.anim);
    this.particles = [];
    this.rings = [];
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
