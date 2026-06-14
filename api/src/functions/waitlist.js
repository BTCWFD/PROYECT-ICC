/**
 * waitlist.js — Captura de leads para la lista de espera "Primeros 1.000 operadores".
 *
 * Contrato:
 *   POST /api/waitlist
 *     body { "email":string, "club":string(opcional), "source":string(opcional) }
 *     -> { "ok":true, "total":number }  (status 201)
 *
 *   Si el email es inválido -> 400 { "ok":false, "error":string }.
 *   Si hay un fallo interno -> 500 { "ok":false, "error":"internal_error" }
 *     (nunca se filtra el error crudo al cliente).
 *
 * Deduplicación y persistencia las gestiona store.addWaitlist (tabla "waitlist"
 * con fallback en memoria). Aquí solo validamos y normalizamos el contrato.
 *
 * Modelo de programación v4 de Azure Functions, compatible con SWA managed functions.
 */

const { app } = require("@azure/functions");
const store = require("../store");

// Regex razonable para validar el formato de email (no exhaustivo según RFC, pero
// suficiente para descartar entradas claramente inválidas). Exige un único '@',
// texto antes y después, y al menos un punto en el dominio.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Límites de longitud para acotar payloads abusivos.
const MAX_EMAIL = 120;
const MAX_CLUB = 64;
const MAX_SOURCE = 40;

/**
 * Valida el cuerpo de la petición contra el contrato.
 * @param {*} body
 * @returns {{ ok: boolean, message?: string }}
 */
function validateBody(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "El cuerpo debe ser un objeto JSON." };
  }

  const { email, club, source } = body;

  // email: obligatorio, texto, formato válido y longitud acotada.
  if (typeof email !== "string" || email.trim().length === 0) {
    return { ok: false, message: "'email' es obligatorio." };
  }
  if (email.trim().length > MAX_EMAIL) {
    return { ok: false, message: `'email' no puede superar ${MAX_EMAIL} caracteres.` };
  }
  if (!EMAIL_RE.test(email.trim())) {
    return { ok: false, message: "El formato del email no es válido." };
  }

  // club: opcional; si viene, debe ser texto acotado.
  if (club !== undefined && club !== null) {
    if (typeof club !== "string") {
      return { ok: false, message: "'club' debe ser un texto." };
    }
    if (club.trim().length > MAX_CLUB) {
      return { ok: false, message: `'club' no puede superar ${MAX_CLUB} caracteres.` };
    }
  }

  // source: opcional; si viene, debe ser texto acotado.
  if (source !== undefined && source !== null) {
    if (typeof source !== "string") {
      return { ok: false, message: "'source' debe ser un texto." };
    }
    if (source.trim().length > MAX_SOURCE) {
      return { ok: false, message: `'source' no puede superar ${MAX_SOURCE} caracteres.` };
    }
  }

  return { ok: true };
}

app.http("waitlist", {
  methods: ["POST"],
  authLevel: "anonymous", // SWA gestiona la autenticación a nivel de plataforma.
  route: "waitlist",
  handler: async (request, context) => {
    try {
      // Parseo defensivo del JSON entrante.
      let body;
      try {
        body = await request.json();
      } catch {
        return {
          status: 400,
          jsonBody: { ok: false, error: "JSON inválido en el cuerpo." },
        };
      }

      // Validación del contrato.
      const validation = validateBody(body);
      if (!validation.ok) {
        return {
          status: 400,
          jsonBody: { ok: false, error: validation.message },
        };
      }

      // Normalizamos: email en minúsculas y recortado; club/source recortados.
      const entry = {
        email: body.email.trim().toLowerCase(),
        club: typeof body.club === "string" ? body.club.trim() : "",
        source: typeof body.source === "string" ? body.source.trim() : "",
      };

      // El store deduplica por email y devuelve el total actualizado.
      const result = await store.addWaitlist(entry);
      const total =
        result && typeof result.total === "number"
          ? result.total
          : await store.waitlistCount();

      return {
        status: 201,
        jsonBody: { ok: true, total },
      };
    } catch (error) {
      // Nunca exponemos el error crudo: solo un código genérico.
      context.error("Error en /api/waitlist:", error);
      return {
        status: 500,
        jsonBody: { ok: false, error: "internal_error" },
      };
    }
  },
});
