/**
 * simulator.js — Renderizado del simulador sobre <canvas>.
 *
 * Dibuja la escena (cielo estrellado, Tierra atmosférica, regolito con cráteres,
 * robot L-Striker, balón con giro y sombra) y anima la trayectoria calculada por
 * physics.js. Escala automáticamente el mundo para que el disparo completo —y los
 * objetivos del modo niveles— quepan en el lienzo.
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
    this.targets = [];               // objetivos del modo niveles {xMeters,radiusMeters}
    this.clock = 0;                  // reloj interno para twinkle/parallax/spin
    this.kickAnticip = 0;            // 0..1 anticipación/retroceso del robot al patear
    this.ballSpin = 0;               // rotación acumulada del balón en vuelo
    // Respeta la preferencia de movimiento reducido del sistema (a11y).
    this.reduceMotion = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
    this._buildStarfield();
    this._buildCraters();
  }

  /** Genera las capas de estrellas una sola vez (deterministas, con fase propia). */
  _buildStarfield() {
    // Tres capas: profundas (lentas, tenues), medias y cercanas (brillantes).
    const layers = [
      { count: 60, depth: 0.15, sizeMin: 0.6, sizeMax: 1.0, alpha: 0.35 },
      { count: 45, depth: 0.35, sizeMin: 0.8, sizeMax: 1.4, alpha: 0.55 },
      { count: 28, depth: 0.6, sizeMin: 1.1, sizeMax: 1.9, alpha: 0.8 },
    ];
    this.starLayers = layers.map((cfg, li) => {
      const stars = [];
      for (let i = 0; i < cfg.count; i++) {
        const seed = i * 137.5 + li * 53.7;
        stars.push({
          x: (seed * 1.13) % this.W,
          y: (seed * 0.71) % (this.groundY - 30),
          r: cfg.sizeMin + ((seed * 0.37) % 1) * (cfg.sizeMax - cfg.sizeMin),
          phase: (seed * 0.21) % (Math.PI * 2),
          // velocidad de parpadeo individual para que no lata al unísono.
          tw: 1.4 + ((seed * 0.09) % 1) * 2.2,
        });
      }
      return { stars, depth: cfg.depth, alpha: cfg.alpha };
    });
  }

  /** Posiciones fijas de cráteres del regolito (solo Luna). */
  _buildCraters() {
    this.craters = [];
    for (let i = 0; i < 9; i++) {
      const seed = i * 91.7 + 13;
      this.craters.push({
        x: (seed * 1.7) % this.W,
        // dentro de la franja de suelo
        y: this.groundY + 8 + ((seed * 0.5) % 1) * (this.H - this.groundY - 16),
        rx: 6 + ((seed * 0.3) % 1) * 18,
        ry: 2 + ((seed * 0.13) % 1) * 5,
      });
    }
  }

  /* ----------------------------------------------------------------------- *
   *  Objetivos (modo niveles)
   * ----------------------------------------------------------------------- */

  /** Fija los objetivos a dibujar; se incluyen en fit() y render(). */
  setTargets(arr) {
    this.targets = Array.isArray(arr) ? arr.filter(Boolean) : [];
  }

  /** Limpia los objetivos (vuelve al comportamiento por defecto). */
  clearTargets() {
    this.targets = [];
  }

  /** Ajusta la escala para que la trayectoria —y los objetivos— entren con margen. */
  fit(trajectory, ghost) {
    const all = [trajectory, ghost].filter(Boolean);
    let maxX = Math.max(...all.map((t) => t.range), 10);
    let maxY = Math.max(...all.map((t) => t.maxHeight), 5);
    // Considera los objetivos para que sus dianas entren en cuadro.
    for (const tg of this.targets) {
      const edge = (tg.xMeters || 0) + (tg.radiusMeters || 0);
      if (edge > maxX) maxX = edge;
    }
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

  /* ----------------------------------------------------------------------- *
   *  Fondo y escena
   * ----------------------------------------------------------------------- */

  clear(world) {
    const { ctx } = this;
    // Cielo con degradado de profundidad (más claro hacia el horizonte).
    const sky = ctx.createLinearGradient(0, 0, 0, this.groundY);
    sky.addColorStop(0, world.sky);
    sky.addColorStop(1, this._lighten(world.sky, world.name === "Luna" ? 0.06 : 0.12));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.W, this.H);

    this._drawStars();

    // Tierra en el cielo si estamos en la Luna.
    if (world.name === "Luna") this._drawEarth();

    this._drawSurface(world);
    this._drawVignette();
  }

  /** Estrellas en capas con parpadeo y leve parallax (estáticas si reduceMotion). */
  _drawStars() {
    const { ctx } = this;
    ctx.save();
    const t = this.clock;
    for (const layer of this.starLayers) {
      // Parallax horizontal muy sutil ligado al reloj interno.
      const drift = this.reduceMotion ? 0 : Math.sin(t * 0.05) * 6 * layer.depth;
      for (const s of layer.stars) {
        let a = layer.alpha;
        if (!this.reduceMotion) {
          // Twinkle: oscilación suave del brillo.
          a *= 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * s.tw + s.phase));
        }
        ctx.globalAlpha = a;
        ctx.fillStyle = "#ffffff";
        const sx = (s.x + drift + this.W) % this.W;
        ctx.beginPath();
        ctx.arc(sx, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Tierra lejana con halo atmosférico, terminador y continentes insinuados. */
  _drawEarth() {
    const { ctx } = this;
    const cx = this.W - 96;
    const cy = 82;
    const R = 30;
    ctx.save();

    // Halo atmosférico (gradiente radial azul que se difumina).
    const halo = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 2.1);
    halo.addColorStop(0, "rgba(91,140,255,0.35)");
    halo.addColorStop(0.5, "rgba(91,140,255,0.12)");
    halo.addColorStop(1, "rgba(91,140,255,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 2.1, 0, Math.PI * 2);
    ctx.fill();

    // Disco oceánico iluminado (luz desde arriba-izquierda).
    const ocean = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.2, cx, cy, R);
    ocean.addColorStop(0, "#5fa0e8");
    ocean.addColorStop(0.7, "#2f6fb5");
    ocean.addColorStop(1, "#143a66");
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = ocean;
    ctx.fill();

    // Continentes insinuados (manchas verdosas recortadas al disco).
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(86,208,122,0.85)";
    ctx.beginPath();
    ctx.ellipse(cx - 8, cy - 6, 9, 6, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 7, cy + 8, 7, 10, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 3, cy - 11, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Terminador día/noche: sombra que cubre el lado opuesto a la luz.
    const term = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    term.addColorStop(0, "rgba(2,3,10,0)");
    term.addColorStop(0.55, "rgba(2,3,10,0)");
    term.addColorStop(1, "rgba(2,3,10,0.78)");
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = term;
    ctx.fill();

    ctx.restore();
  }

  /** Superficie: regolito con gradiente, cráteres y horizonte. */
  _drawSurface(world) {
    const { ctx } = this;
    const isMoon = world.name === "Luna";

    // Suelo con gradiente vertical (más luminoso en el horizonte).
    const grd = ctx.createLinearGradient(0, this.groundY, 0, this.H);
    grd.addColorStop(0, this._lighten(world.surface, 0.1));
    grd.addColorStop(1, this._darken(world.surface, 0.25));
    ctx.fillStyle = grd;
    ctx.fillRect(0, this.groundY, this.W, this.H - this.groundY);

    // Brillo del horizonte (línea luminosa donde el sol roza el borde).
    const horizon = ctx.createLinearGradient(0, this.groundY - 6, 0, this.groundY + 10);
    horizon.addColorStop(0, "rgba(255,255,255,0)");
    horizon.addColorStop(0.5, isMoon ? "rgba(255,255,255,0.28)" : "rgba(180,255,200,0.25)");
    horizon.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = horizon;
    ctx.fillRect(0, this.groundY - 6, this.W, 16);

    // Línea de suelo nítida.
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, this.groundY);
    ctx.lineTo(this.W, this.groundY);
    ctx.stroke();

    // Cráteres / motas del regolito (sombra abajo, luz arriba).
    ctx.save();
    for (const c of this.craters) {
      // sombra interior
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      // borde iluminado superior
      ctx.strokeStyle = isMoon ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y - 0.8, c.rx, c.ry, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    // grano fino: pequeñas piedras dispersas
    ctx.fillStyle = isMoon ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.07)";
    for (let i = 0; i < 40; i++) {
      const seed = i * 53.3 + 7;
      const gx = (seed * 2.1) % this.W;
      const gy = this.groundY + 4 + ((seed * 0.7) % 1) * (this.H - this.groundY - 8);
      ctx.fillRect(gx, gy, 1.2, 1.2);
    }
    ctx.restore();
  }

  /** Viñeta sutil en las esquinas para dar profundidad. */
  _drawVignette() {
    const { ctx } = this;
    const vg = ctx.createRadialGradient(
      this.W / 2, this.H * 0.45, this.H * 0.2,
      this.W / 2, this.H * 0.5, this.H * 0.85
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.save();
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.restore();
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

  /* ----------------------------------------------------------------------- *
   *  Objetivos sobre el lienzo (dianas + banderín)
   * ----------------------------------------------------------------------- */

  /** Dibuja cada objetivo como una diana en el suelo con un banderín de acento. */
  drawTargets() {
    if (!this.targets.length) return;
    const { ctx } = this;
    const pulse = this.reduceMotion ? 0 : 0.5 + 0.5 * Math.sin(this.clock * 2.2);

    for (const tg of this.targets) {
      const cx = this.originX + (tg.xMeters || 0) * this.scale;
      const rPx = Math.max(8, (tg.radiusMeters || 0) * this.scale);
      // Achatamos verticalmente para simular perspectiva sobre el suelo.
      const ry = Math.max(3, rPx * 0.32);

      ctx.save();

      // Halo de zona (elipse rellena tenue, con pulso suave).
      const zone = ctx.createRadialGradient(cx, this.groundY, 0, cx, this.groundY, rPx);
      zone.addColorStop(0, "rgba(255,211,91,0.22)");
      zone.addColorStop(0.7, "rgba(255,211,91,0.10)");
      zone.addColorStop(1, "rgba(255,211,91,0)");
      ctx.fillStyle = zone;
      ctx.beginPath();
      ctx.ellipse(cx, this.groundY, rPx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      // Anillos concéntricos de diana (3 elipses).
      ctx.lineWidth = 1.5;
      for (let k = 1; k <= 3; k++) {
        const f = k / 3;
        ctx.strokeStyle = `rgba(255,211,91,${0.55 - f * 0.12 + pulse * 0.12})`;
        ctx.beginPath();
        ctx.ellipse(cx, this.groundY, rPx * f, ry * f, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Cruz central de puntería.
      ctx.strokeStyle = "rgba(255,211,91,0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 5, this.groundY);
      ctx.lineTo(cx + 5, this.groundY);
      ctx.moveTo(cx, this.groundY - 4);
      ctx.lineTo(cx, this.groundY + 4);
      ctx.stroke();

      // Banderín: asta + bandera triangular de acento.
      const poleH = 30;
      ctx.strokeStyle = "rgba(232,238,252,0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, this.groundY - 2);
      ctx.lineTo(cx, this.groundY - poleH);
      ctx.stroke();
      // bandera ondeando ligeramente
      const wave = this.reduceMotion ? 0 : Math.sin(this.clock * 3 + cx) * 1.5;
      ctx.fillStyle = "#ffd35b";
      ctx.beginPath();
      ctx.moveTo(cx, this.groundY - poleH);
      ctx.lineTo(cx + 14, this.groundY - poleH + 5 + wave);
      ctx.lineTo(cx, this.groundY - poleH + 10);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  /* ----------------------------------------------------------------------- *
   *  Robot, estela y balón
   * ----------------------------------------------------------------------- */

  /** Robot L-Striker estilizado, con visor brillante, dorsal "01" y retroceso. */
  drawRobot() {
    const { ctx } = this;
    // Anticipación: se inclina/retrocede al patear (kickAnticip 0..1).
    const lean = this.kickAnticip * 5;
    const x = this.originX - 26 - lean;
    const y = this.groundY;
    ctx.save();
    ctx.translate(x, y);

    // Sombra de contacto bajo el robot.
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(11, 1, 18, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Piernas digitígradas (invertidas, como resorte) — se comprimen al patear.
    const crouch = this.kickAnticip * 3;
    ctx.strokeStyle = "#7f93b8";
    ctx.beginPath();
    ctx.moveTo(4, 0); ctx.lineTo(10, -16 + crouch); ctx.lineTo(4, -30 + crouch);
    ctx.moveTo(18, 0); ctx.lineTo(12, -16 + crouch); ctx.lineTo(18, -30 + crouch);
    ctx.stroke();

    const top = -30 + crouch;

    // Torso con sombreado azul/acento (gradiente lateral).
    const torsoH = 24;
    const torso = ctx.createLinearGradient(4, 0, 18, 0);
    torso.addColorStop(0, "#e6ecfa");
    torso.addColorStop(0.55, "#aebbd6");
    torso.addColorStop(1, "#6f80a6");
    ctx.fillStyle = torso;
    this._roundRect(4, top - torsoH, 14, torsoH, 3);
    ctx.fill();
    // Banda de acento en el chasis.
    ctx.fillStyle = "#5b8cff";
    ctx.fillRect(4, top - torsoH + 6, 14, 3);
    // Dorsal "01".
    ctx.fillStyle = "rgba(20,28,48,0.85)";
    ctx.font = "bold 7px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("01", 11, top - torsoH + 19);
    ctx.textAlign = "start";

    // Cabeza con visor que brilla.
    const headY = top - torsoH - 13;
    const head = ctx.createLinearGradient(6, headY, 16, headY);
    head.addColorStop(0, "#dfe6f6");
    head.addColorStop(1, "#8a9bc0");
    ctx.fillStyle = head;
    this._roundRect(5, headY, 12, 12, 2);
    ctx.fill();
    // Visor (banda oscura).
    ctx.fillStyle = "#1a2238";
    this._roundRect(6, headY + 3, 10, 5, 1.5);
    ctx.fill();
    // Brillo del visor (sensor óptico que late suavemente).
    const glow = this.reduceMotion ? 0.8 : 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.clock * 4));
    ctx.save();
    ctx.shadowBlur = 6;
    ctx.shadowColor = "#ffd35b";
    ctx.globalAlpha = glow;
    ctx.fillStyle = "#ffd35b";
    ctx.beginPath();
    ctx.arc(11, headY + 5.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

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
    // Resplandor suave de la estela.
    ctx.shadowBlur = 6;
    ctx.shadowColor = color;
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

  /** Balón con sombreado esférico, giro (gajos) y sombra proyectada en el suelo. */
  drawBall(point, color) {
    const { ctx } = this;
    const p = this.toPx(point);
    const r = 6;

    // Sombra proyectada en el suelo bajo el balón (se difumina con la altura).
    const heightPx = Math.max(0, this.groundY - p.y);
    const shFactor = Math.max(0.15, 1 - heightPx / (this.groundY * 0.9));
    ctx.save();
    ctx.globalAlpha = 0.32 * shFactor;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(p.x, this.groundY, r * (1.6 * shFactor + 0.4), r * 0.4 * shFactor, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Halo de luz del balón.
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;

    // Esfera con gradiente radial (luz arriba-izquierda).
    const sphere = ctx.createRadialGradient(p.x - r * 0.4, p.y - r * 0.4, r * 0.1, p.x, p.y, r);
    sphere.addColorStop(0, "#ffffff");
    sphere.addColorStop(0.6, color);
    sphere.addColorStop(1, this._darken(color, 0.35));
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = sphere;
    ctx.fill();
    ctx.restore();

    // Gajos que giran (spin) — recortados al disco del balón.
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(p.x, p.y);
    ctx.rotate(this.ballSpin);
    ctx.strokeStyle = "rgba(30,40,70,0.55)";
    ctx.lineWidth = 1;
    // dos líneas curvas que insinúan los paneles
    for (let k = -1; k <= 1; k += 2) {
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.95, r * 0.45, k * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.restore();

    // Contorno nítido.
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* ----------------------------------------------------------------------- *
   *  Efectos (polvo + anillos)
   * ----------------------------------------------------------------------- */

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

  /* ----------------------------------------------------------------------- *
   *  Render + animación
   * ----------------------------------------------------------------------- */

  /** Renderiza un fotograma completo. */
  render(world, trajectory, frame, ghost) {
    this.clear(world);
    this.drawRuler(trajectory.range);
    this.drawTargets();
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
   *  - Anticipación del robot y giro del balón en vuelo.
   * Respeta prefers-reduced-motion: muestra el resultado al instante.
   *
   * @param {object} opts { onImpact?:fn, onComplete?:fn }
   */
  animate(world, trajectory, ghost, opts = {}) {
    cancelAnimationFrame(this.anim);
    this.fit(trajectory, ghost);
    this.particles = [];
    this.rings = [];
    this.ballSpin = 0;
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
      this.kickAnticip = 0;
      this.render(world, trajectory, total, ghost);
      if (this.onProgress) this.onProgress(trajectory.points[total - 1]);
      if (opts.onImpact) opts.onImpact();
      if (opts.onComplete) opts.onComplete();
      return;
    }

    // Polvo del saque inicial.
    this.spawnDust(this.originX, this.groundY, 14, gScale);
    this.kickAnticip = 1; // arranca con retroceso máximo y se relaja durante el vuelo.

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
      this.clock += dt / 1000;
      // El retroceso del robot se relaja rápido tras el saque.
      this.kickAnticip = Math.max(0, this.kickAnticip - dt / 250);

      if (idxFloat < total - 1) {
        // Cámara lenta cerca del ápice (hang-time).
        const dist = Math.abs(idxFloat - apexIdx) / total;
        const slow = dist < 0.12 ? 0.4 : 1;
        idxFloat = Math.min(total - 1, idxFloat + dt * idxPerMs * slow);
        // Giro del balón proporcional al avance (más rápido al inicio).
        this.ballSpin += dt * 0.02 * (1 - idxFloat / total) + dt * 0.004;
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

  /** Dibuja el estado inicial en reposo (con twinkle/banderines vivos). */
  idle(world) {
    cancelAnimationFrame(this.anim);
    this.particles = [];
    this.rings = [];
    this.kickAnticip = 0;

    // En reduceMotion: un único fotograma estático.
    if (this.reduceMotion) {
      this.clear(world);
      this.drawTargets();
      this.drawRobot();
      this.drawBall({ x: 0, y: 0 }, world.ball);
      return;
    }

    // Bucle de reposo: estrellas que parpadean y banderines que ondean.
    let last = null;
    const loop = (now) => {
      if (last == null) last = now;
      const dt = Math.min(now - last, 50);
      last = now;
      this.clock += dt / 1000;
      this.clear(world);
      this.drawTargets();
      this.drawRobot();
      this.drawBall({ x: 0, y: 0 }, world.ball);
      this.anim = requestAnimationFrame(loop);
    };
    this.anim = requestAnimationFrame(loop);
  }

  /* ----------------------------------------------------------------------- *
   *  Utilidades de color y geometría
   * ----------------------------------------------------------------------- */

  /** Rectángulo redondeado (traza el path; el llamador hace fill/stroke). */
  _roundRect(x, y, w, h, r) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Aclara un color hex (#rrggbb) mezclándolo con blanco. amt 0..1. */
  _lighten(hex, amt) {
    return this._mix(hex, 255, 255, 255, amt);
  }

  /** Oscurece un color hex mezclándolo con negro. amt 0..1. */
  _darken(hex, amt) {
    return this._mix(hex, 0, 0, 0, amt);
  }

  _mix(hex, tr, tg, tb, amt) {
    const c = this._parseHex(hex);
    const r = Math.round(c.r + (tr - c.r) * amt);
    const g = Math.round(c.g + (tg - c.g) * amt);
    const b = Math.round(c.b + (tb - c.b) * amt);
    return `rgb(${r},${g},${b})`;
  }

  _parseHex(hex) {
    let h = String(hex).replace("#", "");
    if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return { r: 128, g: 128, b: 128 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
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
