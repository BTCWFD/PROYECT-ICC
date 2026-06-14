/**
 * store.js — Almacén en memoria compartido para los tiros (shots) de la ICC.
 *
 * IMPORTANTE (PRODUCCIÓN): este store vive en la memoria del proceso de la
 * Function. Es volátil: se reinicia en cada "cold start" y NO se comparte entre
 * instancias cuando el plan escala horizontalmente. Para producción debe
 * migrarse a un almacenamiento persistente como **Azure Table Storage** o
 * **Azure Cosmos DB**. Aquí se usa solo para la Fase 1 / demo.
 */

// Mundos válidos del simulador. Se reutiliza para validar el contrato.
const VALID_WORLDS = ["moon", "earth"];

// Array en memoria con todos los tiros registrados.
// Cada elemento tiene la forma:
//   { club, world, power, angle, range, hangTime }
const shots = [];

/**
 * Añade un tiro al store en memoria.
 * Asume que el objeto ya viene validado por la capa HTTP.
 * @param {object} shot - Tiro a persistir.
 * @returns {object} El mismo tiro almacenado.
 */
function addShot(shot) {
  shots.push(shot);
  return shot;
}

/**
 * Devuelve todos los tiros ordenados de mayor a menor alcance (range).
 * @returns {object[]} Copia ordenada de los tiros.
 */
function getSortedShots() {
  // Copiamos antes de ordenar para no mutar el orden de inserción del store.
  return [...shots].sort((a, b) => b.range - a.range);
}

/**
 * Devuelve los primeros N tiros ordenados desc por alcance.
 * @param {number} [n=Infinity] - Cantidad máxima de entradas.
 * @returns {object[]} Top N tiros.
 */
function getTopShots(n = Infinity) {
  return getSortedShots().slice(0, n);
}

/**
 * Calcula la posición (rank, 1-based) que ocuparía un alcance dado dentro del
 * ranking actual ordenado desc por range. Útil para responder a POST /shots.
 * El rank es 1 + (nº de tiros con range estrictamente mayor).
 * @param {number} range - Alcance del tiro a posicionar.
 * @returns {number} Posición en el ranking (1 = mejor).
 */
function rankForRange(range) {
  let better = 0;
  for (const s of shots) {
    if (s.range > range) better += 1;
  }
  return better + 1;
}

/**
 * Número total de tiros registrados.
 * @returns {number}
 */
function totalShots() {
  return shots.length;
}

module.exports = {
  VALID_WORLDS,
  addShot,
  getSortedShots,
  getTopShots,
  rankForRange,
  totalShots,
};
