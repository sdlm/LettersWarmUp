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
      return { letter, t: 300, k: 1, w: 300 };
    }
    const t = (nowMs - entry.closedAt) / 1000;
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
