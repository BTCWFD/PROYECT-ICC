/**
 * sfx.js — Motor de efectos de sonido 100% SINTETIZADOS con Web Audio API.
 *
 * Expone window.ICCSfx con efectos generados en tiempo real (osciladores,
 * envolventes ADSR y ruido filtrado), SIN ningún archivo de audio externo
 * (cumple la CSP estricta del sitio: nada de recursos externos).
 *
 * Contrato compartido (debe incluirse ANTES de main.js / game.js):
 *   play(name)        -> reproduce un efecto. name en:
 *                        ['kick','whoosh','impact','levelup','achievement','ui','record']
 *   setMuted(bool)    -> silencia/activa y persiste en localStorage ('icc_muted').
 *   isMuted()         -> devuelve el estado de silencio actual (boolean).
 *
 * Diseño defensivo y respetuoso con las políticas de autoplay:
 *   - El AudioContext se crea de forma PEREZOSA y se reanuda (resume) en el
 *     primer gesto real del usuario (pointerdown/keydown/touchstart). Antes de
 *     ese gesto, play() es un no-op silencioso (el navegador lo bloquearía).
 *   - Si el navegador no soporta Web Audio, TODO degrada a no-op sin lanzar.
 *   - Volumen maestro moderado para no saturar ni molestar.
 *   - No reproduce nada si está silenciado (incluido al arrancar si así se
 *     guardó previamente) ni si prefers-reduced-motion está activo lo dejamos
 *     intacto: el sonido no es animación, pero respetamos el silencio del user.
 */

(function () {
  "use strict";

  // Clave de persistencia del estado de silencio.
  const STORAGE_KEY = "icc_muted";

  // Volumen maestro moderado (0..1). Suficientemente audible sin saturar.
  const MASTER_VOLUME = 0.35;

  // Detección del constructor de AudioContext (con prefijo webkit antiguo).
  const AudioCtx =
    (typeof window !== "undefined" &&
      (window.AudioContext || window.webkitAudioContext)) ||
    null;

  // Estado interno del módulo.
  let ctx = null; // AudioContext perezoso.
  let masterGain = null; // Nodo de ganancia maestra.
  let unlocked = false; // ¿Ya hubo un gesto del usuario que desbloquee el audio?
  let muted = readMutedFromStorage(); // Estado de silencio inicial (persistido).

  /**
   * Lee el estado de silencio persistido. Defensivo ante localStorage no
   * disponible (modo privado, file://, etc.).
   * @returns {boolean}
   */
  function readMutedFromStorage() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch (_err) {
      return false;
    }
  }

  /**
   * Persiste el estado de silencio. Falla en silencio si no se puede escribir.
   * @param {boolean} value
   */
  function writeMutedToStorage(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch (_err) {
      /* sin almacenamiento: el estado vive solo en memoria */
    }
  }

  /**
   * Crea (perezosamente) el AudioContext y la cadena maestra de ganancia.
   * Devuelve true si hay un contexto utilizable, false si Web Audio no existe.
   * @returns {boolean}
   */
  function ensureContext() {
    if (!AudioCtx) return false;
    if (ctx) return true;
    try {
      ctx = new AudioCtx();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : MASTER_VOLUME;
      masterGain.connect(ctx.destination);
      return true;
    } catch (_err) {
      // Si la construcción falla, dejamos todo nulo y degradamos a no-op.
      ctx = null;
      masterGain = null;
      return false;
    }
  }

  /**
   * Reanuda el AudioContext si está suspendido (necesario tras el primer
   * gesto del usuario en muchos navegadores).
   */
  function resumeContext() {
    try {
      if (ctx && ctx.state === "suspended" && typeof ctx.resume === "function") {
        ctx.resume();
      }
    } catch (_err) {
      /* algunos navegadores rechazan resume fuera de un gesto: ignorar */
    }
  }

  /**
   * Marca el audio como desbloqueado tras el primer gesto del usuario y se
   * desuscribe de los listeners (solo hace falta una vez).
   */
  function unlockOnGesture() {
    unlocked = true;
    if (ensureContext()) {
      resumeContext();
    }
    removeGestureListeners();
  }

  const GESTURE_EVENTS = ["pointerdown", "keydown", "touchstart", "mousedown"];

  function addGestureListeners() {
    try {
      for (let i = 0; i < GESTURE_EVENTS.length; i++) {
        window.addEventListener(GESTURE_EVENTS[i], unlockOnGesture, {
          once: true,
          passive: true,
        });
      }
    } catch (_err) {
      /* sin window/addEventListener: nada que hacer */
    }
  }

  function removeGestureListeners() {
    try {
      for (let i = 0; i < GESTURE_EVENTS.length; i++) {
        window.removeEventListener(GESTURE_EVENTS[i], unlockOnGesture);
      }
    } catch (_err) {
      /* ignorar */
    }
  }

  // ---------------------------------------------------------------------------
  // Utilidades de síntesis
  // ---------------------------------------------------------------------------

  /**
   * Devuelve el "ahora" del contexto de audio (segundos).
   * @returns {number}
   */
  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  /**
   * Crea un nodo de ganancia con una envolvente percusiva (ataque rápido +
   * caída exponencial) conectado al máster, y devuelve el nodo para enrutar
   * fuentes hacia él.
   *
   * @param {number} start    Instante de inicio (s).
   * @param {number} peak     Ganancia de pico (0..1, relativa al máster).
   * @param {number} attack   Tiempo de ataque (s).
   * @param {number} release  Tiempo de caída/cola (s).
   * @returns {GainNode}
   */
  function makeEnv(start, peak, attack, release) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + attack);
    // Caída exponencial hacia un valor casi nulo (no exactamente 0: exp ramp lo
    // prohíbe). Suena natural para percusión y campanas.
    g.gain.exponentialRampToValueAtTime(0.0001, start + attack + release);
    g.connect(masterGain);
    return g;
  }

  /**
   * Crea y arranca un oscilador conectado a un destino, con parada programada.
   *
   * @param {string} type    Tipo de onda ('sine','square','sawtooth','triangle').
   * @param {number} freq    Frecuencia inicial (Hz).
   * @param {AudioNode} dest Nodo destino.
   * @param {number} start   Instante de inicio (s).
   * @param {number} stop    Instante de parada (s).
   * @returns {OscillatorNode}
   */
  function makeOsc(type, freq, dest, start, stop) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    osc.connect(dest);
    osc.start(start);
    osc.stop(stop);
    return osc;
  }

  /**
   * Crea un buffer de ruido blanco de la duración indicada.
   * @param {number} duration Segundos.
   * @returns {AudioBuffer}
   */
  function makeNoiseBuffer(duration) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /**
   * Crea una fuente de ruido (BufferSource) lista para arrancar/parar.
   * @param {number} duration Segundos.
   * @param {AudioNode} dest  Destino.
   * @param {number} start    Inicio (s).
   * @returns {AudioBufferSourceNode}
   */
  function makeNoiseSource(duration, dest, start) {
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(duration);
    src.connect(dest);
    src.start(start);
    src.stop(start + duration);
    return src;
  }

  // ---------------------------------------------------------------------------
  // Definición de cada efecto (todos parten de t = now())
  // ---------------------------------------------------------------------------

  /** 'kick' — impacto corto del balón con pitch-down (golpe seco lunar). */
  function fxKick() {
    const t = now();
    const env = makeEnv(t, 0.9, 0.005, 0.18);
    const osc = makeOsc("sine", 220, env, t, t + 0.2);
    // Barrido descendente de tono: el clásico "thump" percusivo.
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);

    // Pequeño "click" de ataque con ruido muy corto para dar pegada.
    const clickEnv = makeEnv(t, 0.35, 0.001, 0.03);
    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = "highpass";
    clickFilter.frequency.value = 1500;
    clickFilter.connect(clickEnv);
    makeNoiseSource(0.04, clickFilter, t);
  }

  /** 'whoosh' — ruido filtrado en banda que barre (vuelo del balón). */
  function fxWhoosh() {
    const t = now();
    const dur = 0.45;
    const env = makeEnv(t, 0.5, 0.12, dur);

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.8;
    band.frequency.setValueAtTime(400, t);
    // Barrido de la banda hacia arriba y luego ligera bajada: sensación de paso.
    band.frequency.exponentialRampToValueAtTime(1800, t + dur * 0.6);
    band.frequency.exponentialRampToValueAtTime(700, t + dur);
    band.connect(env);

    makeNoiseSource(dur, band, t);
  }

  /** 'impact' — golpe grave + ruido (aterrizaje/choque). */
  function fxImpact() {
    const t = now();
    // Componente grave (cuerpo del golpe).
    const bodyEnv = makeEnv(t, 0.85, 0.004, 0.3);
    const body = makeOsc("triangle", 140, bodyEnv, t, t + 0.32);
    body.frequency.exponentialRampToValueAtTime(45, t + 0.28);

    // Componente de ruido grave filtrado (textura del impacto).
    const noiseEnv = makeEnv(t, 0.55, 0.002, 0.2);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.18);
    lp.connect(noiseEnv);
    makeNoiseSource(0.22, lp, t);
  }

  /** 'levelup' — arpegio ascendente brillante (subida de nivel). */
  function fxLevelup() {
    const t = now();
    // Arpegio mayor ascendente (C5, E5, G5, C6).
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const step = 0.09;
    for (let i = 0; i < notes.length; i++) {
      const start = t + i * step;
      const env = makeEnv(start, 0.55, 0.01, 0.28);
      makeOsc("triangle", notes[i], env, start, start + 0.3);
      // Capa de brillo (octava + cuadrada suave a bajo volumen).
      const shineEnv = makeEnv(start, 0.18, 0.01, 0.22);
      makeOsc("square", notes[i] * 2, shineEnv, start, start + 0.24);
    }
  }

  /** 'achievement' — campana brillante (logro desbloqueado). */
  function fxAchievement() {
    const t = now();
    // Campana = fundamental + parciales inarmónicos con caída larga.
    const partials = [
      { f: 880, g: 0.6, r: 0.9 },
      { f: 880 * 2.76, g: 0.28, r: 0.7 },
      { f: 880 * 5.4, g: 0.15, r: 0.5 },
    ];
    for (let i = 0; i < partials.length; i++) {
      const p = partials[i];
      const env = makeEnv(t, p.g, 0.005, p.r);
      makeOsc("sine", p.f, env, t, t + p.r + 0.05);
    }
    // Destello de ataque agudo y corto.
    const ping = makeEnv(t, 0.25, 0.002, 0.12);
    makeOsc("sine", 1760, ping, t, t + 0.14);
  }

  /** 'ui' — click corto y discreto (interacción de interfaz). */
  function fxUi() {
    const t = now();
    const env = makeEnv(t, 0.3, 0.002, 0.05);
    const osc = makeOsc("square", 660, env, t, t + 0.06);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.05);
  }

  /** 'record' — fanfarria breve (nuevo récord). */
  function fxRecord() {
    const t = now();
    // Tríada ascendente rápida que resuelve en una nota sostenida brillante.
    const seq = [
      { f: 587.33, s: 0.0, d: 0.12 }, // D5
      { f: 739.99, s: 0.1, d: 0.12 }, // F#5
      { f: 880.0, s: 0.2, d: 0.12 }, // A5
      { f: 1174.66, s: 0.32, d: 0.4 }, // D6 (resolución)
    ];
    for (let i = 0; i < seq.length; i++) {
      const n = seq[i];
      const start = t + n.s;
      const env = makeEnv(start, 0.5, 0.008, n.d);
      makeOsc("sawtooth", n.f, env, start, start + n.d + 0.05);
      // Refuerzo a una octava abajo para dar cuerpo a la fanfarria.
      const lowEnv = makeEnv(start, 0.2, 0.008, n.d);
      makeOsc("triangle", n.f / 2, lowEnv, start, start + n.d + 0.05);
    }
  }

  // Tabla de despacho nombre -> función generadora.
  const EFFECTS = {
    kick: fxKick,
    whoosh: fxWhoosh,
    impact: fxImpact,
    levelup: fxLevelup,
    achievement: fxAchievement,
    ui: fxUi,
    record: fxRecord,
  };

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  /**
   * Reproduce un efecto sintetizado por nombre. No-op silencioso si:
   * no hay Web Audio, está silenciado, el nombre es inválido, o el audio
   * todavía no se desbloqueó con un gesto del usuario.
   *
   * @param {string} name Uno de los efectos válidos.
   */
  function play(name) {
    try {
      if (muted) return;
      const effect = EFFECTS[name];
      if (typeof effect !== "function") return;

      // Sin gesto previo no intentamos sonar (el navegador lo bloquearía).
      if (!unlocked) return;

      if (!ensureContext()) return;
      resumeContext();

      // Si el contexto sigue sin poder ejecutarse, abortamos sin romper.
      if (!ctx || ctx.state === "closed") return;

      effect();
    } catch (_err) {
      // Cualquier fallo de audio se ignora: el sonido nunca rompe la UX.
    }
  }

  /**
   * Activa o desactiva el silencio y lo persiste. Aplica de inmediato sobre
   * la ganancia maestra si el contexto ya existe.
   * @param {boolean} value
   */
  function setMuted(value) {
    muted = !!value;
    writeMutedToStorage(muted);
    try {
      if (masterGain && ctx) {
        // Rampa muy corta para evitar clics al silenciar/activar.
        const t = ctx.currentTime;
        masterGain.gain.cancelScheduledValues(t);
        masterGain.gain.setValueAtTime(masterGain.gain.value, t);
        masterGain.gain.linearRampToValueAtTime(
          muted ? 0 : MASTER_VOLUME,
          t + 0.02
        );
      }
    } catch (_err) {
      /* ignorar: el estado lógico ya está actualizado */
    }
  }

  /**
   * Devuelve el estado de silencio actual.
   * @returns {boolean}
   */
  function isMuted() {
    return muted;
  }

  // Suscribimos los listeners de gesto para desbloquear el audio en cuanto el
  // usuario interactúe (cumple las políticas de autoplay).
  addGestureListeners();

  // Exposición global (sin módulos, para que funcione también en file://).
  window.ICCSfx = { play, setMuted, isMuted };
})();
