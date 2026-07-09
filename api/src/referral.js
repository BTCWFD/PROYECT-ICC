/**
 * referral.js — Códigos de referido de la lista de espera.
 *
 * El código se DERIVA del email (hash), no se almacena como secreto ni se
 * genera al azar. Ventajas:
 *   - Es estable: el mismo operador siempre obtiene el mismo enlace, aunque se
 *     vuelva a registrar (el alta está deduplicada por email).
 *   - No hace falta una tabla de códigos ni resolver colisiones al insertar.
 *   - No revela el email: es un hash truncado, de un solo sentido.
 *
 * NO es un secreto de seguridad: sirve para atribuir invitaciones, no para
 * autenticar. Un código adivinado solo atribuye un alta a otro usuario.
 */

const crypto = require("crypto");

// Longitud del código en caracteres base36 (A-Z0-9). 8 chars ~ 40 bits.
const CODE_LEN = 8;

// Un código válido es alfanumérico y corto. Aceptamos hasta 12 por si en el
// futuro alargamos el código, sin romper enlaces ya repartidos.
const CODE_RE = /^[0-9A-Za-z]{4,12}$/;

/**
 * Deriva el código de referido de un email (determinista, sin estado).
 * @param {string} email
 * @returns {string} código en mayúsculas, longitud CODE_LEN
 */
function codeForEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const hex = crypto.createHash("sha256").update(normalized).digest("hex");
  // 10 dígitos hex = 40 bits: cabe holgadamente en un entero seguro de JS.
  const n = parseInt(hex.slice(0, 10), 16);
  return n.toString(36).toUpperCase().padStart(CODE_LEN, "0").slice(0, CODE_LEN);
}

/**
 * ¿Tiene forma de código de referido? (No comprueba que exista un usuario.)
 * @param {*} code
 * @returns {boolean}
 */
function isValidCode(code) {
  return typeof code === "string" && CODE_RE.test(code.trim());
}

/**
 * Normaliza un código entrante: recorta y pasa a mayúsculas. Devuelve "" si no
 * tiene forma válida, de modo que un ?ref basura simplemente se ignora.
 * @param {*} code
 * @returns {string}
 */
function normalizeCode(code) {
  if (!isValidCode(code)) return "";
  return code.trim().toUpperCase();
}

module.exports = { codeForEmail, isValidCode, normalizeCode, CODE_LEN };
