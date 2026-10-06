import { ALPHABETS, HINTS } from "./alphabets.js";
import { createSession, recordAnswer, pickNext } from "./scheduler.js";

const TIMER_SECONDS = 5;
const TIMER_TICK_MS = 250;
// Mirrors --bg in styles.css; used for the system bar of the installed app.
const THEME_COLORS = { light: "#ffffff", dark: "#0b0b0b" };

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
    nato: requireElement("nato"),
    kid: requireElement("kid"),
    knowButton: requireElement("know-button"),
    dontKnowButton: requireElement("dont-know-button"),
  };
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  elements.themeToggle.textContent = theme === "dark" ? "☾" : "☼";
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", THEME_COLORS[theme]);
  }
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

  const hint = currentHint();
  elements.nato.textContent = hint ? hint.nato : "";
  elements.kid.textContent = hint ? hint.kid : "";
  setHintsVisible(false);
  restartTimer();
}

function currentHint() {
  return HINTS[currentAlphabet]?.[currentLetter] ?? null;
}

function setHintsVisible(visible) {
  const visibility = visible ? "visible" : "hidden";
  elements.nato.style.visibility = visibility;
  elements.kid.style.visibility = visibility;
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
    setHintsVisible(currentHint() !== null);
  } else {
    timerEl.style.visibility = "visible";
    timerEl.textContent = String(remaining);
    setHintsVisible(false);
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

function registerServiceWorker() {
  // Over file:// there is nothing to register; the single-file app works as is.
  const servedOverHttp = location.protocol === "http:" || location.protocol === "https:";
  if (!servedOverHttp || !("serviceWorker" in navigator)) {
    return;
  }
  navigator.serviceWorker.register("sw.js").catch(() => {
    // Offline support is a bonus; the app works without it.
  });
}

function keepScreenAwake() {
  if (!("wakeLock" in navigator)) {
    return;
  }
  const acquire = () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    navigator.wakeLock.request("screen").catch(() => {
      // Denied (low battery, insecure context, policy) — the screen may dim.
    });
  };
  // The browser drops the lock whenever the page is hidden; take it again on return.
  document.addEventListener("visibilitychange", acquire);
  acquire();
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

  registerServiceWorker();
  keepScreenAwake();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
