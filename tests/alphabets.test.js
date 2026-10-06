import test from "node:test";
import assert from "node:assert/strict";
import { ALPHABETS, HINTS } from "../src/alphabets.js";

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

test("EN hints cover exactly the EN letters", () => {
  assert.deepEqual(Object.keys(HINTS.en).sort(), [...ALPHABETS.en].sort());
});

test("every EN hint word starts with its capital letter", () => {
  for (const [letter, hint] of Object.entries(HINTS.en)) {
    for (const word of [hint.nato, hint.kid]) {
      assert.ok(word.length > 0, `${letter}: empty word`);
      assert.equal(word[0], letter, `${letter}: ${word}`);
    }
  }
});

test("RU has no hints", () => {
  assert.equal(HINTS.ru, undefined);
});
