// Service worker for the installed (PWA) version of LettersWarmUp.
// Cache-first for the whole app shell: the app makes no network requests
// of its own, so after the first visit everything is served offline.
// build.py replaces the version placeholder with a hash of dist/ contents,
// so every rebuild that changes a file gets a fresh cache.

const CACHE_VERSION = "ee657b71dd30";
const CACHE_PREFIX = "letters-warmup-";
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // Bypass the HTTP cache: Pages serves max-age=600, and a stale copy would
  // otherwise be pinned under the new cache version until the next deploy.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }
  event.respondWith(
    caches
      .match(event.request, { ignoreSearch: true })
      .then((cached) => cached || fetch(event.request))
  );
});
