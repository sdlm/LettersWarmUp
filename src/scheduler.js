// Picks the next letter to practice. Each letter gets a weight w = t * k:
//   t = seconds since the letter was last closed (0 if it was just shown)
//   k = difficulty multiplier (2 if the child didn't know it, 0.5 if they did)
// Probability of a letter is w / sum(w). No DOM, no clock, no storage:
// `nowMs` and `rng` are injected so this module is deterministic under test.

export function createSession() {
  return { history: {}, lastShown: null };
}

export function recordAnswer(state, letter, answer, nowMs) {
  state.history[letter] = { answer, closedAt: nowMs };
  state.lastShown = letter;
}

export function computeWeights(state, letters, nowMs) {
  return letters.map((letter) => {
    if (letter === state.lastShown) {
      return { letter, t: 0, k: 1, w: 0 };
    }
    const entry = state.history[letter];
    if (!entry) {
      // Unseen letter: treat it as if it had been idle five minutes.
      const t = 5 * 60;
      return { letter, t, k: 1, w: t };
    }
    // Clamp at 0: a clock that has moved backwards (NTP correction, a
    // child in the date settings) must never produce a negative weight.
    const t = Math.max(0, (nowMs - entry.closedAt) / 1000);
    // Anything other than "dont_know" (i.e. "know") is treated as known.
    const k = entry.answer === "dont_know" ? 2 : 0.5;
    return { letter, t, k, w: t * k };
  });
}

export function pickNext(state, letters, nowMs, rng) {
  const weights = computeWeights(state, letters, nowMs);
  const total = weights.reduce((sum, x) => sum + x.w, 0);

  if (total === 0) {
    const index = Math.floor(rng() * letters.length);
    return letters[index];
  }

  const r = rng() * total;
  let running = 0;
  let lastNonZero = null;
  for (const x of weights) {
    if (x.w > 0) {
      lastNonZero = x.letter;
    }
    running += x.w;
    if (running > r) {
      return x.letter;
    }
  }
  return lastNonZero;
}
