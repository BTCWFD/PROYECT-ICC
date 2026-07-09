/**
 * sanitize.js — Saneado del texto que la API persiste o devuelve.
 *
 * Motivación: el nombre de club llega del cliente y se muestra tal cual en el
 * ranking público. Sin limpiar, un atacante puede:
 *   - inyectar caracteres de control (C0/C1) que corrompen logs y consolas;
 *   - usar overrides bidireccionales (U+202E RIGHT-TO-LEFT OVERRIDE) para que
 *     el club se RENDERICE distinto de como está almacenado (spoofing visual);
 *   - meter espacios de ancho cero (U+200B) para suplantar el nombre de otro
 *     club o inflar el tamaño de la entidad.
 * Lo mismo aplica a las 'props' de analítica, que además deben estar acotadas
 * en número de claves y tamaño para que un cliente no engorde la tabla.
 *
 * Nota: esto NO sustituye al escapado en el cliente (el frontend usa
 * textContent, no innerHTML). Es defensa en profundidad en la capa de datos.
 */

// Rangos de code points prohibidos, expresados numéricamente (evitamos meter
// caracteres de control literales dentro de un regex, que son invisibles y se
// corrompen al copiar el archivo).
//   C0            U+0000..U+001F   controles ASCII
//   C1 + DEL      U+007F..U+009F   controles extendidos
//   bidi/ZW       U+200B..U+200F   ancho cero + marcas LTR/RTL
//   bidi override U+202A..U+202E   embedding/override direccional
//   bidi isolate  U+2066..U+2069   aislamiento direccional
//   BOM           U+FEFF
const UNSAFE_RANGES = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];

// Límites por defecto (coherentes con la validación de los handlers).
const DEFAULT_MAX_TEXT = 64;
const MAX_PROP_KEYS = 12;
const MAX_PROP_KEY_LEN = 32;
const MAX_PROP_VALUE_LEN = 120;

/**
 * ¿El code point cae en alguno de los rangos prohibidos?
 * @param {number} cp
 * @returns {boolean}
 */
function isUnsafeCodePoint(cp) {
  for (const [lo, hi] of UNSAFE_RANGES) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

/**
 * Limpia una cadena: elimina caracteres peligrosos, recorta y acota longitud.
 * Devuelve "" para cualquier entrada que no sea string.
 * @param {*} value
 * @param {number} [maxLen=64]
 * @returns {string}
 */
function sanitizeText(value, maxLen = DEFAULT_MAX_TEXT) {
  if (typeof value !== "string") return "";

  let out = "";
  // for...of itera por code points (no por unidades UTF-16), así que los pares
  // suplentes (emojis, etc.) se conservan intactos.
  for (const ch of value) {
    if (!isUnsafeCodePoint(ch.codePointAt(0))) out += ch;
  }

  const cleaned = out.trim();
  const limit = Number.isFinite(maxLen) && maxLen > 0 ? maxLen : DEFAULT_MAX_TEXT;
  return cleaned.length > limit ? cleaned.slice(0, limit) : cleaned;
}

/**
 * Acota y limpia el objeto 'props' de analítica.
 * - Solo admite valores primitivos (string / number finito / boolean).
 * - Descarta objetos, arrays, null y no-finitos (NaN/Infinity).
 * - Limita el número de claves y la longitud de claves y valores de texto.
 * @param {*} props
 * @returns {object|undefined} objeto saneado, o undefined si no queda nada útil
 */
function sanitizeProps(props) {
  if (!props || typeof props !== "object" || Array.isArray(props)) return undefined;

  const out = {};
  let kept = 0;

  for (const rawKey of Object.keys(props)) {
    if (kept >= MAX_PROP_KEYS) break;

    const key = sanitizeText(rawKey, MAX_PROP_KEY_LEN);
    if (!key) continue; // clave vacía tras limpiar: se descarta

    const rawVal = props[rawKey];
    let val;
    if (typeof rawVal === "string") {
      val = sanitizeText(rawVal, MAX_PROP_VALUE_LEN);
    } else if (typeof rawVal === "number" && Number.isFinite(rawVal)) {
      val = rawVal;
    } else if (typeof rawVal === "boolean") {
      val = rawVal;
    } else {
      continue; // objetos, arrays, null, undefined, NaN/Infinity -> fuera
    }

    out[key] = val;
    kept += 1;
  }

  return kept > 0 ? out : undefined;
}

module.exports = { sanitizeText, sanitizeProps };
