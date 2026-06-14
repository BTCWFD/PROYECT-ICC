/**
 * store.js — Capa de datos de la ICC con DOS implementaciones tras una interfaz común.
 *
 * Interfaz (todas async):
 *   addShot(shot)        -> persiste un tiro y devuelve el tiro almacenado.
 *   getTopShots(n)       -> top N tiros ordenados desc por range.
 *   rankForRange(range)  -> posición (1-based) que ocuparía un alcance.
 *   totalShots()         -> número total de tiros.
 *   addEvent(event, props) -> persiste un evento de analítica (fire-and-forget).
 *
 * SELECCIÓN DE BACKEND (en tiempo de carga del módulo):
 *   - Si existe process.env.TABLES_CONNECTION_STRING -> Azure Table Storage
 *     (@azure/data-tables), tablas "shots" y "events".
 *   - Si NO existe -> almacén EN MEMORIA (volátil), útil para desarrollo local
 *     y para que el simulador siga funcionando sin infraestructura.
 *
 * Todas las funciones exportadas son async para que ambos backends compartan la
 * misma firma y los handlers HTTP puedan hacer `await` indistintamente.
 */

// Mundos válidos del simulador. Se reutiliza para validar el contrato.
const VALID_WORLDS = ["moon", "earth"];

// PartitionKey fija: todos los tiros/eventos viven en una sola partición lógica.
const PARTITION_KEY = "global";

// Nombres de las tablas de Azure Table Storage.
const SHOTS_TABLE = "shots";
const EVENTS_TABLE = "events";

/**
 * Genera una RowKey única en TIEMPO DE EJECUCIÓN (no en import).
 * Combina timestamp invertido (para orden cronológico inverso natural) con un
 * sufijo aleatorio para evitar colisiones en inserciones concurrentes.
 * @returns {string}
 */
function makeRowKey() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
// Implementación (a): almacén EN MEMORIA (fallback sin conexión).
// ---------------------------------------------------------------------------
function createMemoryStore() {
  // Array en memoria con todos los tiros. Volátil: se pierde en cada cold start.
  const shots = [];

  async function addShot(shot) {
    shots.push(shot);
    return shot;
  }

  async function getTopShots(n = Infinity) {
    // Copiamos antes de ordenar para no mutar el orden de inserción.
    return [...shots].sort((a, b) => b.range - a.range).slice(0, n);
  }

  async function rankForRange(range) {
    // rank = 1 + (nº de tiros con range estrictamente mayor).
    let better = 0;
    for (const s of shots) {
      if (s.range > range) better += 1;
    }
    return better + 1;
  }

  async function totalShots() {
    return shots.length;
  }

  async function addEvent() {
    // No-op: en memoria no persistimos analítica.
    return;
  }

  return { addShot, getTopShots, rankForRange, totalShots, addEvent };
}

// ---------------------------------------------------------------------------
// Implementación (b): Azure Table Storage (@azure/data-tables).
// ---------------------------------------------------------------------------
function createTableStore(connectionString) {
  const { TableClient } = require("@azure/data-tables");

  const shotsClient = TableClient.fromConnectionString(connectionString, SHOTS_TABLE);
  const eventsClient = TableClient.fromConnectionString(connectionString, EVENTS_TABLE);

  // Creación perezosa de tablas: garantizamos que existan una sola vez.
  let shotsReady = null;
  let eventsReady = null;

  function ensureShotsTable() {
    if (!shotsReady) shotsReady = shotsClient.createTable().catch(() => {});
    return shotsReady;
  }
  function ensureEventsTable() {
    if (!eventsReady) eventsReady = eventsClient.createTable().catch(() => {});
    return eventsReady;
  }

  async function addShot(shot) {
    await ensureShotsTable();
    const entity = {
      partitionKey: PARTITION_KEY,
      rowKey: makeRowKey(),
      club: shot.club,
      world: shot.world,
      power: shot.power,
      angle: shot.angle,
      range: shot.range,
      hangTime: shot.hangTime,
    };
    await shotsClient.createEntity(entity);
    return shot;
  }

  /**
   * Lee todas las entidades de tiros desde la partición global.
   * @returns {Promise<object[]>}
   */
  async function listAllShots() {
    await ensureShotsTable();
    const all = [];
    const iter = shotsClient.listEntities({
      queryOptions: { filter: `PartitionKey eq '${PARTITION_KEY}'` },
    });
    for await (const e of iter) {
      all.push({
        club: e.club,
        world: e.world,
        power: e.power,
        angle: e.angle,
        range: e.range,
        hangTime: e.hangTime,
      });
    }
    return all;
  }

  async function getTopShots(n = Infinity) {
    const all = await listAllShots();
    return all.sort((a, b) => b.range - a.range).slice(0, n);
  }

  async function rankForRange(range) {
    const all = await listAllShots();
    let better = 0;
    for (const s of all) {
      if (s.range > range) better += 1;
    }
    return better + 1;
  }

  async function totalShots() {
    const all = await listAllShots();
    return all.length;
  }

  async function addEvent(event, props) {
    await ensureEventsTable();
    const entity = {
      partitionKey: PARTITION_KEY,
      rowKey: makeRowKey(),
      event,
      // Serializamos props como JSON; Table Storage no admite objetos anidados.
      props: props ? JSON.stringify(props) : "",
    };
    await eventsClient.createEntity(entity);
    return;
  }

  return { addShot, getTopShots, rankForRange, totalShots, addEvent };
}

// ---------------------------------------------------------------------------
// Selección del backend al cargar el módulo.
// ---------------------------------------------------------------------------
const connectionString = process.env.TABLES_CONNECTION_STRING;
const backend = connectionString
  ? createTableStore(connectionString) // (b) persistente
  : createMemoryStore();               // (a) volátil/fallback

module.exports = {
  VALID_WORLDS,
  addShot: backend.addShot,
  getTopShots: backend.getTopShots,
  rankForRange: backend.rankForRange,
  totalShots: backend.totalShots,
  addEvent: backend.addEvent,
};
