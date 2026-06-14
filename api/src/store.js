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
const WAITLIST_TABLE = "waitlist";

/**
 * Sanea un email para usarlo como RowKey de Table Storage.
 * Pasa a minúsculas, recorta espacios y reemplaza los caracteres prohibidos en
 * claves de Table Storage (/ \ # ?). Sirve además para deduplicar: el mismo
 * email produce siempre la misma RowKey.
 * @param {string} email
 * @returns {string}
 */
function sanitizeEmailKey(email) {
  return String(email)
    .trim()
    .toLowerCase()
    // Reemplaza los caracteres prohibidos en claves de Table Storage: / \ # ?
    .replace(/[/\\#?]/g, "_");
}

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

  // Mapa de la waitlist: clave = email saneado, valor = entrada almacenada.
  // El uso de Map deduplica por email de forma natural.
  const waitlist = new Map();

  async function addWaitlist(entry) {
    const key = sanitizeEmailKey(entry.email);
    // Deduplicación: si el email ya existe, NO se sobrescribe ni se duplica.
    if (!waitlist.has(key)) {
      waitlist.set(key, {
        email: entry.email,
        club: entry.club || "",
        source: entry.source || "",
        createdAt: new Date().toISOString(),
      });
    }
    return { total: waitlist.size };
  }

  async function waitlistCount() {
    return waitlist.size;
  }

  return {
    addShot,
    getTopShots,
    rankForRange,
    totalShots,
    addEvent,
    addWaitlist,
    waitlistCount,
  };
}

// ---------------------------------------------------------------------------
// Implementación (b): Azure Table Storage (@azure/data-tables).
// ---------------------------------------------------------------------------
function createTableStore(connectionString) {
  const { TableClient } = require("@azure/data-tables");

  const shotsClient = TableClient.fromConnectionString(connectionString, SHOTS_TABLE);
  const eventsClient = TableClient.fromConnectionString(connectionString, EVENTS_TABLE);
  const waitlistClient = TableClient.fromConnectionString(connectionString, WAITLIST_TABLE);

  // Creación perezosa de tablas: garantizamos que existan una sola vez.
  let shotsReady = null;
  let eventsReady = null;
  let waitlistReady = null;

  function ensureShotsTable() {
    if (!shotsReady) shotsReady = shotsClient.createTable().catch(() => {});
    return shotsReady;
  }
  function ensureEventsTable() {
    if (!eventsReady) eventsReady = eventsClient.createTable().catch(() => {});
    return eventsReady;
  }
  function ensureWaitlistTable() {
    if (!waitlistReady) waitlistReady = waitlistClient.createTable().catch(() => {});
    return waitlistReady;
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

  async function addWaitlist(entry) {
    await ensureWaitlistTable();
    const rowKey = sanitizeEmailKey(entry.email);
    const item = {
      partitionKey: PARTITION_KEY,
      rowKey,
      email: entry.email,
      club: entry.club || "",
      source: entry.source || "",
      createdAt: new Date().toISOString(),
    };
    try {
      // createEntity falla con 409 si la RowKey ya existe -> deduplicación por email.
      await waitlistClient.createEntity(item);
    } catch (err) {
      // 409 (EntityAlreadyExists) significa que el email ya estaba: no es un error
      // para nosotros (deduplicación). Cualquier otro error se relanza.
      const isConflict =
        err && (err.statusCode === 409 || err.code === "EntityAlreadyExists");
      if (!isConflict) throw err;
    }
    const total = await waitlistCount();
    return { total };
  }

  async function waitlistCount() {
    await ensureWaitlistTable();
    let count = 0;
    const iter = waitlistClient.listEntities({
      queryOptions: { filter: `PartitionKey eq '${PARTITION_KEY}'` },
    });
    for await (const _ of iter) {
      count += 1;
    }
    return count;
  }

  return {
    addShot,
    getTopShots,
    rankForRange,
    totalShots,
    addEvent,
    addWaitlist,
    waitlistCount,
  };
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
  addWaitlist: backend.addWaitlist,
  waitlistCount: backend.waitlistCount,
};
