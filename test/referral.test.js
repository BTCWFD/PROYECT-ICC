/**
 * referral.test.js — Códigos de referido.
 *
 * normalizeCode es el ÚNICO guardián antes de que el código se interpole en el
 * filtro OData de store.referralCount(). Si dejara pasar una comilla, permitiría
 * manipular la consulta. Ese contrato se fija aquí.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { codeForEmail, isValidCode, normalizeCode, CODE_LEN } = require("../api/src/referral.js");

test("el código es determinista y estable para el mismo email", () => {
  const a = codeForEmail("ana@example.com");
  const b = codeForEmail("ana@example.com");
  assert.equal(a, b);
});

test("normaliza el email antes de derivar (mayúsculas y espacios)", () => {
  const canon = codeForEmail("ana@example.com");
  assert.equal(codeForEmail("  Ana@Example.COM  "), canon);
});

test("emails distintos producen códigos distintos", () => {
  const codes = new Set(
    ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"].map(codeForEmail)
  );
  assert.equal(codes.size, 5, "no debe haber colisiones en un conjunto pequeño");
});

test("el código tiene la longitud y el alfabeto declarados", () => {
  const code = codeForEmail("ana@example.com");
  assert.equal(code.length, CODE_LEN);
  assert.match(code, /^[0-9A-Z]+$/, "base36 en mayúsculas");
});

test("el código no revela el email", () => {
  const email = "ana@example.com";
  const code = codeForEmail(email);
  assert.ok(!code.toLowerCase().includes("ana"));
  assert.ok(!code.includes("@"));
});

test("isValidCode acepta alfanuméricos de 4 a 12 y rechaza el resto", () => {
  assert.ok(isValidCode("ABCD"));
  assert.ok(isValidCode("abc123XYZ"));
  assert.ok(!isValidCode("abc"), "demasiado corto");
  assert.ok(!isValidCode("a".repeat(13)), "demasiado largo");
  assert.ok(!isValidCode(""));
  assert.ok(!isValidCode(null));
  assert.ok(!isValidCode(12345678), "un número no es un código");
});

test("normalizeCode pasa a mayúsculas y recorta", () => {
  assert.equal(normalizeCode("  ab1x9z  "), "AB1X9Z");
});

test("SEGURIDAD: normalizeCode neutraliza intentos de inyección OData", () => {
  // El resultado se interpola en: ref eq '<code>'
  const ataques = [
    "A' or 1 eq 1",
    "A' or ref ne '",
    "'; drop",
    "AB'CD",
    "AB CD",
    "AB\\CD",
    "A'",
  ];
  for (const a of ataques) {
    assert.equal(normalizeCode(a), "", `debió rechazar: ${JSON.stringify(a)}`);
  }
});

test("normalizeCode devuelve vacío ante basura, sin lanzar", () => {
  for (const v of [null, undefined, 0, {}, [], "!!!", "ñ".repeat(5)]) {
    assert.equal(normalizeCode(v), "");
  }
});
