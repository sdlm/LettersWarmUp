import { ALPHABETS } from "./alphabets.js";
import { createSession, recordAnswer, pickNext } from "./scheduler.js";

const TIMER_SECONDS = 5;
const TIMER_TICK_MS = 250;

const sessions = {};
let currentAlphabet = "ru";
let currentTheme = "light";
let currentLetter = null;
let timerStartedAt = 0;

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

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  const themeToggle = document.getElementById("theme-toggle");
  themeToggle.textContent = theme === "dark" ? "☾" : "☼";
}

function applyAlphabetToggle(alphabet) {
  const ruToggle = document.getElementById("alphabet-ru");
  const enToggle = document.getElementById("alphabet-en");
  ruToggle.classList.toggle("active", alphabet === "ru");
  enToggle.classList.toggle("active", alphabet === "en");
}

function showNextLetter() {
  const session = getSession(currentAlphabet);
  const letters = ALPHABETS[currentAlphabet];
  currentLetter = pickNext(session, letters, Date.now(), Math.random);

  const letterEl = document.getElementById("letter");
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
  const timerEl = document.getElementById("timer");
  const elapsedSeconds = (Date.now() - timerStartedAt) / 1000;
  const remaining = Math.ceil(TIMER_SECONDS - elapsedSeconds);

  if (remaining <= 0) {
    timerEl.style.visibility = "hidden";
  } else {
    timerEl.style.visibility = "visible";
    timerEl.textContent = String(remaining);
  }
}

function answer(result) {
  const session = getSession(currentAlphabet);
  recordAnswer(session, currentLetter, result, Date.now());
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
  writeStorage("lw.theme", nextTheme);
  applyTheme(nextTheme);
}

function init() {
  currentAlphabet = readStorage("lw.alphabet", ["ru", "en"], "ru");
  currentTheme = readStorage("lw.theme", ["light", "dark"], "light");

  applyTheme(currentTheme);
  applyAlphabetToggle(currentAlphabet);

  document.getElementById("alphabet-ru").addEventListener("click", () => switchAlphabet("ru"));
  document.getElementById("alphabet-en").addEventListener("click", () => switchAlphabet("en"));
  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
  document.getElementById("know-button").addEventListener("click", () => answer("know"));
  document.getElementById("dont-know-button").addEventListener("click", () => answer("dont_know"));

  showNextLetter();
  setInterval(updateTimerDisplay, TIMER_TICK_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
