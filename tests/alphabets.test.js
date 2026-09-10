import test from "node:test";
import assert from "node:assert/strict";
import { ALPHABETS } from "../src/alphabets.js";

test("RU has exactly 32 letters, excludes Ё, includes Е", () => {
  assert.equal(ALPHABETS.ru.length, 32);
  assert.ok(!ALPHABETS.ru.includes("Ё"));
  assert.ok(ALPHABETS.ru.includes("Е"));
});

test("EN has exactly 26 letters", () => {
  assert.equal(ALPHABETS.en.length, 26);
});

test("both alphabets have no duplicates and are uppercase", () => {
  for (const letters of [ALPHABETS.ru, ALPHABETS.en]) {
    assert.equal(new Set(letters).size, letters.length);
    for (const ch of letters) {
      assert.equal(ch, ch.toUpperCase());
      assert.notEqual(ch, ch.toLowerCase());
    }
  }
});
