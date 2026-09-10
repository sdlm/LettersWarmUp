import test from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  recordAnswer,
  computeWeights,
  pickNext,
} from "../src/scheduler.js";

test("a letter not in history gets t=300, k=1, w=300", () => {
  const state = createSession();
  const weights = computeWeights(state, ["A", "B", "C"], 1_000_000);
  // Positional lookup (not .find()) so the test also asserts that
  // computeWeights returns results in the same order as `letters`.
  const a = weights[0];
  assert.equal(a.letter, "A");
  assert.equal(a.t, 300);
  assert.equal(a.k, 1);
  assert.equal(a.w, 300);
});

test("the lastShown letter gets t=0 and w=0", () => {
  const state = createSession();
  state.lastShown = "B";
  const weights = computeWeights(state, ["A", "B", "C"], 1_000_000);
  const b = weights.find((x) => x.letter === "B");
  assert.equal(b.t, 0);
  assert.equal(b.w, 0);
});

test("lastShown wins w=0 even when that letter is present in history", () => {
  const state = createSession();
  state.history["B"] = { answer: "know", closedAt: 500_000 };
  state.lastShown = "B";
  const weights = computeWeights(state, ["A", "B", "C"], 1_000_000);
  const b = weights.find((x) => x.letter === "B");
  assert.equal(b.t, 0);
  assert.equal(b.w, 0);
});

test('answer "know" gives k=0.5; "dont_know" gives k=2', () => {
  const nowMs = 1_000_000;
  const state = createSession();
  // closedAt chosen so (nowMs - closedAt) / 1000 === 10 seconds
  state.history["A"] = { answer: "know", closedAt: nowMs - 10_000 };
  state.history["B"] = { answer: "dont_know", closedAt: nowMs - 10_000 };
  const weights = computeWeights(state, ["A", "B"], nowMs);
  const a = weights.find((x) => x.letter === "A");
  const b = weights.find((x) => x.letter === "B");
  assert.equal(a.t, 10);
  assert.equal(a.k, 0.5);
  assert.equal(a.w, 5);
  assert.equal(b.t, 10);
  assert.equal(b.k, 2);
  assert.equal(b.w, 20);
});

test("t grows with time: same history, larger nowMs gives larger w", () => {
  const state = createSession();
  state.history["A"] = { answer: "know", closedAt: 500_000 };
  const earlier = computeWeights(state, ["A"], 600_000).find(
    (x) => x.letter === "A",
  );
  const later = computeWeights(state, ["A"], 900_000).find(
    (x) => x.letter === "A",
  );
  assert.ok(later.w > earlier.w);
});

test("at the start of a session all weights are equal", () => {
  const state = createSession();
  const weights = computeWeights(state, ["A", "B", "C"], 1_000_000);
  assert.equal(weights[0].w, weights[1].w);
  assert.equal(weights[1].w, weights[2].w);
});

test("recordAnswer writes answer and closedAt into history and sets lastShown", () => {
  const state = createSession();
  recordAnswer(state, "A", "know", 12345);
  assert.deepEqual(state.history["A"], { answer: "know", closedAt: 12345 });
  assert.equal(state.lastShown, "A");
});

test("recordAnswer on an already-answered letter overwrites its entry", () => {
  const state = createSession();
  recordAnswer(state, "A", "dont_know", 1000);
  recordAnswer(state, "A", "know", 2000);
  assert.deepEqual(state.history["A"], { answer: "know", closedAt: 2000 });
});

test("pickNext with rng=() => 0 returns the first letter with non-zero weight", () => {
  const state = createSession();
  state.lastShown = "A";
  const result = pickNext(state, ["A", "B", "C"], 1_000_000, () => 0);
  assert.equal(result, "B");
});

test("pickNext with rng=() => 0.999999 returns the last letter with non-zero weight", () => {
  const state = createSession();
  state.lastShown = "C";
  const result = pickNext(state, ["A", "B", "C"], 1_000_000, () => 0.999999);
  assert.equal(result, "B");
});

test("pickNext never returns lastShown across a sweep of rng values", () => {
  const state = createSession();
  state.lastShown = "B";
  const letters = ["A", "B", "C"];
  for (let i = 0; i < 1000; i++) {
    const r = i / 1000;
    const result = pickNext(state, letters, 1_000_000, () => r);
    assert.notEqual(result, "B");
  }
});

test("pickNext on a single-letter alphabet returns that letter without hanging", () => {
  const state = createSession();
  state.lastShown = "A";
  const result = pickNext(state, ["A"], 1_000_000, () => 0.5);
  assert.equal(result, "A");
});

test("statistical run: empirical frequencies match w/total within 0.02", () => {
  // Small deterministic LCG (Numerical Recipes constants), fixed seed.
  let seed = 42;
  function lcg() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const state = createSession();
  const nowMs = 1_000_000;
  // lastShown stays null so no letter has a forced zero weight.
  // A: not in history                                -> t=300, k=1,   w=300
  // B: know,      closedAt = nowMs - 400_000          -> t=400, k=0.5, w=200
  // C: dont_know, closedAt = nowMs - 250_000          -> t=250, k=2,   w=500
  // total = 1000 -> expected frequencies: A=0.30, B=0.20, C=0.50
  // (hand-derived from the spec, not from computeWeights, so a wrong
  // weight formula can't launder its own error into `expected`)
  state.history["B"] = { answer: "know", closedAt: nowMs - 400_000 };
  state.history["C"] = { answer: "dont_know", closedAt: nowMs - 250_000 };
  const letters = ["A", "B", "C"];
  const expected = { A: 0.3, B: 0.2, C: 0.5 };

  const counts = { A: 0, B: 0, C: 0 };
  const iterations = 10_000;
  for (let i = 0; i < iterations; i++) {
    const letter = pickNext(state, letters, nowMs, lcg);
    counts[letter]++;
  }

  for (const letter of letters) {
    const empirical = counts[letter] / iterations;
    assert.ok(
      Math.abs(empirical - expected[letter]) < 0.02,
      `letter ${letter}: empirical ${empirical} vs expected ${expected[letter]}`,
    );
  }
});
