/**
 * store.test.js — Capa de datos (backend EN MEMORIA).
 *
 * store.js elige backend al cargar el módulo según TABLES_CONNECTION_STRING.
 * Estos tests se ejecutan sin esa variable, así que ejercitan el almacén en
 * memoria. La ruta de Azure Table Storage NO se cubre aquí (requiere servicio
 * real o emulador): su corrección se apoya en reaplicar el predicado en memoria
 * tras el filtro OData (ver queryShots en store.js).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

assert.equal(
  process.env.TABLES_CONNECTION_STRING,
  undefined,
  "estos tests asumen el backend en memoria"
);

const store = require("../api/src/store.js");

const DAY = 24 * 60 * 60 * 1000;
const shot = (club, range, extra = {}) => ({
  club,
  world: "moon",
  power: 100,
  angle: 45,
  range,
  hangTime: 10,
  ...extra,
});

test("VALID_WORLDS expone exactamente los dos mundos", () => {
  assert.deepEqual([...store.VALID_WORLDS].sort(), ["earth", "moon"]);
});

test("addShot sella createdAt y respeta uno entrante", async () => {
  const antes = Date.now();
  const s = await store.addShot(shot("Sello FC", 10));
  assert.ok(s.createdAt >= antes, "debe sellar con el instante actual");

  const fijo = await store.addShot(shot("Seed FC", 11, { createdAt: 1234567890 }));
  assert.equal(fijo.createdAt, 1234567890, "un createdAt explícito se respeta");
});

test("getTopShots ordena desc por range y aplica el límite", async () => {
  await store.addShot(shot("Bajo", 50));
  await store.addShot(shot("Alto", 5000));
  await store.addShot(shot("Medio", 500));

  const top = await store.getTopShots(2);
  assert.equal(top.length, 2);
  assert.ok(top[0].range >= top[1].range, "orden descendente");
  assert.equal(top[0].club, "Alto", "el mejor alcance va primero");
});

test("getTopShots filtra por ventana temporal (leaderboard semanal)", async () => {
  const ahora = Date.now();
  // Un tiro "viejo" (hace 30 días) y otro reciente, ambos con alcance enorme
  // para que dominarían el ranking si no se filtrasen.
  await store.addShot(shot("Antiguo", 99999, { createdAt: ahora - 30 * DAY }));
  await store.addShot(shot("Reciente", 88888, { createdAt: ahora - 1 * DAY }));

  const semana = await store.getTopShots(50, ahora - 7 * DAY);
  const clubes = semana.map((s) => s.club);
  assert.ok(clubes.includes("Reciente"), "el reciente entra en la semana");
  assert.ok(!clubes.includes("Antiguo"), "el de hace 30 días queda fuera");

  // Sin ventana (sinceMs=0) el histórico sí lo incluye.
  const historico = await store.getTopShots(50, 0);
  assert.ok(historico.map((s) => s.club).includes("Antiguo"));
});

test("los tiros sin createdAt cuentan como históricos, no como recientes", async () => {
  await store.addShot(shot("SinSello", 77777, { createdAt: 0 }));
  const semana = await store.getTopShots(50, Date.now() - 7 * DAY);
  assert.ok(!semana.map((s) => s.club).includes("SinSello"));
});

test("rankForRange devuelve 1 + los tiros estrictamente mejores", async () => {
  const total = await store.totalShots();
  assert.ok(total > 0);

  // Un alcance imposible de superar debe quedar primero.
  assert.equal(await store.rankForRange(1e9), 1);

  // Un alcance de 0 queda por detrás de todos los tiros con range > 0.
  const mejores = (await store.getTopShots(Infinity)).filter((s) => s.range > 0).length;
  assert.equal(await store.rankForRange(0), mejores + 1);
});

test("rankForRange usa comparación estricta (empate no penaliza)", async () => {
  await store.addShot(shot("Empate A", 4242));
  const rankConEmpate = await store.rankForRange(4242);
  const mejoresEstrictos = (await store.getTopShots(Infinity)).filter(
    (s) => s.range > 4242
  ).length;
  assert.equal(rankConEmpate, mejoresEstrictos + 1, "un empate no cuenta como mejor");
});

test("totalShots cuenta todos los tiros registrados", async () => {
  const antes = await store.totalShots();
  await store.addShot(shot("Contable", 1));
  assert.equal(await store.totalShots(), antes + 1);
});

test("addWaitlist deduplica por email (normalizado) y devuelve el total", async () => {
  const r1 = await store.addWaitlist({ email: "dup@x.com", club: "A" });
  const r2 = await store.addWaitlist({ email: "dup@x.com", club: "B" });
  assert.equal(r2.total, r1.total, "la segunda alta del mismo email no suma");

  // La RowKey normaliza a minúsculas: DUP@X.com es el mismo operador.
  const r3 = await store.addWaitlist({ email: "DUP@X.com" });
  assert.equal(r3.total, r1.total, "el email es case-insensitive");
});

test("addWaitlist no sobrescribe los datos del alta original", async () => {
  await store.addWaitlist({ email: "keep@x.com", club: "Original" });
  await store.addWaitlist({ email: "keep@x.com", club: "Intruso" });
  const lista = await store.listWaitlist(100);
  const fila = lista.find((e) => e.email === "keep@x.com");
  assert.equal(fila.club, "Original", "la primera alta manda");
});

test("waitlistCount coincide con el número de emails únicos", async () => {
  const antes = await store.waitlistCount();
  await store.addWaitlist({ email: "nuevo-unico@x.com" });
  await store.addWaitlist({ email: "nuevo-unico@x.com" });
  assert.equal(await store.waitlistCount(), antes + 1);
});

test("referralCount atribuye las altas al código de quien invitó", async () => {
  const CODE = "INVITA01";
  assert.equal(await store.referralCount(CODE), 0);

  await store.addWaitlist({ email: "ref1@x.com", ref: CODE });
  await store.addWaitlist({ email: "ref2@x.com", ref: CODE });
  await store.addWaitlist({ email: "solo@x.com" }); // sin ref
  await store.addWaitlist({ email: "otro@x.com", ref: "OTRO0001" });

  assert.equal(await store.referralCount(CODE), 2);
  assert.equal(await store.referralCount("OTRO0001"), 1);
});

test("referralCount ignora códigos vacíos (no cuenta a los que llegaron solos)", async () => {
  assert.equal(await store.referralCount(""), 0);
  assert.equal(await store.referralCount(null), 0);
  assert.equal(await store.referralCount(undefined), 0);
});

test("listWaitlist devuelve los más recientes primero y no expone 'ref'", async () => {
  await store.addWaitlist({ email: "ultimo@x.com", club: "Z" });
  const lista = await store.listWaitlist(1);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].email, "ultimo@x.com", "el más reciente primero");
  assert.deepEqual(Object.keys(lista[0]).sort(), ["club", "email", "source"]);
});

test("eventCounts agrega los eventos por nombre", async () => {
  await store.addEvent("page_view");
  await store.addEvent("page_view");
  await store.addEvent("shot_executed");
  const counts = await store.eventCounts();
  assert.ok(counts.page_view >= 2);
  assert.ok(counts.shot_executed >= 1);
});
