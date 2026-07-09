/**
 * sanitize.test.js — Saneado del texto que la API persiste y sirve.
 *
 * El nombre de club se muestra en el ranking público y en el panel admin, así
 * que un texto con overrides bidi o controles puede falsear cómo se lee la
 * lista. Estos tests fijan ese contrato.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { sanitizeText, sanitizeProps } = require("../api/src/sanitize.js");

// Construimos los caracteres por code point: meterlos literalmente en el
// fuente los haría invisibles y frágiles ante copias/formateadores.
const NUL = String.fromCodePoint(0x00);
const BEL = String.fromCodePoint(0x07);
const DEL = String.fromCodePoint(0x7f);
const ZWSP = String.fromCodePoint(0x200b);
const LRM = String.fromCodePoint(0x200e);
const RLO = String.fromCodePoint(0x202e);
const LRI = String.fromCodePoint(0x2066);
const BOM = String.fromCodePoint(0xfeff);

test("elimina controles C0/C1 y DEL", () => {
  assert.equal(sanitizeText("Mare" + NUL + BEL + " FC"), "Mare FC");
  assert.equal(sanitizeText("A" + DEL + "B"), "AB");
});

test("elimina overrides bidi (spoofing visual del ranking)", () => {
  assert.equal(sanitizeText("Real" + RLO + "DIRDAM"), "RealDIRDAM");
  assert.equal(sanitizeText("X" + LRI + "Y"), "XY");
  assert.equal(sanitizeText("X" + LRM + "Y"), "XY");
});

test("elimina espacios de ancho cero y BOM (suplantación de nombres)", () => {
  // Sin esto, "Tycho​United" y "TychoUnited" se ven idénticos pero difieren.
  assert.equal(sanitizeText("Tycho" + ZWSP + "United"), "TychoUnited");
  assert.equal(sanitizeText(BOM + "Club"), "Club");
});

test("conserva Unicode legítimo, incluidos emojis (pares suplentes)", () => {
  assert.equal(sanitizeText("Luna FC 🌕"), "Luna FC 🌕");
  assert.equal(sanitizeText("Mare Tranquillitatis · Ñandú"), "Mare Tranquillitatis · Ñandú");
});

test("recorta espacios y acota la longitud", () => {
  assert.equal(sanitizeText("  hola  "), "hola");
  assert.equal(sanitizeText("abcdefghij", 5), "abcde");
  assert.equal(sanitizeText("abc", 10), "abc");
});

test("devuelve cadena vacía ante entradas no textuales", () => {
  for (const v of [42, null, undefined, {}, [], true]) {
    assert.equal(sanitizeText(v), "");
  }
});

test("un texto solo de caracteres peligrosos queda vacío (el handler lo rechaza)", () => {
  assert.equal(sanitizeText(RLO + ZWSP + NUL), "");
});

test("sanitizeProps solo admite primitivas", () => {
  const out = sanitizeProps({ s: "x", n: 5, b: true, obj: { a: 1 }, arr: [1], nil: null });
  assert.deepEqual(out, { s: "x", n: 5, b: true });
});

test("sanitizeProps descarta números no finitos", () => {
  assert.equal(sanitizeProps({ a: NaN, b: Infinity }), undefined);
  assert.deepEqual(sanitizeProps({ a: NaN, ok: 1 }), { ok: 1 });
});

test("sanitizeProps limpia claves y valores de texto", () => {
  const out = sanitizeProps({ ["k" + RLO]: "v" + ZWSP + "w" });
  assert.deepEqual(out, { k: "vw" });
});

test("sanitizeProps limita a 12 claves", () => {
  const many = {};
  for (let i = 0; i < 30; i++) many["k" + i] = i;
  assert.equal(Object.keys(sanitizeProps(many)).length, 12);
});

test("sanitizeProps acota la longitud de valores de texto", () => {
  const out = sanitizeProps({ t: "x".repeat(500) });
  assert.equal(out.t.length, 120);
});

test("sanitizeProps devuelve undefined cuando no queda nada útil", () => {
  assert.equal(sanitizeProps(null), undefined);
  assert.equal(sanitizeProps([1, 2]), undefined, "un array no es un objeto de props");
  assert.equal(sanitizeProps("texto"), undefined);
  assert.equal(sanitizeProps({ obj: {} }), undefined);
});
