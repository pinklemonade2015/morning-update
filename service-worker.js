// Service worker: lets the page open quickly and be installed on the home screen.
//
// RULE: only the page's own files are ever cached.
// Train and weather data come from other websites (TfL, Open-Meteo), and this
// worker ignores those requests completely, so they always go straight to the
// live service and are never stored.

const CACHE = "morning-update-v5"; // change the number to force an update
const PAGE_FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PAGE_FILES)));
  self.skipWaiting();
});

// Delete caches from older versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Not our own site (e.g. TfL or weather)? Do nothing — the browser fetches it live.
  if (url.origin !== self.location.origin) return;

  // Our own page files: try the network first so you always get the latest
  // version, and fall back to the saved copy if you're offline.
  // cache: "no-cache" makes the browser check with GitHub every time instead of
  // reusing its own copy for up to 10 minutes. Without it, an update could load
  // the new page with the old app.js, leaving parts stuck on "Loading…".
  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
