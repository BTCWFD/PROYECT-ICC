/**
 * share.js — Tarjeta compartible de la hazaña (marca ICC).
 *
 * Expone window.ICCShare.shareFeat({club, world, range, milestone}) que dibuja
 * en un <canvas> oculto de 1200x630 (formato de tarjeta social) una imagen de
 * marca de la ICC y la comparte:
 *   1) navigator.share({files:[File]}) si el navegador lo soporta (móvil),
 *   2) si no, descarga el PNG y/o copia al portapapeles un texto promocional.
 *
 * Todo va envuelto en try/catch para no romper nunca la UX. Debe incluirse
 * ANTES de main.js.
 */

(function () {
  // Paleta de marca (coherente con styles.css): azul espacial y dorado ICC.
  const COLORS = {
    bgTop: "#0a1430",
    bgBottom: "#05070f",
    accent: "#5b8cff",
    gold: "#ffd35b",
    text: "#e8eefc",
    muted: "#aab8d8",
  };

  const W = 1200;
  const H = 630;

  /** Crea (una sola vez) y devuelve el canvas oculto reutilizable. */
  function getCanvas() {
    let canvas = document.getElementById("iccShareCanvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "iccShareCanvas";
      canvas.width = W;
      canvas.height = H;
      // Oculto pero renderizable (display:none impediría toBlob en algunos navegadores).
      canvas.style.position = "fixed";
      canvas.style.left = "-9999px";
      canvas.style.top = "0";
      canvas.style.pointerEvents = "none";
      canvas.setAttribute("aria-hidden", "true");
      document.body.appendChild(canvas);
    }
    return canvas;
  }

  /** Dibuja la tarjeta de marca en el canvas con los datos del disparo. */
  function drawCard(ctx, data) {
    const club = (data.club || "L-Striker 01").toString().slice(0, 40);
    const isEarth = data.world === "earth";
    const worldEmoji = isEarth ? "🌍" : "🌕";
    const worldName = isEarth ? "Tierra" : "Luna";
    const range = Math.round(Number(data.range) || 0);
    const milestone = (data.milestone || "").toString().slice(0, 60);

    // Fondo: gradiente espacial vertical azul -> negro.
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, COLORS.bgTop);
    grad.addColorStop(1, COLORS.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Resplandor dorado decorativo en la esquina superior.
    const glow = ctx.createRadialGradient(W * 0.85, -40, 40, W * 0.85, -40, 520);
    glow.addColorStop(0, "rgba(255, 211, 91, 0.22)");
    glow.addColorStop(1, "rgba(255, 211, 91, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Marco interior sutil.
    ctx.strokeStyle = "rgba(91, 140, 255, 0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 28, W - 56, H - 56);

    ctx.textBaseline = "alphabetic";

    // Kicker (operación).
    ctx.fillStyle = COLORS.gold;
    ctx.font = "700 30px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("OPERACIÓN PRIMER TOQUE", 72, 110);

    // Título de marca.
    ctx.fillStyle = COLORS.text;
    ctx.font = "800 52px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("Interplanetary Champions Cup", 72, 175);

    // Club.
    ctx.fillStyle = COLORS.muted;
    ctx.font = "600 34px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(club + " · L-Striker 01", 72, 250);

    // Alcance grande (héroe de la tarjeta).
    ctx.fillStyle = COLORS.gold;
    ctx.font = "800 210px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(String(range), 72, 470);

    // Unidad "m" junto al número.
    const numW = ctx.measureText(String(range)).width;
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 64px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("m", 72 + numW + 24, 470);

    // Mundo (emoji + nombre).
    ctx.fillStyle = COLORS.text;
    ctx.font = "600 44px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(worldEmoji + "  " + worldName, 72, 545);

    // Hito (si lo hay).
    if (milestone) {
      ctx.fillStyle = COLORS.accent;
      ctx.font = "700 30px 'Segoe UI', system-ui, sans-serif";
      ctx.fillText("★ " + milestone, 72, 590);
    }

    // Hashtag de campaña (alineado a la derecha).
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.gold;
    ctx.font = "700 34px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("#ICCFirstTouch", W - 72, 590);
    ctx.textAlign = "left";
  }

  /** Construye el texto promocional de respaldo (sin PII). */
  function buildText(data) {
    const club = (data.club || "Mi L-Striker").toString().trim() || "Mi L-Striker";
    const isEarth = data.world === "earth";
    const worldEmoji = isEarth ? "🌍" : "🌕";
    const worldName = isEarth ? "la Tierra" : "la Luna";
    const range = Math.round(Number(data.range) || 0);
    return (
      `${club} voló ${range} m en ${worldName} ${worldEmoji} ` +
      `#ICC #ICCFirstTouch · Interplanetary Champions Cup`
    );
  }

  /** Convierte el canvas en Blob (Promise) de forma segura. */
  function canvasToBlob(canvas) {
    return new Promise(function (resolve) {
      try {
        canvas.toBlob(function (blob) {
          resolve(blob);
        }, "image/png");
      } catch (_err) {
        resolve(null);
      }
    });
  }

  /** Fallback: descarga el PNG mediante un enlace temporal. */
  function downloadPng(blob) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "icc-primer-toque.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Liberar el objeto URL un instante después.
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
      return true;
    } catch (_err) {
      return false;
    }
  }

  /** Fallback: copia el texto promocional al portapapeles (si se puede). */
  function copyText(text) {
    try {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () {});
        return true;
      }
    } catch (_err) {
      /* sin portapapeles: ignorar */
    }
    return false;
  }

  /**
   * Genera y comparte la tarjeta de la hazaña. Nunca lanza.
   *
   * @param {object} data
   * @param {string} data.club      Nombre del club.
   * @param {string} data.world     "moon" | "earth".
   * @param {number} data.range     Alcance en metros.
   * @param {string} [data.milestone] Hito a destacar.
   * @returns {Promise<boolean>} true si se inició algún mecanismo de compartir.
   */
  async function shareFeat(data) {
    try {
      const safe = data && typeof data === "object" ? data : {};
      const canvas = getCanvas();
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;

      drawCard(ctx, safe);

      const text = buildText(safe);
      const blob = await canvasToBlob(canvas);

      // 1) Web Share API con archivos (móvil/PWA): la mejor experiencia.
      if (blob && navigator && typeof navigator.share === "function") {
        try {
          const file = new File([blob], "icc-primer-toque.png", {
            type: "image/png",
          });
          if (
            typeof navigator.canShare !== "function" ||
            navigator.canShare({ files: [file] })
          ) {
            await navigator.share({
              files: [file],
              title: "Interplanetary Champions Cup",
              text,
            });
            return true;
          }
        } catch (_shareErr) {
          // El usuario canceló o el navegador no soporta compartir archivos:
          // continuamos con el fallback de descarga/portapapeles.
        }
      }

      // 2) Fallback: descargar el PNG y copiar el texto promocional.
      let ok = false;
      if (blob) ok = downloadPng(blob) || ok;
      ok = copyText(text) || ok;
      return ok;
    } catch (_err) {
      // Robustez total: cualquier fallo se ignora para no romper la UX.
      return false;
    }
  }

  // Exposición global (sin módulos para que funcione con file://).
  window.ICCShare = { shareFeat };
})();
