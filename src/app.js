import { ALPHABETS } from "./alphabets.js";
import { createSession, recordAnswer, pickNext } from "./scheduler.js";

const TIMER_SECONDS = 5;
const TIMER_TICK_MS = 250;

const sessions = {};
let currentAlphabet = "ru";
let currentTheme = "light";
let currentLetter = null;
let timerStartedAt = 0;

let elements = null;

function readStorage(key, allowedValues, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (allowedValues.includes(value)) {
      return value;
    }
  } catch (err) {
    // localStorage unavailable (e.g. private mode) — use fallback.
  }
  return fallback;
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    // localStorage unavailable (e.g. private mode) — ignore.
  }
}

function getSession(alphabet) {
  if (!sessions[alphabet]) {
    sessions[alphabet] = createSession();
  }
  return sessions[alphabet];
}

function requireElement(id) {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`LettersWarmUp: missing required element #${id}`);
  }
  return el;
}

function collectElements() {
  return {
    alphabetRu: requireElement("alphabet-ru"),
    alphabetEn: requireElement("alphabet-en"),
    themeToggle: requireElement("theme-toggle"),
    letter: requireElement("letter"),
    timer: requireElement("timer"),
    knowButton: requireElement("know-button"),
    dontKnowButton: requireElement("dont-know-button"),
  };
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  elements.themeToggle.textContent = theme === "dark" ? "☾" : "☼";
}

function applyAlphabetToggle(alphabet) {
  const isRu = alphabet === "ru";
  const isEn = alphabet === "en";
  elements.alphabetRu.classList.toggle("active", isRu);
  elements.alphabetRu.setAttribute("aria-pressed", String(isRu));
  elements.alphabetEn.classList.toggle("active", isEn);
  elements.alphabetEn.setAttribute("aria-pressed", String(isEn));
}

function showNextLetter() {
  const session = getSession(currentAlphabet);
  const letters = ALPHABETS[currentAlphabet];
  currentLetter = pickNext(session, letters, Date.now(), Math.random);

  const letterEl = elements.letter;
  letterEl.textContent = currentLetter;
  letterEl.style.animation = "none";
  // Force reflow so the animation restarts.
  void letterEl.offsetWidth;
  letterEl.style.animation = "";

  restartTimer();
}

function restartTimer() {
  timerStartedAt = Date.now();
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const timerEl = elements.timer;
  const elapsedSeconds = (Date.now() - timerStartedAt) / 1000;
  const remaining = Math.min(TIMER_SECONDS, Math.ceil(TIMER_SECONDS - elapsedSeconds));

  if (remaining <= 0) {
    timerEl.style.visibility = "hidden";
  } else {
    timerEl.style.visibility = "visible";
    timerEl.textContent = String(remaining);
  }
}

function handleAnswer(answer) {
  const session = getSession(currentAlphabet);
  recordAnswer(session, currentLetter, answer, Date.now());
  showNextLetter();
}

function switchAlphabet(alphabet) {
  if (alphabet === currentAlphabet) {
    return;
  }
  currentAlphabet = alphabet;
  writeStorage("lw.alphabet", alphabet);
  applyAlphabetToggle(alphabet);
  showNextLetter();
}

function toggleTheme() {
  const nextTheme = currentTheme === "light" ? "dark" : "light";
  currentTheme = nextTheme;
  writeStorage("lw.theme", nextTheme);
  applyTheme(nextTheme);
}

function init() {
  elements = collectElements();

  currentAlphabet = readStorage("lw.alphabet", ["ru", "en"], "ru");
  currentTheme = readStorage("lw.theme", ["light", "dark"], "light");

  applyTheme(currentTheme);
  applyAlphabetToggle(currentAlphabet);

  elements.alphabetRu.addEventListener("click", () => switchAlphabet("ru"));
  elements.alphabetEn.addEventListener("click", () => switchAlphabet("en"));
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.knowButton.addEventListener("click", () => handleAnswer("know"));
  elements.dontKnowButton.addEventListener("click", () => handleAnswer("dont_know"));

  showNextLetter();
  setInterval(updateTimerDisplay, TIMER_TICK_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
